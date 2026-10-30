import { createRequire } from 'node:module';
import { dirname,join,resolve } from 'node:path';
import { readFile,access,mkdir,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Eve deliberately vendors a newer World than the application's workflow
// dependency. Use exactly that implementation and protocol, without an upgrade.
const require=createRequire(import.meta.url);
const eveRoot=dirname(require.resolve('eve/package.json'));
if(JSON.parse(await readFile(join(eveRoot,'package.json'),'utf8')).version!=='0.27.13')throw new Error('ARCHIVE_RUNTIME_VERSION_UNSUPPORTED');
const {createWorld:baseFactory}=await import(pathToFileURL(join(eveRoot,'dist/src/compiled/@workflow/world-local/index.js')).href);
export const DATA_VERSION='@workflow/world-local@5.0.0-beta.31';
const idPattern=/^wrun_[0-9A-HJKMNP-TV-Z]{26}$/;
const symbol=Symbol.for('creciendo.archive.barriers.v1');
const locks=globalThis[symbol]??=new Map();
export function markerPath(root,id){if(!idPattern.test(id))throw new Error('ARCHIVE_ID_INVALID');return join(resolve(root),'.account-erasure','markers',id);}
export async function markErased(root,id){const target=markerPath(root,id);await mkdir(dirname(target),{recursive:true});await writeFile(target,'v1',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw new Error('ARCHIVE_FENCE_UNAVAILABLE');});}
export async function withRunBarrier(root,ids,run){
  const keys=[...new Set(ids)].filter(id=>idPattern.test(id)).sort().map(id=>resolve(root)+'\n'+id);
  const enter=async(index)=>{
    if(index===keys.length)return run();
    const key=keys[index],previous=locks.get(key)??Promise.resolve();
    let release;const tail=new Promise(done=>{release=done;});
    const pending=previous.catch(()=>{}).then(()=>tail);locks.set(key,pending);
    await previous.catch(()=>{});
    try{return await enter(index+1);}finally{release();if(locks.get(key)===pending)locks.delete(key);}
  };
  return enter(0);
}
function refs(attrs){return ['$rootRunId','$parentRunId','$eve.root','$eve.parent'].map(key=>attrs?.[key]).filter(value=>typeof value==='string'&&idPattern.test(value));}
function parentsOf(run){const result=refs(run?.attributes);const replay=run?.executionContext?.replayedFromRunId;if(typeof replay==='string'&&idPattern.test(replay))result.push(replay);return result;}
export function nativeWorld(options){return baseFactory(options);}
export function createWorld(options={}){
  const root=resolve(options.dataDir??process.env.WORKFLOW_LOCAL_DATA_DIR??'.eve/.workflow-data');
  const base=baseFactory({...options,dataDir:root});
  const parents=new Map();
  const targets=async(id,extra=[])=>{
    if(!id)return extra;
    let known=parents.get(id);
    if(!known){try{known=parentsOf(await base.runs.get(id,{resolveData:'none'}));if(known.length)parents.set(id,known);}catch(error){if(error.status===404||error.name==='WorkflowRunNotFoundError')known=[];else throw new Error('ARCHIVE_FENCE_UNAVAILABLE');}}
    return [id,...known,...extra];
  };
  const mutate=async(id,extra,operation)=>{
    const ids=await targets(id,extra);
    return withRunBarrier(root,ids,async()=>{
      for(const target of ids){try{await access(markerPath(root,target));}catch(error){if(error.code==='ENOENT')continue;throw new Error('ARCHIVE_FENCE_UNAVAILABLE');}throw new Error('ACCOUNT_ARCHIVE_ERASED');}
      return operation();
    });
  };
  return {
    ...base,
    queue:(name,payload,options)=>mutate(payload?.runId,parentsOf(payload?.resilientStart),()=>base.queue(name,payload,options)),
    events:{...base.events,async create(id,event,params){
      const lineage=parentsOf(event.eventData);
      if(id&&lineage.length)parents.set(id,lineage);
      return mutate(id,lineage,()=>base.events.create(id,event,params));
    }},
    runs:{...base.runs,...(base.runs.experimentalSetAttributes?{experimentalSetAttributes:async(id,changes,options)=>mutate(id,refs(Object.fromEntries(changes.map(change=>[change.key,change.value]))),()=>base.runs.experimentalSetAttributes(id,changes,options))}:{})},
    streams:{...base.streams,
      write:(id,name,chunk)=>mutate(id,[],()=>base.streams.write(id,name,chunk)),
      writeMulti:(id,name,chunks)=>mutate(id,[],()=>base.streams.writeMulti(id,name,chunks)),
      close:(id,name)=>mutate(id,[],()=>base.streams.close(id,name)),
    },
  };
}
