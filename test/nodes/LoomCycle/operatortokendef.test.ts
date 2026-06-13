import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError, type INodePropertyOptions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		operatorTokenDef: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleOperatorToken as LoomCycle } from '../../../nodes/LoomCycleOperatorToken/LoomCycleOperatorToken.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=operatorTokenDef', () => {
	// SECURITY (CLAUDE.md §6): create/rotate return the token plaintext, which
	// must never enter n8n execution data. This node must expose ONLY the
	// non-secret lifecycle, and the executor must refuse create/rotate even if
	// an op value is injected via an expression.
	it('exposes ONLY get / list / retire — no create / rotate op', () => {
		const node = new LoomCycle();
		const op = node.description.properties.find((p) => p.name === 'operation')!;
		const values = (op.options as INodePropertyOptions[]).map((o) => o.value);
		expect(values.sort()).toEqual(['get', 'list', 'retire']);
		expect(values).not.toContain('create');
		expect(values).not.toContain('rotate');
	});

	it('refuses create at the executor (defence-in-depth) without calling the adapter', async () => {
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'operatorTokenDef', operation: 'create', name: 't' },
		});
		await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.operatorTokenDef).not.toHaveBeenCalled();
	});

	it('refuses rotate at the executor', async () => {
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'operatorTokenDef', operation: 'rotate', name: 't' },
		});
		await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.operatorTokenDef).not.toHaveBeenCalled();
	});

	it('Get forwards { op: "get", name }', async () => {
		mockClient.operatorTokenDef.mockResolvedValue({ name: 'ci-bot', version: 1 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'operatorTokenDef', operation: 'get', name: 'ci-bot' },
		});
		await node.execute.call(ctx);
		expect(mockClient.operatorTokenDef).toHaveBeenCalledWith({ op: 'get', name: 'ci-bot' });
	});

	it('List forwards { op: "list", name }', async () => {
		mockClient.operatorTokenDef.mockResolvedValue({ tokens: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'operatorTokenDef', operation: 'list', name: '' },
		});
		await node.execute.call(ctx);
		expect(mockClient.operatorTokenDef).toHaveBeenCalledWith({ op: 'list' });
	});

	it('Retire forwards name + def_id', async () => {
		mockClient.operatorTokenDef.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'operatorTokenDef', operation: 'retire', name: 'ci-bot', defId: 'otd_9' },
		});
		await node.execute.call(ctx);
		expect(mockClient.operatorTokenDef).toHaveBeenCalledWith({ op: 'retire', name: 'ci-bot', def_id: 'otd_9' });
	});
});
