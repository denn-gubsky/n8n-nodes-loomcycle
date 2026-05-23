import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleSubAgentTool } from '../../../nodes/LoomCycleSubAgentTool/LoomCycleSubAgentTool.node';
import { makeSupplyDataContext, invokeSupplyData } from './_helpers';

function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) yield item;
		},
	};
}

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycleSubAgentTool', () => {
	it('spawns the configured agent with the AI Agent\'s prompt + returns finalText', async () => {
		mockClient.runStreaming.mockReturnValue(
			asAsyncIterable([
				{ type: 'text', text: 'partial-' },
				{ type: 'text', text: 'response' },
				{ type: 'done', stop_reason: 'end_turn' },
			]),
		);
		const node = new LoomCycleSubAgentTool();
		const ctx = makeSupplyDataContext({
			params: { toolName: 'sub', toolDescription: 'd', agent: 'specialised', treatPromptAsUntrusted: true },
		});
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ prompt: 'Do the thing' });

		expect(mockClient.runStreaming).toHaveBeenCalledOnce();
		const arg = mockClient.runStreaming.mock.calls[0][0];
		expect(arg.agent).toBe('specialised');
		expect(arg.segments[0].content[0].type).toBe('untrusted-block');
		expect(out).toBe('partial-response');
	});

	it('forwards credential-default userId + userTier', async () => {
		mockClient.runStreaming.mockReturnValue(asAsyncIterable([{ type: 'done', stop_reason: 'end_turn' }]));
		const node = new LoomCycleSubAgentTool();
		const ctx = makeSupplyDataContext({
			params: { toolName: 'sub', toolDescription: 'd', agent: 'a' },
			credentials: { userId: 'u-default', userTier: 'pro' },
		});
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ prompt: 'q' });
		const arg = mockClient.runStreaming.mock.calls[0][0];
		expect(arg.userId).toBe('u-default');
		expect(arg.userTier).toBe('pro');
	});

	it('forwards sessionId when supplied on the tool call', async () => {
		mockClient.runStreaming.mockReturnValue(asAsyncIterable([{ type: 'done', stop_reason: 'end_turn' }]));
		const node = new LoomCycleSubAgentTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'sub', toolDescription: 'd', agent: 'a' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ prompt: 'q', sessionId: 'sess_42' });
		expect(mockClient.runStreaming.mock.calls[0][0].sessionId).toBe('sess_42');
	});

	it('treatPromptAsUntrusted=false wraps as trusted-text', async () => {
		mockClient.runStreaming.mockReturnValue(asAsyncIterable([{ type: 'done', stop_reason: 'end_turn' }]));
		const node = new LoomCycleSubAgentTool();
		const ctx = makeSupplyDataContext({
			params: { toolName: 'sub', toolDescription: 'd', agent: 'a', treatPromptAsUntrusted: false },
		});
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ prompt: 'q' });
		expect(mockClient.runStreaming.mock.calls[0][0].segments[0].content[0].type).toBe('trusted-text');
	});
});
