import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		registerHook: vi.fn(),
		listHooks: vi.fn(),
		deleteHook: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleHook as LoomCycle } from '../../../nodes/LoomCycleHook/LoomCycleHook.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=hook', () => {
	it('Register forwards owner/name/phase/callbackUrl + parsed globs', async () => {
		mockClient.registerHook.mockResolvedValue({ id: 'hook_1' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'hook',
				operation: 'register',
				name: 'audit-tools',
				phase: 'pre',
				callbackUrl: 'https://n8n.example.com/webhook/loom',
				owner: 'team-sec',
				agents: 'researcher, writer-*',
				tools: 'HTTP, WebFetch',
				failMode: 'closed',
				timeoutMs: 2000,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.registerHook).toHaveBeenCalledWith({
			owner: 'team-sec',
			name: 'audit-tools',
			phase: 'pre',
			callbackUrl: 'https://n8n.example.com/webhook/loom',
			agents: ['researcher', 'writer-*'],
			tools: ['HTTP', 'WebFetch'],
			failMode: 'closed',
			timeoutMs: 2000,
		});
	});

	it('Register defaults owner to the node id when empty', async () => {
		mockClient.registerHook.mockResolvedValue({ id: 'hook_2' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'hook',
				operation: 'register',
				name: 'h',
				phase: 'post',
				callbackUrl: 'https://x/y',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.registerHook.mock.calls[0][0];
		expect(arg.owner).toBe('n8n:test-node');
	});

	it('Register omits empty globs and zero timeout', async () => {
		mockClient.registerHook.mockResolvedValue({ id: 'hook_3' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'hook',
				operation: 'register',
				name: 'h',
				phase: 'pre',
				callbackUrl: 'https://x/y',
				agents: '',
				tools: '',
				timeoutMs: 0,
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.registerHook.mock.calls[0][0];
		expect(arg.agents).toBeUndefined();
		expect(arg.tools).toBeUndefined();
		expect(arg.timeoutMs).toBeUndefined();
	});

	it('List returns the hooks array under a { hooks } envelope', async () => {
		mockClient.listHooks.mockResolvedValue([{ id: 'hook_1', name: 'h' }]);
		const node = new LoomCycle();
		const ctx = makeExecuteContext({ params: { resource: 'hook', operation: 'list' } });
		const result = await node.execute.call(ctx);
		expect(mockClient.listHooks).toHaveBeenCalledOnce();
		expect((result[0][0].json as Record<string, unknown>).hooks).toHaveLength(1);
	});

	it('Delete calls deleteHook(id) and returns an ok envelope', async () => {
		mockClient.deleteHook.mockResolvedValue(undefined);
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'hook', operation: 'delete', hookId: 'hook_9' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.deleteHook).toHaveBeenCalledWith('hook_9');
		expect(result[0][0].json).toEqual({ ok: true, id: 'hook_9' });
	});
});
