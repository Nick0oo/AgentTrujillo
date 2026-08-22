begin;

insert into public.clinical_algorithms (
  id, domain, algorithm_key, version, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status
) values (
  '33000000-0000-4000-8000-000000000001', 'growth', 'conveyed_approval_fixture', '1.0.0', repeat('1', 64), array['1'],
  'fixture.evaluate', 'node24', repeat('2', 64), 'draft'
);

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, artifact_sha256
) values (
  '33000000-0000-4000-8000-000000000002', 'growth', 'CO', '1.0.0', 'es-CO', 'draft', '2026-01-01', repeat('3', 64)
);

insert into public.clinical_approvals (
  id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, request_id,
  approval_provenance, conveyance_record_sha256
) values (
  '33000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000002', repeat('3', 64),
  'product_owner_conveyed', null, 'approved', '2026-08-22T12:00:00Z', 1,
  '33000000-0000-4000-8000-000000000001', repeat('1', 64), repeat('4', 64), repeat('5', 64),
  null, 'clinical_approver', '33000000-0000-4000-8000-000000000004',
  'product_owner_conveyed', repeat('6', 64)
);

do $$
begin
  begin
    insert into public.clinical_approvals (
      rule_pack_id, artifact_sha256, approver_name, decision, attestation_version,
      algorithm_id, algorithm_implementation_sha256, source_set_sha256, manifest_sha256,
      approver_subject, approver_role, request_id, approval_provenance, conveyance_record_sha256
    ) values (
      '33000000-0000-4000-8000-000000000002', repeat('7', 64), 'invalid-conveyed', 'rejected', 1,
      '33000000-0000-4000-8000-000000000001', repeat('1', 64), repeat('4', 64), repeat('8', 64),
      '33000000-0000-4000-8000-000000000099', 'clinical_approver', '33000000-0000-4000-8000-000000000005',
      'product_owner_conveyed', repeat('6', 64)
    );
    raise exception 'expected conveyed personal-subject rejection';
  exception when check_violation then null;
  end;

  begin
    insert into public.clinical_approvals (
      rule_pack_id, artifact_sha256, approver_name, decision, attestation_version,
      algorithm_id, algorithm_implementation_sha256, source_set_sha256, manifest_sha256,
      approver_subject, approver_role, request_id, approval_provenance, conveyance_record_sha256
    ) values (
      '33000000-0000-4000-8000-000000000002', repeat('7', 64), 'invalid-conveyed', 'rejected', 1,
      '33000000-0000-4000-8000-000000000001', repeat('1', 64), repeat('4', 64), repeat('8', 64),
      null, 'clinical_approver', '33000000-0000-4000-8000-000000000006',
      'product_owner_conveyed', null
    );
    raise exception 'expected missing conveyance digest rejection';
  exception when check_violation then null;
  end;

  begin
    update public.clinical_approvals
    set conveyance_record_sha256 = repeat('9', 64)
    where id = '33000000-0000-4000-8000-000000000003';
    raise exception 'expected append-only update rejection';
  exception when raise_exception then null;
  end;
end;
$$;

rollback;
