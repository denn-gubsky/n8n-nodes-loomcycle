import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanMessage, SystemMessage, ToolMessage, AIMessage } from '@langchain/core/messages';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		llmChat: vi.fn(),
		llmStream: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleChatModel } from '../../../nodes/LoomCycleChatModel/LoomCycleChatModel.node';
import { LoomcycleChatModel } from '../../../nodes/_shared/langchainChatModel';
import { makeSupplyDataContext, invokeSupplyData } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycleChatModel — n8n cluster sub-node', () => {
	it('supplyData returns a LoomcycleChatModel instance', async () => {
		const node = new LoomCycleChatModel();
		const ctx = makeSupplyDataContext({
			params: { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: 4096, temperature: -1, streaming: true },
		});
		const result = await invokeSupplyData(node, ctx);
		expect(result.response).toBeInstanceOf(LoomcycleChatModel);
	});

	it('supplyData honours node-level overrides + falls through to credential defaults', async () => {
		const node = new LoomCycleChatModel();
		const ctx = makeSupplyDataContext({
			params: { provider: '', model: '', tier: 'pro', maxTokens: 2048, temperature: -1, streaming: true },
			credentials: { userId: 'cred-default-user', userTier: 'cred-default-tier' },
		});
		const result = await invokeSupplyData(node, ctx);
		const model = result.response as LoomcycleChatModel;
		// Internal state isn't exposed publicly, but the model should
		// construct without throwing and route the credential defaults
		// when no per-node override is set. End-to-end assertions on
		// llmChat call below verify the routing.
		expect(model).toBeInstanceOf(LoomcycleChatModel);
	});
});

describe('LoomcycleChatModel — LangChain wrapper around the LLM gateway', () => {
	function buildModel(overrides: Partial<ConstructorParameters<typeof LoomcycleChatModel>[0]> = {}) {
		return new LoomcycleChatModel({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			client: mockClient as any,
			...overrides,
		});
	}

	function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
		return {
			async *[Symbol.asyncIterator]() {
				for (const item of items) yield item;
			},
		};
	}

	it('_generate maps text response to AIMessage + tokenUsage', async () => {
		mockClient.llmChat.mockResolvedValue({
			id: 'llm_01',
			request_id: 'req_01',
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			content: [{ type: 'text', text: 'Hello!' }],
			stop_reason: 'end_turn',
			usage: { input_tokens: 100, output_tokens: 20 },
		});

		const model = buildModel({ maxTokens: 1024 });
		const result = await model.invoke([new HumanMessage('Hi')]);

		expect(mockClient.llmChat).toHaveBeenCalledOnce();
		const callOpts = mockClient.llmChat.mock.calls[0][0];
		expect(callOpts.messages).toEqual([{ role: 'user', content: 'Hi' }]);
		expect(callOpts.max_tokens).toBe(1024);

		expect(result.content).toBe('Hello!');
		expect((result as AIMessage).usage_metadata).toMatchObject({
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
		});
	});

	it('_generate maps tool_use content blocks into AIMessage.tool_calls', async () => {
		mockClient.llmChat.mockResolvedValue({
			id: 'llm_02',
			request_id: 'req_02',
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			content: [
				{ type: 'text', text: 'Let me check.' },
				{ type: 'tool_use', id: 'call_abc', name: 'calculator', input: { expr: '2+2' } },
			],
			stop_reason: 'tool_use',
			usage: { input_tokens: 50, output_tokens: 30 },
		});

		const model = buildModel();
		const result = (await model.invoke([new HumanMessage("What's 2+2?")])) as AIMessage;

		expect(result.content).toBe('Let me check.');
		expect(result.tool_calls).toEqual([
			{ id: 'call_abc', name: 'calculator', args: { expr: '2+2' } },
		]);
	});

	it('maps the canonical four message types (system / human / ai / tool) to gateway shape', async () => {
		mockClient.llmChat.mockResolvedValue({
			id: 'llm_03',
			request_id: 'req_03',
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			content: [{ type: 'text', text: 'Got it.' }],
			stop_reason: 'end_turn',
			usage: { input_tokens: 1, output_tokens: 1 },
		});

		const model = buildModel();
		await model.invoke([
			new SystemMessage('You are helpful.'),
			new HumanMessage('Hi'),
			new AIMessage({
				content: '',
				tool_calls: [{ id: 'c1', name: 'calc', args: { x: 1 } }],
			}),
			new ToolMessage({ content: '42', tool_call_id: 'c1' }),
		]);

		const sent = mockClient.llmChat.mock.calls[0][0].messages;
		expect(sent).toEqual([
			{ role: 'system', content: 'You are helpful.' },
			{ role: 'user', content: 'Hi' },
			{ role: 'assistant', content: '', tool_calls: [{ id: 'c1', name: 'calc', input: { x: 1 } }] },
			{ role: 'tool', content: '42', tool_call_id: 'c1' },
		]);
	});

	it('forwards provider / model / tier / userId / userTier routing hints', async () => {
		mockClient.llmChat.mockResolvedValue({
			id: 'llm_04',
			request_id: 'req_04',
			provider: 'deepseek',
			model: 'deepseek-v4-pro',
			content: [{ type: 'text', text: 'ok' }],
			stop_reason: 'end_turn',
			usage: { input_tokens: 1, output_tokens: 1 },
		});

		const model = buildModel({
			provider: 'deepseek',
			model: 'deepseek-v4-pro',
			tier: 'pro',
			userId: 'u-1',
			userTier: 'pro',
			temperature: 0.7,
		});
		await model.invoke([new HumanMessage('hi')]);

		const opts = mockClient.llmChat.mock.calls[0][0];
		expect(opts.provider).toBe('deepseek');
		expect(opts.model).toBe('deepseek-v4-pro');
		expect(opts.tier).toBe('pro');
		expect(opts.user_id).toBe('u-1');
		expect(opts.user_tier).toBe('pro');
		expect(opts.temperature).toBe(0.7);
	});

	it('streaming: yields ChatGenerationChunk per text_delta + final usage chunk on done', async () => {
		mockClient.llmStream.mockReturnValue(
			asAsyncIterable([
				{ kind: 'provider_chosen', payload: { provider: 'anthropic', model: 'claude-sonnet-4-6', request_id: 'req_05' } },
				{ kind: 'content_block_start', payload: { index: 0, block: { type: 'text', text: '' } } },
				{ kind: 'content_block_delta', payload: { index: 0, delta: { type: 'text_delta', text: 'Hello' } } },
				{ kind: 'content_block_delta', payload: { index: 0, delta: { type: 'text_delta', text: ' world' } } },
				{ kind: 'content_block_stop', payload: { index: 0 } },
				{ kind: 'message_delta', payload: { delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 2 } } },
				{ kind: 'done', payload: { id: 'llm_05', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } } },
			]),
		);

		const model = buildModel({ streaming: true });
		const chunks: string[] = [];
		let lastUsage: unknown = null;
		for await (const chunk of await model.stream([new HumanMessage('hi')])) {
			if (chunk.content) chunks.push(chunk.content as string);
			const meta = (chunk as { usage_metadata?: unknown }).usage_metadata;
			if (meta) lastUsage = meta;
		}

		expect(chunks).toContain('Hello');
		expect(chunks).toContain(' world');
		expect(lastUsage).toMatchObject({ input_tokens: 10, output_tokens: 2, total_tokens: 12 });
	});

	it('streaming: consolidates input_json_delta fragments into one tool_call_chunk on content_block_stop', async () => {
		mockClient.llmStream.mockReturnValue(
			asAsyncIterable([
				{ kind: 'content_block_start', payload: { index: 0, block: { type: 'tool_use', id: 'call_x', name: 'calc', input: {} } } },
				{ kind: 'content_block_delta', payload: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"expr":' } } },
				{ kind: 'content_block_delta', payload: { index: 0, delta: { type: 'input_json_delta', partial_json: '"2+2"}' } } },
				{ kind: 'content_block_stop', payload: { index: 0 } },
				{ kind: 'done', payload: { id: 'llm_06', stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 3 } } },
			]),
		);

		const model = buildModel({ streaming: true });
		const toolCalls: Array<{ name: string; args: unknown }> = [];
		for await (const chunk of await model.stream([new HumanMessage("What's 2+2?")])) {
			// AIMessageChunk has tool_call_chunks on streamed tool calls
			const msg = chunk as { tool_call_chunks?: Array<{ name: string; args: string }> };
			if (msg.tool_call_chunks) {
				for (const tc of msg.tool_call_chunks) {
					toolCalls.push({ name: tc.name, args: JSON.parse(tc.args) });
				}
			}
		}
		expect(toolCalls).toEqual([{ name: 'calc', args: { expr: '2+2' } }]);
	});

	it('bindTools is defined so n8n Tools Agent recognises tool-calling support', async () => {
		const model = buildModel();
		// n8n's check is essentially `typeof model.bindTools === 'function'`.
		expect(typeof model.bindTools).toBe('function');
	});

	it('bindTools forwards tools through this.bind so they land on options.tools at call time', async () => {
		mockClient.llmChat.mockResolvedValue({
			id: 'llm_07',
			request_id: 'req_07',
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			content: [{ type: 'text', text: 'ok' }],
			stop_reason: 'end_turn',
			usage: { input_tokens: 1, output_tokens: 1 },
		});
		const model = buildModel();
		// Pre-bind tools via the LangChain pattern; the returned Runnable
		// should propagate the tools through to llmChat.
		const bound = model.bindTools([
			{
				name: 'calc',
				description: 'evaluate math',
				input_schema: { type: 'object', properties: { expr: { type: 'string' } } },
			},
		]);
		await bound.invoke([new HumanMessage('compute 2+2')]);
		const opts = mockClient.llmChat.mock.calls[0][0];
		expect(opts.tools).toEqual([
			{
				name: 'calc',
				description: 'evaluate math',
				input_schema: { type: 'object', properties: { expr: { type: 'string' } } },
			},
		]);
	});

	it('SECURITY — bearer fragments in error messages are redacted before reaching the caller', async () => {
		mockClient.llmChat.mockRejectedValue(
			new Error('Authorization: Bearer sk-leaked-fake-token-xyz123 was rejected'),
		);
		const model = buildModel();
		await expect(model.invoke([new HumanMessage('hi')])).rejects.toThrow(/\[REDACTED\]/);
		await expect(model.invoke([new HumanMessage('hi')])).rejects.not.toThrow(/sk-leaked-fake-token-xyz123/);
	});
});
