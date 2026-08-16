begin;

insert into public.clinical_algorithms (id, domain, algorithm_key, version, implementation_sha256, artifact_schema_versions, entrypoint, runtime, test_vector_sha256, status)
values ('00000000-0000-4000-8000-000000000801', 'growth', 'release_fixture', '1.0.0', repeat('1', 64), array['1'], 'fixture.evaluate', 'node24', repeat('2', 64), 'draft');
insert into public.clinical_rule_packs (id, domain, country_code, version, locale, status, effective_from, artifact_sha256)
values ('00000000-0000-4000-8000-000000000802', 'growth', 'CO', '1.0.0', 'es-CO', 'active', '2026-01-01', repeat('3', 64));
insert into public.clinical_approvals (id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256, manifest_sha256, approver_subject, approver_role, request_id)
values ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000802', repeat('3', 64), 'synthetic-only', '00000000-0000-4000-8000-000000000804', 'approved', 1, '00000000-0000-4000-8000-000000000801', repeat('1', 64), repeat('4', 64), repeat('5', 64), '00000000-0000-4000-8000-000000000804', 'clinical_approver', '00000000-0000-4000-8000-000000000805');

insert into public.clinical_package_releases (rule_pack_id, artifact_sha256, algorithm_id, approval_id, domain, country_code, locale, action, status, activation_at, evidence_sha256, preview_sha256, requester_subject, request_id)
values ('00000000-0000-4000-8000-000000000802', repeat('3', 64), '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000803', 'growth', 'CO', 'es-CO', 'release', 'active', now(), repeat('6', 64), repeat('7', 64), '00000000-0000-4000-8000-000000000804', '00000000-0000-4000-8000-000000000806');

do $$
begin
  begin
    insert into public.clinical_package_releases (rule_pack_id, artifact_sha256, algorithm_id, approval_id, domain, country_code, locale, action, status, activation_at, evidence_sha256, preview_sha256, requester_subject, request_id)
    values ('00000000-0000-4000-8000-000000000802', repeat('3', 64), '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000803', 'growth', 'CO', 'es-CO', 'release', 'active', now(), repeat('6', 64), repeat('7', 64), '00000000-0000-4000-8000-000000000804', '00000000-0000-4000-8000-000000000806');
    raise exception 'expected replay denial';
  exception when unique_violation then null;
  end;
  begin
    update public.clinical_package_releases set status = 'superseded' where request_id = '00000000-0000-4000-8000-000000000806';
    raise exception 'expected immutable release denial';
  exception when raise_exception then null;
  end;
end;
$$;

rollback;
