import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
		listChannels: vi.fn(),
		publishChannel: vi.fn(),
		subscribeChannel: vi.fn(),
		peekChannel: vi.fn(),
		ackChannel: vi.fn(),
		health: vi.fn(),
		agentDef: vi.fn(),
		skillDef: vi.fn(),
		mcpServerDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleAgentDef as LoomCycle } from '../../../nodes/LoomCycleAgentDef/LoomCycleAgentDef.node';
import { LoomCycleSkillDef } from '../../../nodes/LoomCycleSkillDef/LoomCycleSkillDef.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=agentDef', () => {
	it('Get forwards { op: "get", name }', async () => {
		mockClient.agentDef.mockResolvedValue({ name: 'researcher', version: 3 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'get', name: 'researcher' },
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({ op: 'get', name: 'researcher' });
	});

	it('List forwards { op: "list", name }', async () => {
		mockClient.agentDef.mockResolvedValue({ versions: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'list', name: 'researcher' },
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({ op: 'list', name: 'researcher' });
	});

	it('Create forwards name + description + overlay + promote', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'create',
				name: 'researcher',
				defDescription: 'v1 initial',
				overlay: '{"model":"claude-sonnet-4-5","max_iterations":64}',
				promote: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'researcher',
			description: 'v1 initial',
			overlay: { model: 'claude-sonnet-4-5', max_iterations: 64 },
			promote: true,
		});
	});

	it('Create omits overlay when empty object', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'create', name: 'x', overlay: '{}', promote: false },
		});
		await node.execute.call(ctx);
		const arg = mockClient.agentDef.mock.calls[0][0];
		expect(arg.overlay).toBeUndefined();
	});

	it('Fork forwards parent_def_id + overlay', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_new' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'fork',
				parentDefId: 'def_abc',
				overlay: '{"max_iterations":128}',
				promote: false,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'fork',
			parent_def_id: 'def_abc',
			overlay: { max_iterations: 128 },
			promote: false,
		});
	});

	it('Promote forwards def_id', async () => {
		mockClient.agentDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'promote', defId: 'def_abc' },
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({ op: 'promote', def_id: 'def_abc' });
	});

	it('Retire with name only', async () => {
		mockClient.agentDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'retire', name: 'researcher' },
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({ op: 'retire', name: 'researcher' });
	});

	it('Retire with both name + def_id', async () => {
		mockClient.agentDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'retire', name: 'researcher', defId: 'def_abc' },
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'retire',
			name: 'researcher',
			def_id: 'def_abc',
		});
	});

	it('Verify forwards content_sha256', async () => {
		mockClient.agentDef.mockResolvedValue({ matches: true, current_sha256: 'sha256:abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'verify',
				name: 'researcher',
				contentSha256: 'sha256:abc123def456',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'verify',
			name: 'researcher',
			content_sha256: 'sha256:abc123def456',
		});
	});

	it('Create folds agentProvider into overlay.provider (code-js, empty overlay)', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_js' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'create',
				name: 'nightly-report',
				agentProvider: 'code-js',
				overlay: '{}',
				promote: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'nightly-report',
			overlay: { provider: 'code-js' },
			promote: true,
		});
	});

	it('Create with provider keeps other overlay fields and lets the dropdown win', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'create',
				name: 'researcher',
				agentProvider: 'anthropic',
				// Overlay JSON also names a provider — the dropdown overrides it.
				overlay: '{"provider":"openai","model":"claude-sonnet-4-5"}',
				promote: false,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'researcher',
			overlay: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
			promote: false,
		});
	});

	it('Create with empty agentProvider leaves provider unset', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'create',
				name: 'researcher',
				agentProvider: '',
				overlay: '{"model":"claude-sonnet-4-5"}',
				promote: false,
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.agentDef.mock.calls[0][0];
		expect(arg.overlay).toEqual({ model: 'claude-sonnet-4-5' });
		expect((arg.overlay as Record<string, unknown>).provider).toBeUndefined();
	});

	it('Fork folds agentProvider into the overlay diff', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_new' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'agentDef',
				operation: 'fork',
				parentDefId: 'def_abc',
				agentProvider: 'code-js',
				overlay: '{}',
				promote: false,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.agentDef).toHaveBeenCalledWith({
			op: 'fork',
			parent_def_id: 'def_abc',
			overlay: { provider: 'code-js' },
			promote: false,
		});
	});

	it('wraps response in { result } envelope', async () => {
		mockClient.agentDef.mockResolvedValue({ def_id: 'def_x' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'agentDef', operation: 'get', name: 'x' },
		});
		const result = await node.execute.call(ctx);
		expect((result[0][0].json as Record<string, unknown>).result).toEqual({ def_id: 'def_x' });
	});
});

describe('LoomCycle resource=skillDef', () => {
	it('routes to client.skillDef instead of client.agentDef', async () => {
		mockClient.skillDef.mockResolvedValue({ name: 'webfetch-skill', version: 1 });
		const node = new LoomCycleSkillDef();
		const ctx = makeExecuteContext({
			params: { resource: 'skillDef', operation: 'get', name: 'webfetch-skill' },
		});
		await node.execute.call(ctx);
		expect(mockClient.skillDef).toHaveBeenCalledWith({ op: 'get', name: 'webfetch-skill' });
		expect(mockClient.agentDef).not.toHaveBeenCalled();
	});

	it('Create with overlay forwards same shape as agentDef', async () => {
		mockClient.skillDef.mockResolvedValue({ def_id: 'def_skill' });
		const node = new LoomCycleSkillDef();
		const ctx = makeExecuteContext({
			params: {
				resource: 'skillDef',
				operation: 'create',
				name: 'webfetch',
				defDescription: 'fetch + parse',
				overlay: '{"body":"# WebFetch skill...","allowed_tools":["HTTP","WebFetch"]}',
				promote: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.skillDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'webfetch',
			description: 'fetch + parse',
			overlay: { body: '# WebFetch skill...', allowed_tools: ['HTTP', 'WebFetch'] },
			promote: true,
		});
	});
});
