import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { INodeExecutionData, IPollFunctions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: { listUserAgents: vi.fn() },
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleRunCompleted } from '../../../nodes/LoomCycleRunCompleted/LoomCycleRunCompleted.node';

function pollCtx(params: Record<string, unknown>, staticData: Record<string, unknown> = {}): IPollFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'http://127.0.0.1:8787', bearerToken: 't', userId: '', userTier: '', mcpUrl: '' }),
		getNode: () => ({ id: 't', name: 'RC', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
		getWorkflowStaticData: () => staticData,
	} as unknown as IPollFunctions;
}

function poll(node: LoomCycleRunCompleted, ctx: IPollFunctions) {
	return (node.poll as unknown as (this: IPollFunctions) => Promise<INodeExecutionData[][] | null>).call(ctx);
}

beforeEach(() => mockClient.listUserAgents.mockReset());

describe('LoomCycle: Run Completed — poll()', () => {
	it('emits fresh runs whose status matches the selected terminal statuses', async () => {
		mockClient.listUserAgents.mockResolvedValue([
			{ agent_id: 'a1', status: 'completed' },
			{ agent_id: 'a2', status: 'running' },
			{ agent_id: 'a3', status: 'failed' },
		]);
		const res = await poll(new LoomCycleRunCompleted(), pollCtx({ userId: 'u1', statuses: ['completed', 'failed'], additionalFields: {} }));
		expect(res).not.toBeNull();
		expect(res![0].map((i) => (i.json as { agent_id: string }).agent_id)).toEqual(['a1', 'a3']);
	});

	it('dedups across polls — returns null when nothing new', async () => {
		mockClient.listUserAgents.mockResolvedValue([{ agent_id: 'a1', status: 'completed' }]);
		const sd = {};
		const ctx = pollCtx({ userId: 'u1', statuses: ['completed'], additionalFields: {} }, sd);
		const node = new LoomCycleRunCompleted();
		const first = await poll(node, ctx);
		expect(first![0]).toHaveLength(1);
		const second = await poll(node, ctx);
		expect(second).toBeNull();
	});

	it('filters by parentAgentId', async () => {
		mockClient.listUserAgents.mockResolvedValue([
			{ agent_id: 'a1', status: 'completed', parent_agent_id: 'p1' },
			{ agent_id: 'a2', status: 'completed', parent_agent_id: 'p2' },
		]);
		const res = await poll(new LoomCycleRunCompleted(), pollCtx({ userId: 'u1', statuses: ['completed'], additionalFields: { parentAgentId: 'p1' } }));
		expect(res![0].map((i) => (i.json as { agent_id: string }).agent_id)).toEqual(['a1']);
	});

	it('falls through to credential default userId', async () => {
		mockClient.listUserAgents.mockResolvedValue([]);
		const ctx = {
			getNodeParameter: (n: string) => (n === 'statuses' ? ['completed'] : n === 'additionalFields' ? {} : ''),
			getCredentials: async () => ({ baseUrl: 'http://x', bearerToken: 't', userId: 'cred-u', userTier: '', mcpUrl: '' }),
			getNode: () => ({ id: 't', name: 'RC', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
			getWorkflowStaticData: () => ({}),
		} as unknown as IPollFunctions;
		await poll(new LoomCycleRunCompleted(), ctx);
		expect(mockClient.listUserAgents).toHaveBeenCalledWith('cred-u');
	});
});
