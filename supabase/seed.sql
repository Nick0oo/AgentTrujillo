-- Intentionally empty.
-- Synthetic development fixtures belong in explicit, reviewable seed files.

-- Development-only consent fixtures. These rows are intentionally synthetic,
-- are loaded only by `supabase db reset --local`, and must never be promoted to
-- a hosted or production project. Replace them with legally approved
-- definitions before testing against any shared environment.
insert into public.consent_definitions (
  consent_type,
  jurisdiction,
  version,
  locale,
  title,
  document_uri,
  content_sha256,
  effective_from,
  status
) values
  (
    'privacy',
    'CO',
    'DEV_ONLY-1.0',
    'es-CO',
    'DEV_ONLY - Consentimiento de privacidad de prueba',
    'urn:creciendo:dev-only:privacy-consent:co:1.0',
    '424829bb8e4d182b86521291fa207e1ba25f22ce07f34881fde5970adae5877b',
    date '2026-01-01',
    'active'
  ),
  (
    'privacy',
    'US',
    'DEV_ONLY-1.0',
    'en-US',
    'DEV_ONLY - Privacy consent test definition',
    'urn:creciendo:dev-only:privacy-consent:us:1.0',
    '24f1fbee3fd3258cb94b69b2df4eedbae15ffe63545d2bf38ba87dca002f37d5',
    date '2026-01-01',
    'active'
  )
on conflict (consent_type, jurisdiction, version, locale) do update
set title = excluded.title,
    document_uri = excluded.document_uri,
    content_sha256 = excluded.content_sha256,
    effective_from = excluded.effective_from,
    status = excluded.status;
