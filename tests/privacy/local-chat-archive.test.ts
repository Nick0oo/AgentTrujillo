import {mkdtemp,readFile,readdir,rm,writeFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {ulid} from 'ulid';
import {afterEach,describe,expect,test} from 'vitest';
import {nativeWorld,createWorld,withRunBarrier} from '@creciendo/workflow-world-local';
import type {World} from '../../node_modules/eve/dist/src/compiled/@workflow/world/index';
import {eraseLocalChatArchive} from '../../agent/lib/privacy/local-chat-archive';
import {legacyLineage} from '../../agent/lib/privacy/archive-lineage';
import {gzipSync} from 'node:zlib';

const fixtures:string[]=[];
afterEach(async()=>{for(const path of fixtures.splice(0)){if(!resolve(path).startsWith(resolve(tmpdir())+sep+'creciendo-archive-test-'))throw new Error('UNSAFE_FIXTURE');await rm(path,{recursive:true,force:true});}});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'creciendo-archive-test-'));fixtures.push(root);const world=nativeWorld({dataDir:root,recoverActiveRuns:false}) as World;await world.start?.();return {root,world};}
async function seed(world:World,id:string,parent?:string){
  await world.events.create(id,{eventType:'run_created',eventData:{deploymentId:'fixture',workflowName:'fixture',input:['synthetic canary '+id]}});
  await world.runs.experimentalSetAttributes!(id,[{key:'$eve.type',value:parent?'turn':'session'},{key:'$eve.title',value:'synthetic canary '+id},...(parent?[{key:'$rootRunId',value:parent}]:[])],{allowReservedAttributes:true});
  await world.streams.write(id,'strm_'+id,'synthetic canary '+id);
  await world.events.create(id,{eventType:'step_created',correlationId:'step_'+ulid(),eventData:{stepName:'fixture',input:['synthetic canary '+id]}});
  await world.events.create(id,{eventType:'hook_created',correlationId:'hook_'+ulid(),eventData:{token:'fixture-'+id}});
}
describe('Eve bundled local archive erasure',()=>{
  test('erases root and descendant payloads in bounded batches, preserving another account and fencing replay',async()=>{
    const {root,world}=await fixture();const a='wrun_'+ulid(),child='wrun_'+ulid(),b='wrun_'+ulid();
    await seed(world,a);await seed(world,child,a);await seed(world,b);
    await world.runs.experimentalSetAttributes!(b,[{key:'$eve.title',value:'Untrusted mention '+a}],{allowReservedAttributes:true});
    const untouched=await readFile(join(root,'runs',b+'.json'),'utf8');
    let result={pending:true,processed:0};
    for(let n=0;n<80&&result.pending;n++){
      result=await eraseLocalChatArchive({dataDir:root,rootIds:[a],limit:1,quietMs:0});
      expect(result.processed).toBeLessThanOrEqual(1);
    }
    expect(result.pending).toBe(false);
    expect(await readFile(join(root,'runs',b+'.json'),'utf8')).toBe(untouched);
    const inspect=async(folder:string):Promise<void>=>{for(const item of await readdir(folder,{withFileTypes:true})){const path=join(folder,item.name);if(item.isDirectory())await inspect(path);else if(item.isFile()){const data=await readFile(path);expect(data.includes(Buffer.from('synthetic canary '+a))).toBe(false);expect(data.includes(Buffer.from('synthetic canary '+child))).toBe(false);}}};
    await inspect(root);
    for(const id of [a,child]){const text=await readFile(join(root,'runs',id+'.json'),'utf8');expect(text).not.toContain('synthetic canary');expect(JSON.parse(text).status).toBe('cancelled');}
    const guarded=createWorld({dataDir:root,recoverActiveRuns:false}) as World;
    await expect(guarded.streams.write(child,'strm_late','late canary')).rejects.toThrow('ACCOUNT_ARCHIVE_ERASED');
    await expect(guarded.events.create(a,{eventType:'run_created',eventData:{deploymentId:'fixture',workflowName:'fixture',input:['late canary']}})).rejects.toThrow('ACCOUNT_ARCHIVE_ERASED');
    await expect(guarded.events.create('wrun_'+ulid(),{eventType:'run_created',eventData:{deploymentId:'fixture',workflowName:'fixture',input:['late canary'],executionContext:{replayedFromRunId:a}}})).rejects.toThrow('ACCOUNT_ARCHIVE_ERASED');
    expect(await eraseLocalChatArchive({dataDir:root,rootIds:[a],limit:100,quietMs:0})).toMatchObject({pending:false,processed:0});
    await world.close?.();await guarded.close?.();
  },30_000);
  test('waits for an in-flight writer before fencing, then removes its payload',async()=>{
    const {root,world}=await fixture();const a='wrun_'+ulid();await seed(world,a);
    let release!:()=>void;const held=new Promise<void>(done=>{release=done;});let entered!:()=>void;const ready=new Promise<void>(done=>{entered=done;});
    const writer=withRunBarrier(root,[a],async()=>{entered();await held;await world.streams.write(a,'strm_race','racing canary');});
    await ready;const erasure=eraseLocalChatArchive({dataDir:root,rootIds:[a],limit:100,quietMs:0});
    release();await writer;await erasure;
    expect(await readdir(join(root,'streams/chunks/strm_race'))).toHaveLength(0);await world.close?.();
  });
  test('refuses a symlink escape before erasing payloads',async()=>{
    const {root,world}=await fixture();const a='wrun_'+ulid();await seed(world,a);
    const outside=await mkdtemp(join(tmpdir(),'creciendo-archive-test-'));fixtures.push(outside);await writeFile(join(outside,'keep.txt'),'outside canary');
    await symlink(outside,join(root,'streams/chunks/strm_escape'),'junction');
    await expect(eraseLocalChatArchive({dataDir:root,rootIds:[a],limit:100,quietMs:0})).rejects.toThrow('ARCHIVE_PATH_INVALID');
    expect(await readFile(join(outside,'keep.txt'),'utf8')).toBe('outside canary');await world.close?.();
  });
  test('legacy decoding selects runtime argument fields and ignores identifiers in message text',()=>{
    const a='wrun_'+ulid();const bytes=Buffer.from('devl'+JSON.stringify([[1],{stepInput:2},{sessionState:3},{sessionId:4},a]));
    expect(legacyLineage(bytes)).toEqual([a]);
    expect(legacyLineage(Buffer.concat([Buffer.from('gzip'),gzipSync(bytes)]))).toEqual([a]);
    expect(legacyLineage([{input:{message:{stepInput:{sessionState:{sessionId:a}}}}}])).toEqual([]);
  });
  test('rejects traversal and shared stream namespaces without deleting another owner’s content',async()=>{
    const {root,world}=await fixture();const a='wrun_'+ulid(),b='wrun_'+ulid();await seed(world,a);await seed(world,b);
    await expect(eraseLocalChatArchive({dataDir:root,rootIds:['../runs'],limit:1,quietMs:0})).rejects.toThrow();
    await world.streams.write(a,'strm_collision','owner a');await world.streams.write(b,'strm_collision','owner b');
    await expect(eraseLocalChatArchive({dataDir:root,rootIds:[a],limit:100,quietMs:0})).rejects.toThrow('ARCHIVE_SHARED_STREAM');
    expect((await readdir(join(root,'streams/chunks/strm_collision'))).length).toBe(2);await world.close?.();
  });
});
