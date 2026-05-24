import {
	AIMessage,
	AIMessageChunk,
	type BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from '@langchain/core/messages';
import {
	BaseChatModel,
	type BaseChatModelCallOptions,
	type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatGeneration, ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type {
	LLMChatContent,
	LLMChatMessage,
	LLMChatOptions,
	LLMChatStreamItem,
	LLMChatUsage,
	LLMTool,
	LoomcycleClient,
} from '@loomcycle/client';

import { redactBearerFragments } from '../LoomCycle/helpers/errors';

/**
 * Constructor input for {@link LoomcycleChatModel}. Tracks the n8n
 * cluster-sub-node's per-parameter overrides + the shared client.
 */
export interface LoomcycleChatModelFields extends BaseChatModelParams {
	client: LoomcycleClient;
	provider?: string;
	model?: string;
	tier?: string;
	userId?: string;
	userTier?: string;
	maxTokens?: number;
	temperature?: number | null;
	streaming?: boolean;
}

/**
 * LangChain `BaseChatModel` backed by loomcycle's `POST /v1/_llm/chat`
 * gateway endpoint (substrate v0.10.x+, adapter `@loomcycle/client`
 * `>=0.11.0`). Exposes loomcycle's provider routing, auth substitution,
 * retry, host allowlist, and per-user quota policy to any LangChain-
 * compatible consumer — most importantly n8n's built-in AI Agent
 * wiring via the Chat Model slot.
 *
 * Architecture: this wraps `client.llmChat` (non-streaming) /
 * `client.llmStream` (streaming) directly. There is NO loomcycle agent
 * loop in the path — no DB row, no snapshot, no hook eval, no MCP
 * registration check. The gateway is the thin resolver-front-end that
 * loomcycle ships specifically for "I just want loomcycle's routing
 * for an LLM call" use cases.
 *
 * Tool calling: the model honours LangChain `bindTools` via the default
 * inherited implementation (passes tools through `options.tools` on
 * every call). Tools are translated to the gateway's provider-agnostic
 * `LLMTool` shape — substrate-side per-driver translation handles the
 * Anthropic/OpenAI/Gemini/Ollama specifics.
 *
 * Errors are caught + bearer-redacted (CLAUDE.md §security.6) before
 * being re-thrown so the LLM context / n8n execution UI never sees
 * raw bearer fragments.
 */
export class LoomcycleChatModel extends BaseChatModel<BaseChatModelCallOptions> {
	private readonly client: LoomcycleClient;
	private readonly provider?: string;
	private readonly model?: string;
	private readonly tier?: string;
	private readonly userId?: string;
	private readonly userTier?: string;
	private readonly maxTokens?: number;
	private readonly temperature?: number | null;

	constructor(fields: LoomcycleChatModelFields) {
		super(fields);
		this.client = fields.client;
		this.provider = fields.provider;
		this.model = fields.model;
		this.tier = fields.tier;
		this.userId = fields.userId;
		this.userTier = fields.userTier;
		this.maxTokens = fields.maxTokens;
		this.temperature = fields.temperature;
		// `streaming` field is read by BaseChatModel internally to decide
		// _streamResponseChunks vs _generate routing.
		if (fields.streaming !== undefined) {
			this.disableStreaming = !fields.streaming;
		}
	}

	_llmType(): string {
		return 'loomcycle';
	}

	get callKeys(): string[] {
		return [...super.callKeys, 'tools'];
	}

	async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun,
	): Promise<ChatResult> {
		const opts = this.buildChatOptions(messages, options);

		try {
			const resp = await this.client.llmChat(opts);

			// Stream the response text back to LangChain's run-manager so
			// that downstream consumers expecting newToken events still get
			// them in non-streaming mode (best-effort — there's no per-
			// token granularity here, so we emit the joined text once).
			const joined = joinTextContent(resp.content);
			if (joined) {
				await runManager?.handleLLMNewToken(joined);
			}

			const aiMessage = chatResponseToAIMessage(resp);
			const generation: ChatGeneration = {
				text: joined,
				message: aiMessage,
				generationInfo: {
					provider: resp.provider,
					model: resp.model,
					request_id: resp.request_id,
					stop_reason: resp.stop_reason,
					usage: resp.usage,
				},
			};
			return {
				generations: [generation],
				llmOutput: {
					tokenUsage: {
						promptTokens: resp.usage.input_tokens,
						completionTokens: resp.usage.output_tokens,
						totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
					},
					provider: resp.provider,
					model: resp.model,
				},
			};
		} catch (err) {
			throw redactedError(err);
		}
	}

	override async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun,
	): AsyncGenerator<ChatGenerationChunk> {
		const opts = this.buildChatOptions(messages, options);

		// Accumulates partial JSON for in-flight tool_use blocks, keyed by
		// content-block index. Anthropic-style streaming emits the tool
		// name + id on `content_block_start` and the input JSON in
		// `input_json_delta` slices on `content_block_delta`. We assemble
		// here and emit the consolidated tool_call_chunk on
		// `content_block_stop` so LangChain gets one well-formed tool
		// call per block, not N partial fragments.
		const toolBlocks = new Map<
			number,
			{ id: string; name: string; partialJson: string }
		>();

		let stream: AsyncIterable<LLMChatStreamItem>;
		try {
			stream = this.client.llmStream(opts);
		} catch (err) {
			throw redactedError(err);
		}

		try {
			for await (const item of stream) {
				if (item.kind === 'content_block_start') {
					const block = item.payload.block;
					if (block.type === 'tool_use') {
						toolBlocks.set(item.payload.index, {
							id: block.id,
							name: block.name,
							partialJson: '',
						});
					}
					continue;
				}

				if (item.kind === 'content_block_delta') {
					const delta = item.payload.delta;
					if (delta.type === 'text_delta' && delta.text) {
						await runManager?.handleLLMNewToken(delta.text);
						yield new ChatGenerationChunk({
							text: delta.text,
							message: new AIMessageChunk({ content: delta.text }),
						});
					} else if (delta.type === 'input_json_delta' && delta.partial_json) {
						const block = toolBlocks.get(item.payload.index);
						if (block) block.partialJson += delta.partial_json;
					}
					continue;
				}

				if (item.kind === 'content_block_stop') {
					const block = toolBlocks.get(item.payload.index);
					if (block) {
						let parsedInput: Record<string, unknown> = {};
						try {
							parsedInput = block.partialJson ? JSON.parse(block.partialJson) : {};
						} catch {
							// Partial JSON failed to parse — emit invalid_tool_call so
							// the parent agent can decide how to recover. LangChain's
							// AIMessageChunk supports invalid_tool_calls natively.
						}
						yield new ChatGenerationChunk({
							text: '',
							message: new AIMessageChunk({
								content: '',
								tool_call_chunks: [
									{
										id: block.id,
										name: block.name,
										args: block.partialJson,
										index: item.payload.index,
									},
								],
								tool_calls: [
									{
										id: block.id,
										name: block.name,
										args: parsedInput,
									},
								],
							}),
						});
						toolBlocks.delete(item.payload.index);
					}
					continue;
				}

				if (item.kind === 'done') {
					// Emit a final empty chunk carrying usage metadata so
					// downstream consumers (LangSmith, n8n's UI) can show
					// token usage even when the last content delta didn't
					// include it.
					yield new ChatGenerationChunk({
						text: '',
						message: new AIMessageChunk({
							content: '',
							usage_metadata: {
								input_tokens: item.payload.usage.input_tokens,
								output_tokens: item.payload.usage.output_tokens,
								total_tokens: item.payload.usage.input_tokens + item.payload.usage.output_tokens,
							},
							response_metadata: {
								stop_reason: item.payload.stop_reason,
								id: item.payload.id,
							},
						}),
						generationInfo: {
							stop_reason: item.payload.stop_reason,
							usage: item.payload.usage,
						},
					});
					return;
				}

				if (item.kind === 'error') {
					// Terminal gateway error — throw redacted so the LLM
					// context never sees raw bearer fragments.
					throw new Error(
						`loomcycle gateway error [${item.payload.code}]: ${item.payload.message}`,
					);
				}

				// provider_chosen + message_delta: informational only; no
				// per-frame work needed.
			}
		} catch (err) {
			throw redactedError(err);
		}
	}

	private buildChatOptions(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
	): LLMChatOptions {
		const llmMessages = messages.map(langchainToLoomcycleMessage);
		const tools = extractToolsFromOptions(options);

		const opts: LLMChatOptions = { messages: llmMessages };
		if (tools.length > 0) opts.tools = tools;
		if (this.provider) opts.provider = this.provider;
		if (this.model) opts.model = this.model;
		if (this.tier) opts.tier = this.tier;
		if (this.userId) opts.user_id = this.userId;
		if (this.userTier) opts.user_tier = this.userTier;
		if (this.maxTokens !== undefined) opts.max_tokens = this.maxTokens;
		if (this.temperature !== undefined) opts.temperature = this.temperature;
		// LangChain passes RunnableConfig.signal through ParsedCallOptions;
		// thread it through to the adapter for cooperative cancellation.
		const signal = (options as { signal?: AbortSignal }).signal;
		if (signal) opts.signal = signal;
		return opts;
	}
}

// ---- Message mapping ----

/**
 * Convert a LangChain `BaseMessage` to the gateway's `LLMChatMessage`.
 * Handles the four canonical message types (System / Human / AI / Tool)
 * + accumulates `AIMessage.tool_calls` into the gateway's `tool_calls`
 * field.
 */
function langchainToLoomcycleMessage(msg: BaseMessage): LLMChatMessage {
	if (msg instanceof SystemMessage) {
		return { role: 'system', content: messageContentToString(msg.content) };
	}
	if (msg instanceof HumanMessage) {
		return { role: 'user', content: messageContentToString(msg.content) };
	}
	if (msg instanceof AIMessage) {
		const out: LLMChatMessage = { role: 'assistant', content: messageContentToString(msg.content) };
		if (msg.tool_calls && msg.tool_calls.length > 0) {
			out.tool_calls = msg.tool_calls.map((tc) => ({
				id: tc.id ?? '',
				name: tc.name,
				input: (tc.args ?? {}) as Record<string, unknown>,
			}));
		}
		return out;
	}
	if (msg instanceof ToolMessage) {
		return {
			role: 'tool',
			content: messageContentToString(msg.content),
			tool_call_id: msg.tool_call_id,
		};
	}
	// Fallback: treat unrecognised roles as a user message with the
	// content stringified. n8n's AI Agent emits the canonical four
	// types, so this is a safety net for custom workflows.
	return { role: 'user', content: messageContentToString(msg.content) };
}

function messageContentToString(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return JSON.stringify(content);
	// MessageContent[]: collapse to the joined `text` of text blocks;
	// ignore image / other blocks (multi-modal is out of scope for v1).
	return content
		.map((b) => {
			if (typeof b === 'string') return b;
			if (b && typeof b === 'object' && 'text' in b && typeof (b as { text: unknown }).text === 'string') {
				return (b as { text: string }).text;
			}
			return '';
		})
		.join('');
}

function joinTextContent(content: LLMChatContent[]): string {
	return content
		.filter((c): c is { type: 'text'; text: string } => c.type === 'text')
		.map((c) => c.text)
		.join('');
}

function chatResponseToAIMessage(resp: {
	content: LLMChatContent[];
	usage: LLMChatUsage;
	provider: string;
	model: string;
	stop_reason: string;
	id: string;
	request_id: string;
}): AIMessage {
	const text = joinTextContent(resp.content);
	const toolCalls = resp.content
		.filter((c): c is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => c.type === 'tool_use')
		.map((c) => ({ id: c.id, name: c.name, args: c.input }));

	return new AIMessage({
		content: text,
		tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
		usage_metadata: {
			input_tokens: resp.usage.input_tokens,
			output_tokens: resp.usage.output_tokens,
			total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
		},
		response_metadata: {
			provider: resp.provider,
			model: resp.model,
			stop_reason: resp.stop_reason,
			id: resp.id,
			request_id: resp.request_id,
		},
	});
}

// ---- Tool mapping ----

/**
 * Pull the `tools` array out of LangChain ParsedCallOptions and convert
 * each to the gateway's `LLMTool` shape. Supports the common formats
 * n8n's AI Agent / LangChain wrappers emit: StructuredTool instances
 * (with `.schema` Zod / JSON schema), OpenAI function definitions
 * (`{ type: "function", function: {...} }`), and the gateway-native
 * Anthropic-style `{ name, description, input_schema }`.
 */
function extractToolsFromOptions(options: unknown): LLMTool[] {
	const raw = (options as { tools?: unknown }).tools;
	if (!Array.isArray(raw)) return [];
	const out: LLMTool[] = [];
	for (const t of raw) {
		const converted = normaliseTool(t);
		if (converted) out.push(converted);
	}
	return out;
}

function normaliseTool(t: unknown): LLMTool | null {
	if (!t || typeof t !== 'object') return null;

	// Native gateway shape (already in our format)
	if (
		'name' in t &&
		'input_schema' in t &&
		typeof (t as { name: unknown }).name === 'string' &&
		(t as { input_schema: unknown }).input_schema !== undefined
	) {
		const obj = t as { name: string; description?: string; input_schema: unknown };
		return {
			name: obj.name,
			description: obj.description,
			input_schema: obj.input_schema as Record<string, unknown>,
		};
	}

	// OpenAI function definition shape
	if (
		'type' in t &&
		(t as { type: unknown }).type === 'function' &&
		'function' in t &&
		typeof (t as { function: unknown }).function === 'object'
	) {
		const fn = (t as { function: { name?: string; description?: string; parameters?: unknown } }).function;
		if (fn.name) {
			return {
				name: fn.name,
				description: fn.description,
				input_schema: (fn.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} },
			};
		}
	}

	// StructuredTool / LangChain tool instance: has `.name`, `.description`,
	// `.schema` (typically a Zod schema). toJsonSchema() handles both Zod
	// and already-JSON-schema inputs interoperably.
	if (
		'name' in t &&
		'schema' in t &&
		typeof (t as { name: unknown }).name === 'string'
	) {
		const tool = t as { name: string; description?: string; schema: unknown };
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const jsonSchema = toJsonSchema(tool.schema as any);
			return {
				name: tool.name,
				description: tool.description,
				input_schema: jsonSchema as Record<string, unknown>,
			};
		} catch {
			// If the schema can't be converted, skip this tool rather than
			// erroring the whole call — partial tool support beats a hard
			// failure here.
			return null;
		}
	}

	return null;
}

// ---- Error redaction ----

function redactedError(err: unknown): Error {
	const message = redactBearerFragments((err as Error).message ?? 'unknown loomcycle error');
	const wrapped = new Error(message);
	// Preserve the error chain for callers that walk .cause for diagnostics.
	(wrapped as Error & { cause?: unknown }).cause = err;
	return wrapped;
}
