import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		path: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCyclePath as LoomCycle } from '../../../nodes/LoomCyclePath/LoomCyclePath.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=path', () => {
	it('Resolve forwards op + path + default scope=agent, wraps result', async () => {
		mockClient.path.mockResolvedValue({ dirent: { name: 'launch' } });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'path', operation: 'resolve', path: '/docs/launch' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.path).toHaveBeenCalledWith({ op: 'resolve', path: '/docs/launch', scope: 'agent' });
		expect((result[0][0].json as Record<string, unknown>).result).toEqual({ dirent: { name: 'launch' } });
	});

	it('forwards a non-default scope', async () => {
		mockClient.path.mockResolvedValue({});
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'path', operation: 'stat', path: '/x', scope: 'user' },
		});
		await node.execute.call(ctx);
		expect(mockClient.path.mock.calls[0][0].scope).toBe('user');
	});

	describe('List (ls)', () => {
		it('includes recursive + kind_filter when set', async () => {
			mockClient.path.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'path', operation: 'ls', path: '/docs', recursive: true, kindFilter: 'document' },
			});
			await node.execute.call(ctx);
			expect(mockClient.path).toHaveBeenCalledWith({
				op: 'ls',
				path: '/docs',
				scope: 'agent',
				recursive: true,
				kind_filter: 'document',
			});
		});

		it('omits recursive when false and kind_filter when Any (empty)', async () => {
			mockClient.path.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'path', operation: 'ls', path: '/docs', recursive: false, kindFilter: '' },
			});
			await node.execute.call(ctx);
			const arg = mockClient.path.mock.calls[0][0];
			expect(arg.recursive).toBeUndefined();
			expect(arg.kind_filter).toBeUndefined();
		});
	});

	it('Move forwards the destination path', async () => {
		mockClient.path.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'path', operation: 'mv', path: '/a', to: '/b' },
		});
		await node.execute.call(ctx);
		expect(mockClient.path.mock.calls[0][0]).toMatchObject({ op: 'mv', path: '/a', to: '/b' });
	});

	it('Remove forwards recursive only when set', async () => {
		mockClient.path.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'path', operation: 'rm', path: '/a', recursive: true },
		});
		await node.execute.call(ctx);
		expect(mockClient.path.mock.calls[0][0]).toMatchObject({ op: 'rm', path: '/a', recursive: true });
	});
});
