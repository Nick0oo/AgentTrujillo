import { z } from 'zod';
import type { AuthenticatedChannelRequest } from '../auth-middleware';
import type { RuntimeConfig } from '../../../../agent/lib/config/env';
import { createRequestSupabaseClient } from '../../../../agent/lib/supabase/request-client';

const requestSchema=z.object({version:z.literal('account-deletion.v1'),confirmed:z.literal(true)}).strict();
const receiptSchema=z.object({version:z.literal('account-deletion.v1'),status:z.literal('queued'),requestId:z.uuid(),accessRevoked:z.literal(true)}).strict();
const keySchema=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);
type Receipt=z.infer<typeof receiptSchema>;
export interface AccountDeletionPersistence {request(key:string,signal:AbortSignal):Promise<unknown>;}
export async function handleAccountDeletion(request:Request,persistence:AccountDeletionPersistence):Promise<Response>{
  const failure=(status:number,code:string)=>Response.json({ok:false,code},{status,headers:{'cache-control':'no-store'}});
  const key=keySchema.safeParse(request.headers.get('Idempotency-Key'));
  let body:unknown;try{body=await request.json();}catch{return failure(400,'INVALID_DELETION_REQUEST');}
  if(!key.success||!requestSchema.safeParse(body).success)return failure(400,'INVALID_DELETION_REQUEST');
  try{
    if(request.signal.aborted)return failure(503,'DELETION_UNAVAILABLE');
    const receipt:Receipt=receiptSchema.parse(await persistence.request(key.data,request.signal));
    return Response.json(receipt,{status:202,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return failure(503,'DELETION_UNAVAILABLE');}
}
export function createAccountDeletionPersistence(config:RuntimeConfig,auth:AuthenticatedChannelRequest):AccountDeletionPersistence{
  const client=createRequestSupabaseClient({config,accessToken:auth.guardian.bearerToken});
  return {async request(key,signal){
    const response=await client.rpc('request_account_deletion' as never,{p_idempotency_key:key} as never).abortSignal(signal);
    if(response.error)throw new Error('DELETION_UNAVAILABLE');return response.data;
  }};
}
