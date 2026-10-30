-- User approved the existing published Colombia policy on 2026-10-29.
-- SHA-256 identifies the exact UTF-8 HTML response downloaded from this URI.
-- The document declares its effective date as 24 September 2026.
-- No account consent is inferred or inserted by this migration.
do $policy$
begin
  if exists (
    select 1 from public.consent_definitions d
    where d.consent_type = 'privacy' and d.jurisdiction = 'CO'
      and d.version = '2026-09-24' and d.locale = 'es-CO'
      and (d.title <> 'Política de Privacidad y Tratamiento de Datos Personales'
        or d.document_uri <> 'https://www.creciendo.com.co/legal/privacidad'
        or d.content_sha256 <> 'a799169e648729430b7bbaf41ca6a12bdf7c59cb1d769190a11a934ac79742fc'
        or d.effective_from <> date '2026-09-24'
        or d.effective_until is not null or d.status <> 'active')
  ) then
    raise exception 'privacy_definition_conflict' using errcode = '23505';
  end if;

  insert into public.consent_definitions (
    consent_type, jurisdiction, version, locale, title, document_uri,
    content_sha256, effective_from, status
  ) values (
    'privacy', 'CO', '2026-09-24', 'es-CO',
    'Política de Privacidad y Tratamiento de Datos Personales',
    'https://www.creciendo.com.co/legal/privacidad',
    'a799169e648729430b7bbaf41ca6a12bdf7c59cb1d769190a11a934ac79742fc',
    date '2026-09-24', 'active'
  ) on conflict (consent_type, jurisdiction, version, locale) do nothing;
end;
$policy$;
