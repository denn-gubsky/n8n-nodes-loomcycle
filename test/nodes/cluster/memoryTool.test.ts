import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
		setMemoryEntry: vi.fn(),
		deleteMemoryEntry: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleMemoryTool } from '../../../nodes/LoomCycleMemoryTool/LoomCycleMemoryTool.node';
import { makeSupplyDataContext, invokeSupplyData, makeExecuteContext, invokeExecute } from './_helpers';

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

	// ---- execute() path: n8n Tools Agent invocation (v1.82+) ----

	it('execute(op=listScopes) reads input + returns scopes JSON', async () => {
		mockClient.listMemoryScopes.mockResolvedValue({ scopes: [{ name: 'agent' }, { name: 'user' }] });
		const node = new LoomCycleMemoryTool();
		const ctx = makeExecuteContext({
			params: { toolName: 'mem', toolDescription: 'd' },
			inputJson: { op: 'listScopes' },
		});
		const out = await invokeExecute(node, ctx);
		expect(mockClient.listMemoryScopes).toHaveBeenCalledOnce();
		expect(out).toHaveLength(1);
		expect(out[0]).toHaveLength(1);
		expect(out[0][0].json).toMatchObject({ scopes: [{ name: 'agent' }, { name: 'user' }] });
	});

	it('execute() returns redacted error envelope on wire failure', async () => {
		mockClient.listMemoryScopes.mockRejectedValue(
			new Error('Authorization: Bearer sk-leaked-token-abcdefghij was rejected'),
		);
		const node = new LoomCycleMemoryTool();
		const ctx = makeExecuteContext({
			params: { toolName: 'mem', toolDescription: 'd' },
			inputJson: { op: 'listScopes' },
		});
		const out = await invokeExecute(node, ctx);
		const surface = JSON.stringify(out);
		expect(surface).not.toContain('sk-leaked-token-abcdefghij');
		expect(surface).toContain('[REDACTED]');
		expect(out[0][0].json).toHaveProperty('error');
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

	// ---- v0.11.5 write ops via the agent-side tool ----

	it('tool.invoke(op=setEntry) forwards scope + scopeID + key + value + embed/ttlSeconds', async () => {
		mockClient.setMemoryEntry.mockResolvedValue({ scope: 's', scope_id: 'i', key: 'k', embedded: true });
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({
			op: 'setEntry',
			scope: 'briefings',
			scopeID: 'arctic-terns',
			key: 'raw',
			value: { text: 'Arctic terns migrate further than any other bird.' },
			embed: true,
			ttlSeconds: 3600,
		});
		expect(mockClient.setMemoryEntry).toHaveBeenCalledWith(
			'briefings',
			'arctic-terns',
			'raw',
			expect.objectContaining({
				value: { text: 'Arctic terns migrate further than any other bird.' },
				embed: true,
				ttl_seconds: 3600,
			}),
		);
	});

	it('tool.invoke(op=setEntry) requires value (gateway-style validation)', async () => {
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'setEntry', scope: 's', scopeID: 'i', key: 'k' });
		// Missing value → tool throws → buildTool catches and returns
		// { error } envelope as a JSON string.
		expect(JSON.parse(out).error).toMatch(/value is required/);
		expect(mockClient.setMemoryEntry).not.toHaveBeenCalled();
	});

	it('tool.invoke(op=deleteEntry) forwards scope + scopeID + key', async () => {
		mockClient.deleteMemoryEntry.mockResolvedValue(undefined);
		const node = new LoomCycleMemoryTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'mem', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'deleteEntry', scope: 's', scopeID: 'i', key: 'k' });
		expect(mockClient.deleteMemoryEntry).toHaveBeenCalledWith('s', 'i', 'k');
		expect(JSON.parse(out)).toMatchObject({ ok: true, scope: 's', scope_id: 'i', key: 'k' });
	});
});
