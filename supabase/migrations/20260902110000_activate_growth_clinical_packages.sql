-- AT-05-17: approve and activate exact local growth packages.
-- This migration changes control-plane metadata only. It creates no patient row,
-- credential, personal approver identity, public write grant, or market activation.

with expected_source(id, artifact_sha256) as (values
  ('bb8fc1b9-b96e-4506-9608-626e8c6a7f6f'::uuid, '296038a15de807ee74940627bd1ddc638e68b223b410b4ca3ccf1ff4a8b5770a'),
  ('e64a533e-b50b-4d74-836f-7b7c14403bd3'::uuid, '134cd53ca39f0f55b0b3c2bc6c94278c83d9945842bc64088464f73effcd12e7'),
  ('79715fd8-18bc-4362-94d5-507b65ef1542'::uuid, 'ccfd8e455141c9a39dd728d99b7d7e080a925b06ea4a4d7592229665713dba54'),
  ('bbc17adc-eb76-4ba3-afe5-91ec687f513f'::uuid, 'a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d'),
  ('2e360506-72f3-404a-aca4-129efddc3b3c'::uuid, '6757f5eb96b51ab5cdb4828105929c78b1fb3d73b0fd8fa65682ad9f60f8c083'),
  ('82c889ea-eccc-4115-b399-b9e45c6da96a'::uuid, 'a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c'),
  ('f99044e8-9159-43a0-b32e-cbf1bf2eddf3'::uuid, 'f8f5a77b944ff7a8c1524e76f9d33f8a93cc423d23c2e7f2b10ba6b96a428e69'),
  ('f2723d5a-adf3-4c04-8dff-6c99b655f847'::uuid, '01e9a6fda2f3723dbc74d3c86bfbfcb9f6d474367d1d7b4a804501a2debd2ef1'),
  ('6452ba7c-1239-44b5-a46b-5296617066e4'::uuid, '3406c9d125bcb69c062a9e84eb8c0209bfe9346542bdc1d308643750dcc241b7'),
  ('28b6dd80-2d56-4964-b6fb-69a9e386f856'::uuid, '45130d2a9d7c50c54a47e7ba626b66c61d4554bc2d901198cedd9419a53f7251'),
  ('6098661c-9630-4f41-8ccc-34d235a6daa1'::uuid, 'cbeea0e8d500ee15c652f3fdc45bcd02cb9c15d4d1e86f4d8048bbfea8d166e5'),
  ('941f58c1-5e70-4876-8bf9-0a86fdca39be'::uuid, '73221dd4de82eb9a70c1e6dd45c9b9e285fa1a3d7fff4971c3b85c1be6e5feed'),
  ('7c165215-e094-40ac-a311-ac1208684d60'::uuid, 'a334b86bc0ecde80d12cdc172dde17b4390ca53ac372b26dd0d72d8502ac2687'),
  ('487ec964-0fc0-4055-8248-31027f8a801d'::uuid, '3dd616c8d11ad8ad5470929477609e6fc44cb2e5f7b95494061e1413a0034249'),
  ('deff5502-74be-4680-a5a8-d648a7b0eba2'::uuid, 'bf7e2d7af8fdb336f0b159e480414842136da960ea6a730b7e73d1060b4549e9'),
  ('c2633e66-f138-4996-810f-3208131c3849'::uuid, '0f75b6ef7ac725c311bd3ff9d50c5b3b415b7faa00c99126b04f4f9a1c773db3'),
  ('57203783-64bd-445e-b139-c8524e273e0b'::uuid, '7f416a213157a5209bb6cbfd1b19292510248f3f31fe43c9ff63f6d8e39f7890')
)
update public.clinical_sources source
set status = 'approved'
from expected_source expected
where source.id = expected.id
  and source.artifact_sha256 = expected.artifact_sha256
  and source.status in ('reviewed', 'approved');

do $$
begin
  if (select count(1) from public.clinical_sources where id in (
    'bb8fc1b9-b96e-4506-9608-626e8c6a7f6f','e64a533e-b50b-4d74-836f-7b7c14403bd3',
    '79715fd8-18bc-4362-94d5-507b65ef1542','bbc17adc-eb76-4ba3-afe5-91ec687f513f',
    '2e360506-72f3-404a-aca4-129efddc3b3c','82c889ea-eccc-4115-b399-b9e45c6da96a',
    'f99044e8-9159-43a0-b32e-cbf1bf2eddf3','f2723d5a-adf3-4c04-8dff-6c99b655f847',
    '6452ba7c-1239-44b5-a46b-5296617066e4','28b6dd80-2d56-4964-b6fb-69a9e386f856',
    '6098661c-9630-4f41-8ccc-34d235a6daa1','941f58c1-5e70-4876-8bf9-0a86fdca39be',
    '7c165215-e094-40ac-a311-ac1208684d60','487ec964-0fc0-4055-8248-31027f8a801d',
    'deff5502-74be-4680-a5a8-d648a7b0eba2','c2633e66-f138-4996-810f-3208131c3849',
    '57203783-64bd-445e-b139-c8524e273e0b'
  ) and status = 'approved') <> 17 then
    raise exception 'growth source approval precondition failed';
  end if;
end;
$$;

insert into public.clinical_algorithms (
  id, algorithm_key, version, domain, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status, approved_at, activated_at
) values (
  '51000000-0000-4000-8000-000000000001', 'growth-assessment-governed-v1', '1.0.0', 'growth',
  'd71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517', array['1'],
  'growth.assessGrowth', 'node24',
  '0f23f7f0f9c996ebea5a64459ee21aa9388ae46664c7992bbed939d69e619d43', 'active',
  '2026-09-02T15:00:00Z', '2026-09-02T15:00:00Z'
) on conflict (id) do nothing;

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, artifact_uri, artifact_sha256
) values
  ('51000000-0000-4000-8000-000000000101', 'growth', 'CO', '1.0.0', 'es-CO', 'active', '2026-09-02', 'v1/growth/CO/8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b.json', '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b'),
  ('51000000-0000-4000-8000-000000000201', 'growth', 'US', '1.0.0', 'en-US', 'active', '2026-09-02', 'v1/growth/US/f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c.json', 'f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c')
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

insert into public.clinical_rule_pack_sources (rule_pack_id, source_id, purpose)
select '51000000-0000-4000-8000-000000000201'::uuid, source_id, 'normative growth reference'
from unnest(array[
  'bb8fc1b9-b96e-4506-9608-626e8c6a7f6f','e64a533e-b50b-4d74-836f-7b7c14403bd3',
  '79715fd8-18bc-4362-94d5-507b65ef1542','bbc17adc-eb76-4ba3-afe5-91ec687f513f',
  '2e360506-72f3-404a-aca4-129efddc3b3c','82c889ea-eccc-4115-b399-b9e45c6da96a',
  'f99044e8-9159-43a0-b32e-cbf1bf2eddf3','f2723d5a-adf3-4c04-8dff-6c99b655f847',
  '6452ba7c-1239-44b5-a46b-5296617066e4','28b6dd80-2d56-4964-b6fb-69a9e386f856',
  '6098661c-9630-4f41-8ccc-34d235a6daa1','941f58c1-5e70-4876-8bf9-0a86fdca39be',
  '7c165215-e094-40ac-a311-ac1208684d60','487ec964-0fc0-4055-8248-31027f8a801d',
  'deff5502-74be-4680-a5a8-d648a7b0eba2','c2633e66-f138-4996-810f-3208131c3849',
  '57203783-64bd-445e-b139-c8524e273e0b'
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
  ),
  (
    '51000000-0000-4000-8000-000000000202', '51000000-0000-4000-8000-000000000201',
    'f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c',
    'product_owner_conveyed', null, 'approved',
    'growth-us-who-cdc-v1; unsigned conveyed decision; no personal identity or signature', '2026-09-02T15:00:00Z',
    1, '51000000-0000-4000-8000-000000000001',
    'd71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517',
    '1cca51d539c7c44519da5111e17fbf06ed9f6e7143c4f0a84366329a446a32da',
    '57be10bf36b3fe0a39335c9618fff1a521addeb7c6fa4e867b641b8c1d60d430',
    null, 'clinical_approver', '51000000-0000-4000-8000-000000000203',
    'product_owner_conveyed', '30b6d302ac00b770a4d564994afb2c918803e34bc3d71408996d22ae20544089'
  )
on conflict (id) do nothing;

do $$
begin
  perform app_private.activate_clinical_package(
    '51000000-0000-4000-8000-000000000101',
    '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b',
    '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000102',
    'growth', 'CO', 'es-CO', '2026-09-02T15:00:00Z', null,
    '10bc1a538d4e2516cd01fb7450ffe45fba29ade7b6db428b5711f6a2161523ca',
    '51000000-0000-4000-8000-000000000999', '51000000-0000-4000-8000-000000000104',
    'release', '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b'
  );
  perform app_private.activate_clinical_package(
    '51000000-0000-4000-8000-000000000201',
    'f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c',
    '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000202',
    'growth', 'US', 'en-US', '2026-09-02T15:00:00Z', null,
    '57be10bf36b3fe0a39335c9618fff1a521addeb7c6fa4e867b641b8c1d60d430',
    '51000000-0000-4000-8000-000000000999', '51000000-0000-4000-8000-000000000204',
    'release', 'f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c'
  );
end;
$$;

