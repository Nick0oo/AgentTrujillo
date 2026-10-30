import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeGeneratedTypes,validateGeneratedTypes} from '../generate-database-types.mjs';

// All mutations require the explicit project-specific release authorization.
// This helper never reads guardian, child, chat or Storage content.
const ref='yapjiinrjsrothzgzxsv';
const mode=process.argv[2]??'preflight';
if(!['preflight','dry-run','apply','postflight','types','lint'].includes(mode))throw new Error('MODE_INVALID');
const migrations=['20261029210000_onboarding_birth_dimensions','20261029220000_account_deletion_jobs'].map(name=>({name,version:name.slice(0,14),sql:readFileSync(`supabase/migrations/${name}.sql`,'utf8')}));
const functionNames=migrations.flatMap(m=>[...m.sql.matchAll(/create (?:or replace )?function (?:public|app_private)\.([a-z_]+)/g)].map(match=>match[1]));
const env=Object.fromEntries([...readFileSync('C:/Users/ACER/Desktop/PROYECTOS/TRUJILL0/AgentTrujillo/.env','utf8').matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/gm)].map(m=>[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2').trim()]));
if(new URL(env.SUPABASE_URL).hostname!==`${ref}.supabase.co`)throw new Error('PROJECT_MISMATCH');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function api(path,query){
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:query?'POST':'GET',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},...(query?{body:JSON.stringify({query})}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){
    const body=await response.json().catch(()=>({}));
    const message=typeof body.message==='string'?body.message:'';
    emit({mode,status:response.status,sqlstate:message.match(/ERROR:\s*([0-9A-Z]{5}):/)?.[1],knownFunctions:functionNames.filter(name=>message.includes(name)),category:/ambiguous/i.test(message)?'AMBIGUOUS':/permission denied/i.test(message)?'PERMISSION':/does not exist/i.test(message)?'MISSING_OBJECT':/timeout/i.test(message)?'TIMEOUT':'QUERY_FAILED'});
    throw new Error('LINKED_METADATA_HTTP_'+response.status);
  }
  return response.json();
}
try{
  const project=await api('');
  if(project.id!==ref||project.name!=='CreciendoApp'||project.status!=='ACTIVE_HEALTHY')throw new Error('PROJECT_IDENTITY_OR_HEALTH_MISMATCH');
  const catalogQuery=`select
    (select max(version) from supabase_migrations.schema_migrations) as migration_head,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261029190000') as registration_applied,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261029200000') as policy_applied,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261029210000') as birth_applied,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261029220000') as deletion_applied,
    exists(select 1 from pg_extension where extname='plpgsql_check') as sql_lint_available,
    to_regprocedure('public.request_account_deletion(text)') is not null as deletion_rpc_exists`;
  const catalog=await api('/database/query/read-only',catalogQuery);
  emit({project:'CreciendoApp',catalog});
  for(const version of ['20261029210000_onboarding_birth_dimensions','20261029220000_account_deletion_jobs']){
    const bytes=readFileSync(`supabase/migrations/${version}.sql`);
    emit({migration:version,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const row=catalog[0];
  const lintSql=`create extension if not exists plpgsql_check with schema extensions;
    create temporary table account_erasure_filters(rel oid primary key,predicate text) on commit drop;
    select p.proname as function_name,coalesce(c.relname,'') as trigger_table,x.level,x.sqlstate,x.lineno
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    left join pg_trigger t on t.tgfoid=p.oid left join pg_class c on c.oid=t.tgrelid
    cross join lateral extensions.plpgsql_check_function_tb(p.oid,coalesce(t.tgrelid,0),fatal_errors=>false) x
    where n.nspname in ('public','app_private') and l.lanname='plpgsql'
      and p.proname in (${functionNames.map(name=>`'${name}'`).join(',')});`;
  if(mode==='dry-run'||mode==='apply'){
    if(!row.registration_applied||!row.policy_applied||row.migration_head!=='20261029200000'||row.birth_applied||row.deletion_applied)throw new Error('MIGRATION_PREFLIGHT_CHANGED');
    const guards=`do $lifecycle_guard$ begin
      if (select max(version) from supabase_migrations.schema_migrations)<>'20261029200000'
        or to_regclass('app_private.account_deletion_jobs') is not null then raise exception 'MIGRATION_STATE_CHANGED'; end if;
      end $lifecycle_guard$;`;
    const history=migrations.map((m,i)=>{
      const tag=`$lifecycle_history_${i}$`;if(m.sql.includes(tag))throw new Error('SQL_QUOTE_COLLISION');
      return `insert into supabase_migrations.schema_migrations(version,name,statements) values('${m.version}','${m.name.slice(15)}',array[${tag}${m.sql}${tag}]);`;
    }).join('\n');
    const sql=`begin; set local lock_timeout='5s'; set local statement_timeout='45s';
      select pg_advisory_xact_lock(29220000); ${guards}
      ${migrations.map(m=>m.sql).join('\n')}
      ${mode==='dry-run'?lintSql:`${history} notify pgrst,'reload schema';`}
      ${mode==='dry-run'?'rollback':'commit'};`;
    const result=await api('/database/query',sql);
    if(mode==='dry-run'){
      emit({mode,lint:result});
      if(result.some(item=>item.level==='error'))throw new Error('SQL_LINT_FAILED');
      const after=await api('/database/query/read-only',catalogQuery);
      if(JSON.stringify(after)!==JSON.stringify(catalog))throw new Error('ROLLBACK_NOT_VERIFIED');
      emit({dryRunPassed:true,rollbackVerified:true});
    }else emit({applied:true,catalog:await api('/database/query/read-only',catalogQuery)});
    process.exit(0);
  }
  if(['postflight','types','lint'].includes(mode)){
    if(!row.birth_applied||!row.deletion_applied||!row.deletion_rpc_exists)throw new Error('ACTIVATION_REQUIRED');
    if(mode==='types'){
      const generated=validateGeneratedTypes((await api('/types/typescript?included_schemas=public')).types);
      for(const marker of ['birth_length_cm','birth_head_circumference_cm','create_onboarding_with_birth_measurements','request_account_deletion','account_deletion_archive_scope'])if(!generated.includes(marker))throw new Error('TYPES_CONTRACT_MISSING');
      for(const target of ['agent/lib/supabase/database.types.ts','src/persistence/supabase/database.types.ts'])writeFileSync(target,generated);
      const repeated=normalizeGeneratedTypes((await api('/types/typescript?included_schemas=public')).types);
      if(repeated!==generated)throw new Error('TYPES_PARITY_FAILED');
      emit({typesUpdated:true,parity:true,bytes:Buffer.byteLength(generated),sha256:createHash('sha256').update(generated).digest('hex')});
    }else if(mode==='lint'){
      const result=await api('/database/query',`begin; set local statement_timeout='45s'; ${lintSql} rollback;`);
      emit({lint:result});if(result.some(item=>item.level==='error'))throw new Error('SQL_LINT_FAILED');
    }else{
      const [grants]=await api('/database/query/read-only',`select
        not has_function_privilege('anon','public.request_account_deletion(text)','execute') as anon_denied,
        has_function_privilege('authenticated','public.request_account_deletion(text)','execute') as self_service_allowed,
        not has_function_privilege('authenticated','public.claim_account_deletion_job()','execute') as worker_denied,
        not has_function_privilege('authenticated','public.ack_account_deletion_archive(uuid,uuid,text)','execute') as archive_ack_denied,
        not has_table_privilege('authenticated','app_private.account_deletion_jobs','select,insert,update,delete') as private_jobs_denied,
        not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity
          and not exists(select from pg_policy p where p.polrelid=c.oid and p.polname='account_deletion_denial' and not p.polpermissive)) as pending_rls_covers_all`);
      emit({grants});if(!Object.values(grants).every(value=>value===true))throw new Error('POSTFLIGHT_GRANTS_FAILED');
    }
    process.exit(0);
  }
  const key=env.SUPABASE_PUBLISHABLE_KEY??env.SUPABASE_ANON_KEY;
  const health=await fetch(`${env.SUPABASE_URL}/auth/v1/health`,{headers:{apikey:key},signal:AbortSignal.timeout(15000)});
  const healthBody=health.ok?await health.json():{};
  emit({authHealth:health.status,authVersion:typeof healthBody.version==='string'?healthBody.version.slice(0,32):null});
  const backend=await fetch('https://agent.creciendo.com.co/creciendo/v1/account/deletion',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
  emit({unauthenticatedDeletionEndpoint:backend.status});
}catch(error){emit({ok:false,code:/^[A-Z_]+(?:_\d+)?$/.test(error.message)?error.message:'LINKED_PREFLIGHT_UNAVAILABLE'});process.exitCode=1;}
