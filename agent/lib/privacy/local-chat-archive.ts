import {access,lstat,mkdir,readFile,readdir,realpath,rename,unlink,writeFile} from 'node:fs/promises';
import {join,resolve,relative,sep,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DATA_VERSION,markErased,markerPath,nativeWorld,withRunBarrier} from '@creciendo/workflow-world-local';
import type {World,WorkflowRunWithoutData} from '../../../node_modules/eve/dist/src/compiled/@workflow/world/index';
import {RUN_ID,lineage,legacyLineage} from './archive-lineage';

const SAFE_COMPONENT=/^[A-Za-z0-9_-]{1,240}$/;
const MAX_JSON=16*1024*1024;
type Candidate={path:string;priority:number};
type ArchiveInput=Readonly<{dataDir:string;rootIds:readonly string[];limit:number;quietMs?:number;cancelOnly?:boolean}>;
export type ArchiveResult=Readonly<{pending:boolean;processed:number}>;
function fail(code='ARCHIVE_LAYOUT_UNSUPPORTED'):never{throw new Error(code);}
async function exists(path:string){try{await access(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function directory(root:string,path:string){
  const full=resolve(path),base=resolve(root);
  if(full!==base&&!full.startsWith(base+sep))fail('ARCHIVE_PATH_INVALID');
  const parts=relative(base,full).split(sep).filter(Boolean);let current=base;
  for(const part of ['',...parts]){if(part)current=join(current,part);try{const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail('ARCHIVE_PATH_INVALID');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
  return true;
}
async function files(root:string,folder:string,depth=0):Promise<string[]>{
  if(!await directory(root,folder))return [];
  const found:string[]=[];
  for(const entry of await readdir(folder,{withFileTypes:true})){
    if(entry.isSymbolicLink())fail('ARCHIVE_PATH_INVALID');
    const path=join(folder,entry.name);
    if(entry.isFile())found.push(path);
    else if(entry.isDirectory()&&depth>0)found.push(...await files(root,path,depth-1));
    else if(entry.isDirectory()&&depth===0)fail();
    else fail();
    if(found.length>100_000)fail('ARCHIVE_SCAN_LIMIT');
  }
  return found;
}
async function json(path:string):Promise<Record<string,unknown>>{
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_JSON)fail('ARCHIVE_PATH_INVALID');
  const value:unknown=JSON.parse(await readFile(path,'utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))fail();return value as Record<string,unknown>;
}
function isOwnedPrefix(name:string,owned:ReadonlySet<string>){for(const id of owned)if(name.startsWith(id+'-'))return true;return false;}
async function scan(world:World,roots:readonly string[]){
  const runs=new Map<string,WorkflowRunWithoutData>();const parents=new Map<string,string[]>();let cursor:string|undefined;
  do{
    const page=await world.runs.list({resolveData:'none',pagination:{limit:100,...(cursor?{cursor}:{})}});
    for(const run of page.data){
      if(!RUN_ID.test(run.runId))fail();runs.set(run.runId,run);
      let refs=lineage(run.attributes);
      if(!refs.length&&/(?:workflowEntry|turnWorkflow|workflow-entry|turn-workflow)/u.test(run.workflowName)&&run.attributes?.['$eve.type']!=='session'&&!roots.includes(run.runId)){
        const raw=await world.runs.get(run.runId);refs=legacyLineage(raw.input);
      }
      const replay=run.executionContext?.replayedFromRunId;
      if(typeof replay==='string'&&RUN_ID.test(replay))refs.push(replay);
      parents.set(run.runId,refs);
    }
    if(runs.size>5000)fail('ARCHIVE_SCAN_LIMIT');
    cursor=page.hasMore?page.cursor??undefined:undefined;
    if(page.hasMore&&!cursor)fail();
  }while(cursor);
  const owned=new Set(roots);
  for(let depth=0;depth<64;depth++){
    let changed=false;
    for(const [id,refs] of parents)if(!owned.has(id)&&refs.some(parent=>owned.has(parent))){owned.add(id);changed=true;}
    if(!changed)return {runs,owned};
  }
  fail('ARCHIVE_LINEAGE_LIMIT');
}
async function candidates(root:string,owned:Set<string>):Promise<Candidate[]>{
  const result:Candidate[]=[];const events=new Set<string>();const streamOwners=new Map<string,Set<string>>();
  const add=(path:string,priority:number)=>result.push({path,priority});
  for(const path of await files(root,join(root,'streams','runs'))){
    const name=path.slice(path.lastIndexOf(sep)+1);const id=name.replace(/\.json$/u,'');
    if(!RUN_ID.test(id))fail();const value=await json(path);
    if(!Array.isArray(value.streams)||!value.streams.every(item=>typeof item==='string'&&SAFE_COMPONENT.test(item)))fail();
    for(const stream of value.streams as string[]){const owners=streamOwners.get(stream)??new Set();owners.add(id);streamOwners.set(stream,owners);}
    if(owned.has(id))add(path,3);
  }
  const ownedStreams=new Set<string>();
  for(const [name,owners] of streamOwners)if([...owners].some(id=>owned.has(id))){
    if([...owners].some(id=>!owned.has(id)))fail('ARCHIVE_SHARED_STREAM');ownedStreams.add(name);
  }
  for(const path of await files(root,join(root,'streams','chunks'),1)){
    const rel=relative(join(root,'streams','chunks'),path).split(sep);
    if(rel.length===2&&ownedStreams.has(rel[0]))add(path,1);
    else if(rel.length===1&&[...ownedStreams].some(name=>rel[0].startsWith(name+'-chnk_')))add(path,1);
  }
  for(const folder of ['events','steps','waits'])for(const path of await files(root,join(root,folder))){
    const name=path.slice(path.lastIndexOf(sep)+1);if(!isOwnedPrefix(name,owned))continue;
    const value=await json(path);if(typeof value.runId!=='string'||!owned.has(value.runId))fail('ARCHIVE_SCOPE_MISMATCH');
    if(folder==='events'&&typeof value.eventId==='string')events.add(value.eventId);
    add(path,folder==='events'?5:4);
  }
  for(const path of await files(root,join(root,'hooks'),2)){
    if(!path.endsWith('.json'))continue;
    const value=await json(path);const name=path.slice(path.lastIndexOf(sep)+1);
    if((typeof value.runId==='string'&&owned.has(value.runId))
      ||(relative(join(root,'hooks'),path).startsWith('by-run'+sep)&&isOwnedPrefix(name,owned))
      ||(typeof value.eventId==='string'&&events.has(value.eventId)))add(path,0);
  }
  for(const path of await files(root,join(root,'.locks'),4))if(isOwnedPrefix(path.slice(path.lastIndexOf(sep)+1),owned))add(path,2);
  return [...new Map(result.map(item=>[item.path,item])).values()].sort((a,b)=>a.priority-b.priority||a.path.localeCompare(b.path));
}
async function tombstone(root:string,id:string,run:WorkflowRunWithoutData){
  const path=join(root,'runs',id+'.json');const previous=await json(path);
  if(previous.accountErasureVersion===1)return false;
  const attrs=Object.fromEntries(Object.entries(run.attributes??{}).filter(([key,value])=>['$rootRunId','$parentRunId','$eve.root','$eve.parent'].includes(key)&&RUN_ID.test(value)));
  const erased={runId:id,workflowName:run.workflowName,deploymentId:run.deploymentId,specVersion:run.specVersion,
    status:'cancelled',attributes:attrs,createdAt:run.createdAt,updatedAt:new Date(),completedAt:run.completedAt??new Date(),accountErasureVersion:1};
  const temp=path+'.erasure-'+randomUUID();
  await writeFile(temp,JSON.stringify(erased));await rename(temp,path);return true;
}
/** Version-pinned, single-node LocalWorld adapter; never calls broad clear(). */
export async function eraseLocalChatArchive(input:ArchiveInput):Promise<ArchiveResult>{
  if(!Number.isInteger(input.limit)||input.limit<1||input.limit>100||input.rootIds.length>5000||input.rootIds.some(id=>!RUN_ID.test(id)))fail('ARCHIVE_SCOPE_INVALID');
  if(input.rootIds.length===0)return {processed:0,pending:false};
  const root=resolve(input.dataDir);if(!await directory(root,root))fail('ARCHIVE_DIRECTORY_UNAVAILABLE');
  if((await realpath(root))!==root)fail('ARCHIVE_PATH_INVALID');
  if((await readFile(join(root,'version.txt'),'utf8')).trim()!==DATA_VERSION)fail('ARCHIVE_RUNTIME_VERSION_UNSUPPORTED');
  for(const entry of await readdir(root))if(!['runs','steps','events','waits','hooks','streams','.locks','.account-erasure','version.txt'].includes(entry))fail();
  await directory(root,join(root,'.account-erasure','markers'));
  const world=nativeWorld({dataDir:root,recoverActiveRuns:false}) as World;
  try{
    let snapshot=await scan(world,input.rootIds);let fenced=0;
    // Root barriers stop all descendant writers through the configured World,
    // including a create operation that started before the erasure request.
    const order=[...new Set([...input.rootIds,...snapshot.owned])];
    for(const id of order){
      if(await exists(markerPath(root,id)))continue;
      if(fenced>=100)return {processed:0,pending:true};
      await withRunBarrier(root,[id],async()=>{
        const run=snapshot.runs.get(id);
        if(run&&(run.status==='running'||run.status==='pending'))await world.events.create(id,{eventType:'run_cancelled'});
        await markErased(root,id);fenced++;
      });
    }
    snapshot=await scan(world,input.rootIds);
    for(const id of snapshot.owned)if(!await exists(markerPath(root,id)))return {processed:0,pending:true};
    if(input.cancelOnly)return {processed:0,pending:false};
    const quietMs=input.quietMs??600_000;
    if([...snapshot.owned].some(id=>{const run=snapshot.runs.get(id);return run&&Date.now()-new Date(run.updatedAt).getTime()<quietMs;}))return {processed:0,pending:true};
    const batch=await candidates(root,snapshot.owned);let processed=0;
    for(const item of batch.slice(0,input.limit)){
      if(!await directory(root,dirname(item.path)))fail('ARCHIVE_PATH_INVALID');
      const stat=await lstat(item.path);if(!stat.isFile()||stat.isSymbolicLink())fail('ARCHIVE_PATH_INVALID');
      await unlink(item.path);processed++;
    }
    if(batch.length>processed)return {processed,pending:true};
    for(const id of snapshot.owned){
      if(processed>=input.limit)return {processed,pending:true};
      const run=snapshot.runs.get(id);if(!run)continue;
      if(await withRunBarrier(root,[id],()=>tombstone(root,id,run)))processed++;
    }
    return {processed,pending:false};
  }catch(error){
    if(error instanceof Error&&/^ARCHIVE_[A-Z_]+$/u.test(error.message))throw error;
    throw new Error('ARCHIVE_ERASURE_RETRY');
  }finally{await world.close?.();}
}
