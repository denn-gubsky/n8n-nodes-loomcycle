import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		scheduleDef: vi.fn(),
		agentDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleSchedule as LoomCycle } from '../../../nodes/LoomCycleSchedule/LoomCycleSchedule.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=scheduleDef', () => {
	it('Get forwards { op: "get", name }', async () => {
		mockClient.scheduleDef.mockResolvedValue({ name: 'daily-report', version: 2 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'scheduleDef', operation: 'get', name: 'daily-report' },
		});
		await node.execute.call(ctx);
		expect(mockClient.scheduleDef).toHaveBeenCalledWith({ op: 'get', name: 'daily-report' });
	});

	it('List forwards { op: "list", name }', async () => {
		mockClient.scheduleDef.mockResolvedValue({ versions: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'scheduleDef', operation: 'list', name: 'daily-report' },
		});
		await node.execute.call(ctx);
		expect(mockClient.scheduleDef).toHaveBeenCalledWith({ op: 'list', name: 'daily-report' });
	});

	it('Create assembles the schedule body into overlay', async () => {
		mockClient.scheduleDef.mockResolvedValue({ def_id: 'sched_abc' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'scheduleDef',
				operation: 'create',
				name: 'daily-report',
				schedule: '0 9 * * 1-5',
				agent: 'reporter',
				prompt: 'Summarise yesterday',
				promote: true,
				additionalFields: { userId: 'u_42', userTier: 'high', timezone: 'UTC', catchUpMax: 3 },
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.scheduleDef.mock.calls[0][0];
		expect(arg.op).toBe('create');
		expect(arg.name).toBe('daily-report');
		expect(arg.promote).toBe(true);
		expect(arg.overlay.schedule).toBe('0 9 * * 1-5');
		expect(arg.overlay.agent).toBe('reporter');
		expect(arg.overlay.user_id).toBe('u_42');
		expect(arg.overlay.user_tier).toBe('high');
		expect(arg.overlay.timezone).toBe('UTC');
		expect(arg.overlay.catch_up_max).toBe(3);
		// Prompt is wrapped as a trusted-text segment by default
		expect(arg.overlay.prompt[0].content[0].type).toBe('trusted-text');
		expect(arg.overlay.prompt[0].content[0].text).toBe('Summarise yesterday');
	});

	it('Create parses required_credentials CSV and per-fire credentials map', async () => {
		mockClient.scheduleDef.mockResolvedValue({ def_id: 'sched_x' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'scheduleDef',
				operation: 'create',
				name: 's',
				schedule: '0 * * * *',
				agent: 'a',
				prompt: 'go',
				promote: true,
				additionalFields: { requiredCredentials: 'slack, github' },
				userCredentials: { credential: [{ name: 'slack', value: '${LOOMCYCLE_SLACK}' }] },
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.scheduleDef.mock.calls[0][0];
		expect(arg.overlay.required_credentials).toEqual(['slack', 'github']);
		expect(arg.overlay.user_credentials).toEqual({ slack: '${LOOMCYCLE_SLACK}' });
	});

	it('Create folds metadata into overlay.metadata (v0.21)', async () => {
		mockClient.scheduleDef.mockResolvedValue({ def_id: 'sched_md' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'scheduleDef',
				operation: 'create',
				name: 's',
				schedule: '0 * * * *',
				agent: 'a',
				prompt: 'go',
				promote: true,
				metadata: '{"repo":"org/proj"}',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.scheduleDef.mock.calls[0][0];
		expect(arg.overlay.metadata).toEqual({ repo: 'org/proj' });
	});

	it('Fork merges per-fire credentials onto the JSON overlay diff', async () => {
		mockClient.scheduleDef.mockResolvedValue({ def_id: 'sched_fork' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'scheduleDef',
				operation: 'fork',
				parentDefId: 'sched_tmpl',
				overlay: '{"user_id":"u_99","user_tier":"low"}',
				promote: true,
				userCredentials: { credential: [{ name: 'github', value: '${run.user_bearer}' }] },
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.scheduleDef).toHaveBeenCalledWith({
			op: 'fork',
			parent_def_id: 'sched_tmpl',
			promote: true,
			overlay: {
				user_id: 'u_99',
				user_tier: 'low',
				user_credentials: { github: '${run.user_bearer}' },
			},
		});
	});

	it('Retire with name only', async () => {
		mockClient.scheduleDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'scheduleDef', operation: 'retire', name: 'daily-report' },
		});
		await node.execute.call(ctx);
		expect(mockClient.scheduleDef).toHaveBeenCalledWith({ op: 'retire', name: 'daily-report' });
	});

	it('wraps response in { result } envelope', async () => {
		mockClient.scheduleDef.mockResolvedValue({ def_id: 'sched_x' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'scheduleDef', operation: 'get', name: 's' },
		});
		const result = await node.execute.call(ctx);
		expect((result[0][0].json as Record<string, unknown>).result).toEqual({ def_id: 'sched_x' });
	});
});
