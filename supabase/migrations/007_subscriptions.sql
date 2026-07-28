-- ============================================================
-- 007_subscriptions.sql
-- Suscripciones/Pagos — integrado con Mercado Pago
-- ============================================================

CREATE TABLE public.subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id              UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,

  -- Estado del ciclo de vida
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',    -- Creada, pendiente de pago
                          'active',     -- Pago confirmado y vigente
                          'expired',    -- Período vencido
                          'cancelled',  -- Cancelada por el admin/padre
                          'past_due',   -- Vencida sin renovar
                          'refunded'    -- Reembolsada
                        )),

  plan_name             TEXT NOT NULL DEFAULT 'monthly',
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'COP',

  -- ═════════════════════════════════════════
  -- Campos específicos de Mercado Pago
  -- ═════════════════════════════════════════
  mp_preference_id      TEXT,              -- ID de la preferencia creada en MP
  mp_payment_id         TEXT,              -- ID del pago aprobado por MP
  mp_external_reference TEXT,              -- Referencia propia (child_id + timestamp)
  mp_payer_email        TEXT,              -- Email del pagador según MP
  mp_payment_type       TEXT,              -- 'credit_card','debit_card','pse','cash','bank_transfer'
  mp_status_detail      TEXT,              -- 'accredited','pending_contingency', etc.

  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,

  -- Respuesta completa del webhook/API para auditoría
  metadata              JSONB NOT NULL DEFAULT '{}'
                        CHECK (jsonb_typeof(metadata) = 'object'),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un mismo período no puede solaparse para el mismo niño (evita doble pago)
  CONSTRAINT subscriptions_no_overlap CHECK (starts_at < ends_at)
);

-- Índices
CREATE INDEX subscriptions_child_id_idx ON public.subscriptions (child_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions (status);
CREATE INDEX subscriptions_ends_at_idx ON public.subscriptions (ends_at)
  WHERE status = 'active';
-- Índices para lookup rápido desde webhooks de Mercado Pago
CREATE INDEX subscriptions_mp_payment_id_idx ON public.subscriptions (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
CREATE INDEX subscriptions_mp_external_ref_idx ON public.subscriptions (mp_external_reference)
  WHERE mp_external_reference IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY subscriptions_admin_all ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Padres: ver suscripciones de sus hijos (sin poder modificar)
CREATE POLICY subscriptions_parent_select ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE children.id = subscriptions.child_id
        AND children.parent_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Trigger: updated_at
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Trigger: sincronizar subscription_status en children
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_child_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.children
  SET
    subscription_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE child_id = NEW.child_id
          AND status = 'active'
          AND now() BETWEEN starts_at AND ends_at
      ) THEN 'active'
      ELSE 'inactive'
    END,
    updated_at = now()
  WHERE id = NEW.child_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_subscription_status_on_change
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_subscription_status();
