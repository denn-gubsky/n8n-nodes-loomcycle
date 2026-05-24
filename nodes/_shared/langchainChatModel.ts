import {
	AIMessage,
	AIMessageChunk,
	type BaseMessage,
	type ToolMessage,
} from '@langchain/core/messages';
import {
	BaseChatModel,
	type BaseChatModelCallOptions,
	type BaseChatModelParams,
	type BindToolsInput,
} from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { ChatGeneration, ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { type Runnable, RunnableBinding } from '@langchain/core/runnables';
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

	/**
	 * Tool-calling capability advertisement. n8n's Tools Agent checks
	 * for the presence of `bindTools` to decide whether a connected
	 * Chat Model supports tool calls; without this override the Agent
	 * refuses to wire the workflow with the error "Tools Agent requires
	 * Chat Model which supports Tools calling."
	 *
	 * Implementation note: we construct `RunnableBinding` directly
	 * instead of going through `this.bind()`. The 1.1.1 release used
	 * `this.bind({ tools })` and failed at runtime with `this.bind is
	 * not a function` inside n8n's AI Agent — the Agent appears to
	 * invoke `bindTools` in a context where the Runnable prototype
	 * chain is not reliably preserved on `this`. Direct
	 * `new RunnableBinding({ bound: this, kwargs, config })` matches
	 * exactly what `Runnable.bind()` does internally (per
	 * `@langchain/core/runnables/base.js:63`) and sidesteps the
	 * problematic lookup.
	 *
	 * Runtime forwarding: tools land on `options.tools` for every
	 * subsequent invoke / stream call. `extractToolsFromOptions`
	 * (in buildChatOptions) normalises each tool to the gateway's
	 * `LLMTool` shape at call time, so the same conversion path
	 * handles both `bindTools`-bound calls and raw `options.tools`
	 * overlays.
	 */
	override bindTools(
		tools: BindToolsInput[],
		kwargs?: Partial<BaseChatModelCallOptions>,
	): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
		return new RunnableBinding<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>({
			bound: this,
			kwargs: { tools, ...kwargs } as Partial<BaseChatModelCallOptions>,
			config: {},
		});
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
							id: ensureNonEmptyToolCallId(block.id),
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
						// Emit ONLY `tool_call_chunks` — LangChain's
						// AIMessageChunk.concat() reconstructs the final
						// `tool_calls` from the accumulated chunks. Emitting
						// both fields on the same chunk causes LangChain to
						// double-count + can corrupt the id field during the
						// accumulation, which downstream surfaces as the
						// "messages[*].tool_call_id: tool message requires
						// tool_call_id" gateway error when the agent's tool
						// loop replays the ToolMessage back to us.
						yield new ChatGenerationChunk({
							text: '',
							message: new AIMessageChunk({
								content: '',
								tool_call_chunks: [
									{
										id: block.id,
										name: block.name,
										args: block.partialJson || '{}',
										index: item.payload.index,
										type: 'tool_call_chunk',
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

// ---- Tool-call id helpers ----

/**
 * Generate a synthetic, non-empty tool-call id. Used as a defensive
 * fallback when the upstream wire (gateway → stream / non-stream
 * response) omits the id or returns an empty string. LangChain's
 * AIMessageChunk reconstruction rejects empty ids and routes the tool
 * call into `invalid_tool_calls` (see
 * @langchain/core/messages/ai.js:178), which then causes the AI
 * Agent's Tools Agent to create a ToolMessage with empty tool_call_id
 * — which our gateway in turn rejects with
 * `messages[*].tool_call_id: tool message requires tool_call_id`.
 *
 * Format: `tool_<10-hex-chars>`. Matches the substrate's `tool_call_`
 * convention closely enough that operators recognise it; uniquely
 * identifies the call within a single conversation. The id is only
 * used by LangChain to correlate tool_use (assistant turn) with
 * tool_result (next turn) — the gateway accepts any non-empty string.
 */
function generateToolCallId(): string {
	return `tool_${Math.random().toString(36).slice(2, 12)}`;
}

function ensureNonEmptyToolCallId(id: string | undefined): string {
	if (typeof id === 'string' && id.length > 0) return id;
	const synthetic = generateToolCallId();
	// eslint-disable-next-line no-console
	console.warn(
		`[LoomcycleChatModel] gateway tool_use block had empty/missing id; substituting synthetic "${synthetic}" so LangChain's tool-call reconstruction doesn't drop it. If this happens consistently, file a substrate-side issue against loomcycle.`,
	);
	return synthetic;
}

// ---- Message mapping ----

// Exported for direct testing: invoke() coerces messages upstream of our
// conversion, so unit tests need to call this helper directly to
// exercise edge cases (broken prototype chain, missing _getType, etc).
export { langchainToLoomcycleMessage as __langchainToLoomcycleMessageForTests };
export { generateToolCallId as __generateToolCallIdForTests };
export { ensureNonEmptyToolCallId as __ensureNonEmptyToolCallIdForTests };

/**
 * Convert a LangChain `BaseMessage` to the gateway's `LLMChatMessage`.
 * Handles the four canonical message types (System / Human / AI / Tool)
 * + accumulates `AIMessage.tool_calls` into the gateway's `tool_calls`
 * field.
 *
 * Type detection uses `BaseMessage._getType()` rather than `instanceof`.
 * Reason: n8n's worker-thread / IPC layer passes messages through
 * serialization on some code paths, which breaks the prototype chain
 * and makes `instanceof ToolMessage` return false even when the object
 * IS semantically a tool message. The `_getType()` method (or its
 * fallback shape checks below) survives the round-trip because n8n's
 * LangChain layer preserves the method on the reconstructed instance.
 * Lost type detection caused "messages[2].tool_call_id: tool message
 * requires tool_call_id" gateway errors in the AI Agent's tool-loop
 * (1.1.2 and earlier).
 */
function langchainToLoomcycleMessage(msg: BaseMessage): LLMChatMessage {
	const type = detectMessageType(msg);
	const content = messageContentToString(msg.content);

	switch (type) {
		case 'system':
			return { role: 'system', content };
		case 'user':
		case 'human':
			return { role: 'user', content };
		case 'assistant':
		case 'ai': {
			const out: LLMChatMessage = { role: 'assistant', content };
			const aiMsg = msg as AIMessage;
			if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
				out.tool_calls = aiMsg.tool_calls.map((tc) => ({
					id: tc.id ?? '',
					name: tc.name,
					input: (tc.args ?? {}) as Record<string, unknown>,
				}));
			}
			return out;
		}
		case 'tool':
		case 'function': {
			const toolMsg = msg as ToolMessage;
			// tool_call_id is REQUIRED by the gateway — it's how the AI
			// turn correlates this result back to the originating
			// tool_use call. If empty (LangChain's tool-call
			// reconstruction can drop the id when the upstream chunks
			// have empty/missing ids — we handle that with synthetic
			// ids on the assistant side), generate a fresh synthetic
			// id rather than send empty and hit the gateway-reject path.
			// This is a last-line-of-defence; the upstream
			// ensureNonEmptyToolCallId in chunks should prevent reaching
			// here with empty ids in normal operation.
			const tcId = toolMsg.tool_call_id ?? '';
			if (tcId.length === 0) {
				// eslint-disable-next-line no-console
				console.warn(
					`[LoomcycleChatModel] ToolMessage has empty tool_call_id (assistant turn likely lost the id during accumulation). Sending synthetic id to avoid gateway rejection — the round-trip won't correlate cleanly but the request will succeed.`,
				);
				return { role: 'tool', content, tool_call_id: generateToolCallId() };
			}
			return { role: 'tool', content, tool_call_id: tcId };
		}
		default:
			// Safety net for unrecognised roles. Logged via toJSON so
			// operators can debug if they see this branch fire.
			return { role: 'user', content };
	}
}

/**
 * Type detection for LangChain `BaseMessage` instances. Robust to
 * prototype-chain loss (which happens at n8n's worker-thread boundary).
 * Order of precedence:
 *   1. `_getType()` — the canonical method, present on the prototype
 *      of all BaseMessage subclasses. Survives serialization in most
 *      LangChain layers because n8n re-hydrates via the LangChain
 *      reviver.
 *   2. Shape inspection — `tool_call_id` field implies a tool result;
 *      `tool_calls` field implies an AI turn requesting tool use.
 *   3. `role` / `type` fields — for OpenAI-style plain-object messages
 *      that might come through custom workflows.
 *   4. Default `'human'`.
 */
function detectMessageType(msg: BaseMessage): string {
	const m = msg as unknown as {
		_getType?: () => string;
		tool_call_id?: string;
		tool_calls?: unknown[];
		role?: string;
		type?: string;
	};
	if (typeof m._getType === 'function') {
		try {
			return m._getType();
		} catch {
			// Fall through to shape inspection — _getType can throw on
			// re-hydrated instances where some private field is missing.
		}
	}
	if (typeof m.tool_call_id === 'string') return 'tool';
	if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return 'ai';
	if (m.role) return m.role;
	if (m.type) return m.type;
	return 'human';
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
		.map((c) => ({ id: ensureNonEmptyToolCallId(c.id), name: c.name, args: c.input }));

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
