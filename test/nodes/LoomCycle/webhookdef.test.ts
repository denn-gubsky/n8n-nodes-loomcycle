import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		webhookDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleWebhook } from '../../../nodes/LoomCycleWebhook/LoomCycleWebhook.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle Webhook (resource=webhookDef)', () => {
	it('Get forwards { op: "get", name }', async () => {
		mockClient.webhookDef.mockResolvedValue({ name: 'gh-push', version: 1 });
		const ctx = makeExecuteContext({
			params: { resource: 'webhookDef', operation: 'get', name: 'gh-push' },
		});
		await new LoomCycleWebhook().execute.call(ctx);
		expect(mockClient.webhookDef).toHaveBeenCalledWith({ op: 'get', name: 'gh-push' });
	});

	it('Create assembles agent/channel/enabled into overlay and merges advanced JSON', async () => {
		mockClient.webhookDef.mockResolvedValue({ def_id: 'wh_1' });
		const ctx = makeExecuteContext({
			params: {
				resource: 'webhookDef',
				operation: 'create',
				name: 'gh-push',
				agent: 'reviewer',
				channel: '',
				enabled: true,
				promote: true,
				overlay: '{"auth":{"kind":"hmac","signing_secret_env":"GH_WEBHOOK_SECRET"},"rate_limit":{"requests_per_minute":60}}',
			},
		});
		await new LoomCycleWebhook().execute.call(ctx);
		const arg = mockClient.webhookDef.mock.calls[0][0];
		expect(arg.op).toBe('create');
		expect(arg.name).toBe('gh-push');
		expect(arg.promote).toBe(true);
		expect(arg.overlay.agent).toBe('reviewer');
		expect(arg.overlay.enabled).toBe(true);
		// advanced JSON merged in
		expect(arg.overlay.auth).toEqual({ kind: 'hmac', signing_secret_env: 'GH_WEBHOOK_SECRET' });
		expect(arg.overlay.rate_limit).toEqual({ requests_per_minute: 60 });
		// channel omitted when empty
		expect(arg.overlay.channel).toBeUndefined();
	});

	it('structured create fields override matching keys in the advanced overlay', async () => {
		mockClient.webhookDef.mockResolvedValue({ def_id: 'wh_2' });
		const ctx = makeExecuteContext({
			params: {
				resource: 'webhookDef',
				operation: 'create',
				name: 'x',
				agent: 'reviewer',
				enabled: true,
				promote: true,
				overlay: '{"agent":"stale","enabled":false}',
			},
		});
		await new LoomCycleWebhook().execute.call(ctx);
		const arg = mockClient.webhookDef.mock.calls[0][0];
		expect(arg.overlay.agent).toBe('reviewer');
		expect(arg.overlay.enabled).toBe(true);
	});

	it('Fork forwards parent_def_id + overlay diff', async () => {
		mockClient.webhookDef.mockResolvedValue({ def_id: 'wh_fork' });
		const ctx = makeExecuteContext({
			params: {
				resource: 'webhookDef',
				operation: 'fork',
				parentDefId: 'wh_tmpl',
				overlay: '{"enabled":false}',
				promote: true,
			},
		});
		await new LoomCycleWebhook().execute.call(ctx);
		expect(mockClient.webhookDef).toHaveBeenCalledWith({
			op: 'fork',
			parent_def_id: 'wh_tmpl',
			promote: true,
			overlay: { enabled: false },
		});
	});

	it('Retire with name only', async () => {
		mockClient.webhookDef.mockResolvedValue({ ok: true });
		const ctx = makeExecuteContext({
			params: { resource: 'webhookDef', operation: 'retire', name: 'gh-push' },
		});
		await new LoomCycleWebhook().execute.call(ctx);
		expect(mockClient.webhookDef).toHaveBeenCalledWith({ op: 'retire', name: 'gh-push' });
	});
});
