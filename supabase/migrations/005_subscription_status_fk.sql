-- 005_subscription_status_fk.sql

CREATE TABLE public.subscription_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_statuses (name, description) VALUES 
  ('pending', 'Pendiente de pago o verificación'),
  ('active', 'Suscripción activa y al día'),
  ('expired', 'El periodo de suscripción ha terminado'),
  ('cancelled', 'Suscripción cancelada manualmente'),
  ('past_due', 'Retraso en el pago'),
  ('refunded', 'Pago reembolsado');

-- Enable RLS for subscription_statuses
ALTER TABLE public.subscription_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_status_read_all ON public.subscription_statuses FOR SELECT TO authenticated USING (true);


-- Add new column
ALTER TABLE public.subscriptions ADD COLUMN status_id UUID REFERENCES public.subscription_statuses(id);

-- Backfill data
UPDATE public.subscriptions s
SET status_id = ss.id
FROM public.subscription_statuses ss
WHERE s.status = ss.name;

-- Make NOT NULL and remove old column
ALTER TABLE public.subscriptions ALTER COLUMN status_id SET NOT NULL;
ALTER TABLE public.subscriptions DROP COLUMN status;

-- Recreate index on new column if needed
CREATE INDEX subscriptions_status_id_idx ON public.subscriptions (status_id);
