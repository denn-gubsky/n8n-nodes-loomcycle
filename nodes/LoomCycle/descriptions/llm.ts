import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `llm` resource — direct calls to loomcycle's
 * LLM gateway (v0.11.0) as a workflow step. Distinct from the LoomCycle Chat
 * Model cluster sub-node (which feeds an AI Agent); this is a plain action
 * node for RAG / embedding pipelines that want a completion or a vector
 * without an agent loop. 2 ops:
 *
 *   - Chat       → llmChat (non-streaming completion; provider routing + auth
 *                  + retry handled by the gateway)
 *   - Embeddings → embeddings (OpenAI-compatible; dispatches to the operator-
 *                  configured Embedder)
 *
 * Op options array is alphabetised by name.
 */
export const llmOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['llm'] } },
		options: [
			{
				name: 'Chat',
				value: 'chat',
				description: 'Non-streaming chat completion through loomcycle\'s gateway',
				action: 'Chat completion',
			},
			{
				name: 'Embeddings',
				value: 'embeddings',
				description: 'Embed text via the operator-configured embedder',
				action: 'Create embeddings',
			},
		],
		default: 'chat',
	},

	// ---- Chat: messages ----
	{
		displayName: 'Messages',
		name: 'messages',
		type: 'fixedCollection',
		placeholder: 'Add Message',
		default: {},
		required: true,
		typeOptions: { multipleValues: true, sortable: true },
		displayOptions: { show: { resource: ['llm'], operation: ['chat'] } },
		options: [
			{
				name: 'message',
				displayName: 'Message',
				values: [
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						default: 'user',
						options: [
							{ name: 'Assistant', value: 'assistant' },
							{ name: 'System', value: 'system' },
							{ name: 'Tool', value: 'tool' },
							{ name: 'User', value: 'user' },
						],
						description: 'The role of this message in the conversation',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'The message text',
					},
				],
			},
		],
		description: 'The conversation sent to the model, in order',
	},

	// ---- Chat: routing + sampling (additional) ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['llm'], operation: ['chat'] } },
		options: [
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 1024,
				typeOptions: { minValue: 1 },
				description: 'Maximum tokens to generate',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				description: 'Routing hint — pin a specific model. With Provider set, an explicit pin; alone, the resolver picks the provider hosting it.',
			},
			{
				displayName: 'Provider',
				name: 'provider',
				type: 'string',
				default: '',
				description: 'Routing hint — pin a provider (e.g. `anthropic`, `openai`). Alone, the resolver picks the best model in that provider for the tier.',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
				description: 'Sampling temperature',
			},
			{
				displayName: 'Tier',
				name: 'tier',
				type: 'string',
				default: '',
				description: 'Resolver dispatch tier. Defaults to `default` when neither a pin nor a tier is supplied.',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'Per-user quota tracking. Empty = use the credential\'s Default User ID, else bypass the per-user cap.',
			},
			{
				displayName: 'User Tier',
				name: 'userTier',
				type: 'string',
				default: '',
				description: 'Per-user tier overlay; takes precedence over Tier when set',
			},
		],
	},

	// ---- Embeddings: model + input ----
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['llm'], operation: ['embeddings'] } },
		description: 'Requested model ID (echoed in the response). Loomcycle uses its single configured embedder regardless — this is for drop-in OpenAI compatibility.',
	},
	{
		displayName: 'Input',
		name: 'input',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['llm'], operation: ['embeddings'] } },
		description: 'Text to embed. By default the whole field is one input; enable "Split Into Lines" to embed each non-empty line separately.',
	},
	{
		displayName: 'Split Into Lines (Batch)',
		name: 'splitLines',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['llm'], operation: ['embeddings'] } },
		description: 'Whether to treat each non-empty line of Input as a separate text to embed (one vector per line) instead of embedding the whole field as one input',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['llm'], operation: ['embeddings'] } },
		options: [
			{
				displayName: 'Dimensions',
				name: 'dimensions',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'OpenAI dimension-reduction hint. Accepted but ignored unless the configured embedder supports it.',
			},
			{
				displayName: 'Encoding Format',
				name: 'encodingFormat',
				type: 'options',
				default: 'float',
				options: [
					{ name: 'Float', value: 'float', description: 'Each vector as a JSON array of numbers' },
					{ name: 'Base64', value: 'base64', description: 'Float32 little-endian, base64-encoded (~25% smaller on the wire)' },
				],
				description: 'How each vector is encoded in the response',
			},
			{
				displayName: 'User',
				name: 'user',
				type: 'string',
				default: '',
				description: 'Opaque end-user identifier for per-user quota tracking + audit log',
			},
		],
	},
];
