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

import { LoomCycleRun as LoomCycle } from '../../../nodes/LoomCycleRun/LoomCycleRun.node';
import { makeExecuteContext, asAsyncIterable, fakeSuccessfulRunEvents } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=run Spawn — RFC F per-tool credentials', () => {
	it('forwards Per-Tool Credentials as a userCredentials map', async () => {
		mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'run',
				operation: 'spawn',
				agent: 'a',
				prompt: 'q',
				additionalFields: {
					userCredentials: {
						credential: [
							{ name: 'github', value: '${LOOMCYCLE_GH_TOKEN}' },
							{ name: 'slack', value: '${run.user_bearer}' },
						],
					},
				},
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.runStreaming.mock.calls[0][0];
		expect(arg.userCredentials).toEqual({
			github: '${LOOMCYCLE_GH_TOKEN}',
			slack: '${run.user_bearer}',
		});
	});

	it('does NOT forward userCredentials when none added', async () => {
		mockClient.runStreaming.mockReturnValue(asAsyncIterable(fakeSuccessfulRunEvents({ text: 'hi' })));
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'run', operation: 'spawn', agent: 'a', prompt: 'q' },
		});
		await node.execute.call(ctx);
		const arg = mockClient.runStreaming.mock.calls[0][0];
		expect(arg.userCredentials).toBeUndefined();
	});
});
