import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleMemoryTool } from '../../../nodes/LoomCycleMemoryTool/LoomCycleMemoryTool.node';
import { makeSupplyDataContext, invokeSupplyData } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycleMemoryTool', () => {
	it('supplyData returns a tool with the configured name + description', async () => {
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({
			params: { toolName: 'mem', toolDescription: 'Read loomcycle memory' },
		});
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { name: string; description: string };
		expect(tool.name).toBe('mem');
		expect(tool.description).toContain('Read loomcycle memory');
	});

	it('tool.invoke(op=listScopes) calls listMemoryScopes', async () => {
		mockClient.listMemoryScopes.mockResolvedValue({ scopes: [{ name: 'agent' }, { name: 'user' }] });
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'listScopes' });
		expect(mockClient.listMemoryScopes).toHaveBeenCalledOnce();
		expect(JSON.parse(out)).toMatchObject({ scopes: [{ name: 'agent' }, { name: 'user' }] });
	});

	it('tool.invoke(op=listScopeIDs) requires scope', async () => {
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'listScopeIDs' });
		expect(JSON.parse(out)).toHaveProperty('error');
		expect(JSON.parse(out).error).toContain('scope is required');
	});

	it('tool.invoke(op=getEntry) forwards scope + scopeID + key', async () => {
		mockClient.getMemoryEntry.mockResolvedValue({ key: 'k1', value: 'hello' });
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'getEntry', scope: 'agent', scopeID: 'a1', key: 'k1' });
		expect(mockClient.getMemoryEntry).toHaveBeenCalledWith('agent', 'a1', 'k1');
		expect(JSON.parse(out)).toMatchObject({ key: 'k1', value: 'hello' });
	});

	it('tool.invoke(op=listEntries) forwards optional prefix + limit', async () => {
		mockClient.listMemoryEntries.mockResolvedValue({ entries: [] });
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ op: 'listEntries', scope: 'user', scopeID: 'u1', prefix: 'pref.', limit: 25 });
		expect(mockClient.listMemoryEntries).toHaveBeenCalledWith('user', 'u1', { prefix: 'pref.', limit: 25 });
	});

	it('SECURITY — wrapped error from wire call is bearer-redacted', async () => {
		mockClient.listMemoryScopes.mockRejectedValue(
			new Error('Authorization: Bearer sk-leaked-token-abcdefghij was rejected'),
		);
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'listScopes' });
		expect(out).not.toContain('sk-leaked-token-abcdefghij');
		expect(out).toContain('[REDACTED]');
	});
});
