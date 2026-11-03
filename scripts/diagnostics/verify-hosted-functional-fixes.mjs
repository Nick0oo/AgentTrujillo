import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';

if(!['--approved-disposable-fixture','--resume-approved-disposable-fixture'].includes(process.argv[2]))throw Error('EXPLICIT_FIXTURE_APPROVAL_REQUIRED');
const file='.eve/functional-fixes-fixture.json',resume=process.argv[2].startsWith('--resume');
if(existsSync(file)!==resume)throw Error('FIXTURE_RESUME_STATE_MISMATCH');
const env=Object.fromEntries([...readFileSync('C:/Users/ACER/Desktop/PROYECTOS/TRUJILL0/AgentTrujillo/.env','utf8').matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/gm)].map(m=>[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2').trim()]));
const ref='yapjiinrjsrothzgzxsv';if(new URL(env.SUPABASE_URL).hostname!==ref+'.supabase.co')throw Error('PROJECT_MISMATCH');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const guardian=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY??env.SUPABASE_ANON_KEY,options);
const fixture=resume?JSON.parse(readFileSync(file,'utf8')):{version:1,nonce:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),actor:null,space:null,children:[],childJob:null,accountJob:null,tested:false,childCompleted:false,completed:false};
const id=value=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))throw Error('FIXTURE_ID_INVALID');return value;};
const assert=(condition,code)=>{if(!condition)throw Error(code);};
assert(fixture.version===1&&/^[a-f0-9]{32}$/.test(fixture.nonce)&&!fixture.completed,'FIXTURE_INVALID');
const save=()=>writeFileSync(file,JSON.stringify(fixture,null,2));
const emit=value=>console.log(JSON.stringify(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const email='creciendo-functional-'+fixture.nonce+'@example.invalid',password=randomBytes(32).toString('base64url');
let loader,token;
async function sql(query){const response=await fetch('https://api.supabase.com/v1/projects/'+ref+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('SYNTHETIC_SQL_FAILED_'+response.status);return response.json();}
async function rpc(client,name,args){const result=await client.rpc(name,args);if(result.error)throw Error('RPC_'+name.toUpperCase()+'_'+String(result.error.code??'FAILED').replace(/[^A-Z0-9]/g,''));return result.data;}
async function http(path,body,extra={}){const response=await fetch('https://agent.creciendo.com.co'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'content-type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok)emit({step:path,status:response.status,code:typeof data.code==='string'&&/^[A-Z_]+$/.test(data.code)?data.code:undefined,persistenceCode:response.headers.get('x-creciendo-persistence-code')?.match(/^(?:[A-Z0-9]{5}|PGRST\d{3})$/)?.[0]});assert(response.ok,'HTTP_'+response.status);return data;}
async function verifyOwnership(){
 const [row]=await sql(`select exists(select from auth.users where id='${id(fixture.actor)}' and raw_user_meta_data->>'functional_fixture'='${fixture.nonce}' and created_at>='${fixture.createdAt}'::timestamptz-interval '1 minute') as owned;`);
 assert(row.owned,'SYNTHETIC_OWNER_MISMATCH');
}
async function sweep(jobId,kind){
 let done=false,batches=0,authCalls=0;
 for(;batches<40&&!done;batches++){
  const [state]=await sql(`select stage from app_private.account_deletion_jobs where id='${id(jobId)}' and actor='${id(fixture.actor)}' and kind='${kind}' and requested_at>='${fixture.createdAt}'::timestamptz;`);
  assert(state,'SYNTHETIC_JOB_NOT_FOUND');if(state.stage==='completed'){done=true;break;}
  const jobs=await sql(`update app_private.account_deletion_jobs set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    where id='${jobId}' and actor='${fixture.actor}' and kind='${kind}' and requested_at>='${fixture.createdAt}'::timestamptz
      and child_ids=array['${id(fixture.children[kind==='child'?0:1])}'::uuid] and cardinality(session_ids)=0 and cardinality(eve_session_ids)=0
      and stage<>'completed' and (lease is null or lease_until<now()) returning id,actor,lease,stage,kind;`);
  assert(jobs.length===1,'SYNTHETIC_LEASE_OR_SCOPE_CHANGED');const job=jobs[0];
  const {runAccountDeletionSweep}=await loader.ssrLoadModule('/agent/lib/privacy/account-deletion-worker.ts');
  await runAccountDeletionSweep({
   async claim(){return job;},
   async disableLogin(){assert(kind==='account','CHILD_DISABLED_LOGIN');authCalls++;const r=await admin.auth.admin.deleteUser(fixture.actor,true);assert(!r.error||r.error.status===404,'AUTH_CLEANUP_FAILED');},
   async archive(_,cancelOnly){const scope=await rpc(admin,'account_deletion_archive_scope',{p_job:job.id,p_lease:job.lease});assert(scope.rootIds.length===0,'SYNTHETIC_ARCHIVE_SCOPE_CHANGED');await rpc(admin,'ack_account_deletion_archive',{p_job:job.id,p_lease:job.lease,p_phase:cancelOnly?'fenced':'erased'});return {pending:false,processed:0};},
   async batch(_,limit){const r=await rpc(admin,'account_deletion_batch',{p_job:job.id,p_lease:job.lease,p_limit:limit});assert(r.processed<=100,'UNBOUNDED_BATCH');return r;},
   async removeObjects(){throw Error('UNEXPECTED_SYNTHETIC_OBJECTS');},
   async acknowledgeObjects(){throw Error('UNEXPECTED_SYNTHETIC_OBJECTS');},
   async release(_,failed){await rpc(admin,'release_account_deletion_job',{p_job:job.id,p_lease:job.lease,p_failed:failed});},
  });
 }
 assert(done,'SYNTHETIC_ERASURE_INCOMPLETE');return {batches,authCalls};
}
try{
 loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 if(!resume){const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Synthetic functional fixture',functional_fixture:fixture.nonce}});assert(!created.error&&created.data.user,'SYNTHETIC_AUTH_CREATE_FAILED');fixture.actor=id(created.data.user.id);save();}
 await verifyOwnership();
 if(!fixture.accountJob){
  let signed;
  if(resume){const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert(!link.error&&link.data.properties?.hashed_token,'SYNTHETIC_RESUME_FAILED');signed=await guardian.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});}
  else signed=await guardian.auth.signInWithPassword({email,password});
  assert(!signed.error&&signed.data.session,'SYNTHETIC_LOGIN_FAILED');token=signed.data.session.access_token;
  const child={givenNames:'Synthetic functional child',familyNames:'Synthetic family',preferredName:'Synthetic preferred',birthDate:'2025-01-01',referenceSex:'female',countryOfCare:'CO',timezone:'America/Bogota',isPremature:false,gestationalAgeWeeks:null,birthWeightGrams:3200,birthLengthCm:50,birthHeadCircumferenceCm:34,allergies:[]};
  if(!fixture.children.length){const first=await http('/creciendo/v1/onboarding',{contractVersion:'onboarding.v1',idempotencyKey:'functional-onboarding-'+fixture.nonce,careSpace:{name:'Synthetic functional fixture'},child,guardianRelationship:'guardian',privacyConsentAccepted:true});fixture.space=id(first.careSpaceId);fixture.children.push(id(first.childId));save();}
  if(fixture.children.length===1){const next=await http('/creciendo/v1/children',{contractVersion:'add-child.v1',idempotencyKey:'functional-sibling-'+fixture.nonce,careSpaceId:fixture.space,child:{...child,givenNames:'Synthetic retained child'},privacyConsentAccepted:true});fixture.children.push(id(next.childId));save();}
  if(!fixture.tested){
   const target=fixture.children[0],patch={name:'Synthetic confirmed profile',allergies:'Synthetic annotation',history:'Synthetic history',bloodType:'Desconocido',birthWeightKg:3.25,birthHeightCm:50.5,birthHeadCm:34.5};
   const args={p_child_id:target,p_patch:patch,p_idempotency_key:'functional-profile-'+fixture.nonce};
   const profile=await rpc(guardian,'update_guardian_child_profile',args);assert(profile.status==='saved','PROFILE_RECEIPT_INVALID');
   await rpc(guardian,'update_guardian_child_profile',args);
   const stored=await guardian.from('children').select('given_names,birth_weight_grams,birth_length_cm').eq('id',target).single();assert(!stored.error&&stored.data.given_names===patch.name&&stored.data.birth_weight_grams===3250&&stored.data.birth_length_cm===50.5,'PROFILE_NOT_PERSISTED');
   const vaccineArgs={p_child_id:target,p_vaccine_code:'CO-PAI-BCG',p_vaccine_name:'BCG',p_administered_on:'2026-11-03',p_clinic:'Synthetic clinic',p_lot_number:'QA-functional',p_notes:'Synthetic guardian declaration',p_idempotency_key:'functional-vaccine-'+fixture.nonce,p_confirmed:true};
   const vaccine=await rpc(guardian,'record_guardian_vaccine_declaration',vaccineArgs),retry=await rpc(guardian,'record_guardian_vaccine_declaration',vaccineArgs);
   assert(vaccine.verification==='pending'&&vaccine.administration.confirmation_status==='draft'&&retry.administration.id===vaccine.administration.id&&retry.outcome==='idempotent_replay','VACCINE_RECEIPT_FAILED');
   const savedVaccine=await guardian.from('vaccine_administrations').select('guardian_notes,provider_name,lot_number,vaccine_product_id').eq('id',vaccine.administration.id).single();assert(!savedVaccine.error&&savedVaccine.data.guardian_notes===vaccineArgs.p_notes&&savedVaccine.data.provider_name===vaccineArgs.p_clinic&&savedVaccine.data.lot_number===vaccineArgs.p_lot_number&&savedVaccine.data.vaccine_product_id===null,'VACCINE_DECLARATION_NOT_PERSISTED');
   if(!fixture.milestoneId){
    const prior=await guardian.from('development_observations').select('observation').eq('child_id',target).eq('idempotency_key','functional-milestone-'+fixture.nonce+':0').maybeSingle();
    assert(!prior.error,'MILESTONE_RESUME_LOOKUP_FAILED');
    fixture.milestoneId=prior.data?JSON.parse(prior.data.observation).id:'custom-milestone:'+randomUUID();
    assert(/^custom-milestone:[a-f0-9-]{36}$/.test(fixture.milestoneId),'MILESTONE_RESUME_SCOPE_FAILED');save();
   }
   const milestoneId=fixture.milestoneId;let predecessor=null;
   for(const [index,achieved,deleted]of [[0,true,false],[1,false,false],[2,false,true]]){
    const observation=JSON.stringify({version:'guardian-milestone.v1',id:milestoneId,text:'Synthetic milestone',domain:'routines',isCustom:true,achieved,deleted});
    const receipt=await rpc(guardian,'record_development_observation',{p_care_space_id:fixture.space,p_child_id:target,p_milestone_id:null,p_domain:'general',p_title:'Hito:'+milestoneId,p_observation:observation,p_observed_on:'2026-11-03',p_status:deleted?'entered_in_error':achieved?'achieved':'observed',p_provenance_type:'guardian',p_idempotency_key:'functional-milestone-'+fixture.nonce+':'+index,p_input_sha256:hash(observation),p_confirmation_sha256:hash('confirmed:'+observation),p_supersedes_observation_id:predecessor,p_document_ids:[]});predecessor=id(receipt[0].observation_id);
   }
   const latest=await guardian.from('development_observations').select('status,observation,supersedes_observation_id').eq('id',predecessor).single();assert(!latest.error&&latest.data.status==='entered_in_error'&&JSON.parse(latest.data.observation).deleted,'MILESTONE_TOMBSTONE_NOT_PERSISTED');
   const context=await http('/creciendo/v1/child-context',{version:'creciendo.channel.v1',childId:target,nonce:randomUUID(),capabilities:{channelVersions:['creciendo.channel.v1'],eventVersions:['creciendo.channel-event.v1'],widgetVersions:[],ndjson:true}});
   const headers={'X-Child-Context':context.childContextToken,'Idempotency-Key':'functional-growth-'+fixture.nonce};
   await http('/creciendo/v1/anthropometry',{version:'creciendo.anthropometry.v1',measurement:{measurementType:'weight',value:'10.5',unit:'kg',occurredAt:'2026-11-03T15:00:00.000Z',measurementMethod:'unknown',provenanceType:'guardian',sourceNote:'Disposable synthetic QA measurement'},confirmed:true},headers);
   const history=await http('/creciendo/v1/anthropometry',null,headers),growth=await http('/creciendo/v1/anthropometry/growth',null,headers);
   assert(history.measurements.length===1&&growth.status==='ready'&&growth.chart?.observations.length===1,'GROWTH_HISTORY_OR_CHART_FAILED');
   fixture.tested=true;save();emit({profilePersisted:true,profileReplay:true,vaccinePendingPersisted:true,vaccineReplay:true,milestoneToggleAndTombstone:true,backendGrowthReadWrite:true});
  }
  if(!fixture.childJob){const removed=await rpc(guardian,'request_child_deletion',{p_child_id:fixture.children[0],p_idempotency_key:'functional-child-remove-'+fixture.nonce});assert(removed.version==='child-deletion.v1'&&removed.accessRevoked&&removed.status==='queued','CHILD_REMOVAL_RECEIPT_FAILED');fixture.childJob=id(removed.requestId);save();}
  if(!fixture.childCompleted){const result=await sweep(fixture.childJob,'child');assert(result.authCalls===0,'CHILD_REMOVAL_DISABLED_AUTH');fixture.childCompleted=true;save();
   const visible=await guardian.from('children').select('id').in('id',fixture.children);assert(!visible.error&&visible.data.length===1&&visible.data[0].id===fixture.children[1],'OTHER_CHILD_ACCESS_CHANGED');
   const own=await guardian.auth.getUser();assert(!own.error&&own.data.user.id===fixture.actor,'CHILD_REMOVAL_DISABLED_SESSION');
   emit({childErased:true,childJobAuthCalls:0,accountAndOtherChildPreserved:true,childBatches:result.batches});
  }
  const account=await rpc(guardian,'request_account_deletion',{p_idempotency_key:'functional-account-cleanup-'+fixture.nonce});fixture.accountJob=id(account.requestId);save();
 }
 const cleanup=await sweep(fixture.accountJob,'account');
 const [remaining]=await sql(`select (select count(*) from public.children where id in('${id(fixture.children[0])}','${id(fixture.children[1])}')) as children,(select count(*) from public.vaccine_administrations where child_id in('${fixture.children[0]}','${fixture.children[1]}')) as vaccines,(select count(*) from public.development_observations where child_id in('${fixture.children[0]}','${fixture.children[1]}')) as observations;`);
 assert(Object.values(remaining).every(n=>Number(n)===0),'SYNTHETIC_RECORDS_REMAIN');
 if(token){const denied=await guardian.auth.getUser(token);assert(Boolean(denied.error),'SYNTHETIC_LOGIN_NOT_REVOKED');}
 fixture.completed=true;save();emit({ok:true,syntheticAccountAndChildrenErased:true,accountBatches:cleanup.batches,existingAccountsTouched:0,globalHourlyClockChanged:false});
}catch(error){emit({ok:false,code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'SYNTHETIC_FUNCTIONAL_TEST_FAILED',fixtureCreated:!!fixture.actor,childQueued:!!fixture.childJob,accountQueued:!!fixture.accountJob});process.exitCode=1;}
finally{await loader?.close();}
