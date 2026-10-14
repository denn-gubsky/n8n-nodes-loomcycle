import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `run` resource. Twenty-one ops:
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
 *   - Get Run              → getRun (by run_id; carries result + spec)
 *   - List Children        → listChildRuns (loomcycle ≥ v1.111)
 *   - Review               → reviewRun (RFC DJ — rule on a held answer)
 *   - Retune               → retuneRun (change a live run's settings)
 *   - Get Run Config       → getRunConfig / getEffectiveConfig / getRunPrompt
 *   - Delete Run Tree      → deleteRunTree (runs:delete scope)
 *   - Create / Update / Start / Delete Draft → configured runs (RFC DI)
 *
 * Long runs block the node's execute(); operators wanting async semantics
 * should use the LoomCycle: Run Completed trigger (Sub-phase 2.3).
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base
 * convention (default values are selected by `value`, not array position).
 */
const SPAWN_BASE_FIELDS: INodeProperties[] = [
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
];

const TOOL_CHOICE_MODES = [
	{ name: 'Inherit', value: '', description: 'Use the agent definition\'s tool choice' },
	{ name: 'Auto', value: 'auto', description: 'The model decides whether to call a tool' },
	{ name: 'None', value: 'none', description: 'The model may not call tools' },
	{ name: 'Required', value: 'required', description: 'The model must call some tool' },
	{ name: 'Specific Tool', value: 'tool', description: 'The model must call the tool named below' },
];

/**
 * Per-run settings that may also be changed on a live run (`RunOverrideOptions`,
 * loomcycle ≥ v1.82). Shared by Spawn / drafts (as Additional Fields) and Retune.
 * An override only selects WITHIN what the agent definition allows; anything
 * else is refused, never dropped, so these fields fail loudly on a typo.
 */
export const RUN_OVERRIDE_FIELDS: INodeProperties[] = [
	{
		displayName: 'Effort',
		name: 'effort',
		type: 'options',
		default: '',
		options: [
			{ name: 'Inherit', value: '' },
			{ name: 'High', value: 'high' },
			{ name: 'Low', value: 'low' },
			{ name: 'Medium', value: 'medium' },
		],
		description: 'Reasoning effort for models that support it',
	},
	{
		displayName: 'Hold for Review',
		name: 'review',
		type: 'boolean',
		default: false,
		description:
			'Whether to hold each finished answer for an operator\'s verdict (loomcycle ≥ v1.93). The node returns at the hold with awaitingReview; rule on it with Run → Review, or watch for holds with the LoomCycle: Review Pending trigger. An unreviewed hold ends the run as rejected.',
	},
	{
		displayName: 'Max Iterations',
		name: 'maxIterations',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description: 'Upper bound on agent-loop turns for this run. 0 = the agent\'s own bound.',
	},
	{
		displayName: 'Max Tokens',
		name: 'maxTokens',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description: 'Output-token ceiling per model call. 0 = the agent\'s own value.',
	},
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadModels' },
		default: '',
		description:
			'Run on this model alias instead of the agent\'s (loomcycle ≥ v1.82). Naming a model clears the tier and provider routing. Only models the agent definition allows are accepted. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Output Schema (JSON)',
		name: 'outputSchema',
		type: 'json',
		default: '{}',
		description:
			'A JSON Schema (object root) the final answer must follow (loomcycle ≥ v1.92). When set, Spawn returns the parsed answer as `structured`. Replaces the agent\'s own output format. Some providers cannot enforce it and run anyway.',
	},
	{
		displayName: 'Provider',
		name: 'provider',
		type: 'string',
		default: '',
		description: 'Route to this provider, within what the agent definition allows. Empty = the agent\'s routing.',
	},
	{
		displayName: 'Tier',
		name: 'tier',
		type: 'string',
		default: '',
		placeholder: 'low',
		description: 'Route by model tier (for example low / middle / high) instead of a named model. Naming a tier clears the model.',
	},
	{
		displayName: 'Tool Choice',
		name: 'toolChoiceMode',
		type: 'options',
		default: '',
		options: TOOL_CHOICE_MODES,
		description: 'Whether, and which, tool the model must call (loomcycle ≥ v1.92)',
	},
	{
		displayName: 'Tool Choice: Tool Name',
		name: 'toolChoiceName',
		type: 'string',
		default: '',
		description: 'With Tool Choice "Specific Tool": the tool the model must call',
	},
	{
		displayName: 'Tool Choice: Until',
		name: 'toolChoiceUntil',
		type: 'options',
		default: '',
		options: [
			{ name: 'Default', value: '' },
			{ name: 'Always', value: 'always', description: 'Every turn (not allowed with Required or Specific Tool)' },
			{ name: 'First Call', value: 'first_call', description: 'Only the first model call' },
			{ name: 'Until Called', value: 'until_called', description: 'Until the model has called a tool' },
		],
		description: 'How long the tool choice holds',
	},
];

/**
 * Settings a run takes only when it starts: not changeable by Retune.
 */
const START_ONLY_FIELDS: INodeProperties[] = [
	{
		displayName: 'Context Mode',
		name: 'contextMode',
		type: 'options',
		default: '',
		options: [
			{ name: 'Append', value: 'append', description: 'Keep the whole conversation (the default)' },
			{ name: 'Auto', value: 'auto', description: 'Recap on local models, stateful on frontier models' },
			{ name: 'Inherit', value: '' },
			{ name: 'Recap', value: 'recap', description: 'Summarise older turns, keep the recent ones' },
			{ name: 'Stateful', value: 'stateful', description: 'Carry a structured state instead of the transcript' },
		],
		description: 'How the run keeps its context as it grows (loomcycle ≥ v1.85)',
	},
	{
		displayName: 'Hook Names or IDs',
		name: 'runHooks',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'loadHookDefNames' },
		default: [],
		description:
			'Hook definitions to add to this run, on top of the agent\'s own (loomcycle ≥ v1.98). Sub-agents inherit them. Each is attached under its own event. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		default: '',
		placeholder: 'order-{{ $json.orderId }}',
		description:
			'Makes the spawn safe to retry (loomcycle ≥ v1.106): a second spawn with the same key, for the same user, starts nothing and returns the first run, marked deduplicated. 1–200 characters of letters, digits and : . _ -. Not with Session ID.',
	},
	{
		displayName: 'Max Context Tokens',
		name: 'maxContextTokens',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description: 'The run\'s context window. 0 = the agent\'s own value.',
	},
	{
		displayName: 'Max Wall Time (Seconds)',
		name: 'maxWallSeconds',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description:
			'Hard limit on the run\'s lifetime, waits included (loomcycle ≥ v1.106). A run that reaches it ends cancelled with stop reason wall_limit. 0 = no limit.',
	},
	{
		displayName: 'No Trace',
		name: 'noTrace',
		type: 'boolean',
		default: false,
		description:
			'Whether to keep no content of this run: its transcript, prompts and results are replaced by markers (loomcycle ≥ v1.112). Not with interactive runs, review holds or sessions.',
	},
	{
		displayName: 'Review Time Limit (Seconds)',
		name: 'reviewTtlSeconds',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description: 'With Hold for Review: how long a hold waits for a verdict before the run ends as rejected. 0 = the server default.',
	},
];

const DRAFT_EXCLUDED_FIELDS = ['sessionId', 'userBearer', 'userCredentials', 'idempotencyKey'];

function sortByDisplayName(fields: INodeProperties[]): INodeProperties[] {
	return [...fields].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

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
				name: 'Create Draft',
				value: 'createDraft',
				description: 'Validate and store a run without starting it; start it later with Start Draft (loomcycle ≥ v1.93)',
				action: 'Create a draft run',
			},
			{
				name: 'Delete Draft',
				value: 'deleteDraft',
				description: 'Discard a draft run that has not started',
				action: 'Delete a draft run',
			},
			{
				name: 'Delete Run Tree',
				value: 'deleteRunTree',
				description: 'Permanently delete a finished run, its sub-runs and their transcripts (needs the runs:delete scope, loomcycle ≥ v1.112)',
				action: 'Delete a run tree',
			},
			{
				name: 'Get Run',
				value: 'getRun',
				description: 'Read a run by its run ID, with its result and the settings it ran with',
				action: 'Get a run',
			},
			{
				name: 'Get Run Config',
				value: 'getRunConfig',
				description: 'Read what a live run overrides, every setting with where it came from, or the prompt it was sent',
				action: 'Get the configuration of a run',
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
				name: 'List Children',
				value: 'listChildren',
				description: 'List the sub-runs a run started directly (loomcycle ≥ v1.111)',
				action: 'List the child runs of a run',
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
				name: 'Retune',
				value: 'retune',
				description: 'Change a live or parked run\'s model, limits, review or tool choice without sending it a turn',
				action: 'Retune a run',
			},
			{
				name: 'Review',
				value: 'review',
				description: 'Approve or reject an answer held for review',
				action: 'Review a held run',
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
				name: 'Start Draft',
				value: 'startDraft',
				description: 'Start a draft run and wait for it like Spawn',
				action: 'Start a draft run',
			},
			{
				name: 'Update Draft',
				value: 'updateDraft',
				description: 'Change a draft run\'s prompt or settings before it starts',
				action: 'Update a draft run',
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
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'createDraft', 'replaySession'] } },
		description:
			'For Spawn and Create Draft, the agent to run; for Replay Session, the agent the replayed context is handed to. Merged from loomcycle.yaml + AgentDef registry via the GET /v1/_library/agents endpoint, falling back to the runnable-agent listing when the credential is a delegated user token. Each option\'s description tag (yaml-static / dynamic / yaml+dynamic) shows where the definition lives. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'createDraft'] } },
		description: 'User prompt sent to the agent — wrapped as a trusted-text segment by default',
	},
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'createDraft'] } },
		description: 'Override the credential\'s Default User ID for this run. Leave empty to use the credential default.',
	},
	{
		displayName: 'User Tier',
		name: 'userTier',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'createDraft'] } },
		description: 'Override the credential\'s Default User Tier for this run. Leave empty to use the credential default.',
	},
	{
		displayName: 'Treat Prompt as Untrusted',
		name: 'treatPromptAsUntrusted',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['run'], operation: ['spawn', 'createDraft', 'updateDraft'] } },
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
		options: sortByDisplayName([...SPAWN_BASE_FIELDS, ...RUN_OVERRIDE_FIELDS, ...START_ONLY_FIELDS]),
	},
	{
		displayName: 'Additional Fields',
		name: 'draftFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['run'], operation: ['createDraft', 'updateDraft'] } },
		// A draft stores no secret and is not a continuation, so the bearer,
		// per-tool credentials and session are offered on Start Draft instead.
		// An idempotency key is refused on a draft (start:false).
		options: sortByDisplayName(
			[...SPAWN_BASE_FIELDS, ...RUN_OVERRIDE_FIELDS, ...START_ONLY_FIELDS].filter(
				(f) => !DRAFT_EXCLUDED_FIELDS.includes(f.name),
			),
		),
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
		displayOptions: {
			show: {
				resource: ['run'],
				operation: [
					'cancelTurn',
					'compact',
					'sendInput',
					'getRun',
					'listChildren',
					'review',
					'retune',
					'getRunConfig',
					'deleteRunTree',
					'deleteDraft',
					'startDraft',
					'updateDraft',
				],
			},
		},
		description: 'The run_id to target (from a Spawn, Create Draft or trigger output)',
	},

	// ---- Review ----
	{
		displayName: 'Decision',
		name: 'decision',
		type: 'options',
		default: 'approve',
		displayOptions: { show: { resource: ['run'], operation: ['review'] } },
		options: [
			{ name: 'Approve', value: 'approve', description: 'The run completes with the held answer' },
			{ name: 'Reject', value: 'reject', description: 'With feedback the run revises and is held again; without feedback it ends as rejected' },
		],
		description: 'Your verdict on the held answer',
	},
	{
		displayName: 'Feedback',
		name: 'feedback',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['review'], decision: ['reject'] } },
		description: 'What to change. Sent to the run as its next turn; leave empty to end the run as rejected.',
	},

	// ---- Retune ----
	{
		displayName: 'Settings to Change',
		name: 'overrides',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		displayOptions: { show: { resource: ['run'], operation: ['retune'] } },
		options: sortByDisplayName([
			...RUN_OVERRIDE_FIELDS,
			{
				displayName: 'Interactive Session',
				name: 'interactive',
				type: 'boolean',
				default: false,
				description: 'Whether the run parks at end_turn for operator steering',
			},
		]),
		description:
			'The settings to change on a live or parked run (loomcycle ≥ v1.82). The answer is the run\'s merged configuration. A finished run cannot be retuned.',
	},

	// ---- Get Run Config ----
	{
		displayName: 'View',
		name: 'configView',
		type: 'options',
		default: 'overrides',
		displayOptions: { show: { resource: ['run'], operation: ['getRunConfig'] } },
		options: [
			{ name: 'Effective Settings', value: 'effective', description: 'Every setting with the layer it came from (run, definition, user tier, operator, default). Live runs only.' },
			{ name: 'First Prompt', value: 'prompt', description: 'The system and input blocks the run\'s first model call received. Also after the run ended.' },
			{ name: 'Overrides', value: 'overrides', description: 'Only what this run sets itself. Live runs only.' },
		],
		description: 'What to read',
	},

	// ---- List Children ----
	{
		displayName: 'Page Size',
		name: 'pageSize',
		type: 'number',
		default: 100,
		typeOptions: { minValue: 1, maxValue: 1000 },
		displayOptions: { show: { resource: ['run'], operation: ['listChildren'] } },
		description: 'How many child runs to return (at most 1 000)',
	},
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['listChildren'] } },
		description: 'The next_cursor of a previous page. Empty = the first page.',
	},

	// ---- Delete Run Tree ----
	{
		displayName: 'Deletes the Run and Every Sub-Run',
		name: 'deleteTreeNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['deleteRunTree'] } },
		description:
			'Removes the run, everything it started and their transcripts. This cannot be undone. The run must have ended, and the credential needs the runs:delete scope. Usage accounting is kept. The output lists what it could not reach, such as snapshots.',
	},

	// ---- Update Draft ----
	{
		displayName: 'New Prompt',
		name: 'draftPrompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['updateDraft'] } },
		description: 'Replace the draft\'s prompt. Empty = keep it.',
	},

	// ---- Start Draft ----
	{
		displayName: 'Start Options',
		name: 'startFields',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['run'], operation: ['startDraft'] } },
		options: [
			{
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
							{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true },
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								required: true,
								description: 'Template string only, such as $cred:&lt;name&gt;. Plaintext credentials never travel this wire path.',
							},
						],
					},
				],
				description: 'Per-tool named credentials for this run. A draft stores none, so they are given at start.',
			},
			{
				displayName: 'User Bearer',
				name: 'userBearer',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Per-end-user bearer substituted into MCP headers via ${run.user_bearer}',
			},
		],
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
			{ name: 'Configured (Draft, Not Started)', value: 'configured' },
			{ name: 'Failed', value: 'failed' },
			{ name: 'Rejected (At Review)', value: 'rejected' },
			{ name: 'Running', value: 'running' },
		],
		description: 'Filter the listing by run status. Configured and Rejected need loomcycle ≥ v1.93.',
	},
];
