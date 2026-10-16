-- Production CO growth activation, requested 2026-10-16.
-- Reuses exact 2026-09-02 conveyed approval; no new clinical authority.
-- Does not activate US packages or modify patient records.
with expected_source(id, artifact_sha256) as (values
  ('bb8fc1b9-b96e-4506-9608-626e8c6a7f6f'::uuid, '296038a15de807ee74940627bd1ddc638e68b223b410b4ca3ccf1ff4a8b5770a'),
  ('e64a533e-b50b-4d74-836f-7b7c14403bd3'::uuid, '134cd53ca39f0f55b0b3c2bc6c94278c83d9945842bc64088464f73effcd12e7'),
  ('79715fd8-18bc-4362-94d5-507b65ef1542'::uuid, 'ccfd8e455141c9a39dd728d99b7d7e080a925b06ea4a4d7592229665713dba54'),
  ('bbc17adc-eb76-4ba3-afe5-91ec687f513f'::uuid, 'a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d'),
  ('2e360506-72f3-404a-aca4-129efddc3b3c'::uuid, '6757f5eb96b51ab5cdb4828105929c78b1fb3d73b0fd8fa65682ad9f60f8c083'),
  ('82c889ea-eccc-4115-b399-b9e45c6da96a'::uuid, 'a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c'),
  ('f99044e8-9159-43a0-b32e-cbf1bf2eddf3'::uuid, 'f8f5a77b944ff7a8c1524e76f9d33f8a93cc423d23c2e7f2b10ba6b96a428e69'),
  ('f2723d5a-adf3-4c04-8dff-6c99b655f847'::uuid, '01e9a6fda2f3723dbc74d3c86bfbfcb9f6d474367d1d7b4a804501a2debd2ef1')
)
update public.clinical_sources source set status = 'approved'
from expected_source expected where source.id = expected.id
and source.artifact_sha256 = expected.artifact_sha256 and source.status in ('reviewed','approved');
do $$ begin
  if (select count(*) from public.clinical_sources where id in ('bb8fc1b9-b96e-4506-9608-626e8c6a7f6f','e64a533e-b50b-4d74-836f-7b7c14403bd3','79715fd8-18bc-4362-94d5-507b65ef1542','bbc17adc-eb76-4ba3-afe5-91ec687f513f','2e360506-72f3-404a-aca4-129efddc3b3c','82c889ea-eccc-4115-b399-b9e45c6da96a','f99044e8-9159-43a0-b32e-cbf1bf2eddf3','f2723d5a-adf3-4c04-8dff-6c99b655f847') and status='approved') <> 8 then
    raise exception 'growth CO source approval precondition failed';
  end if;
end; $$;
insert into public.clinical_algorithms (
  id, algorithm_key, version, domain, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status, approved_at, activated_at
) values (
  '51000000-0000-4000-8000-000000000001', 'growth-assessment-governed-v1', '1.0.0', 'growth',
  'd71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517', array['1'],
  'growth.assessGrowth', 'node24',
  '0f23f7f0f9c996ebea5a64459ee21aa9388ae46664c7992bbed939d69e619d43', 'active',
  '2026-09-02T15:00:00Z', now()
) on conflict (id) do nothing;

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, artifact_uri, artifact_sha256
) values
  ('51000000-0000-4000-8000-000000000101', 'growth', 'CO', '1.0.0', 'es-CO', 'active', '2026-09-02', 'v1/growth/CO/8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b.json', '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b')
on conflict (id) do nothing;

insert into public.clinical_rule_pack_sources (rule_pack_id, source_id, purpose)
select '51000000-0000-4000-8000-000000000101'::uuid, source_id, 'normative growth reference'
from unnest(array[
  'bb8fc1b9-b96e-4506-9608-626e8c6a7f6f','e64a533e-b50b-4d74-836f-7b7c14403bd3',
  '79715fd8-18bc-4362-94d5-507b65ef1542','bbc17adc-eb76-4ba3-afe5-91ec687f513f',
  '2e360506-72f3-404a-aca4-129efddc3b3c','82c889ea-eccc-4115-b399-b9e45c6da96a',
  'f99044e8-9159-43a0-b32e-cbf1bf2eddf3','f2723d5a-adf3-4c04-8dff-6c99b655f847'
]::uuid[]) source_id
on conflict (rule_pack_id, source_id) do update set purpose = excluded.purpose;

insert into public.clinical_approvals (
  id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, notes, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, request_id,
  approval_provenance, conveyance_record_sha256
) values
  (
    '51000000-0000-4000-8000-000000000102', '51000000-0000-4000-8000-000000000101',
    '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b',
    'product_owner_conveyed', null, 'approved',
    'growth-co-who-v1; unsigned conveyed decision; no personal identity or signature', '2026-09-02T15:00:00Z',
    1, '51000000-0000-4000-8000-000000000001',
    'd71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517',
    'bb259ea0bb6a0538e93ab9143fc9f0f2501a56aa296f4d76ba006bda7ac757a7',
    '10bc1a538d4e2516cd01fb7450ffe45fba29ade7b6db428b5711f6a2161523ca',
    null, 'clinical_approver', '51000000-0000-4000-8000-000000000103',
    'product_owner_conveyed', '30b6d302ac00b770a4d564994afb2c918803e34bc3d71408996d22ae20544089'
  )
on conflict (id) do nothing;

do $$
begin
  perform app_private.activate_clinical_package(
    '51000000-0000-4000-8000-000000000101',
    '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b',
    '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000102',
    'growth', 'CO', 'es-CO', now(), null,
    '10bc1a538d4e2516cd01fb7450ffe45fba29ade7b6db428b5711f6a2161523ca',
    '51000000-0000-4000-8000-000000000999', '51000000-0000-4000-8000-000000000104',
    'release', '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b'
  );
end;
$$;

