import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		publishChannel: vi.fn(),
		peekChannel: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleChannelTool } from '../../../nodes/LoomCycleChannelTool/LoomCycleChannelTool.node';
import { makeSupplyDataContext, invokeSupplyData, makeExecuteContext, invokeExecute } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycleChannelTool', () => {
	it('publish forwards channel + payload + scope', async () => {
		mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1' });
		const node = new LoomCycleChannelTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'ch', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({
			op: 'publish',
			channel: 'events',
			scope: 'global',
			payload: { hello: 'world' },
		});
		expect(mockClient.publishChannel).toHaveBeenCalledWith(
			'events',
			expect.objectContaining({ scope: 'global', payload: { hello: 'world' } }),
		);
	});

	it('publish without payload returns an error string (no wire call)', async () => {
		const node = new LoomCycleChannelTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'ch', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'publish', channel: 'events', scope: 'global' });
		expect(JSON.parse(out).error).toContain('payload is required');
		expect(mockClient.publishChannel).not.toHaveBeenCalled();
	});

	it('peek forwards channel + fromCursor + maxMessages', async () => {
		mockClient.peekChannel.mockResolvedValue({ channel: 'events', messages: [] });
		const node = new LoomCycleChannelTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'ch', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ op: 'peek', channel: 'events', scope: 'global', fromCursor: 'cur_5', maxMessages: 20 });
		expect(mockClient.peekChannel).toHaveBeenCalledWith(
			'events',
			expect.objectContaining({ scope: 'global', fromCursor: 'cur_5', maxMessages: 20 }),
		);
	});

	it('scope=user resolves userId from credential default', async () => {
		mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1' });
		const node = new LoomCycleChannelTool();
		const ctx = makeSupplyDataContext({
			params: { toolName: 'ch', toolDescription: 'd' },
			credentials: { userId: 'cred-u' },
		});
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		await tool.invoke({ op: 'publish', channel: 'events', scope: 'user', payload: {} });
		expect(mockClient.publishChannel.mock.calls[0][1].userId).toBe('cred-u');
	});

	it('scope=user with no userId returns error', async () => {
		const node = new LoomCycleChannelTool();
		const ctx = makeSupplyDataContext({ params: { toolName: 'ch', toolDescription: 'd' } });
		const result = await invokeSupplyData(node, ctx);
		const tool = result.response as { invoke: (args: unknown) => Promise<string> };
		const out = await tool.invoke({ op: 'publish', channel: 'events', scope: 'user', payload: {} });
		expect(JSON.parse(out).error).toContain('userId required');
	});

	it('execute(op=peek) reads input + returns peek result JSON', async () => {
		mockClient.peekChannel.mockResolvedValue({ channel: 'events', messages: [{ id: 'm1' }] });
		const node = new LoomCycleChannelTool();
		const ctx = makeExecuteContext({
			params: { toolName: 'ch', toolDescription: 'd' },
			inputJson: { op: 'peek', channel: 'events', scope: 'global' },
		});
		const out = await invokeExecute(node, ctx);
		expect(mockClient.peekChannel).toHaveBeenCalledOnce();
		expect(out[0][0].json).toMatchObject({ channel: 'events', messages: [{ id: 'm1' }] });
	});
});
