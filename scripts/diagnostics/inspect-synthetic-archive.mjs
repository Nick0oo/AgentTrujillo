import { mkdtemp,readdir,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { ulid } from 'ulid';
import { createWorld } from '../../node_modules/eve/dist/src/compiled/@workflow/world-local/index.js';

const base=await mkdtemp(join(tmpdir(),'creciendo-archive-fixture-'));
const world=createWorld({dataDir:base,recoverActiveRuns:false});
try{
  await world.start?.();
  const id='wrun_'+ulid();
  await world.events.create(id,{eventType:'run_created',eventData:{deploymentId:'fixture',workflowName:'fixture',input:[]}});
  await world.runs.experimentalSetAttributes(id,[{key:'$eve.type',value:'session'}],{allowReservedAttributes:true});
  await world.streams.write(id,'strm_fixture','synthetic fixture');
  await world.events.create(id,{eventType:'step_created',correlationId:'step_fixture',eventData:{stepName:'fixture',input:[]}});
  await world.events.create(id,{eventType:'hook_created',correlationId:'hook_fixture',eventData:{token:'fixture-token'}});
  const walk=async(folder,rel='')=>{for(const item of await readdir(folder,{withFileTypes:true})){const name=join(rel,item.name);if(item.isDirectory())await walk(join(folder,item.name),name);else {
    process.stdout.write(name.replaceAll(id,'<run>')+'\n');
    if(name.startsWith('hooks')&&name.endsWith('.json')){const value=JSON.parse(await readFile(join(folder,item.name),'utf8'));process.stdout.write('keys:'+Object.keys(value).join(',')+' runOwned:'+String(value.runId===id)+'\n');}
    if(name==='version.txt')process.stdout.write('version:'+await readFile(join(folder,item.name),'utf8')+'\n');
  }}};
  await walk(base);
}catch(error){process.stdout.write('SYNTHETIC_ARCHIVE_INSPECTION_FAILED '+String(error.message).slice(0,220)+'\n');process.exitCode=1;}
finally{await world.close?.();if(!resolve(base).startsWith(resolve(tmpdir())+sep+'creciendo-archive-fixture-'))throw new Error('INVALID_FIXTURE_PATH');await rm(base,{recursive:true,force:true});}
