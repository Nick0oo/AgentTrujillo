select result
from (
  select 0 as position, '1..4' as result
  union all
  select 1, case when count(*) = 8 then 'ok 1 - eight WHO growth artifacts are registered' else 'not ok 1 - eight WHO growth artifacts are registered' end
    from public.clinical_sources where authority = 'WHO' and retrieved_at = '2026-08-21T22:00:00Z'
  union all
  select 2, case when count(*) = 9 then 'ok 2 - nine CDC growth artifacts are registered' else 'not ok 2 - nine CDC growth artifacts are registered' end
    from public.clinical_sources where authority = 'CDC_NCHS' and retrieved_at = '2026-08-21T22:00:00Z'
  union all
  select 3, case when count(*) = 17 then 'ok 3 - every growth source has reviewed status and a SHA-256' else 'not ok 3 - every growth source has reviewed status and a SHA-256' end
    from public.clinical_sources where authority in ('WHO', 'CDC_NCHS') and retrieved_at = '2026-08-21T22:00:00Z' and status = 'reviewed' and artifact_sha256 ~ '^[0-9a-f]{64}$'
  union all
  select 4, case when not exists (select 1 from public.clinical_rule_packs where domain = 'growth')
    then 'ok 4 - source registration does not fabricate a growth package' else 'not ok 4 - source registration does not fabricate a growth package' end
) as checks
order by position;
