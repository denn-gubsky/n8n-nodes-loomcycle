import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		mcpServerDef: vi.fn(),
		runStreaming: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleMcpServerTool } from '../../../nodes/LoomCycleMcpServerTool/LoomCycleMcpServerTool.node';
import { makeSupplyDataContext, invokeSupplyData } from './_helpers';
import { NotFoundError } from '@loomcycle/client';

function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) yield item;
		},
	};
}

const BASE_PARAMS = {
	toolName: 'mcp',
	toolDescription: 'Delegate to loomcycle with MCP',
	mcpName: 'slack-mcp',
	transport: 'streamable-http',
	mcpUrl: 'https://mcp.slack.example/v1',
	headers: { header: [{ name: 'Authorization', value: 'Bearer ${LOOMCYCLE_SLACK_TOKEN}' }] },
	agent: 'orchestrator',
	cleanupOnEnd: false,
};

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycleMcpServerTool', () => {
	describe('supplyData — idempotent ensure', () => {
		it('calls mcpServerDef get; on hit skips create', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp' }); // get succeeds
			const node = new LoomCycleMcpServerTool();
			await invokeSupplyData(node, makeSupplyDataContext({ params: BASE_PARAMS  }));
			expect(mockClient.mcpServerDef).toHaveBeenCalledTimes(1);
			expect(mockClient.mcpServerDef.mock.calls[0][0]).toMatchObject({ op: 'get', name: 'slack-mcp' });
		});

		it('on NotFoundError, calls create with transport + url + headers + promote:true', async () => {
			mockClient.mcpServerDef
				.mockRejectedValueOnce(new NotFoundError('not found', { status: 404 }))
				.mockResolvedValueOnce({ def_id: 'def_1' });
			const node = new LoomCycleMcpServerTool();
			await invokeSupplyData(node, makeSupplyDataContext({ params: BASE_PARAMS  }));
			expect(mockClient.mcpServerDef).toHaveBeenCalledTimes(2);
			const createArg = mockClient.mcpServerDef.mock.calls[1][0];
			expect(createArg).toMatchObject({
				op: 'create',
				name: 'slack-mcp',
				transport: 'streamable-http',
				url: 'https://mcp.slack.example/v1',
				promote: true,
				headers: { Authorization: 'Bearer ${LOOMCYCLE_SLACK_TOKEN}' },
			});
		});

		it('omits headers field when no headers added', async () => {
			mockClient.mcpServerDef
				.mockRejectedValueOnce(new NotFoundError('not found', { status: 404 }))
				.mockResolvedValueOnce({});
			const node = new LoomCycleMcpServerTool();
			await invokeSupplyData(node, makeSupplyDataContext({ params: { ...BASE_PARAMS, headers: {} } }));
			const createArg = mockClient.mcpServerDef.mock.calls[1][0];
			expect(createArg.headers).toBeUndefined();
		});

		it('rejects stdio transport with NodeOperationError (no wire call)', async () => {
			const node = new LoomCycleMcpServerTool();
			await expect(
				invokeSupplyData(node, makeSupplyDataContext({ params: { ...BASE_PARAMS, transport: 'stdio' } })),
			).rejects.toBeInstanceOf(NodeOperationError);
			expect(mockClient.mcpServerDef).not.toHaveBeenCalled();
		});

		it('re-throws non-NotFoundError exceptions from get (no fallback to create)', async () => {
			mockClient.mcpServerDef.mockRejectedValueOnce(new Error('network timeout'));
			const node = new LoomCycleMcpServerTool();
			await expect(invokeSupplyData(node, makeSupplyDataContext({ params: BASE_PARAMS  }))).rejects.toThrow(
				'network timeout',
			);
			// get called once, no fall-through create attempted
			expect(mockClient.mcpServerDef).toHaveBeenCalledTimes(1);
		});
	});

	describe('returned tool', () => {
		it('invoke spawns a sub-agent with mcp__<name>__* in allowed_tools', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp' });
			mockClient.runStreaming.mockReturnValue(
				asAsyncIterable([
					{ type: 'text', text: 'posted to slack' },
					{ type: 'done', stop_reason: 'end_turn' },
				]),
			);
			const node = new LoomCycleMcpServerTool();
			const result = await invokeSupplyData(node, makeSupplyDataContext({ params: BASE_PARAMS  }));
			const tool = result.response as { invoke: (args: unknown) => Promise<string> };
			const out = await tool.invoke({ prompt: 'Post hello to channel #general' });

			expect(mockClient.runStreaming).toHaveBeenCalledOnce();
			const runArg = mockClient.runStreaming.mock.calls[0][0];
			expect(runArg.agent).toBe('orchestrator');
			expect(runArg.allowedTools).toEqual(['mcp__slack-mcp__*']);
			expect(runArg.segments[0].content[0].type).toBe('untrusted-block');
			expect(out).toBe('posted to slack');
		});
	});

	describe('cleanupOnEnd', () => {
		it('cleanupOnEnd=false (default) → no closeFunction', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp' });
			const node = new LoomCycleMcpServerTool();
			const result = await invokeSupplyData(node, makeSupplyDataContext({ params: BASE_PARAMS  }));
			expect(result.closeFunction).toBeUndefined();
		});

		it('cleanupOnEnd=true → closeFunction retires the registration', async () => {
			mockClient.mcpServerDef
				.mockResolvedValueOnce({ name: 'slack-mcp' }) // get
				.mockResolvedValueOnce({ ok: true }); // retire
			const node = new LoomCycleMcpServerTool();
			const result = await invokeSupplyData(
				node,
				makeSupplyDataContext({ params: { ...BASE_PARAMS, cleanupOnEnd: true } }),
			);
			expect(result.closeFunction).toBeDefined();
			await result.closeFunction!();
			expect(mockClient.mcpServerDef).toHaveBeenLastCalledWith({ op: 'retire', name: 'slack-mcp' });
		});

		it('cleanupOnEnd=true with failed retire — closeFunction does NOT throw (best-effort)', async () => {
			mockClient.mcpServerDef
				.mockResolvedValueOnce({ name: 'slack-mcp' }) // get
				.mockRejectedValueOnce(new Error('retire failed')); // retire fails
			const node = new LoomCycleMcpServerTool();
			const result = await invokeSupplyData(
				node,
				makeSupplyDataContext({ params: { ...BASE_PARAMS, cleanupOnEnd: true } }),
			);
			await expect(result.closeFunction!()).resolves.toBeUndefined();
		});
	});

	describe('env-var hints', () => {
		it('logs detected ${LOOMCYCLE_*} tokens from headers', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp' });
			const ctx = makeSupplyDataContext({ params: BASE_PARAMS });
			const node = new LoomCycleMcpServerTool();
			await invokeSupplyData(node, ctx);
			const logger = (ctx as unknown as { logger: { info: ReturnType<typeof vi.fn> } }).logger;
			expect(logger.info).toHaveBeenCalled();
			const logCall = logger.info.mock.calls[0][0];
			expect(logCall).toContain('LOOMCYCLE_SLACK_TOKEN');
		});

		it('does NOT log when headers have no LOOMCYCLE_ tokens', async () => {
			mockClient.mcpServerDef.mockResolvedValueOnce({ name: 'slack-mcp' });
			const ctx = makeSupplyDataContext({
				params: {
					...BASE_PARAMS,
					headers: { header: [{ name: 'X-Plain', value: 'literal' }] },
				},
			});
			const node = new LoomCycleMcpServerTool();
			await invokeSupplyData(node, ctx);
			const logger = (ctx as unknown as { logger: { info: ReturnType<typeof vi.fn> } }).logger;
			expect(logger.info).not.toHaveBeenCalled();
		});
	});
});
