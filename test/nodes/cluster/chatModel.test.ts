import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Message, Tool } from '@n8n/ai-node-sdk';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		llmChat: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleChatModel } from '../../../nodes/LoomCycleChatModel/LoomCycleChatModel.node';
import { LoomcycleChatModel } from '../../../nodes/_shared/loomcycleChatModel';
import { makeSupplyDataContext, invokeSupplyData } from './_helpers';

// Minimal loomcycle llmChat response factory.
function chatResp(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: 'llm_abc',
		request_id: 'req_abc',
		provider: 'anthropic',
		model: 'claude-sonnet-4-6',
		content: [{ type: 'text', text: 'Hello' }],
		stop_reason: 'end_turn',
		usage: { input_tokens: 10, output_tokens: 5 },
		...over,
	};
}

beforeEach(() => {
	mockClient.llmChat.mockReset();
});

describe('LoomcycleChatModel — @n8n/ai-node-sdk model over the LLM gateway', () => {
	function model(fields: Record<string, unknown> = {}) {
		return new LoomcycleChatModel({ client: mockClient as never, ...fields });
	}

	it('generate maps system/user messages to llmChat content + forwards routing', async () => {
		mockClient.llmChat.mockResolvedValue(chatResp());
		const m = model({ provider: 'anthropic', model: 'claude-sonnet-4-6', tier: 'pro', userId: 'u1', userTier: 'high', maxTokens: 2048, temperature: 0.4 });
		const messages: Message[] = [
			{ role: 'system', content: [{ type: 'text', text: 'be brief' }] },
			{ role: 'user', content: [{ type: 'text', text: 'hi there' }] },
		];
		await m.generate(messages);
		const opts = mockClient.llmChat.mock.calls[0][0];
		expect(opts.messages).toEqual([
			{ role: 'system', content: 'be brief' },
			{ role: 'user', content: 'hi there' },
		]);
		expect(opts).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-4-6', tier: 'pro', user_id: 'u1', user_tier: 'high', max_tokens: 2048, temperature: 0.4 });
	});

	it('generate maps assistant tool-call + tool-result messages to the gateway shape', async () => {
		mockClient.llmChat.mockResolvedValue(chatResp());
		const m = model();
		const messages: Message[] = [
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'calling' },
					{ type: 'tool-call', toolCallId: 'call_1', toolName: 'getMemory', input: '{"key":"x"}' },
				],
			},
			{
				role: 'tool',
				content: [{ type: 'tool-result', toolCallId: 'call_1', result: { value: 42 } }],
			},
		];
		await m.generate(messages);
		const opts = mockClient.llmChat.mock.calls[0][0];
		expect(opts.messages[0]).toEqual({
			role: 'assistant',
			content: 'calling',
			tool_calls: [{ id: 'call_1', name: 'getMemory', input: { key: 'x' } }],
		});
		expect(opts.messages[1]).toEqual({ role: 'tool', content: '{"value":42}', tool_call_id: 'call_1' });
	});

	it('generate maps the gateway response (text + tool_use) to a GenerateResult', async () => {
		mockClient.llmChat.mockResolvedValue(
			chatResp({
				content: [
					{ type: 'text', text: 'sure' },
					{ type: 'tool_use', id: 'tu_1', name: 'doThing', input: { a: 1 } },
				],
				stop_reason: 'tool_use',
				usage: { input_tokens: 7, output_tokens: 3 },
			}),
		);
		const res = await model().generate([{ role: 'user', content: [{ type: 'text', text: 'go' }] }]);
		expect(res.message.role).toBe('assistant');
		expect(res.message.content).toEqual([
			{ type: 'text', text: 'sure' },
			{ type: 'tool-call', toolCallId: 'tu_1', toolName: 'doThing', input: '{"a":1}' },
		]);
		expect(res.finishReason).toBe('tool-calls');
		expect(res.usage).toEqual({ promptTokens: 7, completionTokens: 3, totalTokens: 10 });
	});

	it('withTools forwards function tools as gateway LLMTools (JSON schema)', async () => {
		mockClient.llmChat.mockResolvedValue(chatResp());
		const tools: Tool[] = [
			{ type: 'function', name: 'lookup', description: 'look it up', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
		];
		await model().withTools(tools).generate([{ role: 'user', content: [{ type: 'text', text: 'q' }] }]);
		const opts = mockClient.llmChat.mock.calls[0][0];
		expect(opts.tools).toHaveLength(1);
		expect(opts.tools[0]).toMatchObject({ name: 'lookup', description: 'look it up' });
		expect(opts.tools[0].input_schema).toMatchObject({ type: 'object' });
	});

	it('redacts bearer fragments from gateway errors', async () => {
		mockClient.llmChat.mockRejectedValue(new Error('failed: Authorization: Bearer sk-leaked-123'));
		await expect(model().generate([{ role: 'user', content: [{ type: 'text', text: 'x' }] }])).rejects.toThrow(
			/\[REDACTED\]/,
		);
	});
});

describe('LoomCycleChatModel — n8n Chat Model sub-node', () => {
	it('supplyData builds without throwing and returns a response', async () => {
		mockClient.llmChat.mockResolvedValue(chatResp());
		const node = new LoomCycleChatModel();
		const ctx = makeSupplyDataContext({
			params: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 4096, temperature: -1 },
		});
		const result = await invokeSupplyData(node, ctx);
		expect(result).toBeDefined();
		expect(result.response).toBeDefined();
	});
});
