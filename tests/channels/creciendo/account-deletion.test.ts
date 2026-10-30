import { describe,expect,test,vi } from 'vitest';
import { handleAccountDeletion } from '../../../src/channels/creciendo/routes/account-deletion';
const receipt={version:'account-deletion.v1',status:'queued',requestId:'00000000-0000-4000-8000-000000000001',accessRevoked:true};
function request(body:unknown={version:'account-deletion.v1',confirmed:true},key='deletion-fixture-1'){
  return new Request('https://fixture.invalid/creciendo/v1/account/deletion',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(body)});
}
describe('self-service deletion request',()=>{
  test('rejects authority injection and missing confirmation before persistence',async()=>{
    const store={request:vi.fn()};
    for(const body of [{version:'account-deletion.v1',confirmed:true,guardianId:'forged'},{version:'account-deletion.v1',confirmed:false}])expect((await handleAccountDeletion(request(body),store)).status).toBe(400);
    expect(store.request).not.toHaveBeenCalled();
  });
  test('returns an accepted queue receipt, without claiming that all data is erased',async()=>{
    const response=await handleAccountDeletion(request(),{request:vi.fn().mockResolvedValue(receipt)});
    expect(response.status).toBe(202);expect(await response.json()).toEqual(receipt);
  });
  test('fails closed on unavailable persistence or an unconfirmed revocation',async()=>{
    for(const action of [vi.fn().mockRejectedValue(new Error('private provider details')),vi.fn().mockResolvedValue({...receipt,accessRevoked:false})]){
      const response=await handleAccountDeletion(request(),{request:action});expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('private');
    }
  });
});
