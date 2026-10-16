import { pathToFileURL } from 'node:url';

export function deploymentPayload(env) {
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME === 'pull_request') {
    throw new Error('DEPLOYMENT_REQUIRES_MAIN');
  }
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw new Error('COMMIT_INVALID');
  if (env.GITHUB_REPOSITORY !== 'Nick0oo/AgentTrujillo') throw new Error('REPOSITORY_INVALID');
  return {
    action: 'published',
    registry_package: {
      package_type: 'container',
      package_version: {
        package_url: 'ghcr.io/nick0oo/agent-trujillo:main',
        container_metadata: { tag: { name: 'main' } },
      },
    },
    head_commit: { id: env.GITHUB_SHA, message: `Deploy image sha-${env.GITHUB_SHA}` },
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
      headers: { 'content-type': 'application/json', 'x-github-event': 'registry_package' },
      body: JSON.stringify(payload),
    });
  } catch { throw new Error('DOKPLOY_WEBHOOK_REQUEST_FAILED'); }
  // Dokploy uses 301 for a source/image/tag mismatch. Never follow it or
  // report the response body, which may include deployment credentials.
  if (response.status !== 200) throw new Error(`DOKPLOY_WEBHOOK_HTTP_${response.status}`);
  console.log(`Dokploy accepted the deployment request for ${env.GITHUB_SHA.slice(0, 7)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  triggerDokploy(process.env).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
