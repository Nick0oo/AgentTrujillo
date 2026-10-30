import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';

// Explicitly approved disposable synthetic workflow only. Never accepts an
// account identifier, password or child ID as an argument. No real-user reads.
const resume=process.argv[2]==='--resume-approved-synthetic-erasure';
if(!resume&&process.argv[2]!=='--approved-synthetic-erasure')throw new Error('SYNTHETIC_ERASURE_APPROVAL_REQUIRED');
const receiptPath='.eve/hosted-lifecycle-fixture.json';
if(existsSync(receiptPath)!==resume)throw new Error('EXISTING_FIXTURE_REQUIRES_REVIEW');
const env=Object.fromEntries([...readFileSync('C:/Users/ACER/Desktop/PROYECTOS/TRUJILL0/AgentTrujillo/.env','utf8').matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/gm)].map(m=>[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2').trim()]));
const ref='yapjiinrjsrothzgzxsv';
if(new URL(env.SUPABASE_URL).hostname!==`${ref}.supabase.co`)throw new Error('PROJECT_MISMATCH');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,opts);
const guardian=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY??env.SUPABASE_ANON_KEY,opts);
const savedFixture=resume?JSON.parse(readFileSync(receiptPath,'utf8')):null;
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
if(resume&&(!/^[a-f0-9]{32}$/.test(savedFixture.nonce)||savedFixture.version!==1||savedFixture.completed||!Array.isArray(savedFixture.children)||savedFixture.children.length!==2
  ||![savedFixture.actor,savedFixture.job,savedFixture.space,savedFixture.session,...savedFixture.children].every(validId)
  ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(savedFixture.createdAt)))throw new Error('SYNTHETIC_FIXTURE_INVALID');
const nonce=savedFixture?.nonce??randomBytes(16).toString('hex');
const email=`creciendo-lifecycle-${nonce}@example.invalid`,password=randomBytes(32).toString('base64url');
const fixture=savedFixture??{version:1,nonce,createdAt:new Date().toISOString(),actor:null,children:[],space:null,session:null,job:null,completed:false};
const save=()=>writeFileSync(receiptPath,JSON.stringify(fixture,null,2));
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const assert=(condition,code)=>{if(!condition)throw new Error(code);};
const uuid=value=>{assert(validId(value),'FIXTURE_ID_INVALID');return value;};
let loader;
async function sql(query){
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){const body=await response.json().catch(()=>({}));emit({databaseStatus:response.status,sqlstate:typeof body.message==='string'?body.message.match(/ERROR:\s*([A-Z0-9]{5}):/)?.[1]:undefined});throw new Error('SYNTHETIC_SQL_FAILED');}
  return response.json();
}
async function rpc(name,args={}){const result=await admin.rpc(name,args);if(result.error){emit({rpc:name,code:result.error.code});throw new Error('SYNTHETIC_RPC_FAILED');}return result.data;}
async function http(path,body,token){
  const response=await fetch('https://agent.creciendo.com.co'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>({}));return {status:response.status,data};
}
try{
  const deployed=await http('/creciendo/v1/account/deletion',{});
  assert(deployed.status===401,'BACKEND_ACTIVATION_REQUIRED');
  loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  const {runAccountDeletionSweep}=await loader.ssrLoadModule('/agent/lib/privacy/account-deletion-worker.ts');
  let signed;
  if(resume){
    const own=await admin.auth.admin.getUserById(uuid(fixture.actor));
    assert(!own.error&&own.data.user?.user_metadata.lifecycle_fixture===nonce&&own.data.user.email===email,'SYNTHETIC_FIXTURE_SCOPE_CHANGED');
    const link=await admin.auth.admin.generateLink({type:'magiclink',email});
    assert(!link.error&&link.data.properties?.hashed_token,'SYNTHETIC_RESUME_TOKEN_FAILED');
    signed=await guardian.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});
  }else{
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Synthetic lifecycle fixture',lifecycle_fixture:nonce}});
    assert(!created.error&&created.data.user,'SYNTHETIC_AUTH_CREATE_FAILED');
    fixture.actor=uuid(created.data.user.id);save();
    signed=await guardian.auth.signInWithPassword({email,password});
  }
  assert(!signed.error&&signed.data.session,'SYNTHETIC_SIGN_IN_FAILED');
  const token=signed.data.session.access_token,refresh=signed.data.session.refresh_token;
  if(!resume){
  const child={givenNames:'Synthetic child',familyNames:'Synthetic family',preferredName:'Synthetic preferred',birthDate:'2025-01-01',referenceSex:'female',countryOfCare:'CO',timezone:'America/Bogota',isPremature:false,gestationalAgeWeeks:null,birthWeightGrams:3200,birthLengthCm:50.25,birthHeadCircumferenceCm:34.5,allergies:[]};
  const onboarding={contractVersion:'onboarding.v1',idempotencyKey:'fixture-onboarding-'+nonce,careSpace:{name:'Synthetic lifecycle fixture'},child,guardianRelationship:'guardian',privacyConsentAccepted:true};
  const first=await http('/creciendo/v1/onboarding',onboarding,token);
  if(first.status!==201)emit({onboardingStatus:first.status,code:first.data.code});
  assert(first.status===201,'SYNTHETIC_ONBOARDING_FAILED');
  fixture.space=uuid(first.data.careSpaceId);fixture.children.push(uuid(first.data.childId));save();
  const replay=await http('/creciendo/v1/onboarding',onboarding,token);
  assert(replay.status===200&&replay.data.childId===fixture.children[0],'SYNTHETIC_REPLAY_FAILED');
  const stored=await guardian.from('children').select('family_names,preferred_name,birth_weight_grams,birth_length_cm,birth_head_circumference_cm').eq('id',fixture.children[0]).single();
  assert(!stored.error&&stored.data.family_names===child.familyNames&&stored.data.preferred_name===child.preferredName&&stored.data.birth_weight_grams===3200&&stored.data.birth_length_cm===50.25&&stored.data.birth_head_circumference_cm===34.5,'SYNTHETIC_BIRTH_PERSISTENCE_FAILED');
  const edited=await guardian.rpc('update_registered_birth_measurements',{p_child_id:fixture.children[0],p_birth_weight_grams:3250,p_birth_length_cm:50.5,p_birth_head_circumference_cm:34.75});
  assert(!edited.error,'SYNTHETIC_PROFILE_EDIT_FAILED');
  const replayAfterEdit=await http('/creciendo/v1/onboarding',onboarding,token);
  assert(replayAfterEdit.status===200,'SYNTHETIC_EDIT_REPLAY_FAILED');
  const sibling=await http('/creciendo/v1/children',{contractVersion:'add-child.v1',idempotencyKey:'fixture-sibling-'+nonce,careSpaceId:fixture.space,child:{...child,givenNames:'Synthetic sibling'},privacyConsentAccepted:true},token);
  assert(sibling.status===201,'SYNTHETIC_SIBLING_FAILED');fixture.children.push(uuid(sibling.data.childId));save();
  const path=`${fixture.actor}/${fixture.children[0]}/lifecycle-fixture.png`;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lQAAAABJRU5ErkJggg==','base64');
  const uploaded=await guardian.storage.from('avatars').upload(path,png,{contentType:'image/png',upsert:false});
  assert(!uploaded.error,'SYNTHETIC_STORAGE_UPLOAD_FAILED');
  const before=await admin.storage.from('avatars').download(path);assert(!before.error&&before.data.size>0,'SYNTHETIC_STORAGE_READ_FAILED');
  fixture.session=randomUUID();save();
  const [guard]=await sql(`select exists(select from auth.users where id='${uuid(fixture.actor)}' and raw_user_meta_data->>'lifecycle_fixture'='${nonce}' and created_at>='${fixture.createdAt}'::timestamptz-interval '1 minute') as owned`);
  assert(guard?.owned===true,'SYNTHETIC_ACCOUNT_SCOPE_FAILED');
  await sql(`begin;
    insert into public.agent_sessions(id,care_space_id,child_id,owner_user_id,channel,initial_model)
      values('${uuid(fixture.session)}','${uuid(fixture.space)}','${uuid(fixture.children[0])}','${uuid(fixture.actor)}','evaluation','synthetic-fixture');
    insert into public.messages(care_space_id,child_id,agent_session_id,sequence,actor_type,parts)
      select '${fixture.space}','${fixture.children[0]}','${fixture.session}',n,'guardian','[{"type":"text","text":"Disposable synthetic lifecycle fixture"}]'::jsonb from generate_series(1,5)n;
    commit;`);
  emit({registrationCreated:true,replay:true,birthDimensionsAndNames:true,profileEdit:true,siblingCreated:true,privateObjectBeforeErasure:true,syntheticMessages:5});
  const deletion=await http('/creciendo/v1/account/deletion',{version:'account-deletion.v1',confirmed:true},token);
  assert(deletion.status===400,'MISSING_IDEMPOTENCY_KEY_ACCEPTED');
  const response=await fetch('https://agent.creciendo.com.co/creciendo/v1/account/deletion',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json','Idempotency-Key':'fixture-deletion-'+nonce},body:JSON.stringify({version:'account-deletion.v1',confirmed:true}),signal:AbortSignal.timeout(30000)});
  const receipt=await response.json();assert(response.status===202&&receipt.accessRevoked===true&&receipt.status==='queued','SYNTHETIC_DELETION_RECEIPT_FAILED');
  fixture.job=uuid(receipt.requestId);save();
  }
  const path=`${fixture.actor}/${fixture.children[0]}/lifecycle-fixture.png`;
  const denied=await guardian.from('children').select('id').in('id',fixture.children);
  assert(!denied.error&&denied.data.length===0,'SYNTHETIC_ACCESS_NOT_REVOKED');
  let batches=0,completed=false,storageRemoved=false;
  // Accelerate only this newly created fixture's lease. The production global
  // hourly clock and all other jobs/schedules remain untouched.
  for(;batches<40&&!completed;batches++){
    const rows=await sql(`update app_private.account_deletion_jobs set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
      where id='${fixture.job}' and actor='${fixture.actor}' and requested_at>='${fixture.createdAt}'::timestamptz
        and child_ids @> array[${fixture.children.map(id=>`'${uuid(id)}'::uuid`).join(',')}] and cardinality(child_ids)=2
        and session_ids=array['${fixture.session}'::uuid] and cardinality(eve_session_ids)=0
        and stage<>'completed' and (lease is null or lease_until<now())
      returning id,actor,lease,stage;`);
    if(!rows.length){const [state]=await sql(`select stage from app_private.account_deletion_jobs where id='${fixture.job}' and actor='${fixture.actor}'`);completed=state?.stage==='completed';assert(completed,'SYNTHETIC_JOB_LEASE_UNAVAILABLE');break;}
    const job=rows[0];
    await runAccountDeletionSweep({
      async claim(){return job;},
      async disableLogin(){const result=await admin.auth.admin.deleteUser(fixture.actor,true);assert(!result.error||result.error.status===404,'SYNTHETIC_AUTH_ERASURE_FAILED');},
      async archive(){const scope=await rpc('account_deletion_archive_scope',{p_job:job.id,p_lease:job.lease});assert(Array.isArray(scope.rootIds)&&scope.rootIds.length===0,'SYNTHETIC_ARCHIVE_SCOPE_CHANGED');return {processed:0,pending:false};},
      async batch(_,limit){return rpc('account_deletion_batch',{p_job:job.id,p_lease:job.lease,p_limit:limit});},
      async removeObjects(objects){for(const item of objects){assert(item.bucket==='avatars'&&item.path===path,'SYNTHETIC_STORAGE_SCOPE_CHANGED');const result=await admin.storage.from(item.bucket).remove([item.path]);assert(!result.error,'SYNTHETIC_STORAGE_ERASURE_FAILED');storageRemoved=true;}},
      async acknowledgeObjects(_,objects){await rpc('ack_account_deletion_objects',{p_job:job.id,p_lease:job.lease,p_ids:objects.map(item=>item.id)});},
      async release(_,failed){await rpc('release_account_deletion_job',{p_job:job.id,p_lease:job.lease,p_failed:failed});},
    });
  }
  assert(completed&&storageRemoved,'SYNTHETIC_ERASURE_NOT_COMPLETED');
  const [remaining]=await sql(`select
    (select count(*) from public.children where id=any(array[${fixture.children.map(id=>`'${id}'::uuid`).join(',')}])) as children,
    (select count(*) from public.agent_sessions where id='${fixture.session}') as sessions,
    (select count(*) from public.messages where agent_session_id='${fixture.session}') as messages,
    (select stage from app_private.account_deletion_jobs where id='${fixture.job}') as stage;`);
  assert(Number(remaining.children)===0&&Number(remaining.sessions)===0&&Number(remaining.messages)===0&&remaining.stage==='completed','SYNTHETIC_DATA_REMAINS');
  const after=await admin.storage.from('avatars').download(path);assert(Boolean(after.error),'SYNTHETIC_STORAGE_BYTES_REMAIN');
  const login=resume?await guardian.auth.getUser(token):await guardian.auth.signInWithPassword({email,password});assert(Boolean(login.error),'SYNTHETIC_LOGIN_STILL_ALLOWED');
  const refreshResult=await guardian.auth.refreshSession({refresh_token:refresh});assert(Boolean(refreshResult.error),'SYNTHETIC_REFRESH_STILL_ALLOWED');
  fixture.completed=true;save();emit({queuedReceipt:true,accessRevokedImmediately:true,loginAndRefreshRevoked:true,chatsErased:true,childrenErased:true,privateBytesErased:true,jobCompleted:true,batches,existingAccountsTouched:0,globalHourlyClockChanged:false,internalArchive:'verified separately with actual bundled LocalWorld fixtures'});
}catch(error){emit({ok:false,code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'HOSTED_SYNTHETIC_CHECK_FAILED',fixtureCreated:Boolean(fixture.actor),queued:Boolean(fixture.job)});process.exitCode=1;}
finally{await loader?.close();}
