import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		a2aAgentDef: vi.fn(),
		a2aServerCardDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleA2aAgent } from '../../../nodes/LoomCycleA2aAgent/LoomCycleA2aAgent.node';
import { LoomCycleA2aServerCard } from '../../../nodes/LoomCycleA2aServerCard/LoomCycleA2aServerCard.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle A2A Agent (resource=a2aAgentDef)', () => {
	it('Create forwards name + description + overlay + promote', async () => {
		mockClient.a2aAgentDef.mockResolvedValue({ def_id: 'a2a_1' });
		const ctx = makeExecuteContext({
			params: {
				resource: 'a2aAgentDef',
				operation: 'create',
				name: 'peer-researcher',
				defDescription: 'external researcher',
				overlay: '{"agent_card_url":"https://peer/.well-known/agent.json","endpoint":"https://peer/a2a"}',
				promote: true,
			},
		});
		await new LoomCycleA2aAgent().execute.call(ctx);
		expect(mockClient.a2aAgentDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'peer-researcher',
			description: 'external researcher',
			overlay: { agent_card_url: 'https://peer/.well-known/agent.json', endpoint: 'https://peer/a2a' },
			promote: true,
		});
	});

	it('Get forwards { op: "get", name } and wraps in { result }', async () => {
		mockClient.a2aAgentDef.mockResolvedValue({ name: 'peer-researcher' });
		const ctx = makeExecuteContext({
			params: { resource: 'a2aAgentDef', operation: 'get', name: 'peer-researcher' },
		});
		const result = await new LoomCycleA2aAgent().execute.call(ctx);
		expect(mockClient.a2aAgentDef).toHaveBeenCalledWith({ op: 'get', name: 'peer-researcher' });
		expect((result[0][0].json as Record<string, unknown>).result).toEqual({ name: 'peer-researcher' });
	});
});

describe('LoomCycle A2A Server Card (resource=a2aServerCardDef)', () => {
	it('routes to client.a2aServerCardDef, not a2aAgentDef', async () => {
		mockClient.a2aServerCardDef.mockResolvedValue({ def_id: 'card_1' });
		const ctx = makeExecuteContext({
			params: {
				resource: 'a2aServerCardDef',
				operation: 'create',
				name: 'loomcycle-card',
				overlay: '{"provider":{"organization":"acme"}}',
				promote: true,
			},
		});
		await new LoomCycleA2aServerCard().execute.call(ctx);
		expect(mockClient.a2aServerCardDef).toHaveBeenCalledWith({
			op: 'create',
			name: 'loomcycle-card',
			overlay: { provider: { organization: 'acme' } },
			promote: true,
		});
		expect(mockClient.a2aAgentDef).not.toHaveBeenCalled();
	});

	it('List forwards { op: "list", name }', async () => {
		mockClient.a2aServerCardDef.mockResolvedValue({ versions: [] });
		const ctx = makeExecuteContext({
			params: { resource: 'a2aServerCardDef', operation: 'list', name: 'loomcycle-card' },
		});
		await new LoomCycleA2aServerCard().execute.call(ctx);
		expect(mockClient.a2aServerCardDef).toHaveBeenCalledWith({ op: 'list', name: 'loomcycle-card' });
	});
});
