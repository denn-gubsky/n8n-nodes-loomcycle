import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		createSnapshot: vi.fn(),
		listSnapshots: vi.fn(),
		getSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
		restoreSnapshot: vi.fn(),
		exportSnapshotURL: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleSnapshot as LoomCycle } from '../../../nodes/LoomCycleSnapshot/LoomCycleSnapshot.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=snapshot', () => {
	it('Create folds label + includeHistory + maxBytes', async () => {
		mockClient.createSnapshot.mockResolvedValue({ id: 'snap_1', created_at: 't', schema_version: 1, byte_size: 9 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'snapshot',
				operation: 'create',
				additionalFields: { label: 'pre-deploy', includeHistory: true, maxBytes: 1048576 },
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.createSnapshot).toHaveBeenCalledWith({
			label: 'pre-deploy',
			includeHistory: true,
			maxBytes: 1048576,
		});
	});

	it('Create omits maxBytes when 0', async () => {
		mockClient.createSnapshot.mockResolvedValue({ id: 'snap_1' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'snapshot', operation: 'create', additionalFields: { maxBytes: 0 } },
		});
		await node.execute.call(ctx);
		expect(mockClient.createSnapshot.mock.calls[0][0].maxBytes).toBeUndefined();
	});

	it('List forwards filters + wraps { entries }', async () => {
		mockClient.listSnapshots.mockResolvedValue([{ id: 'snap_1', label: 'a' }]);
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'snapshot', operation: 'list', additionalFields: { limit: 10, labelContains: 'deploy' } },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.listSnapshots).toHaveBeenCalledWith({ limit: 10, labelContains: 'deploy' });
		expect((result[0][0].json as Record<string, unknown>).entries).toHaveLength(1);
	});

	it('Get forwards snapshotId', async () => {
		mockClient.getSnapshot.mockResolvedValue({ id: 'snap_1', json_content: {} });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'snapshot', operation: 'get', snapshotId: 'snap_1' },
		});
		await node.execute.call(ctx);
		expect(mockClient.getSnapshot).toHaveBeenCalledWith('snap_1');
	});

	it('Delete surfaces an ok envelope', async () => {
		mockClient.deleteSnapshot.mockResolvedValue(undefined);
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'snapshot', operation: 'delete', snapshotId: 'snap_doomed' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.deleteSnapshot).toHaveBeenCalledWith('snap_doomed');
		expect(result[0][0].json).toMatchObject({ ok: true, id: 'snap_doomed' });
	});

	it('Export URL returns the bearer-authed URL (synchronous, no fetch)', async () => {
		mockClient.exportSnapshotURL.mockReturnValue('http://127.0.0.1:8787/v1/_snapshots/snap_1/export');
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'snapshot', operation: 'exportUrl', snapshotId: 'snap_1' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.exportSnapshotURL).toHaveBeenCalledWith('snap_1');
		expect((result[0][0].json as Record<string, unknown>).url).toContain('/v1/_snapshots/snap_1/export');
	});

	it('Restore by ID forwards snapshotId + includeHistory', async () => {
		mockClient.restoreSnapshot.mockResolvedValue({ restored: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'snapshot',
				operation: 'restore',
				restoreSource: 'byId',
				snapshotId: 'snap_1',
				includeHistory: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.restoreSnapshot).toHaveBeenCalledWith({ snapshotId: 'snap_1', includeHistory: true });
	});

	it('Restore inline forwards the parsed envelope JSON', async () => {
		mockClient.restoreSnapshot.mockResolvedValue({ restored: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'snapshot',
				operation: 'restore',
				restoreSource: 'inline',
				restoreJson: '{"id":"snap_x","schema_version":1}',
				includeHistory: false,
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.restoreSnapshot.mock.calls[0][0];
		expect(arg.json).toEqual({ id: 'snap_x', schema_version: 1 });
		expect(arg.snapshotId).toBeUndefined();
		expect(arg.includeHistory).toBe(false);
	});
});
