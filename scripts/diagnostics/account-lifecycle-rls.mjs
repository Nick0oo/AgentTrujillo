import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const mode=process.argv[2]??'preflight';
if(!['preflight','dry-run','apply','postflight'].includes(mode))throw new Error('MODE_INVALID');
const ref='yapjiinrjsrothzgzxsv',version='20261029230000';
const env=Object.fromEntries([...readFileSync('C:/Users/ACER/Desktop/PROYECTOS/TRUJILL0/AgentTrujillo/.env','utf8').matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/gm)].map(m=>[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2').trim()]));
if(new URL(env.SUPABASE_URL).hostname!==`${ref}.supabase.co`)throw new Error('PROJECT_MISMATCH');
const migration=readFileSync(`supabase/migrations/${version}_account_deletion_rls_prerequisite.sql`,'utf8');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function api(path,query){const response=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:query?'POST':'GET',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'content-type':'application/json'},...(query?{body:JSON.stringify({query})}:{}),signal:AbortSignal.timeout(60000)});const body=await response.json();if(!response.ok){emit({status:response.status,sqlstate:typeof body.message==='string'?body.message.match(/ERROR:\s*([A-Z0-9]{5}):/)?.[1]:undefined});throw new Error('RLS_QUERY_FAILED');}return body;}
const catalogSql=`select (select max(version) from supabase_migrations.schema_migrations) as migration_head,
  (select count(*)::int from pg_class v join pg_namespace vn on vn.oid=v.relnamespace where vn.nspname='public' and v.relkind='v' and not coalesce(v.reloptions @> array['security_invoker=true'],false)) as unsafe_views,
  count(*)::int as public_tables,count(*) filter(where not c.relrowsecurity)::int as disabled_rls,
  count(*) filter(where not exists(select from pg_policy p where p.polrelid=c.oid and p.polname='account_deletion_denial' and not p.polpermissive))::int as missing_pending_denial,
  count(*) filter(where not exists(select from pg_trigger t where t.tgrelid=c.oid and t.tgname='account_deletion_write_guard' and t.tgenabled='O'))::int as missing_write_guard
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`;
try{
  const project=await api('');if(project.id!==ref||project.name!=='CreciendoApp'||project.status!=='ACTIVE_HEALTHY')throw new Error('PROJECT_IDENTITY_OR_HEALTH_MISMATCH');
  const [before]=await api('/database/query/read-only',catalogSql);
  emit({mode,catalog:before,migrationSha256:createHash('sha256').update(migration).digest('hex')});
  if(mode==='preflight')process.exit(0);
  if(mode==='postflight'){if(before.public_tables<1||before.disabled_rls!==0||before.missing_pending_denial!==0||before.missing_write_guard!==0||before.unsafe_views!==0||before.migration_head!==version)throw new Error('RLS_POSTFLIGHT_FAILED');emit({rlsPrerequisiteVerified:true});process.exit(0);}
  if(before.migration_head!=='20261029220000'||before.unsafe_views!==0)throw new Error('RLS_MIGRATION_STATE_CHANGED');
  const fixture=JSON.parse(readFileSync('.eve/hosted-lifecycle-fixture.json','utf8'));
  if(!/^[a-f0-9]{32}$/.test(fixture.nonce)||!Array.isArray(fixture.children)||fixture.children.length!==2
    ||![fixture.actor,fixture.job,fixture.space,fixture.session,...fixture.children].every(id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))||fixture.completed)throw new Error('SYNTHETIC_FIXTURE_REQUIRED');
  const [owned]=await api('/database/query/read-only',`select exists(select from auth.users u join app_private.account_deletion_jobs j on j.actor=u.id where u.id='${fixture.actor}' and j.id='${fixture.job}' and j.stage='access' and u.raw_user_meta_data->>'lifecycle_fixture'='${fixture.nonce}') as owned`);
  if(!owned.owned)throw new Error('SYNTHETIC_FIXTURE_SCOPE_CHANGED');
  const tests=`select set_config('request.jwt.claim.sub','${fixture.actor}',true);
    set local role authenticated;
    do $pending$ begin if exists(select from public.children) then raise exception 'PENDING_ACTOR_VISIBLE'; end if; end $pending$;
    reset role;
    savepoint active_fixture;
    delete from app_private.account_deletion_jobs where id='${fixture.job}' and actor='${fixture.actor}';
    update public.care_space_members set status='active',revoked_at=null where user_id='${fixture.actor}' and care_space_id='${fixture.space}';
    update public.child_access set status='active',revoked_at=null where user_id='${fixture.actor}' and child_id=any(array[${fixture.children.map(id=>`'${id}'::uuid`).join(',')}]);
    set local role authenticated;
    do $active$ begin
      if (select count(*) from public.children)<>2 then raise exception 'ACTIVE_FIXTURE_READ_FAILED'; end if;
      if not exists(select from public.clinical_package_releases where status='active') then raise exception 'ACTIVE_CATALOG_READ_FAILED'; end if;
    end $active$;
    reset role;
    rollback to savepoint active_fixture;
    select set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
    set local role authenticated;
    do $foreign$ begin if exists(select from public.children) then raise exception 'FOREIGN_ACTOR_VISIBLE'; end if; end $foreign$;
    reset role;
    select jsonb_build_object('pendingDenied',true,'activeFixturePreserved',true,'foreignDenied',true,'activeClinicalCatalogPreserved',true) as assertions;`;
  const guard=`do $guard$ begin if (select max(version) from supabase_migrations.schema_migrations)<>'20261029220000' then raise exception 'RLS_MIGRATION_STATE_CHANGED'; end if; end $guard$;`;
  if(migration.includes('$rls_history$'))throw new Error('SQL_QUOTE_COLLISION');
  const result=await api('/database/query',`begin; set local lock_timeout='5s'; set local statement_timeout='45s'; ${guard} ${migration}
    ${mode==='dry-run'?tests:`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','account_deletion_rls_prerequisite',array[$rls_history$${migration}$rls_history$]); notify pgrst,'reload schema';`}
    ${mode==='dry-run'?'rollback':'commit'};`);
  const [after]=await api('/database/query/read-only',catalogSql);
  if(mode==='dry-run'){if(JSON.stringify(after)!==JSON.stringify(before))throw new Error('RLS_ROLLBACK_NOT_VERIFIED');emit({dryRun:result,rollbackVerified:true});}
  else {if(after.disabled_rls||after.missing_pending_denial||after.missing_write_guard||after.migration_head!==version)throw new Error('RLS_APPLY_POSTFLIGHT_FAILED');emit({applied:true,catalog:after});}
}catch(error){emit({ok:false,code:/^[A-Z_]+$/.test(error.message)?error.message:'RLS_DIAGNOSTIC_FAILED'});process.exitCode=1;}
