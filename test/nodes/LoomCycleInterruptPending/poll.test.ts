import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { INodeExecutionData, IPollFunctions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: { listUserInterrupts: vi.fn() },
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleInterruptPending } from '../../../nodes/LoomCycleInterruptPending/LoomCycleInterruptPending.node';

function pollCtx(params: Record<string, unknown>, staticData: Record<string, unknown> = {}): IPollFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'http://127.0.0.1:8787', bearerToken: 't', userId: '', userTier: '', mcpUrl: '' }),
		getNode: () => ({ id: 't', name: 'IP', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
		getWorkflowStaticData: () => staticData,
	} as unknown as IPollFunctions;
}

function poll(node: LoomCycleInterruptPending, ctx: IPollFunctions) {
	return (node.poll as unknown as (this: IPollFunctions) => Promise<INodeExecutionData[][] | null>).call(ctx);
}

beforeEach(() => mockClient.listUserInterrupts.mockReset());

describe('LoomCycle: Interrupt Pending — poll()', () => {
	it('queries pending interrupts and emits the fresh ones', async () => {
		mockClient.listUserInterrupts.mockResolvedValue({
			interrupts: [
				{ interrupt_id: 'i1', run_id: 'r1', status: 'pending', question: 'Approve?' },
				{ interrupt_id: 'i2', run_id: 'r2', status: 'pending', question: 'Which env?' },
			],
			total: 2,
		});
		const res = await poll(new LoomCycleInterruptPending(), pollCtx({ userId: 'u1' }));
		expect(mockClient.listUserInterrupts).toHaveBeenCalledWith('u1', { status: 'pending' });
		expect(res).not.toBeNull();
		expect(res![0].map((i) => (i.json as { interrupt_id: string }).interrupt_id)).toEqual(['i1', 'i2']);
	});

	it('dedups across polls — returns null when nothing new', async () => {
		mockClient.listUserInterrupts.mockResolvedValue({
			interrupts: [{ interrupt_id: 'i1', run_id: 'r1', status: 'pending' }],
			total: 1,
		});
		const sd = {};
		const ctx = pollCtx({ userId: 'u1' }, sd);
		const node = new LoomCycleInterruptPending();
		const first = await poll(node, ctx);
		expect(first![0]).toHaveLength(1);
		const second = await poll(node, ctx);
		expect(second).toBeNull();
	});

	it('falls through to credential default userId', async () => {
		mockClient.listUserInterrupts.mockResolvedValue({ interrupts: [], total: 0 });
		const ctx = {
			getNodeParameter: () => '',
			getCredentials: async () => ({ baseUrl: 'http://x', bearerToken: 't', userId: 'cred-u', userTier: '', mcpUrl: '' }),
			getNode: () => ({ id: 't', name: 'IP', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
			getWorkflowStaticData: () => ({}),
		} as unknown as IPollFunctions;
		await poll(new LoomCycleInterruptPending(), ctx);
		expect(mockClient.listUserInterrupts).toHaveBeenCalledWith('cred-u', { status: 'pending' });
	});
});
