import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { INodeExecutionData, IPollFunctions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: { listUserAgents: vi.fn() },
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleReviewPending } from '../../../nodes/LoomCycleReviewPending/LoomCycleReviewPending.node';

function pollCtx(params: Record<string, unknown>, staticData: Record<string, unknown> = {}): IPollFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'http://127.0.0.1:8787', bearerToken: 't', userId: '', userTier: '', mcpUrl: '' }),
		getNode: () => ({ id: 't', name: 'RP', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
		getWorkflowStaticData: () => staticData,
	} as unknown as IPollFunctions;
}

function poll(ctx: IPollFunctions) {
	return (new LoomCycleReviewPending().poll as unknown as (this: IPollFunctions) => Promise<INodeExecutionData[][] | null>).call(ctx);
}

const ids = (res: INodeExecutionData[][] | null) => (res ? res[0].map((i) => (i.json as { run_id: string }).run_id) : null);

beforeEach(() => mockClient.listUserAgents.mockReset());

describe('LoomCycle: Review Pending — poll()', () => {
	it('asks for running runs held on review', async () => {
		mockClient.listUserAgents.mockResolvedValue([]);
		await poll(pollCtx({ userId: 'u1' }));
		expect(mockClient.listUserAgents).toHaveBeenCalledWith('u1', { status: 'running', awaitedState: ['review'] });
	});

	it('emits only runs actually held on review, as an older server ignores the filter', async () => {
		mockClient.listUserAgents.mockResolvedValue([
			{ run_id: 'r1', agent: 'a', status: 'running', awaited_state: 'review' },
			{ run_id: 'r2', agent: 'a', status: 'running' },
			{ run_id: 'r3', agent: 'a', status: 'running', awaited_state: 'input' },
		]);
		expect(ids(await poll(pollCtx({ userId: 'u1' })))).toEqual(['r1']);
	});

	it('filters by agent', async () => {
		mockClient.listUserAgents.mockResolvedValue([
			{ run_id: 'r1', agent: 'writer', status: 'running', awaited_state: 'review' },
			{ run_id: 'r2', agent: 'coder', status: 'running', awaited_state: 'review' },
		]);
		expect(ids(await poll(pollCtx({ userId: 'u1', agent: 'coder' })))).toEqual(['r2']);
	});

	it('fires once per hold, and again when a revised answer is held anew', async () => {
		const sd = {};
		const held = [{ run_id: 'r1', agent: 'a', status: 'running', awaited_state: 'review' }];
		mockClient.listUserAgents.mockResolvedValue(held);
		expect(ids(await poll(pollCtx({ userId: 'u1' }, sd)))).toEqual(['r1']);
		expect(await poll(pollCtx({ userId: 'u1' }, sd))).toBeNull();
		// Rejected with feedback: the run revises (no longer held) …
		mockClient.listUserAgents.mockResolvedValue([]);
		expect(await poll(pollCtx({ userId: 'u1' }, sd))).toBeNull();
		// … and its next answer is held again.
		mockClient.listUserAgents.mockResolvedValue(held);
		expect(ids(await poll(pollCtx({ userId: 'u1' }, sd)))).toEqual(['r1']);
	});
});
