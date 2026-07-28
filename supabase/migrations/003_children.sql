-- ============================================================
-- 003_children.sql
-- Tabla de niños — entidad central del sistema
-- ============================================================

CREATE TABLE public.children (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  gender              TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  weight_kg           NUMERIC(5,2),         -- Peso actual (se sincroniza desde vital_signs)
  height_cm           NUMERIC(5,1),         -- Altura actual (se sincroniza desde vital_signs)
  photo_url           TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'inactive'
                      CHECK (subscription_status IN ('active', 'inactive', 'trial', 'expired')),
  notes               TEXT,                 -- Notas generales del doctor
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX children_parent_id_idx ON public.children (parent_id);
CREATE INDEX children_subscription_status_idx ON public.children (subscription_status);
CREATE INDEX children_full_name_trgm_idx ON public.children USING GIN (full_name gin_trgm_ops);
CREATE INDEX children_date_of_birth_idx ON public.children (date_of_birth);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY children_admin_all ON public.children
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Padres: solo sus propios hijos
CREATE POLICY children_parent_select ON public.children
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY children_parent_insert ON public.children
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY children_parent_update ON public.children
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Padres NO pueden borrar niños (lo hace el admin)

-- ────────────────────────────────────────────────────────────
-- Trigger: updated_at
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
