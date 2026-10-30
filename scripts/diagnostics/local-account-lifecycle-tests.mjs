import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

// An isolated, networkless, synthetic fixture. Never accepts a linked database URL.
const container = 'creciendo-account-tests-20261029';
function sql(source, label) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input: `set client_min_messages=warning;\n${source}`, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(`${label}: ${result.stderr.split('\n').filter(line=>!line.startsWith('NOTICE:')).slice(-20).join('\n').slice(0,3000)}\n`);
    process.exit(1);
  }
}
let inspect = spawnSync('docker', ['inspect', container], { encoding: 'utf8' });
if (inspect.status !== 0 && process.argv.includes('--create-fixture')) {
  const created=spawnSync('docker',['run','-d','--name',container,'--network','none','--label','codex.task=creciendo-account-onboarding-20261029','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17'],{encoding:'utf8'});
  if(created.status!==0)throw new Error('FIXTURE_CREATION_FAILED');
  inspect=spawnSync('docker',['inspect',container],{encoding:'utf8'});
}
function verifiedFixture(result){
  if(result.status!==0)throw new Error('ISOLATED_FIXTURE_REQUIRED');
  const info=JSON.parse(result.stdout)[0];
  if(!/^[a-f0-9]{64}$/.test(info.Id)||info.Config.Labels?.['codex.task']!=='creciendo-account-onboarding-20261029'||info.HostConfig.NetworkMode!=='none')throw new Error('ISOLATED_FIXTURE_REQUIRED');
  return info.Id;
}
const fixtureId=verifiedFixture(inspect);
let ready=false;
for(let attempt=0;attempt<30;attempt++){
  if(spawnSync('docker',['exec',fixtureId,'pg_isready','-U','postgres'],{encoding:'utf8'}).status===0){ready=true;break;}
  await pause(1000);
}
if(!ready)throw new Error('FIXTURE_DATABASE_UNAVAILABLE');
if (!process.argv.includes('--tests-only')) {
sql(`drop schema if exists public cascade; create schema public; grant usage on schema public to public;
drop schema if exists app_private cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists extensions cascade;
do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
create schema auth; create schema storage; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to authenticated,anon,service_role; grant execute on all functions in schema auth to authenticated,anon,service_role;
create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create domain extensions.vector as real[];
do $$ begin if not exists(select from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end $$;
`, 'fixture');
for (const name of readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort()) {
  if(name==='20261029230000_account_deletion_rls_prerequisite.sql'){
    // Reproduce the linked failure before testing its forward repair. This
    // executes only inside the verified, networkless synthetic container.
    sql(`do $$ declare t record; begin for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' loop
      execute format('alter table public.%I disable row level security',t.relname);
      execute format('drop policy if exists account_deletion_denial on public.%I',t.relname);
      execute format('drop trigger if exists account_deletion_write_guard on public.%I',t.relname);
    end loop; end $$;`,'reproduce-linked-rls-drift');
  }
  let source = readFileSync(resolve('supabase/migrations', name), 'utf8');
  // Fixture-only replacement: lifecycle tests never exercise vector math/indexes.
  source = source.replace(/create extension if not exists vector with schema extensions;/gi, '')
    .replace(/extensions\.vector\(\d+\)/g, 'extensions.vector')
    .replace(/create index[^;]+using hnsw[^;]+;/gi, '')
    .replace(/create index[^;]+using ivfflat[^;]+;/gi, '');
  sql(`set check_function_bodies=off;\n${source}`, name);
}
}
if (process.argv.includes('--schema-only')) { process.stdout.write('Synthetic lifecycle schema loaded. Vector algorithms are outside this fixture.\n'); process.exit(0); }
for (const name of readdirSync('supabase/tests').filter(n => n.startsWith('account-lifecycle-') && n.endsWith('.sql')).sort()) sql(readFileSync(resolve('supabase/tests', name), 'utf8'), name);
process.stdout.write('Synthetic lifecycle SQL assertions passed.\n');
if(process.argv.includes('--cleanup-fixture')){
  verifiedFixture(spawnSync('docker',['inspect',fixtureId],{encoding:'utf8'}));
  const removed=spawnSync('docker',['rm','-f','-v',fixtureId],{encoding:'utf8'});
  if(removed.status!==0)throw new Error('FIXTURE_CLEANUP_FAILED');
  process.stdout.write('Owned synthetic fixture removed.\n');
}
