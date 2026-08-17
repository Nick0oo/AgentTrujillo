-- Module 06: record the reviewed official source baseline and the deterministic
-- immunization algorithm identity in Cloud without activating a clinical pack.

insert into public.clinical_sources (
  authority, jurisdiction, title, source_uri, citation, published_at,
  retrieved_at, effective_from, effective_until, license, artifact_sha256, status
)
values
  (
    'MINSALUD_PAI', 'CO', 'Lineamientos técnicos PAI',
    'https://vacunacion.minsalud.gov.co/RT/Paginas/lineamientos-tecnicos.aspx',
    'Official PAI technical guidelines index; 2026 listing', '2026-01-22',
    '2026-08-16T23:00:00Z', '2026-01-01', null,
    'Official government publication; reuse subject to source terms',
    '89bd6e5c20bf0d78796897fea1dbad6c96bd17c0f79fdf09561b4995fd05df74', 'reviewed'
  ),
  (
    'MINSALUD_PAI', 'CO', 'Lineamientos para la gestión y administración del PAI 2026',
    'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lineamientos-gestion-administracion-pai-2026.pdf',
    'January 2026, version 12', '2026-01-22',
    '2026-08-16T23:00:00Z', '2026-01-01', null,
    'Official government publication; reuse subject to source terms',
    '9c9957034a7716092f696f702219d9a496ab12339d95eb00f957c8441283e34e', 'reviewed'
  ),
  (
    'MINSALUD_PAI', 'CO', 'Niños y niñas menores de 6 años',
    'https://vacunacion.minsalud.gov.co/EV/Paginas/ninos-y-ninas-menores-de-6-anos.aspx',
    'Official 2026 children schedule page', null,
    '2026-08-16T23:00:00Z', '2026-01-01', null,
    'Official government web content; recheck current terms',
    'e86bfdd7715f681e48b38ba0e0b3cf3ec5d190a3f162a2df1f9eb9a870b5e29d', 'reviewed'
  ),
  (
    'CDC_ACIP', 'US', 'Child and Adolescent Immunization Schedule by Age',
    'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-age-compliant.html',
    'Addendum updated July 2, 2025; live page requires release-time capture', '2025-07-02',
    '2026-08-16T23:00:00Z', '2025-07-02', null,
    'Official government web content; release-time byte capture required', null, 'reviewed'
  ),
  (
    'CDC_ACIP', 'US', 'Child Immunization Schedule Notes',
    'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html',
    'Addendum updated July 2, 2025; live page requires release-time capture', '2025-07-02',
    '2026-08-16T23:00:00Z', '2025-07-02', null,
    'Official government web content; release-time byte capture required', null, 'reviewed'
  ),
  (
    'CDC_ACIP', 'US', 'Child Immunization Schedule Appendix',
    'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-appendix.html',
    'Addendum updated July 2, 2025; live page requires release-time capture', '2025-07-02',
    '2026-08-16T23:00:00Z', '2025-07-02', null,
    'Official government web content; release-time byte capture required', null, 'reviewed'
  ),
  (
    'CDC_ACIP', 'US', 'ACIP Recommendations',
    'https://www.cdc.gov/acip/vaccine-recommendations/index.html',
    'Official status page dated August 8, 2025; release-time status recheck required', '2025-08-08',
    '2026-08-16T23:00:00Z', '2025-08-08', null,
    'Official government web content; release-time byte capture required', null, 'reviewed'
  )
on conflict (source_uri, retrieved_at) do update set
  authority = excluded.authority,
  jurisdiction = excluded.jurisdiction,
  title = excluded.title,
  citation = excluded.citation,
  published_at = excluded.published_at,
  effective_from = excluded.effective_from,
  effective_until = excluded.effective_until,
  license = excluded.license,
  artifact_sha256 = excluded.artifact_sha256,
  status = excluded.status;

insert into public.clinical_algorithms (
  algorithm_key, version, domain, implementation_sha256, status,
  artifact_schema_versions, entrypoint, runtime, test_vector_sha256
)
values (
  'immunization-status-v1', '1.0.0', 'immunization',
  '1ffd023755c9719e577138145e559531baa32cb9c2abfd25a04151960f4b9133',
  'draft', array['1']::text[], 'immunization.evaluateStatus', 'node24',
  '97c18a5db41e73df45e77fcb73a03fd200027dae14270c97da0e60f9b9c7aac4'
)
on conflict (domain, algorithm_key, version) do nothing;
