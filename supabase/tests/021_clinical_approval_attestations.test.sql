begin;

insert into public.clinical_algorithms (
  id, domain, algorithm_key, version, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status
) values (
  '00000000-0000-4000-8000-000000000701', 'growth', 'approval_fixture', '1.0.0', repeat('1', 64), array['1'],
  'fixture.evaluate', 'node24', repeat('2', 64), 'draft'
);

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, artifact_sha256
) values (
  '00000000-0000-4000-8000-000000000702', 'growth', 'CO', '1.0.0', 'es-CO', 'draft', '2026-01-01', repeat('3', 64)
);

insert into public.clinical_approvals (
  id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, request_id
) values (
  '00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000702', repeat('3', 64),
  'synthetic-only', '00000000-0000-4000-8000-000000000704', 'approved', now(), 1,
  '00000000-0000-4000-8000-000000000701', repeat('1', 64), repeat('4', 64), repeat('5', 64),
  '00000000-0000-4000-8000-000000000704', 'clinical_approver', '00000000-0000-4000-8000-000000000705'
);

do $$
begin
  begin
    insert into public.clinical_approvals (
      rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, attestation_version,
      algorithm_id, algorithm_implementation_sha256, source_set_sha256, manifest_sha256,
      approver_subject, approver_role, request_id
    ) values (
      '00000000-0000-4000-8000-000000000702', repeat('3', 64), 'synthetic-only', '00000000-0000-4000-8000-000000000704', 'approved', 1,
      '00000000-0000-4000-8000-000000000701', repeat('1', 64), repeat('4', 64), repeat('5', 64),
      '00000000-0000-4000-8000-000000000704', 'clinical_approver', '00000000-0000-4000-8000-000000000705'
    );
    raise exception 'expected request replay denial';
  exception when unique_violation then null;
  end;
  begin
    update public.clinical_approvals set notes = 'blocked' where id = '00000000-0000-4000-8000-000000000703';
    raise exception 'expected append-only update denial';
  exception when raise_exception then null;
  end;
  begin
    delete from public.clinical_approvals where id = '00000000-0000-4000-8000-000000000703';
    raise exception 'expected append-only delete denial';
  exception when raise_exception then null;
  end;
end;
$$;

insert into public.clinical_approvals (
  rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, withdrawal_of, request_id
) values (
  '00000000-0000-4000-8000-000000000702', repeat('3', 64), 'synthetic-only', '00000000-0000-4000-8000-000000000704', 'withdrawn', now(), 1,
  '00000000-0000-4000-8000-000000000701', repeat('1', 64), repeat('4', 64), repeat('5', 64),
  '00000000-0000-4000-8000-000000000704', 'clinical_approver', '00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000706'
);

rollback;
