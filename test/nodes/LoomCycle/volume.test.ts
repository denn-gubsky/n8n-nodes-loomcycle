import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		volumeDef: vi.fn(),
		listVolumes: vi.fn(),
		listEphemeralVolumes: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleVolume as LoomCycle } from '../../../nodes/LoomCycleVolume/LoomCycleVolume.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=volume', () => {
	describe('Create', () => {
		it('forwards op=create with name + mode', async () => {
			mockClient.volumeDef.mockResolvedValue({ name: 'scratch', mode: 'rw' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'volume', operation: 'create', name: 'scratch', mode: 'rw' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.volumeDef).toHaveBeenCalledWith({ op: 'create', name: 'scratch', mode: 'rw' });
			expect((result[0][0].json as Record<string, unknown>).result).toEqual({ name: 'scratch', mode: 'rw' });
		});

		it('defaults mode to rw and honours ro', async () => {
			mockClient.volumeDef.mockResolvedValue({});
			const node = new LoomCycle();
			const defaulted = makeExecuteContext({
				params: { resource: 'volume', operation: 'create', name: 'd' },
			});
			await node.execute.call(defaulted);
			expect(mockClient.volumeDef.mock.calls[0][0].mode).toBe('rw');

			const ro = makeExecuteContext({
				params: { resource: 'volume', operation: 'create', name: 'r', mode: 'ro' },
			});
			await node.execute.call(ro);
			expect(mockClient.volumeDef.mock.calls[1][0].mode).toBe('ro');
		});
	});

	describe('Get / Delete / Purge', () => {
		it('maps each op + reads the volumeName dropdown', async () => {
			mockClient.volumeDef.mockResolvedValue({ ok: true });
			const node = new LoomCycle();
			for (const operation of ['get', 'delete', 'purge'] as const) {
				const ctx = makeExecuteContext({
					params: { resource: 'volume', operation, volumeName: 'scratch' },
				});
				await node.execute.call(ctx);
			}
			expect(mockClient.volumeDef.mock.calls.map((c) => c[0])).toEqual([
				{ op: 'get', name: 'scratch' },
				{ op: 'delete', name: 'scratch' },
				{ op: 'purge', name: 'scratch' },
			]);
		});
	});

	describe('List views', () => {
		it('List wraps listVolumes', async () => {
			mockClient.listVolumes.mockResolvedValue({ entries: [{ name: 'scratch', source: 'dynamic', mode: 'rw' }] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({ params: { resource: 'volume', operation: 'list' } });
			const result = await node.execute.call(ctx);
			expect(mockClient.listVolumes).toHaveBeenCalledOnce();
			expect((result[0][0].json as Record<string, unknown>).entries).toHaveLength(1);
		});

		it('List Ephemeral wraps listEphemeralVolumes', async () => {
			mockClient.listEphemeralVolumes.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({ params: { resource: 'volume', operation: 'listEphemeral' } });
			await node.execute.call(ctx);
			expect(mockClient.listEphemeralVolumes).toHaveBeenCalledOnce();
			expect(mockClient.listVolumes).not.toHaveBeenCalled();
		});
	});
});
