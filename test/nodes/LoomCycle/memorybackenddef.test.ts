import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		memoryBackendDef: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleMemoryBackend as LoomCycle } from '../../../nodes/LoomCycleMemoryBackend/LoomCycleMemoryBackend.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=memoryBackendDef', () => {
	it('Get forwards { op: "get", name }', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ name: 'mem9', version: 2 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memoryBackendDef', operation: 'get', name: 'mem9' },
		});
		await node.execute.call(ctx);
		expect(mockClient.memoryBackendDef).toHaveBeenCalledWith({ op: 'get', name: 'mem9' });
	});

	it('List forwards { op: "list", name }', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ versions: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memoryBackendDef', operation: 'list', name: 'mem9' },
		});
		await node.execute.call(ctx);
		expect(mockClient.memoryBackendDef).toHaveBeenCalledWith({ op: 'list', name: 'mem9' });
	});

	it('Create forwards name + description + overlay + promote', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ def_id: 'mbd_1' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memoryBackendDef',
				operation: 'create',
				name: 'mem9',
				defDescription: 'external REST store',
				overlay: '{"kind":"rest","endpoint":"https://mem9.internal/v1"}',
				promote: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.memoryBackendDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'mem9',
			description: 'external REST store',
			overlay: { kind: 'rest', endpoint: 'https://mem9.internal/v1' },
			promote: true,
		});
	});

	it('Fork forwards parent_def_id + overlay diff', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ def_id: 'mbd_2' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memoryBackendDef',
				operation: 'fork',
				parentDefId: 'mbd_1',
				overlay: '{"endpoint":"https://staging.mem9/v1"}',
				promote: false,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.memoryBackendDef).toHaveBeenCalledWith({
			op: 'fork',
			parent_def_id: 'mbd_1',
			overlay: { endpoint: 'https://staging.mem9/v1' },
			promote: false,
		});
	});

	it('Retire with name + def_id', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memoryBackendDef', operation: 'retire', name: 'mem9', defId: 'mbd_1' },
		});
		await node.execute.call(ctx);
		expect(mockClient.memoryBackendDef).toHaveBeenCalledWith({ op: 'retire', name: 'mem9', def_id: 'mbd_1' });
	});

	it('wraps response in { result } envelope', async () => {
		mockClient.memoryBackendDef.mockResolvedValue({ def_id: 'mbd_x' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memoryBackendDef', operation: 'get', name: 'x' },
		});
		const result = await node.execute.call(ctx);
		expect((result[0][0].json as Record<string, unknown>).result).toEqual({ def_id: 'mbd_x' });
	});
});
