import { defineSchedule } from 'eve/schedules';
import { loadRuntimeConfig } from '../lib/config/env';
import { runProductionAccountDeletionSweep } from '../lib/privacy/account-deletion-worker';

export default defineSchedule({
  cron:'0 * * * *',
  async run(){await runProductionAccountDeletionSweep(loadRuntimeConfig(process.env));},
});
