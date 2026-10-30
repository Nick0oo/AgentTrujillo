import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RuntimeConfig } from '../config/env';
import { withPrivilegedJobClient } from '../supabase/privileged-job-client';
import type { PrivilegedJobScope } from '../supabase/privileged-job-scope';
import {resolve} from 'node:path';
import {eraseLocalChatArchive,type ArchiveResult} from './local-chat-archive';

const stage = z.enum(['access','chats','archive','children','profile','completed']);
const jobSchema=z.object({id:z.uuid(),actor:z.uuid(),lease:z.uuid(),stage}).strict();
const objectSchema=z.object({id:z.uuid(),bucket:z.string().min(1).max(100),path:z.string().min(1).max(2048)}).strict();
const batchSchema=z.object({stage,processed:z.number().int().min(0).max(100),objects:z.array(objectSchema).max(100)}).strict();
type Job=z.infer<typeof jobSchema>;
type ObjectRef=z.infer<typeof objectSchema>;
export interface AccountDeletionPorts {
  claim():Promise<Job|null>;
  disableLogin(job:Job):Promise<void>;
  archive(job:Job,cancelOnly:boolean):Promise<ArchiveResult>;
  batch(job:Job,limit:number):Promise<z.infer<typeof batchSchema>>;
  removeObjects(objects:readonly ObjectRef[]):Promise<void>;
  acknowledgeObjects(job:Job,objects:readonly ObjectRef[]):Promise<void>;
  release(job:Job,failed:boolean):Promise<void>;
}

/** One job and one batch per hour, not one unbounded loop per account. */
export async function runAccountDeletionSweep(ports:AccountDeletionPorts):Promise<void> {
  const raw=await ports.claim();
  if(raw===null)return;
  const job=jobSchema.parse(raw);
  let failed=false;
  try {
    if(job.stage==='access'){
      await ports.disableLogin(job);
      if((await ports.archive(job,true)).pending)return;
    }
    if(job.stage==='archive'){
      const archive=await ports.archive(job,false);
      if(archive.pending||archive.processed>=100)return;
    }
    const result=batchSchema.parse(await ports.batch(job,100));
    if(result.objects.length){
      await ports.removeObjects(result.objects);
      await ports.acknowledgeObjects(job,result.objects);
    }
  } catch {
    failed=true;
    throw new Error('ACCOUNT_DELETION_RETRY');
  } finally {
    try { await ports.release(job,failed); } catch { throw new Error('ACCOUNT_DELETION_RETRY'); }
  }
}

export async function runProductionAccountDeletionSweep(config:RuntimeConfig):Promise<void> {
  const now=new Date();
  const scope=Object.freeze({jobName:'account-deletion',invocationId:randomUUID(),allowedOperations:['maintenance:retention'] as const,issuedAt:now,expiresAt:new Date(now.getTime()+5*60_000)}) as unknown as PrivilegedJobScope;
  const timedFetch:typeof globalThis.fetch=(input,init)=>globalThis.fetch(input,{
    ...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(20_000)]),
  });
  await withPrivilegedJobClient({config,scope,operation:'maintenance:retention',fetch:timedFetch},async(client)=>{
    const rpc=async(name:string,args:Record<string,unknown>={})=>{
      const result=await client.rpc(name as never,args as never);
      if(result.error)throw new Error('ACCOUNT_DELETION_RPC_UNAVAILABLE');
      return result.data as unknown;
    };
    await runAccountDeletionSweep({
      async claim(){const result=await rpc('claim_account_deletion_job');return result===null?null:jobSchema.parse(result);},
      async disableLogin(job){
        // Supabase soft deletion removes login identity/refresh access while
        // preserving opaque FK keys belonging to a remaining guardian's facts.
        const result=await client.auth.admin.deleteUser(job.actor,true);
        if(result.error&&result.error.status!==404)throw new Error('ACCOUNT_LOGIN_REVOCATION_UNAVAILABLE');
      },
      async archive(job,cancelOnly){
        const scope=z.object({rootIds:z.array(z.string()).max(5000)}).strict().parse(await rpc('account_deletion_archive_scope',{p_job:job.id,p_lease:job.lease}));
        const expected=resolve(process.cwd(),'.eve/.workflow-data');
        const directory=resolve(process.env.WORKFLOW_LOCAL_DATA_DIR??expected);
        if(directory!==expected)throw new Error('ARCHIVE_RUNTIME_PATH_UNSUPPORTED');
        const result=await eraseLocalChatArchive({dataDir:directory,rootIds:scope.rootIds,limit:100,cancelOnly});
        if(!result.pending)await rpc('ack_account_deletion_archive',{p_job:job.id,p_lease:job.lease,p_phase:cancelOnly?'fenced':'erased'});
        return result;
      },
      async batch(job,limit){return batchSchema.parse(await rpc('account_deletion_batch',{p_job:job.id,p_lease:job.lease,p_limit:limit}));},
      async removeObjects(objects){
        // API deletion removes physical bytes. SQL removal of storage.objects
        // alone is deliberately never used.
        const buckets=new Map<string,string[]>();
        for(const object of objects)buckets.set(object.bucket,[...(buckets.get(object.bucket)??[]),object.path]);
        for(const [bucket,paths] of buckets){const result=await client.storage.from(bucket).remove(paths);if(result.error)throw new Error('ACCOUNT_OBJECT_ERASURE_UNAVAILABLE');}
      },
      async acknowledgeObjects(job,objects){await rpc('ack_account_deletion_objects',{p_job:job.id,p_lease:job.lease,p_ids:objects.map(o=>o.id)});},
      async release(job,failed){await rpc('release_account_deletion_job',{p_job:job.id,p_lease:job.lease,p_failed:failed});},
    });
  });
}
