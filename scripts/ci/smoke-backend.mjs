import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function checkBackend(baseUrl, fetchFn = fetch) {
  const options = { signal: AbortSignal.timeout(5000), redirect: 'manual' };
  const health = await fetchFn(new URL('/eve/v1/health', baseUrl), options);
  if (health.status !== 200) throw new Error('BACKEND_HEALTH_UNAVAILABLE');
  const body = await health.json();
  if (body.ok !== true || body.status !== 'ready') throw new Error('BACKEND_HEALTH_INVALID');

  const children = await fetchFn(new URL('/creciendo/v1/children', baseUrl), options);
  if (children.status !== 401) throw new Error('GUARDIAN_AUTH_CHECK_FAILED');

  const internal = await fetchFn(new URL('/eve/v1/info', baseUrl), options);
  if (internal.status !== 403) throw new Error('INTERNAL_EVE_AUTH_CHECK_FAILED');
}

export async function waitForBackend(env = process.env, once = false) {
  const baseUrl = new URL(env.AGENT_PUBLIC_URL || 'http://127.0.0.1:3000');
  if (baseUrl.username || baseUrl.password
    || (baseUrl.protocol !== 'https:'
      && !(baseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(baseUrl.hostname)))) {
    throw new Error('BACKEND_URL_INVALID');
  }
  const timeoutMs = once ? 5000 : Number(env.SMOKE_TIMEOUT_MS || 90000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) {
    throw new Error('SMOKE_TIMEOUT_INVALID');
  }
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      await checkBackend(baseUrl);
      console.log('Backend health and authentication checks passed.');
      return;
    } catch {
      if (once || Date.now() >= deadline) break;
      await delay(5000);
    }
  } while (Date.now() < deadline);
  throw new Error('BACKEND_SMOKE_FAILED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  waitForBackend(process.env, process.argv.includes('--once')).catch(() => {
    console.error('Backend smoke check failed; check the deployment, DNS, TLS and runtime environment.');
    process.exitCode = 1;
  });
}
