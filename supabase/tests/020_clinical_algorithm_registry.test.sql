begin;

do $$
declare
  algorithm_id uuid;
begin
  insert into public.clinical_algorithms (
    domain, algorithm_key, version, implementation_sha256, artifact_schema_versions,
    entrypoint, runtime, test_vector_sha256, status
  ) values (
    'growth', 'cloud_fixture', '1.0.0', repeat('1', 64), array['1'], 'fixture.evaluate', 'node24', repeat('2', 64), 'draft'
  ) returning id into algorithm_id;

  begin
    insert into public.clinical_algorithms (
      domain, algorithm_key, version, implementation_sha256, artifact_schema_versions,
      entrypoint, runtime, test_vector_sha256, status
    ) values (
      'growth', 'cloud_fixture', '1.0.0', repeat('3', 64), array['1'], 'fixture.evaluate', 'node24', repeat('4', 64), 'draft'
    );
    raise exception 'expected identity uniqueness violation';
  exception when unique_violation then null;
  end;

  begin
    update public.clinical_algorithms set status = 'active' where id = algorithm_id;
    raise exception 'expected lifecycle transition violation';
  exception when raise_exception then null;
  end;

  update public.clinical_algorithms set status = 'approved' where id = algorithm_id;
  update public.clinical_algorithms set status = 'active' where id = algorithm_id;

  begin
    update public.clinical_algorithms set implementation_sha256 = repeat('5', 64) where id = algorithm_id;
    raise exception 'expected immutable identity violation';
  exception when raise_exception then null;
  end;

  if not exists (select 1 from public.clinical_algorithms where id = algorithm_id and status = 'active' and approved_at is not null and activated_at is not null) then
    raise exception 'expected active lifecycle timestamps';
  end if;
end;
$$;

rollback;
