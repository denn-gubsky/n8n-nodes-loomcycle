import { BaseChatModel, getParametersJsonSchema } from '@n8n/ai-node-sdk';
import type {
	ChatModelConfig,
	ContentText,
	ContentToolCall,
	ContentToolResult,
	FinishReason,
	GenerateResult,
	Message,
	MessageContent,
	StreamChunk,
	Tool,
} from '@n8n/ai-node-sdk';
import type {
	LLMChatMessage,
	LLMChatOptions,
	LLMChatResponse,
	LLMTool,
	LoomcycleClient,
} from '@loomcycle/client';

import { redactBearerFragments } from '../LoomCycle/helpers/errors';

/**
 * Constructor input for {@link LoomcycleChatModel} — the n8n Chat Model
 * sub-node's per-parameter overrides + the shared client.
 */
export interface LoomcycleChatModelFields {
	client: LoomcycleClient;
	provider?: string;
	model?: string;
	tier?: string;
	userId?: string;
	userTier?: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Chat model backed by loomcycle's `POST /v1/_llm/chat` gateway, built on
 * **`@n8n/ai-node-sdk`** (`BaseChatModel`). Exposes loomcycle's provider
 * routing, auth substitution, retry, host allowlist, and per-user quota
 * policy to n8n's AI Agent via the Chat Model slot — with no loomcycle agent
 * loop in the path (the gateway is the thin resolver front-end).
 *
 * Migrated off `@langchain/core` (v3.0.0): n8n Cloud forbids community nodes
 * from depending on langchain, so we implement the SDK's `generate`/`stream`
 * contract over the SDK's structured `Message[]` directly. The SDK's typed
 * content blocks (text / tool-call / tool-result) remove the langchain
 * prototype-chain + synthetic-tool-call-id workarounds the old model needed.
 *
 * Errors are bearer-redacted (CLAUDE.md §security.6) before re-throw.
 */
export class LoomcycleChatModel extends BaseChatModel {
	private readonly client: LoomcycleClient;
	private readonly routing: Pick<LoomcycleChatModelFields, 'provider' | 'model' | 'tier' | 'userId' | 'userTier'>;
	private readonly maxTokens?: number;
	private readonly temperature?: number;

	constructor(fields: LoomcycleChatModelFields) {
		// provider/modelId are display + routing hints; loomcycle's resolver
		// makes the final pick, so default to the gateway's "let it choose".
		super('loomcycle', fields.model || 'auto');
		this.client = fields.client;
		this.routing = {
			provider: fields.provider,
			model: fields.model,
			tier: fields.tier,
			userId: fields.userId,
			userTier: fields.userTier,
		};
		this.maxTokens = fields.maxTokens;
		this.temperature = fields.temperature;
	}

	async generate(messages: Message[], config?: ChatModelConfig): Promise<GenerateResult> {
		try {
			const resp = await this.client.llmChat(this.buildOptions(messages, config));
			return responseToGenerateResult(resp);
		} catch (err) {
			throw redactedError(err);
		}
	}

	/**
	 * loomcycle's gateway `llmChat` is non-streaming through the adapter, so
	 * we generate once and replay the result as content blocks + a finish
	 * chunk. The AI Agent consumes this correctly (no token-level streaming,
	 * but complete results + usage).
	 */
	async *stream(messages: Message[], config?: ChatModelConfig): AsyncIterable<StreamChunk> {
		const result = await this.generate(messages, config);
		for (const block of result.message.content) {
			yield { type: 'content', content: block };
		}
		yield { type: 'finish', finishReason: result.finishReason ?? 'stop', usage: result.usage };
	}

	private buildOptions(messages: Message[], config?: ChatModelConfig): LLMChatOptions {
		const opts: LLMChatOptions = { messages: messages.flatMap(toLoomcycleMessages) };

		const tools = this.tools.map(toLoomcycleTool).filter((t): t is LLMTool => t !== null);
		if (tools.length > 0) opts.tools = tools;

		if (this.routing.provider) opts.provider = this.routing.provider;
		if (this.routing.model) opts.model = this.routing.model;
		if (this.routing.tier) opts.tier = this.routing.tier;
		if (this.routing.userId) opts.user_id = this.routing.userId;
		if (this.routing.userTier) opts.user_tier = this.routing.userTier;

		const maxTokens = config?.maxTokens ?? this.maxTokens;
		if (maxTokens !== undefined) opts.max_tokens = maxTokens;
		const temperature = config?.temperature ?? this.temperature;
		if (temperature !== undefined) opts.temperature = temperature;
		if (config?.abortSignal) opts.signal = config.abortSignal;

		return opts;
	}
}

// ---- Message mapping (SDK Message[] → gateway LLMChatMessage[]) ----

/**
 * Convert one SDK `Message` to the gateway's `LLMChatMessage`(s). A `tool`
 * message may carry multiple tool-result blocks; the gateway models each as
 * its own `tool` turn correlated by `tool_call_id`, so we flatMap.
 */
function toLoomcycleMessages(msg: Message): LLMChatMessage[] {
	const text = textOf(msg.content);
	switch (msg.role) {
		case 'system':
			return [{ role: 'system', content: text }];
		case 'user':
			return [{ role: 'user', content: text }];
		case 'assistant': {
			const out: LLMChatMessage = { role: 'assistant', content: text };
			const toolCalls = msg.content
				.filter((c): c is ContentToolCall => c.type === 'tool-call')
				.map((c) => ({ id: c.toolCallId ?? '', name: c.toolName, input: parseToolInput(c.input) }));
			if (toolCalls.length > 0) out.tool_calls = toolCalls;
			return [out];
		}
		case 'tool': {
			const results = msg.content.filter((c): c is ContentToolResult => c.type === 'tool-result');
			if (results.length === 0) return [{ role: 'tool', content: text, tool_call_id: '' }];
			return results.map((r) => ({
				role: 'tool',
				content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
				tool_call_id: r.toolCallId,
			}));
		}
		default:
			return [{ role: 'user', content: text }];
	}
}

function textOf(content: MessageContent[]): string {
	return content
		.filter((c): c is ContentText => c.type === 'text')
		.map((c) => c.text)
		.join('');
}

/** ContentToolCall.input is a JSON string; the gateway wants an object. */
function parseToolInput(input: string): Record<string, unknown> {
	if (!input) return {};
	try {
		const parsed = JSON.parse(input);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

// ---- Response mapping (gateway LLMChatResponse → SDK GenerateResult) ----

function responseToGenerateResult(resp: LLMChatResponse): GenerateResult {
	const content: MessageContent[] = resp.content.map((c) =>
		c.type === 'text'
			? { type: 'text', text: c.text }
			: { type: 'tool-call', toolCallId: c.id, toolName: c.name, input: JSON.stringify(c.input) },
	);
	return {
		id: resp.id,
		message: { role: 'assistant', content },
		finishReason: mapFinishReason(resp.stop_reason),
		usage: {
			promptTokens: resp.usage.input_tokens,
			completionTokens: resp.usage.output_tokens,
			totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
		},
	};
}

function mapFinishReason(stop: LLMChatResponse['stop_reason']): FinishReason {
	switch (stop) {
		case 'max_tokens':
			return 'length';
		case 'tool_use':
			return 'tool-calls';
		default:
			return 'stop';
	}
}

// ---- Tool mapping (SDK Tool → gateway LLMTool) ----

/** Function tools convert to the gateway's `{name, description, input_schema}`;
 *  provider-native tools have no gateway equivalent and are skipped. */
function toLoomcycleTool(tool: Tool): LLMTool | null {
	if (tool.type !== 'function') return null;
	return {
		name: tool.name,
		description: tool.description,
		input_schema: getParametersJsonSchema(tool) as Record<string, unknown>,
	};
}

// ---- Error redaction ----

function redactedError(err: unknown): Error {
	const message = redactBearerFragments((err as Error).message ?? 'unknown loomcycle error');
	const wrapped = new Error(message);
	(wrapped as Error & { cause?: unknown }).cause = err;
	return wrapped;
}
