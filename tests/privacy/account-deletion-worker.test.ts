import { describe, expect, test, vi } from 'vitest';
import { runAccountDeletionSweep, type AccountDeletionPorts } from '../../agent/lib/privacy/account-deletion-worker';

function ports(): AccountDeletionPorts {
  return {
    claim: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', actor: '00000000-0000-4000-8000-000000000002', lease: '00000000-0000-4000-8000-000000000003', stage: 'access' }),
    disableLogin: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue({pending:false,processed:0}),
    batch: vi.fn().mockResolvedValue({ stage: 'chats', processed: 0, objects: [] }),
    removeObjects: vi.fn().mockResolvedValue(undefined),
    acknowledgeObjects: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
}
describe('bounded account deletion', () => {
  test('does not advance while runtime cancellation/fencing is pending',async()=>{
    const p=ports();vi.mocked(p.archive).mockResolvedValue({pending:true,processed:0});
    await runAccountDeletionSweep(p);expect(p.batch).not.toHaveBeenCalled();expect(p.release).toHaveBeenCalledWith(expect.anything(),false);
  });
  test('spends the archive batch budget without also deleting database rows',async()=>{
    const p=ports();vi.mocked(p.claim).mockResolvedValue({id:'00000000-0000-4000-8000-000000000001',actor:'00000000-0000-4000-8000-000000000002',lease:'00000000-0000-4000-8000-000000000003',stage:'archive'});
    vi.mocked(p.archive).mockResolvedValue({pending:true,processed:100});
    await runAccountDeletionSweep(p);expect(p.archive).toHaveBeenCalledWith(expect.anything(),false);expect(p.batch).not.toHaveBeenCalled();
  });
  test('persists a retry on archive failure without claiming completion',async()=>{
    const p=ports();vi.mocked(p.archive).mockRejectedValue(new Error('private filesystem detail'));
    await expect(runAccountDeletionSweep(p)).rejects.toThrow('ACCOUNT_DELETION_RETRY');expect(p.batch).not.toHaveBeenCalled();expect(p.release).toHaveBeenCalledWith(expect.anything(),true);
  });
  test('processes only one leased batch and does not claim again in the same invocation', async () => {
    const p = ports(); await runAccountDeletionSweep(p);
    expect(p.claim).toHaveBeenCalledTimes(1);
    expect(p.disableLogin).toHaveBeenCalledTimes(1);
    expect(p.batch).toHaveBeenCalledWith(expect.anything(), 100);
    expect(p.release).toHaveBeenCalledWith(expect.anything(), false);
  });
  test('never advances the database stage after login revocation fails', async () => {
    const p = ports(); vi.mocked(p.disableLogin).mockRejectedValue(new Error('private provider error'));
    await expect(runAccountDeletionSweep(p)).rejects.toThrow('ACCOUNT_DELETION_RETRY');
    expect(p.batch).not.toHaveBeenCalled();
    expect(p.release).toHaveBeenCalledWith(expect.anything(), true);
  });
  test('acknowledges only successful storage removal, leaving failed objects retryable', async () => {
    const p=ports(); vi.mocked(p.claim).mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', actor: '00000000-0000-4000-8000-000000000002', lease: '00000000-0000-4000-8000-000000000003', stage: 'children' });
    vi.mocked(p.batch).mockResolvedValue({ stage:'children',processed:0,objects:[{id:'00000000-0000-4000-8000-000000000004',bucket:'child-avatars',path:'fixture/avatar.png'}] });
    vi.mocked(p.removeObjects).mockRejectedValue(new Error('provider private details'));
    await expect(runAccountDeletionSweep(p)).rejects.toThrow('ACCOUNT_DELETION_RETRY');
    expect(p.acknowledgeObjects).not.toHaveBeenCalled();
  });
});
