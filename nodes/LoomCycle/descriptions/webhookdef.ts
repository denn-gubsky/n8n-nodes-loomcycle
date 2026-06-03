import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `webhookDef` resource — inbound webhook
 * endpoint management (RFC H, loomcycle v0.14.x). 5 ops mapping to the
 * op-discriminated `client.webhookDef({op})` adapter call:
 *
 *   - Create / Fork / Get / List Versions / Retire
 *
 * A WebhookDef is a loomcycle-HOSTED HTTP endpoint: an external system POSTs
 * to it, and loomcycle spawns an agent run (or publishes to a channel) from
 * the request. This is the INBOUND direction — distinct from the Hook
 * resource, which registers OUTBOUND pre/post-tool callbacks loomcycle calls.
 *
 * The webhook body (agent / channel / enabled / auth / rate_limit /
 * payload_mapping / sync_response) is assembled into the `overlay`. Common
 * fields are structured; the nested blocks go in the Advanced Overlay JSON.
 *
 * Auth uses env-var REFERENCES (signing_secret_env / bearer_token_env)
 * resolved from loomcycle's own env — plaintext secrets never travel here.
 *
 * Op options array is alphabetised by name.
 */
export const webhookDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webhookDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Author a new inbound webhook endpoint',
				action: 'Create a webhook definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork a webhook definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get a webhook definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List webhook definition versions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire a webhook definition',
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
			show: { resource: ['webhookDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description: 'Webhook definition name — also the endpoint path segment loomcycle exposes for inbound POSTs',
	},

	// ---- Def ID (optional override for Retire) ----
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['webhookDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},

	// ---- Agent (Create) ----
	{
		displayName: 'Agent Name or ID',
		name: 'agent',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadAgents' },
		default: '',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create'] } },
		description:
			'Agent spawned when the webhook fires. Leave empty if the webhook publishes to a channel instead. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ---- Channel (Create, optional alternative to agent) ----
	{
		displayName: 'Channel Name or ID',
		name: 'channel',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadChannels' },
		default: '',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create'] } },
		description:
			'Channel the inbound payload is published to (instead of / in addition to spawning an agent). Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ---- Enabled (Create) ----
	{
		displayName: 'Enabled',
		name: 'enabled',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create'] } },
		description: 'Whether loomcycle serves this endpoint. Disable to author a webhook without arming it.',
	},

	// ---- Description (Create / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version. Helps audit the lineage later.',
	},

	// ---- Metadata (Create / Fork) ----
	// loomcycle v0.21: STATIC, operator-authored (trusted) metadata folded
	// into overlay.metadata → delivered as input.metadata (code-js) / a trusted
	// prompt block (LLM). Distinct from REQUEST-SOURCED metadata, which the
	// operator wires via payload_mapping `run_metadata.<name>` targets in the
	// Advanced Overlay below (untrusted — fenced in a <run_metadata> block).
	{
		displayName: 'Metadata (JSON)',
		name: 'metadata',
		type: 'json',
		default: '{}',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create', 'fork'] } },
		description:
			'Static non-secret metadata (JSON object) passed to the spawned agent as TRUSTED (loomcycle ≥ v0.21) — code-js reads `input.metadata`, LLMs get a trusted prompt block. To instead source metadata from the inbound request, add `payload_mapping` entries with `run_metadata.&lt;name&gt;` targets in the Advanced Overlay (those arrive UNTRUSTED, fenced). Not for secrets — use Per-Delivery Credentials.',
	},

	// ---- Per-delivery credentials (Create / Fork) — ScheduleDef parity (v0.21) ----
	// Template-string values only (e.g. ${LOOMCYCLE_FOO}); plaintext secrets
	// never travel this wire path (CLAUDE.md §security). Folded into
	// overlay.user_credentials, matching ScheduleDef's Per-Fire Credentials.
	{
		displayName: 'Per-Delivery Credentials',
		name: 'userCredentials',
		type: 'fixedCollection',
		placeholder: 'Add Credential',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create', 'fork'] } },
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
							'Template string only (e.g. `${LOOMCYCLE_GITHUB_TOKEN}`). Plaintext credentials never travel this wire path. A live per-delivery `user_credentials.&lt;name&gt;` in the payload mapping overrides this.',
					},
				],
			},
		],
		description:
			'Named credentials (RFC F) injected when the webhook spawns a run — parity with ScheduleDef (loomcycle ≥ v0.21). Template strings only. Folded into the overlay as `user_credentials`.',
	},

	// ---- Overlay JSON (Create = advanced; Fork = full diff) ----
	{
		displayName: 'Advanced Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create', 'fork'] } },
		description:
			'Nested webhook fields as JSON — `auth` ({kind, algorithm, header, signing_secret_env, bearer_token_env}), `rate_limit` ({requests_per_minute, burst}), `payload_mapping` (map JSONPath → targets; `run_metadata.&lt;name&gt;` targets feed the agent UNTRUSTED request-sourced metadata; `user_credentials.&lt;name&gt;` targets feed per-delivery tokens), `sync_response` ({enabled, timeout_ms}). For Fork this is the diff merged onto the parent. The structured fields above (agent/channel/enabled, Metadata, Per-Delivery Credentials) override matching keys here on Create.',
	},

	// ---- Env-var hint notice (Create) ----
	{
		displayName: 'Loomcycle resolves auth secrets (signing_secret_env / bearer_token_env) from its OWN env at request time — set those env vars on the loomcycle deployment. Plaintext secrets are never accepted here.',
		name: 'envVarNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create'] } },
	},

	// ---- Promote-after-create (Create / Fork) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['webhookDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately so the endpoint goes live',
	},
];
