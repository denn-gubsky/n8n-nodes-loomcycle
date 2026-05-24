import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { LoomcycleChatModel } from '../_shared/langchainChatModel';

/**
 * `LoomCycle Chat Model` — cluster sub-node that plugs into n8n's AI
 * Agent's **Chat Model** slot, routing the AI Agent's LLM calls through
 * loomcycle's gateway (`POST /v1/_llm/chat`) instead of a direct
 * provider SDK.
 *
 * Why this exists (vs n8n's stock Anthropic / OpenAI Chat Model nodes):
 *   - **Single credential.** Operators set their loomcycle bearer once
 *     on the LoomCycle API credential; all provider auth lives in
 *     loomcycle's env. n8n no longer needs per-provider credentials.
 *   - **Provider routing.** Loomcycle's resolver picks the provider /
 *     model at request time based on tier policy + availability +
 *     fallback rules. n8n workflows automatically benefit.
 *   - **Per-user quotas.** `userId` on the request feeds loomcycle's
 *     per-user quota policy — useful for multi-tenant n8n deployments
 *     where workflows act on behalf of distinct end-users.
 *   - **Single audit log.** All LLM calls audit into loomcycle's
 *     `/v1/_events` log; operators don't need to stitch logs across
 *     multiple provider dashboards.
 *
 * What this does NOT do:
 *   - **No loomcycle agent loop.** No DB row, no snapshot, no hook
 *     pipeline, no MCP registration check. The gateway is the thin
 *     resolver-front-end. If you want the full agent loop (with tools,
 *     memory, hooks), use the LoomCycle Sub-Agent Tool — that's a
 *     different layer.
 *   - **No streaming reconnect.** The gateway stream is single-shot;
 *     if it drops, the caller's retry kicks in. Different from the
 *     RunCompleted trigger's `streamUserRunStates` which has 30-min
 *     server cap + auto-reconnect.
 *
 * Dual-mode (n8n v1.82+ compatibility):
 *   - `supplyData()` returns a `LoomcycleChatModel` instance for older
 *     AI Agent modes (OpenAI Functions Agent, Conversational Agent).
 *   - `execute()` is included as a stub that throws a helpful error —
 *     Chat Models aren't invoked directly by n8n's execute pipeline
 *     the way Tools are, but the lint rule
 *     `node-class-description-outputs-wrong` doesn't catch this nuance
 *     and the dual-method pattern is what unblocked Tools Agent for
 *     the cluster *tool* sub-nodes in v1.0.4.
 */
export class LoomCycleChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Chat Model',
		name: 'loomCycleChatModel',
		icon: 'file:LoomCycleChatModel.svg',
		group: ['transform'],
		version: 1,
		description: 'Route the AI Agent\'s LLM calls through loomcycle\'s gateway (provider routing, auth, retry, per-user quotas)',
		defaults: { name: 'LoomCycle Chat Model' },
		codex: { categories: ['AI'], subcategories: { AI: ['Language Models'] } },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Provider',
				name: 'provider',
				type: 'string',
				default: '',
				description:
					'Optional provider pin. Empty = let loomcycle\'s resolver pick. Must match a provider configured in your loomcycle.yaml (the value the resolver knows internally) — common values: anthropic / openai / deepseek / ollama, but the actual list depends on your operator deployment.',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				description: 'Optional model ID pin. Empty = let the resolver pick within the chosen provider (or globally if Provider is also empty). Must match a model ID the chosen provider knows — refer to the model IDs declared in your loomcycle.yaml or the provider\'s API documentation.',
			},
			{
				displayName: 'Tier',
				name: 'tier',
				type: 'string',
				default: '',
				description:
					'Tier label for resolver dispatch policy. Loomcycle tiers are operator-defined in loomcycle.yaml — whatever your deployment configured. Empty = the resolver\'s default tier. Common conventions are "default" / "pro" / "free" but operators are free to name tiers anything (e.g. "internal", "premium", "research").',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description:
					'Per-user quota tracking + audit-log scoping. Empty = use the credential\'s Default User ID. Empty AND no credential default = anonymous (operator-bearer scope only).',
			},
			{
				displayName: 'User Tier',
				name: 'userTier',
				type: 'string',
				default: '',
				description:
					'Per-user tier overlay (same naming convention as Tier — operator-defined in loomcycle.yaml). Takes precedence over Tier when set. Empty = fall through to Tier / credential default.',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 4096,
				typeOptions: { minValue: 1, maxValue: 200000 },
				description: 'Maximum tokens the model may generate per call',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: -1,
				typeOptions: { minValue: -1, maxValue: 2, numberPrecision: 2 },
				description: 'Sampling temperature. Set to -1 to use the provider default (recommended for most use cases).',
			},
			{
				displayName: 'Streaming',
				name: 'streaming',
				type: 'boolean',
				default: true,
				description:
					'Whether to enable token-by-token streaming. Disable if the consumer expects a single non-streaming response (some older AI Agent modes).',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const providerParam = this.getNodeParameter('provider', 0, '') as string;
		const modelParam = this.getNodeParameter('model', 0, '') as string;
		const tierParam = this.getNodeParameter('tier', 0, '') as string;
		const userIdParam = this.getNodeParameter('userId', 0, '') as string;
		const userTierParam = this.getNodeParameter('userTier', 0, '') as string;
		const maxTokens = this.getNodeParameter('maxTokens', 0, 4096) as number;
		const temperatureParam = this.getNodeParameter('temperature', 0, -1) as number;
		const streaming = this.getNodeParameter('streaming', 0, true) as boolean;

		const client = await getClient(this);
		const userIdDefault = await getCredentialDefault(this, 'userId');
		const userTierDefault = await getCredentialDefault(this, 'userTier');

		const userId = userIdParam || userIdDefault;
		const userTier = userTierParam || userTierDefault;

		const model = new LoomcycleChatModel({
			client,
			provider: providerParam || undefined,
			model: modelParam || undefined,
			tier: tierParam || undefined,
			userId: userId || undefined,
			userTier: userTier || undefined,
			maxTokens,
			// Sentinel: -1 means "don't pass to gateway" (provider default).
			temperature: temperatureParam === -1 ? undefined : temperatureParam,
			streaming,
		});

		return { response: model };
	}

	/**
	 * AI Language Models don't get invoked through n8n's execute pipeline
	 * the same way Tool sub-nodes do — the AI Agent wires this in via
	 * `supplyData` and invokes the LangChain `BaseChatModel` directly.
	 * Provide a sentinel execute() to surface a clear error if n8n ever
	 * tries to invoke this node as a regular action node.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		throw new NodeOperationError(
			this.getNode(),
			'LoomCycle Chat Model is a Language Model cluster sub-node — wire it into an AI Agent\'s Chat Model slot, not as a standalone workflow step.',
		);
	}
}
