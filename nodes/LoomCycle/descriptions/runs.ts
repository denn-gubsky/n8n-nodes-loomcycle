import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `run` resource. Eleven ops:
 *   - Spawn                → runStreaming (drained synchronously)
 *   - Spawn Batch          → spawnRunBatch (up to 32 concurrent children)
 *   - Send Input           → sendRunInput (steer a parked interactive run)
 *   - Get Status           → getAgent
 *   - Get Transcript       → getTranscript
 *   - Compact              → compactRun
 *   - Cancel               → cancelAgent (cascades via parent_agent_id)
 *   - Cancel Turn          → cancelTurn (RFC BH — park, don't terminate)
 *   - Replay Session       → replaySession (RFC BJ P4)
 *   - List Agents          → listUserAgents
 *   - List Runnable Agents → runnableAgents (RFC BY)
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
				name: 'Cancel Turn',
				value: 'cancelTurn',
				description:
					'Stop the current turn of a live interactive run and park it awaiting input, keeping session + transcript intact (loomcycle ≥ v1.22)',
				action: 'Cancel the current turn of a run',
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
				name: 'List Runnable Agents',
				value: 'listRunnableAgents',
				description:
					'List the agents this credential may run, tiered by access mode — works with a delegated per-user token (loomcycle ≥ v1.51)',
				action: 'List runnable agents',
			},
			{
				name: 'Replay Session',
				value: 'replaySession',
				description:
					'Replay a session transcript into a new session bound to another agent, which continues from the same context (loomcycle ≥ v1.25)',
				action: 'Replay a session onto another agent',
			},
			{
				name: 'Send Input',
				value: 'sendInput',
				description: 'Push an operator turn into a live interactive run parked at end_turn (loomcycle ≥ v1.1.1)',
				action: 'Send input to an interactive run',
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
			{
				// FULL EDITION ONLY — polls with setTimeout, which n8n Cloud's
				// scanner bans. The slim edition has no Wait op.
				name: 'Wait for Completion',
				value: 'wait',
				description: 'Poll until the agent reaches a terminal state (completed/failed/cancelled)',
				action: 'Wait for completion',
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
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'replaySession'] } },
		description:
			'For Spawn, the agent to run; for Replay Session, the agent the replayed context is handed to. Merged from loomcycle.yaml + AgentDef registry via the GET /v1/_library/agents endpoint, falling back to the runnable-agent listing when the credential is a delegated user token. Each option\'s description tag (yaml-static / dynamic / yaml+dynamic) shows where the definition lives. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				// RFC AT (loomcycle v1.7): vision input. The node reads these
				// binary properties off the input item and base64s them into
				// `image` content blocks. There is deliberately no URL form on
				// the wire (loomcycle refuses it as SSRF), so the bytes must
				// travel inline.
				displayName: 'Image Binary Properties (Comma-Separated)',
				name: 'imageBinaryProperties',
				type: 'string',
				default: '',
				description:
					'Binary property names on the input item to send as images (loomcycle ≥ v1.7), e.g. `data`. Each must be PNG, JPEG, GIF or WebP. The agent\'s model must be vision-capable or the run errors before the provider call. Empty = no images.',
			},
			{
				// loomcycle v1.1.1 (RFC AI): start a PERSISTENT interactive run
				// that parks at end_turn instead of running to completion. The
				// node returns once the run parks (awaitingInput: true, with the
				// run_id) rather than blocking for the full run — drive it
				// afterwards with the Send Input op or the Run Completed trigger.
				displayName: 'Interactive Session',
				name: 'interactive',
				type: 'boolean',
				default: false,
				description:
					'Whether to start a persistent interactive run that parks at end_turn awaiting operator steering (loomcycle ≥ v1.1.1). The node returns as soon as the run parks (with its run_id and awaitingInput: true) instead of waiting for completion. Push follow-up turns with the Send Input operation, and read final output via the Run Completed trigger or Get Status.',
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

	// ---- Get Status / Wait / Cancel: shared Agent ID ----
	{
		displayName: 'Agent ID',
		name: 'agentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['getStatus', 'wait', 'cancel'] } },
		description: 'The agent_id of the run to inspect / wait on / cancel',
	},

	// ---- Wait-specific (FULL EDITION ONLY) ----
	{
		displayName: 'Poll Interval (Ms)',
		name: 'pollIntervalMs',
		type: 'number',
		default: 1000,
		typeOptions: { minValue: 250, maxValue: 60000 },
		displayOptions: { show: { resource: ['run'], operation: ['wait'] } },
		description: 'How frequently to poll getAgent while waiting. Lower values yield faster detection at the cost of more HTTP calls.',
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeoutSec',
		type: 'number',
		default: 300,
		typeOptions: { minValue: 5, maxValue: 86400 },
		displayOptions: { show: { resource: ['run'], operation: ['wait'] } },
		description: 'Maximum seconds to wait before giving up. Exceeding this throws a workflow error.',
	},

	// ---- Cancel / Compact reason ----
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['cancel', 'cancelTurn', 'compact'] } },
		description: 'Operator-visible reason recorded with the cancellation / compaction',
	},

	// ---- Compact / Send Input / Cancel Turn: shared Run ID ----
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['cancelTurn', 'compact', 'sendInput'] } },
		description: 'The run_id to target (from a Spawn output). Compact summarises its conversation; Send Input delivers an operator turn to it if it is a live interactive run parked at end_turn; Cancel Turn stops its in-flight turn and parks it.',
	},

	// ---- Replay Session: source session + optional compression ----
	{
		displayName: 'Source Session ID',
		name: 'sourceSessionId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['replaySession'] } },
		description: 'The session_id whose transcript is replayed. A NEW session is created bound to the agent chosen above; the response carries its new_session_id, which you continue with via Spawn\'s Session ID field.',
	},
	{
		displayName: 'Compress Carried History',
		name: 'compress',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['run'], operation: ['replaySession'] } },
		description: 'Whether to collapse the carried transcript to a summary plus a recent tail instead of replaying it in full. Use for long sessions that would otherwise consume the target agent\'s context.',
	},

	// ---- Send Input: the operator turn ----
	{
		displayName: 'Input Text',
		name: 'inputText',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['sendInput'] } },
		description: 'Operator message delivered to the parked interactive run as the next user turn. The response returns `delivered: false` if no parked run accepted it (the run already finished, or steering is disabled on the substrate).',
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
