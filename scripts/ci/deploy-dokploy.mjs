import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function deploymentPayload(env, event = {}) {
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME === 'pull_request') {
    throw new Error('DEPLOYMENT_REQUIRES_MAIN');
  }
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw new Error('COMMIT_INVALID');
  if (env.GITHUB_REPOSITORY !== 'Nick0oo/AgentTrujillo') throw new Error('REPOSITORY_INVALID');
  const paths = key => (event.commits || []).flatMap(commit =>
    (commit[key] || []).filter(path => typeof path === 'string'));
  return {
    ref: 'refs/heads/main',
    after: env.GITHUB_SHA,
    repository: { full_name: env.GITHUB_REPOSITORY },
    head_commit: { id: env.GITHUB_SHA, message: `Deploy ${env.GITHUB_SHA}` },
    commits: [{ id: env.GITHUB_SHA, added: paths('added'), modified: paths('modified'), removed: paths('removed') }],
  };
}

export async function triggerDokploy(env = process.env, event = {}, fetchFn = fetch) {
  const payload = deploymentPayload(env, event);
  let url;
  try { url = new URL(env.DOKPLOY_WEBHOOK_URL); } catch { throw new Error('DOKPLOY_WEBHOOK_URL_MISSING_OR_INVALID'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || !/^\/api\/deploy\/[^/]+$/.test(url.pathname)) throw new Error('DOKPLOY_WEBHOOK_URL_INVALID');
  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      body: JSON.stringify(payload),
    });
  } catch { throw new Error('DOKPLOY_WEBHOOK_REQUEST_FAILED'); }
  // Dokploy uses 301 for a branch/watch-path mismatch. Never follow it or
  // report the response body, which may include deployment credentials.
  if (response.status !== 200) throw new Error(`DOKPLOY_WEBHOOK_HTTP_${response.status}`);
  console.log(`Dokploy accepted the deployment request for ${env.GITHUB_SHA.slice(0, 7)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let event = {};
  if (process.env.GITHUB_EVENT_PATH) {
    try { event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); }
    catch { console.error('GITHUB_EVENT_INVALID'); process.exit(1); }
  }
  triggerDokploy(process.env, event).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
