begin;

do $$
declare
  package_count integer;
  release_count integer;
  approval_count integer;
  co_source_count integer;
  us_source_count integer;
begin
  select count(1) into package_count
  from public.clinical_rule_packs
  where id in ('51000000-0000-4000-8000-000000000101','51000000-0000-4000-8000-000000000201')
    and domain = 'growth' and status = 'active'
    and ((country_code = 'CO' and locale = 'es-CO' and version = '1.0.0'
      and artifact_sha256 = '8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b')
      or (country_code = 'US' and locale = 'en-US' and version = '1.0.0'
      and artifact_sha256 = 'f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c'));
  if package_count <> 2 then raise exception 'expected two exact growth packages, found %', package_count; end if;

  select count(1) into release_count
  from public.clinical_package_releases release
  join public.clinical_rule_packs pack on pack.id = release.rule_pack_id
  where pack.id in ('51000000-0000-4000-8000-000000000101','51000000-0000-4000-8000-000000000201')
    and release.status = 'active' and release.action = 'release'
    and release.artifact_sha256 = pack.artifact_sha256
    and release.algorithm_id = '51000000-0000-4000-8000-000000000001';
  if release_count <> 2 then raise exception 'expected two active exact growth releases, found %', release_count; end if;

  select count(1) into approval_count
  from public.clinical_approvals approval
  join public.clinical_package_releases release on release.approval_id = approval.id
  where approval.id in ('51000000-0000-4000-8000-000000000102','51000000-0000-4000-8000-000000000202')
    and approval.decision = 'approved'
    and approval.approval_provenance = 'product_owner_conveyed'
    and approval.approver_subject is null
    and approval.approver_user_id is null
    and ((approval.rule_pack_id = '51000000-0000-4000-8000-000000000101' and approval.notes like 'growth-co-who-v1;%')
      or (approval.rule_pack_id = '51000000-0000-4000-8000-000000000201' and approval.notes like 'growth-us-who-cdc-v1;%'))
    and approval.conveyance_record_sha256 = '30b6d302ac00b770a4d564994afb2c918803e34bc3d71408996d22ae20544089'
    and approval.artifact_sha256 = release.artifact_sha256
    and approval.algorithm_implementation_sha256 = 'd71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517';
  if approval_count <> 2 then raise exception 'expected two unsigned conveyed growth approvals, found %', approval_count; end if;

  select count(1) into co_source_count
  from public.clinical_rule_pack_sources link
  join public.clinical_sources source on source.id = link.source_id
  where link.rule_pack_id = '51000000-0000-4000-8000-000000000101'
    and source.authority = 'WHO' and source.jurisdiction = 'GLOBAL' and source.status = 'approved';
  if co_source_count <> 8 then raise exception 'CO package WHO source isolation failed: %', co_source_count; end if;

  if exists (
    select 1 from public.clinical_rule_pack_sources link
    join public.clinical_sources source on source.id = link.source_id
    where link.rule_pack_id = '51000000-0000-4000-8000-000000000101'
      and (source.authority <> 'WHO' or source.jurisdiction <> 'GLOBAL')
  ) then raise exception 'CO package mixed a non-WHO source'; end if;

  select count(1) into us_source_count
  from public.clinical_rule_pack_sources link
  join public.clinical_sources source on source.id = link.source_id
  where link.rule_pack_id = '51000000-0000-4000-8000-000000000201'
    and source.status = 'approved'
    and ((source.authority = 'WHO' and source.jurisdiction = 'GLOBAL')
      or (source.authority = 'CDC_NCHS' and source.jurisdiction = 'US'));
  if us_source_count <> 17 then raise exception 'US package WHO/CDC_NCHS source isolation failed: %', us_source_count; end if;

  if exists (
    select 1 from public.clinical_rule_packs
    where id in ('51000000-0000-4000-8000-000000000101','51000000-0000-4000-8000-000000000201')
      and ((country_code = 'CO' and locale <> 'es-CO') or (country_code = 'US' and locale <> 'en-US'))
  ) then raise exception 'growth package locale crossed country boundary'; end if;
end;
$$;

rollback;
