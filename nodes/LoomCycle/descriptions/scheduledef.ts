import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `scheduleDef` resource — substrate-native
 * scheduled-run management (RFC E, loomcycle v0.12.x). 5 ops mapping to the
 * op-discriminated `client.scheduleDef({op})` adapter call:
 *
 *   - Create  → author a new scheduled-run definition (cron + agent + prompt)
 *   - Fork    → branch a template per-user with their bearer + tier cron
 *   - Get     → return the active row for a name
 *   - List    → list all versions for a name (lineage tree)
 *   - Retire  → mark a def_id (or name's active row) as retired
 *
 * NOTE: ScheduleDef has NO `promote` op and NO `verify` op (unlike AgentDef /
 * MCPServerDef) — forks auto-promote by default per RFC E's worked example,
 * and there is no content_sha256 in the v1.x schema. A `Promote to Active`
 * toggle on Create/Fork still rides through `SubstrateToolInput.promote`.
 *
 * This is operator-admin scheduling of the SUBSTRATE's own schedules (the
 * loomcycle sweeper fires them autonomously) — NOT a workflow scheduler
 * inside n8n. Use n8n's own Cron/Schedule trigger for n8n-side timing. A
 * schedule firing lands as a Run state caught by the LoomCycle: Run
 * Completed trigger; no dedicated trigger node is needed here.
 *
 * The schedule body (agent / prompt / cron / user_id / user_tier /
 * credentials) is assembled into the `overlay` JSON object — the same
 * content-bearing field AgentDef/SkillDef use — by executeScheduleDef.
 *
 * Op options array is alphabetised by name.
 */
export const scheduleDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['scheduleDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Author a new scheduled-run definition (cron + agent + prompt)',
				action: 'Create a schedule definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch a template per-user with their bearer + tier cron',
				action: 'Fork a schedule definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get a schedule definition',
			},
			{
				name: 'Get State',
				value: 'getState',
				description: 'Read a schedule\'s runtime state: next fire, runs in flight, last status, missed slots (loomcycle ≥ v1.113)',
				action: 'Get the state of a schedule',
			},
			{
				name: 'List All',
				value: 'listAll',
				description: 'List every schedule, the loomcycle.yaml ones included, with its active version',
				action: 'List all schedules',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List schedule definition versions',
			},
			{
				name: 'Pause',
				value: 'pause',
				description: 'Stop a schedule from firing until it is resumed',
				action: 'Pause a schedule',
			},
			{
				name: 'Resume',
				value: 'resume',
				description: 'Let a paused schedule fire again',
				action: 'Resume a schedule',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire a schedule definition',
			},
			{
				name: 'Run Now',
				value: 'runNow',
				description: 'Fire a schedule once on the scheduler\'s next tick; the regular cadence continues',
				action: 'Run a schedule now',
			},
		],
		default: 'list',
	},

	// ---- Name (Get / List / Create / Retire) ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['scheduleDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description: 'Schedule definition name (matches the schedule\'s yaml key / unique substrate name)',
	},

	// ---- Def ID (optional override for Retire) ----
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Def ID for the runtime ops (Get State / Run Now / Pause / Resume) ----
	{
		displayName: 'Def ID',
		name: 'scheduleDefId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'def_…',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['getState', 'runNow', 'pause', 'resume'] } },
		description: 'The schedule\'s active def_id, as Get, List All or Create return it',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['fork'] } },
		description: 'Def_id of the template row to fork. The new row inherits all fields not present in the overlay.',
	},

	// ---- Schedule / cron (Create) ----
	{
		displayName: 'Cron Expression',
		name: 'schedule',
		type: 'string',
		default: '',
		required: true,
		placeholder: '0 9 * * 1-5',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'] } },
		description: 'Standard cron expression the loomcycle sweeper fires on. Validated server-side — an invalid expression is refused with a parse error.',
	},

	// ---- Delivery (Create) ----
	{
		displayName: 'Each Fire',
		name: 'delivery',
		type: 'options',
		default: 'run',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'] } },
		options: [
			{ name: 'Runs an Agent', value: 'run', description: 'Spawn the agent below with the prompt below' },
			{ name: 'Publishes to a Channel', value: 'channel', description: 'Post a tick to a channel and start no run (loomcycle ≥ v1.77)' },
			{ name: 'Starts a Team Walk', value: 'team', description: 'Start a detached walk of a team (loomcycle ≥ v1.104)' },
		],
		description: 'What the schedule does each time it fires',
	},
	{
		displayName: 'Channel',
		name: 'deliveryChannel',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['channel'] } },
		description: 'The channel each fire publishes a tick to',
	},
	{
		displayName: 'Team Name or ID',
		name: 'deliveryTeam',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadTeams' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['team'] } },
		description:
			'The team each fire walks. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Team Input',
		name: 'teamInput',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['team'] } },
		description: 'The task handed to the walk\'s entry state on each fire',
	},
	{
		displayName: 'Team Variables',
		name: 'teamVars',
		type: 'fixedCollection',
		placeholder: 'Add Variable',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['team'] } },
		options: [
			{
				name: 'variable',
				displayName: 'Variable',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
		description: 'Literal values for the team\'s declared variables on every walk',
	},

	// ---- Agent (Create) — reuse the library dropdown ----
	{
		displayName: 'Agent Name or ID',
		name: 'agent',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadAgents' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['run'] } },
		description:
			'Agent the schedule spawns on each fire — merged from loomcycle.yaml + AgentDef registry. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ---- Prompt (Create) ----
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'], delivery: ['run'] } },
		description: 'Prompt sent to the agent on each scheduled fire — wrapped as a trusted-text segment',
	},

	// ---- Description (Create / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version. Helps audit the lineage later.',
	},

	// ---- Per-fire credentials (Create / Fork) ----
	// Template-string values only (e.g. ${LOOMCYCLE_FOO}); plaintext
	// secrets must never travel this wire path (CLAUDE.md §security).
	{
		displayName: 'Per-Fire Credentials',
		name: 'userCredentials',
		type: 'fixedCollection',
		placeholder: 'Add Credential',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create', 'fork'] } },
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
						description:
							'Template string only (e.g. `${LOOMCYCLE_SLACK_TOKEN}`). Forking a template that declares required_credentials must supply every key here — loomcycle loud-fails the fork otherwise.',
					},
				],
			},
		],
		description:
			'Per-fire named credentials (RFC F) the scheduler injects when building each run. Template strings only — plaintext credentials never travel through this wire path.',
	},

	// ---- Metadata (Create / Fork) ----
	// loomcycle v0.21: static non-secret metadata folded into overlay.metadata,
	// delivered to the agent on each fire (input.metadata for code-js; trusted
	// prompt block for LLMs). Per-fork override is the canonical use — e.g. a
	// distinct `repo` per fork of one template.
	{
		displayName: 'Metadata (JSON)',
		name: 'metadata',
		type: 'json',
		default: '{}',
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create', 'fork'] } },
		description:
			'Non-secret structured metadata (JSON object) passed to the agent on each scheduled fire (loomcycle ≥ v0.21). A code-js agent reads it as `input.metadata`; an LLM agent receives it as a trusted prompt block. Override per fork (e.g. a different `repo` per tenant). Not for secrets — use Per-Fire Credentials.',
	},

	// ---- Overlay JSON (Fork) — advanced field diff ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['fork'] } },
		description:
			'JSON diff merged onto the parent row (e.g. `{"schedule":"0 6 * * *","user_id":"u_42","user_tier":"high"}`). Per-Fire Credentials above are merged in as `user_credentials`, and Metadata as `metadata`.',
	},

	// ---- Additional fields (Create) — advanced schedule knobs ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create'] } },
		options: [
			{
				displayName: 'Catch-Up Max',
				name: 'catchUpMax',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description:
					'After an outage: 0 (the default) fires once for all the missed slots and records how many were missed; N (up to 1 000) replays the newest N slots, each run marked catch_up',
			},
			{
				displayName: 'Concurrency Policy',
				name: 'concurrencyPolicy',
				type: 'options',
				default: '',
				options: [
					{ name: 'Allow (Start Another)', value: 'allow' },
					{ name: 'Default (Forbid)', value: '' },
					{ name: 'Forbid (Skip the Slot)', value: 'forbid' },
					{ name: 'Replace (Cancel the Running One)', value: 'replace' },
				],
				description:
					'What a fire does while the previous run is still going (loomcycle ≥ v1.105). Not for channel delivery, which starts no run.',
			},
			{
				displayName: 'Enabled',
				name: 'enabled',
				type: 'boolean',
				default: true,
				description: 'Whether the sweeper fires this schedule. Disable to author a schedule without arming it.',
			},
			{
				displayName: 'Max Fires',
				name: 'maxFires',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Stop after this many fires. 0 = no limit. A skipped overlapping slot does not count.',
			},
			{
				displayName: 'Required Credentials (Comma-Separated)',
				name: 'requiredCredentials',
				type: 'string',
				default: '',
				description: 'Credential keys a fork of this template must supply. Empty = none required.',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'America/New_York',
				description: 'IANA timezone the cron expression is evaluated in. Empty = the loomcycle deployment default.',
			},
			{
				displayName: 'Treat Prompt as Untrusted',
				name: 'treatPromptAsUntrusted',
				type: 'boolean',
				default: false,
				description: 'Whether to wrap the prompt as an untrusted-block segment instead of trusted-text. Enable when the prompt embeds end-user input.',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'User_id the scheduled run executes as. Empty = the schedule fires unscoped.',
			},
			{
				displayName: 'User Tier',
				name: 'userTier',
				type: 'string',
				default: '',
				description: 'User tier for the scheduled run (selects the cron from user_tier_schedules on tier-templated defs)',
			},
		],
	},

	// ---- Promote-after-create (Create / Fork) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['scheduleDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately. Defaults true — forks auto-promote per RFC E\'s worked example.',
	},
];
