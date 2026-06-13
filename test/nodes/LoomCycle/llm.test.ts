import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		llmChat: vi.fn(),
		embeddings: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleLlm as LoomCycle } from '../../../nodes/LoomCycleLlm/LoomCycleLlm.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=llm', () => {
	describe('Chat', () => {
		it('assembles messages + routing/sampling hints', async () => {
			mockClient.llmChat.mockResolvedValue({ provider: 'anthropic', content: [], stop_reason: 'end_turn' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'llm',
					operation: 'chat',
					messages: {
						message: [
							{ role: 'system', content: 'be terse' },
							{ role: 'user', content: 'hello' },
						],
					},
					additionalFields: { maxTokens: 256, temperature: 0.2, provider: 'anthropic', tier: 'fast' },
				},
			});
			await node.execute.call(ctx);
			const opts = mockClient.llmChat.mock.calls[0][0];
			expect(opts.messages).toEqual([
				{ role: 'system', content: 'be terse' },
				{ role: 'user', content: 'hello' },
			]);
			expect(opts.max_tokens).toBe(256);
			expect(opts.temperature).toBe(0.2);
			expect(opts.provider).toBe('anthropic');
			expect(opts.tier).toBe('fast');
		});

		it('falls back to the credential Default User ID for user_id', async () => {
			mockClient.llmChat.mockResolvedValue({ content: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'llm',
					operation: 'chat',
					messages: { message: [{ role: 'user', content: 'hi' }] },
					additionalFields: {},
				},
				credentials: { userId: 'cred-u' },
			});
			await node.execute.call(ctx);
			expect(mockClient.llmChat.mock.calls[0][0].user_id).toBe('cred-u');
		});

		it('throws NodeOperationError on an empty message list', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'llm', operation: 'chat', messages: {}, additionalFields: {} },
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		});
	});

	describe('Embeddings', () => {
		it('sends a single string by default', async () => {
			mockClient.embeddings.mockResolvedValue({ object: 'list', data: [], model: 'm' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'llm',
					operation: 'embeddings',
					model: 'text-embedding-3-small',
					input: 'line one\nline two',
					splitLines: false,
					additionalFields: {},
				},
			});
			await node.execute.call(ctx);
			const opts = mockClient.embeddings.mock.calls[0][0];
			expect(opts.model).toBe('text-embedding-3-small');
			expect(opts.input).toBe('line one\nline two');
		});

		it('splits into a string[] when Split Into Lines is on (empties dropped)', async () => {
			mockClient.embeddings.mockResolvedValue({ object: 'list', data: [], model: 'm' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'llm',
					operation: 'embeddings',
					model: 'm',
					input: 'alpha\n\n  beta  \n',
					splitLines: true,
					additionalFields: { encodingFormat: 'base64', dimensions: 512, user: 'u1' },
				},
			});
			await node.execute.call(ctx);
			const opts = mockClient.embeddings.mock.calls[0][0];
			expect(opts.input).toEqual(['alpha', 'beta']);
			expect(opts.encoding_format).toBe('base64');
			expect(opts.dimensions).toBe(512);
			expect(opts.user).toBe('u1');
		});

		it('omits encoding_format when float (the default)', async () => {
			mockClient.embeddings.mockResolvedValue({ object: 'list', data: [], model: 'm' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'llm',
					operation: 'embeddings',
					model: 'm',
					input: 'x',
					splitLines: false,
					additionalFields: { encodingFormat: 'float' },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.embeddings.mock.calls[0][0].encoding_format).toBeUndefined();
		});
	});
});
