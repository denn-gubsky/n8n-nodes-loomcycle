import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
		listChannels: vi.fn(),
		publishChannel: vi.fn(),
		subscribeChannel: vi.fn(),
		peekChannel: vi.fn(),
		ackChannel: vi.fn(),
		health: vi.fn(),
		agentDef: vi.fn(),
		skillDef: vi.fn(),
		mcpServerDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleMcpServerDef as LoomCycle } from '../../../nodes/LoomCycleMcpServerDef/LoomCycleMcpServerDef.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=mcpServerDef', () => {
	describe('Register (op="create")', () => {
		it('forwards name + transport + url + headers as direct fields', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ def_id: 'mcpdef_1' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'create',
					name: 'slack-mcp',
					transport: 'streamable-http',
					url: 'https://mcp.slack.example/v1',
					headers: {
						header: [
							{ name: 'Authorization', value: 'Bearer ${LOOMCYCLE_SLACK_TOKEN}' },
							{ name: 'X-Tenant', value: 'team-a' },
						],
					},
					defDescription: 'Slack chat MCP',
					promote: true,
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({
				op: 'create',
				name: 'slack-mcp',
				description: 'Slack chat MCP',
				promote: true,
				transport: 'streamable-http',
				url: 'https://mcp.slack.example/v1',
				headers: {
					Authorization: 'Bearer ${LOOMCYCLE_SLACK_TOKEN}',
					'X-Tenant': 'team-a',
				},
			});
		});

		it('omits headers field when no headers added', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ def_id: 'mcpdef_1' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'create',
					name: 'public-mcp',
					transport: 'http',
					url: 'http://localhost:9999',
					headers: {},
					promote: false,
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.mcpServerDef.mock.calls[0][0];
			expect(arg.headers).toBeUndefined();
		});

		it('omits discover when left at the default (auto-discovery on)', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ def_id: 'mcpdef_1', discovered: 7 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'create',
					name: 'slack-mcp',
					transport: 'http',
					url: 'http://localhost:9999',
					headers: {},
					discover: true,
					promote: true,
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.mcpServerDef.mock.calls[0][0];
			expect(arg.discover).toBeUndefined();
		});

		it('forwards discover:false when auto-discovery is turned off', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ def_id: 'mcpdef_1' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'create',
					name: 'slack-mcp',
					transport: 'http',
					url: 'http://localhost:9999',
					headers: {},
					discover: false,
					promote: true,
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.mcpServerDef.mock.calls[0][0];
			expect(arg.discover).toBe(false);
		});

		it('rejects stdio transport with NodeOperationError', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'create',
					name: 'evil-mcp',
					transport: 'stdio',
					url: '/usr/bin/some-binary',
				},
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
			expect(mockClient.mcpServerDef).not.toHaveBeenCalled();
		});
	});

	describe('Fork', () => {
		it('forwards parent_def_id + overlay JSON', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ def_id: 'mcpdef_2' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'fork',
					parentDefId: 'mcpdef_1',
					overlay: '{"url":"https://mcp.slack-staging.example/v1"}',
					promote: false,
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({
				op: 'fork',
				parent_def_id: 'mcpdef_1',
				overlay: { url: 'https://mcp.slack-staging.example/v1' },
				promote: false,
			});
		});
	});

	describe('Rediscover', () => {
		it('forwards { op: "rediscover", name }', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ discovered_tools: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'mcpServerDef', operation: 'rediscover', name: 'slack-mcp' },
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({ op: 'rediscover', name: 'slack-mcp' });
		});
	});

	describe('Verify', () => {
		it('forwards content_sha256', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ matches: false });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'mcpServerDef',
					operation: 'verify',
					name: 'slack-mcp',
					contentSha256: 'sha256:0123456789abcdef',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({
				op: 'verify',
				name: 'slack-mcp',
				content_sha256: 'sha256:0123456789abcdef',
			});
		});
	});

	describe('Promote / Retire / Get / List', () => {
		it('Promote forwards def_id only', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ ok: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'mcpServerDef', operation: 'promote', defId: 'mcpdef_2' },
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({ op: 'promote', def_id: 'mcpdef_2' });
		});

		it('Retire forwards name only when defId blank', async () => {
			mockClient.mcpServerDef.mockResolvedValue({ ok: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'mcpServerDef', operation: 'retire', name: 'slack-mcp' },
			});
			await node.execute.call(ctx);
			expect(mockClient.mcpServerDef).toHaveBeenCalledWith({ op: 'retire', name: 'slack-mcp' });
		});

		it('Get + List route through the same dispatcher', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp', version: 1 });
			mockClient.mcpServerDef.mockResolvedValueOnce({ versions: [] });
			const node = new LoomCycle();
			await node.execute.call(
				makeExecuteContext({
					params: { resource: 'mcpServerDef', operation: 'get', name: 'slack-mcp' },
				}),
			);
			await node.execute.call(
				makeExecuteContext({
					params: { resource: 'mcpServerDef', operation: 'list', name: 'slack-mcp' },
				}),
			);
			expect(mockClient.mcpServerDef).toHaveBeenNthCalledWith(1, { op: 'get', name: 'slack-mcp' });
			expect(mockClient.mcpServerDef).toHaveBeenNthCalledWith(2, { op: 'list', name: 'slack-mcp' });
		});
	});
});
