import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `run` resource of the LoomCycle umbrella
 * node. Five ops:
 *   - Spawn         → runStreaming (drained synchronously)
 *   - Get Status    → getAgent
 *   - Wait          → poll getAgent until terminal state
 *   - Cancel        → cancelAgent (cascades via parent_agent_id)
 *   - List Agents   → listUserAgents
 *
 * Long runs block the node's execute(); operators wanting async semantics
 * should use the LoomCycle: Run Completed trigger (Sub-phase 2.3).
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base
 * convention (default values are selected by `value`, not array position).
 */
export const runOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['run'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel a running agent (cascades to children via parent_agent_id)',
				action: 'Cancel a run',
			},
			{
				name: 'Compact',
				value: 'compact',
				description: 'Summarise a parked run\'s conversation to reclaim context (loomcycle ≥ v0.33)',
				action: 'Compact a run',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description: 'Fetch the current state of a running or completed agent',
				action: 'Get run status',
			},
			{
				name: 'Get Transcript',
				value: 'getTranscript',
				description: 'Read the full event log for a session (system prompt + every turn)',
				action: 'Get a session transcript',
			},
			{
				name: 'List Agents',
				value: 'listAgents',
				description: 'List recent / running agents for a user_id',
				action: 'List agents for a user',
			},
			{
				name: 'Spawn',
				value: 'spawn',
				description: 'Spawn a new loomcycle agent run and wait synchronously for completion',
				action: 'Spawn a run',
			},
			{
				name: 'Spawn Batch',
				value: 'spawnBatch',
				description: 'Fan-out: spawn up to 32 runs concurrently and wait for all to settle (loomcycle ≥ v0.33)',
				action: 'Spawn a batch of runs',
			},
		],
		default: 'spawn',
	},

	// ---- Spawn parameters ----
	{
		displayName: 'Agent Name or ID',
		name: 'agent',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadAgents' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		description:
			'Agent to spawn — merged from loomcycle.yaml + AgentDef registry via the GET /v1/_library/agents endpoint. Each option\'s description tag (yaml-static / dynamic / yaml+dynamic) shows where the definition lives. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		description: 'User prompt sent to the agent — wrapped as a trusted-text segment by default',
	},
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		description: 'Override the credential\'s Default User ID for this run. Leave empty to use the credential default.',
	},
	{
		displayName: 'User Tier',
		name: 'userTier',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		description: 'Override the credential\'s Default User Tier for this run. Leave empty to use the credential default.',
	},
	{
		displayName: 'Treat Prompt as Untrusted',
		name: 'treatPromptAsUntrusted',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		description:
			'Whether to wrap the prompt as an untrusted-block segment instead of trusted-text. Enable when the prompt contains end-user input (e.g. a Slack message body) that the agent should treat as data, not instruction.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['run'], operation: ['spawn'] } },
		options: [
			{
				displayName: 'Agent ID',
				name: 'agentId',
				type: 'string',
				default: '',
				description: 'Caller-supplied agent_id. Loomcycle generates one if empty.',
			},
			{
				displayName: 'Allowed Hosts (Comma-Separated)',
				name: 'allowedHosts',
				type: 'string',
				default: '',
				description: 'Comma-separated host allowlist for the HTTP / WebFetch / WebSearch tools. Empty = use the operator floor.',
			},
			{
				displayName: 'Allowed Tools (Comma-Separated)',
				name: 'allowedTools',
				type: 'string',
				default: '',
				description: 'Comma-separated tool-name list to narrow the agent\'s allowed_tools beyond the operator floor. Empty = no narrowing.',
			},
			{
				// loomcycle v0.32: per-run context-compaction override. Each
				// field optional; unset inherits the agent's value. Folded via
				// parseObjectField onto runOpts.compaction.
				displayName: 'Compaction (JSON)',
				name: 'compaction',
				type: 'json',
				default: '{}',
				description:
					'Per-run context-compaction override (loomcycle ≥ v0.32), e.g. `{"enabled":true,"keepLastN":4,"autocompactAtPct":80}`. Keys: enabled, targetPercentage, keepLastN, keepFirst, autocompactAtPct, model. Empty = inherit the agent\'s settings.',
			},
			{
				// loomcycle v0.21: non-secret structured metadata channel.
				// Trusted (first-party bearer) — code-js reads input.metadata,
				// LLM agents get a trusted prompt block. Per-call, not session
				// state. NOT for secrets — those go in Per-Tool Credentials.
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description:
					'Non-secret structured metadata (JSON object) passed to the agent (loomcycle ≥ v0.21). A code-js agent reads it as `input.metadata`; an LLM agent receives it as a trusted prompt block. Per-call, not session state. Use Per-Tool Credentials for secrets — metadata is safe to log.',
			},
			{
				// RFC F (loomcycle v0.12.x): per-tool named credentials map.
				// Template-string values only (${LOOMCYCLE_*} / ${run.*}) —
				// plaintext secrets must never travel this wire path
				// (CLAUDE.md §security). userBearer above auto-promotes to
				// the `default` key for back-compat, so leave that key free.
				displayName: 'Per-Tool Credentials',
				name: 'userCredentials',
				type: 'fixedCollection',
				placeholder: 'Add Credential',
				default: {},
				typeOptions: { multipleValues: true },
				options: [
					{
						name: 'credential',
						displayName: 'Credential',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								description: 'Credential key referenced by tools as `${run.credentials.&lt;name&gt;}`',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								required: true,
								description: 'Template string only (e.g. `${LOOMCYCLE_GITHUB_TOKEN}`). Plaintext credentials never travel this wire path.',
							},
						],
					},
				],
				description: 'Per-tool named credentials (RFC F) injected into MCP server headers per run. Template strings only.',
			},
			{
				// loomcycle v0.21: per-run wall-clock ceiling. Precedence:
				// per-run > per-agent > global. Folded only when > 0.
				displayName: 'Run Timeout (Seconds)',
				name: 'runTimeoutSeconds',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Per-run wall-clock ceiling (loomcycle ≥ v0.21). 0 = inherit the agent / global default. Overrides both when > 0.',
			},
			{
				// loomcycle v0.28: per-run sampling override. Folded via
				// parseObjectField onto runOpts.sampling.
				displayName: 'Sampling (JSON)',
				name: 'sampling',
				type: 'json',
				default: '{}',
				description:
					'Per-run sampling override (loomcycle ≥ v0.28), e.g. `{"temperature":0.2,"topP":0.9,"seed":7}`. Keys: temperature, topP, topK, frequencyPenalty, presencePenalty, seed, stop. Empty = inherit the agent\'s settings.',
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '',
				description: 'Existing session_id to continue. Leave empty to start a fresh session.',
			},
			{
				displayName: 'User Bearer',
				name: 'userBearer',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Per-end-user bearer token substituted into MCP server headers via the ${run.user_bearer} pattern (v0.8.14+)',
			},
			{
				displayName: 'Web Search Host Filter',
				name: 'webSearchFilter',
				type: 'options',
				default: '',
				options: [
					{ name: 'Default (Off)', value: '' },
					{ name: 'Drop — Filter Out Allowed-Hosts', value: 'drop' },
					{ name: 'Keep — Filter In Allowed-Hosts', value: 'keep' },
				],
				description:
					'Optional Brave-side host-filtering behaviour for the WebSearch tool. Only meaningful when Allowed Hosts is also set on this run.',
			},
		],
	},

	// ---- Get Status / Cancel: shared Agent ID ----
	{
		displayName: 'Agent ID',
		name: 'agentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['getStatus', 'cancel'] } },
		description: 'The agent_id of the run to inspect / cancel',
	},

	// ---- Cancel / Compact reason ----
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['cancel', 'compact'] } },
		description: 'Operator-visible reason recorded with the cancellation / compaction',
	},

	// ---- Compact: Run ID ----
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['compact'] } },
		description: 'The run_id to compact (from a Spawn output). Summarises its conversation; reports before/after token counts + whether applied live, as a marker, or a no-op.',
	},

	// ---- Get Transcript: Session ID ----
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['getTranscript'] } },
		description: 'The session_id whose full event log to return (from a Spawn output)',
	},

	// ---- Spawn Batch: the fan-out set + optional join deadline ----
	{
		displayName: 'Spawns',
		name: 'batchSpawns',
		type: 'fixedCollection',
		placeholder: 'Add Spawn',
		default: {},
		required: true,
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['run'], operation: ['spawnBatch'] } },
		options: [
			{
				name: 'spawn',
				displayName: 'Spawn',
				values: [
					{
						displayName: 'Agent Name or ID',
						name: 'agent',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'loadAgents' },
						default: '',
						required: true,
						description: 'Agent to spawn for this child run. Or specify a name via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Prompt',
						name: 'prompt',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						required: true,
						description: 'Prompt for this child run — wrapped as a trusted-text segment',
					},
					{
						displayName: 'User ID',
						name: 'userId',
						type: 'string',
						default: '',
						description: 'Override the credential Default User ID for this child. Empty = credential default.',
					},
					{
						displayName: 'User Tier',
						name: 'userTier',
						type: 'string',
						default: '',
						description: 'Override the credential Default User Tier for this child. Empty = credential default.',
					},
				],
			},
		],
		description: 'Up to 32 child runs spawned concurrently. The node blocks until all settle; the result is index-aligned with this list (per-child failures reported in-envelope, never thrown).',
	},
	{
		displayName: 'Join Timeout (Ms)',
		name: 'batchTimeoutMs',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['run'], operation: ['spawnBatch'] } },
		description: 'Optional deadline: a child still running when it elapses is cancelled + reported as cancelled in the envelope. 0 = wait indefinitely.',
	},

	// ---- List Agents ----
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['listAgents'] } },
		description: 'User_id to list agents for. Empty = use the credential\'s Default User ID.',
	},
	{
		displayName: 'Status Filter',
		name: 'statusFilter',
		type: 'options',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['listAgents'] } },
		options: [
			{ name: 'All', value: '' },
			{ name: 'Cancelled', value: 'cancelled' },
			{ name: 'Completed', value: 'completed' },
			{ name: 'Failed', value: 'failed' },
			{ name: 'Running', value: 'running' },
		],
		description: 'Filter the listing by run status',
	},
];
