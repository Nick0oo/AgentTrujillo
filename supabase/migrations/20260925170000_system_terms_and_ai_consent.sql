-- Migration: 20260925170000_system_terms_and_ai_consent.sql
-- System configurations for dynamic terms links & guardian AI consent tracking

-- 1. Create system configurations table for URLs and legal links
create table if not exists public.system_configurations (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

-- Enable RLS and allow read access for authenticated and anonymous users
alter table public.system_configurations enable row level security;

create policy "Allow read system configurations" on public.system_configurations
  for select
  using (true);

-- Insert default configurations if not present
insert into public.system_configurations (key, value, description)
values
  ('terms_and_conditions_url', 'https://creciendo.app/terms-and-conditions', 'URL pública de Términos y Condiciones'),
  ('privacy_policy_url', 'https://creciendo.app/privacy-policy', 'URL pública de Políticas de Privacidad'),
  ('ai_educational_policy_url', 'https://creciendo.app/ai-policy', 'URL pública de Políticas de Uso Educativo de IA')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

-- 2. Add AI consent fields to guardian_profiles
alter table public.guardian_profiles
  add column if not exists ai_consent_accepted boolean not null default false,
  add column if not exists ai_consent_accepted_at timestamptz,
  add column if not exists ai_consent_version text default 'v1.0';

-- 3. RPC helper function to retrieve system configuration
create or replace function public.get_system_configuration(config_key text)
returns text
language plpgsql
security definer
as $$
declare
  config_value text;
begin
  select value into config_value
  from public.system_configurations
  where key = config_key
  limit 1;

  return config_value;
end;
$$;
