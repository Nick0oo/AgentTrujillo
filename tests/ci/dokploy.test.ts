import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error Executable Node scripts have no declaration files.
import { deploymentPayload, triggerDokploy } from '../../scripts/ci/deploy-dokploy.mjs';
// @ts-expect-error Executable Node scripts have no declaration files.
import { checkBackend } from '../../scripts/ci/smoke-backend.mjs';

const env = {
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REPOSITORY: 'Nick0oo/AgentTrujillo',
  GITHUB_SHA: 'a'.repeat(40),
  DOKPLOY_WEBHOOK_URL: 'https://dokploy.example/api/deploy/test-only-secret',
};

describe('Dokploy deployment boundary', () => {
  it.each(['refs/heads/app_v1', 'refs/pull/1/merge'])('rejects %s before any request', async ref => {
    const fetchFn = vi.fn();
    await expect(triggerDokploy({ ...env, GITHUB_REF: ref }, {}, fetchFn)).rejects.toThrow('DEPLOYMENT_REQUIRES_MAIN');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a pull request even if the ref says main', () => {
    expect(() => deploymentPayload({ ...env, GITHUB_EVENT_NAME: 'pull_request' })).toThrow('DEPLOYMENT_REQUIRES_MAIN');
  });

  it('forwards only commit identifiers and changed paths', () => {
    const payload = deploymentPayload(env, {
      sender: { email: 'private@example.invalid' },
      commits: [{ added: ['Dockerfile'], author: { email: 'private@example.invalid' }, message: 'private text' }],
    });
    expect(payload.ref).toBe('refs/heads/main');
    expect(payload.commits[0].added).toEqual(['Dockerfile']);
    expect(JSON.stringify(payload)).not.toContain('private');
  });

  it('sends a push payload and rejects redirects without disclosing the webhook', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('secret body', { status: 301 }));
    await expect(triggerDokploy(env, {}, fetchFn)).rejects.toThrow('DOKPLOY_WEBHOOK_HTTP_301');
    const options = fetchFn.mock.calls[0][1];
    expect(options.redirect).toBe('manual');
    expect(options.headers['x-github-event']).toBe('push');
  });

  it('redacts connection failures', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error(env.DOKPLOY_WEBHOOK_URL));
    await expect(triggerDokploy(env, {}, fetchFn)).rejects.toThrow('DOKPLOY_WEBHOOK_REQUEST_FAILED');
  });
});

describe('Production backend smoke', () => {
  it('accepts a healthy server with guarded product and internal routes', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, status: 'ready' }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(checkBackend('https://agent.example', fetchFn)).resolves.toBeUndefined();
  });

  it('rejects a product route that accepts an anonymous request', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, status: 'ready' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(checkBackend('https://agent.example', fetchFn)).rejects.toThrow('GUARDIAN_AUTH_CHECK_FAILED');
  });
});
