import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		listUserInterrupts: vi.fn(),
		listRunInterrupts: vi.fn(),
		resolveInterrupt: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleInterruption as LoomCycle } from '../../../nodes/LoomCycleInterruption/LoomCycleInterruption.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=interruption', () => {
	describe('List for User', () => {
		it('forwards userId + status', async () => {
			mockClient.listUserInterrupts.mockResolvedValue({ interrupts: [], total: 0 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'interruption', operation: 'listForUser', userId: 'u1', status: 'pending' },
			});
			await node.execute.call(ctx);
			expect(mockClient.listUserInterrupts).toHaveBeenCalledWith('u1', { status: 'pending' });
		});

		it('falls back to the credential Default User ID', async () => {
			mockClient.listUserInterrupts.mockResolvedValue({ interrupts: [], total: 0 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'interruption', operation: 'listForUser', status: 'answered' },
				credentials: { userId: 'cred-u' },
			});
			await node.execute.call(ctx);
			expect(mockClient.listUserInterrupts).toHaveBeenCalledWith('cred-u', { status: 'answered' });
		});

		it('throws NodeOperationError when no userId resolvable', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'interruption', operation: 'listForUser', status: 'pending' },
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		});
	});

	describe('List for Run', () => {
		it('forwards runId + status', async () => {
			mockClient.listRunInterrupts.mockResolvedValue({ interrupts: [], total: 0 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'interruption', operation: 'listForRun', runId: 'r1', status: 'pending' },
			});
			await node.execute.call(ctx);
			expect(mockClient.listRunInterrupts).toHaveBeenCalledWith('r1', { status: 'pending' });
		});
	});

	describe('Resolve', () => {
		it('forwards runId + interruptId + answer + resolvedBy', async () => {
			mockClient.resolveInterrupt.mockResolvedValue({ ok: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'interruption',
					operation: 'resolve',
					runId: 'r1',
					interruptId: 'int_42',
					answer: 'yes',
					resolvedBy: 'ops@team',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.resolveInterrupt).toHaveBeenCalledWith('r1', 'int_42', {
				answer: 'yes',
				resolvedBy: 'ops@team',
			});
		});

		it('omits resolvedBy when empty', async () => {
			mockClient.resolveInterrupt.mockResolvedValue(undefined);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'interruption',
					operation: 'resolve',
					runId: 'r1',
					interruptId: 'int_7',
					answer: 'option-a',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.resolveInterrupt).toHaveBeenCalledWith('r1', 'int_7', { answer: 'option-a' });
		});

		it('surfaces an ok envelope when the adapter returns void', async () => {
			mockClient.resolveInterrupt.mockResolvedValue(undefined);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'interruption', operation: 'resolve', runId: 'r1', interruptId: 'i', answer: 'a' },
			});
			const result = await node.execute.call(ctx);
			expect((result[0][0].json as Record<string, unknown>).result).toEqual({ ok: true });
		});
	});
});
