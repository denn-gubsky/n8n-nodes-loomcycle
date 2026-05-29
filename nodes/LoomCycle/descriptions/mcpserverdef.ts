import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `mcpServerDef` resource — dynamic MCP
 * server registration (loomcycle v0.9.2+, PR #177). 8 ops mapping to
 * `client.mcpServerDef({op})`:
 *
 *   - Register (create)   → register an HTTP/Streamable-HTTP MCP server
 *   - Fork                → branch from an existing def_id
 *   - Get                 → return the active row for a name
 *   - List Versions       → list all versions for a name
 *   - Promote             → make a specific def_id the active version
 *   - Retire              → unregister; closes pool entry; in-flight calls complete
 *   - Rediscover          → refresh cached discovered_tools (re-runs tools/list)
 *   - Verify              → content_sha256 comparison
 *
 * Hard constraints enforced substrate-side:
 *   - Transport must be HTTP or Streamable-HTTP (stdio rejected — yaml-only).
 *   - URL hostname must be in operator's HTTPHostAllowlist (SSRF defence).
 *   - Name collisions with static yaml mcp_servers entries are refused.
 *
 * Headers carry the v0.8.14 `${LOOMCYCLE_*}` / `${run.user_bearer}`
 * substitution patterns; n8n nodes accept TEMPLATE STRINGS only —
 * plaintext credentials never travel through this wire path. The UI
 * surfaces a "Required env vars on the loomcycle deployment" notice
 * extracted from the headers via helpers/envVarHints.ts.
 *
 * Op options array is alphabetised by name.
 */
export const mcpServerDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['mcpServerDef'] } },
		options: [
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with a partial overlay',
				action: 'Fork an MCP server definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get an MCP server definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name',
				action: 'List MCP server definition versions',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make a specific def_id the active version',
				action: 'Promote an MCP server definition',
			},
			{
				name: 'Rediscover',
				value: 'rediscover',
				description: 'Refresh the cached discovered_tools snapshot (re-runs tools/list)',
				action: 'Rediscover MCP server tools',
			},
			{
				name: 'Register',
				value: 'create',
				description: 'Register a new HTTP / Streamable-HTTP MCP server',
				action: 'Register an MCP server',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Unregister; closes pool entry. In-flight calls complete.',
				action: 'Retire an MCP server definition',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Compare a content_sha256 against the deployed active row',
				action: 'Verify an MCP server definition hash',
			},
		],
		default: 'create',
	},

	// ---- Name (Register — free text, since the registration is new) ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create'] } },
		description: 'MCP server registration name — referenced by agents as `mcp__&lt;name&gt;__&lt;tool&gt;` in allowed_tools',
	},

	// ---- Name (manage ops — dropdown of existing yaml + dynamic MCP servers) ----
	{
		displayName: 'Name or ID',
		name: 'name',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadMcpLibrary' },
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['mcpServerDef'],
				operation: ['get', 'list', 'retire', 'rediscover', 'verify'],
			},
		},
		description:
			'MCP server to act on — merged from loomcycle.yaml + the MCPServerDef registry. Or specify a name dynamically via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ---- Def ID (Promote / Retire-by-id) ----
	{
		displayName: 'Def ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['promote'] } },
		description: 'Specific def_id to act on',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. Provide the overlay below to specify the diff.',
	},

	// ---- Transport (Register only — Fork inherits from parent unless overlay sets it) ----
	{
		displayName: 'Transport',
		name: 'transport',
		type: 'options',
		default: 'streamable-http',
		required: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create'] } },
		options: [
			{ name: 'HTTP', value: 'http', description: 'Classic JSON-RPC over HTTP POST' },
			{ name: 'Streamable HTTP', value: 'streamable-http', description: 'MCP Streamable HTTP transport (recommended)' },
		],
		description: 'Transport for the MCP server. Stdio is intentionally not supported — register stdio MCPs in loomcycle.yaml instead.',
	},

	// ---- URL (Register only — Fork inherits / overrides via overlay) ----
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://mcp.example.com/v1',
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create'] } },
		description: 'MCP server endpoint URL. The hostname must be in loomcycle\'s HTTPHostAllowlist (SSRF defence).',
	},

	// ---- Headers (Register only) ----
	{
		displayName: 'Headers',
		name: 'headers',
		type: 'fixedCollection',
		placeholder: 'Add Header',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create'] } },
		options: [
			{
				name: 'header',
				displayName: 'Header',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						description: 'Header name (e.g. Authorization)',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						required: true,
						description:
							'Header value. Supports `${LOOMCYCLE_FOO}` env-var substitution and `${run.user_bearer:-FALLBACK}` per-run substitution.',
					},
				],
			},
		],
		description:
			'HTTP headers sent on every MCP call. Use template strings (`${LOOMCYCLE_FOO_TOKEN}`) to reference env vars set on the loomcycle deployment — plaintext credentials never travel through this wire path.',
	},

	// ---- Env-var hint notice (Register only) ----
	{
		displayName: 'Required Env Vars on Loomcycle',
		name: 'envVarNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create'] } },
		description:
			'Loomcycle substitutes `${LOOMCYCLE_*}` tokens in header values from its own env at request time. Set these env vars on the loomcycle deployment before registering — the node validates the substitution at registration time but will not transmit plaintext credentials.',
	},

	// ---- Description (Register / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this MCP server registration',
	},

	// ---- Overlay JSON (Fork only — Register uses the structured fields above) ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['fork'] } },
		description: 'JSON diff applied on top of the parent row (e.g. `{"URL": "https://staging.example.com"}` to override the URL)',
	},

	// ---- Promote-After-Register (Register only) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new registration to active immediately. Defaults true for Register — typical operator intent is "register and use".',
	},

	// ---- Content SHA256 (Verify) ----
	{
		displayName: 'Content SHA256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['mcpServerDef'], operation: ['verify'] } },
		description: 'Local content_sha256 to compare against the deployed active row',
	},
];
