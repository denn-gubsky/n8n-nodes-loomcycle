import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Hoisted mock of the LoomcycleClient surface so vi.mock can reference it.
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
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycle } from '../../../nodes/LoomCycle/LoomCycle.node';
import { makeExecuteContext, asAsyncIterable, fakeSuccessfulRunEvents } from './_helpers';
import { AgentNotFoundError } from '@loomcycle/client';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=run', () => {
	describe('Spawn', () => {
		it('drains runStreaming and returns finalText + agentId + runId', async () => {
			mockClient.runStreaming.mockReturnValue(
				asAsyncIterable(
					fakeSuccessfulRunEvents({ agentId: 'a1', runId: 'r1', text: 'Hello' }),
				),
			);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'spawn',
					agent: 'researcher',
					prompt: 'find X',
				},
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.runStreaming).toHaveBeenCalledOnce();
			const json = result[0][0].json as Record<string, unknown>;
			expect(json.finalText).toBe('Hello');
			expect(json.agentId).toBe('a1');
			expect(json.runId).toBe('r1');
		});

		it('forwards credential-default user_tier when per-node parameter is empty', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'spawn', agent: 'a', prompt: 'q' },
				credentials: { userTier: 'pro' },
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.userTier).toBe('pro');
		});

		it('per-node userId overrides credential default', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'spawn', agent: 'a', prompt: 'q', userId: 'override-u' },
				credentials: { userId: 'default-u' },
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.userId).toBe('override-u');
		});

		it('wraps prompt as trusted-text by default', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'spawn', agent: 'a', prompt: 'hello' },
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.segments[0].content[0].type).toBe('trusted-text');
		});

		it('wraps prompt as untrusted-block when treatPromptAsUntrusted=true', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'spawn',
					agent: 'a',
					prompt: 'user-input',
					treatPromptAsUntrusted: true,
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.segments[0].content[0].type).toBe('untrusted-block');
		});

		it('parses allowedTools CSV into an array', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'spawn',
					agent: 'a',
					prompt: 'q',
					additionalFields: { allowedTools: 'Memory, Channel ,  AgentDef' },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.allowedTools).toEqual(['Memory', 'Channel', 'AgentDef']);
		});

		it('forwards webSearchFilter when set to "drop"', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'spawn',
					agent: 'a',
					prompt: 'q',
					additionalFields: { webSearchFilter: 'drop' },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.webSearchFilter).toBe('drop');
		});

		it('does NOT forward webSearchFilter when empty string', async () => {
			mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'spawn',
					agent: 'a',
					prompt: 'q',
					additionalFields: { webSearchFilter: '' },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runStreaming.mock.calls[0][0];
			expect(arg.webSearchFilter).toBeUndefined();
		});
	});

	describe('Get Status', () => {
		it('returns the Agent shape from getAgent', async () => {
			mockClient.getAgent.mockResolvedValue({ agent_id: 'a1', status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'getStatus', agentId: 'a1' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.getAgent).toHaveBeenCalledWith('a1');
			expect((result[0][0].json as Record<string, unknown>).agent_id).toBe('a1');
		});

		it('wraps AgentNotFoundError into NodeApiError 404', async () => {
			mockClient.getAgent.mockRejectedValue(
				new AgentNotFoundError('not found', { status: 404, bodyText: 'agent_id=missing' }),
			);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'getStatus', agentId: 'missing' },
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeApiError);
		});
	});

	describe('Wait', () => {
		it('returns the Agent when status flips to completed', async () => {
			mockClient.getAgent
				.mockResolvedValueOnce({ agent_id: 'a1', status: 'running' })
				.mockResolvedValueOnce({ agent_id: 'a1', status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'wait',
					agentId: 'a1',
					pollIntervalMs: 5,
					timeoutSec: 5,
				},
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.getAgent).toHaveBeenCalledTimes(2);
			expect((result[0][0].json as Record<string, unknown>).status).toBe('completed');
		});

		it('throws NodeOperationError when timeout exceeded', async () => {
			mockClient.getAgent.mockResolvedValue({ agent_id: 'a1', status: 'running' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'run',
					operation: 'wait',
					agentId: 'a1',
					pollIntervalMs: 5,
					timeoutSec: 0,
				},
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		});
	});

	describe('Cancel', () => {
		it('passes the reason through to cancelAgent', async () => {
			mockClient.cancelAgent.mockResolvedValue({ cancelledCount: 2 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'cancel', agentId: 'a1', reason: 'manual stop' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.cancelAgent).toHaveBeenCalledWith('a1', { reason: 'manual stop' });
			expect((result[0][0].json as Record<string, unknown>).cancelledCount).toBe(2);
		});

		it('omits opts when reason is empty (no second arg)', async () => {
			mockClient.cancelAgent.mockResolvedValue({ cancelledCount: 1 });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'cancel', agentId: 'a1', reason: '' },
			});
			await node.execute.call(ctx);
			expect(mockClient.cancelAgent).toHaveBeenCalledWith('a1', undefined);
		});
	});

	describe('List Agents', () => {
		it('throws NodeOperationError when no userId resolvable', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'listAgents' },
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		});

		it('falls through to credential default userId', async () => {
			mockClient.listUserAgents.mockResolvedValue([{ agent_id: 'a1', agent: 'researcher' }]);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'listAgents' },
				credentials: { userId: 'cred-u' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.listUserAgents).toHaveBeenCalledWith('cred-u', undefined);
			expect((result[0][0].json as Record<string, unknown>).agents).toHaveLength(1);
		});

		it('forwards status filter', async () => {
			mockClient.listUserAgents.mockResolvedValue([]);
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'run', operation: 'listAgents', userId: 'u1', statusFilter: 'running' },
			});
			await node.execute.call(ctx);
			expect(mockClient.listUserAgents).toHaveBeenCalledWith('u1', { status: 'running' });
		});
	});
});
