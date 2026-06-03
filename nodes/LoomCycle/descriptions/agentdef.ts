import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `agentDef` resource — substrate-admin
 * management of versioned agent definitions (v0.8.5+, content_sha256 in
 * v0.9.x). 7 ops mapping to the op-discriminated `client.agentDef({op})`
 * adapter call:
 *
 *   - Create   → register a new agent definition (description + overlay)
 *   - Fork     → branch from an existing def_id with an overlay diff
 *   - Get      → return the active row for a name
 *   - List     → list all versions for a name (lineage tree)
 *   - Promote  → make a specific def_id the active version
 *   - Retire   → mark a def_id (or name's active) as retired
 *   - Verify   → content_sha256 comparison ("is my bundle deployed?")
 *
 * The substrate refuses scope-violating mutations via
 * `SubstrateToolRefusedError` (wired through helpers/errors.ts).
 *
 * Op options array is alphabetised by name.
 */
export const agentDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['agentDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register a new agent definition (initial version)',
				action: 'Create an agent definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork an agent definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get an agent definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List agent definition versions',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make a specific def_id the active version',
				action: 'Promote an agent definition',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire an agent definition',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Compare a content_sha256 against the deployed active row',
				action: 'Verify an agent definition hash',
			},
		],
		default: 'list',
	},

	// ---- Name (used by Get / List / Create / Retire / Verify) ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['agentDef'], operation: ['get', 'list', 'create', 'retire', 'verify'] },
		},
		description: 'Agent definition name (matches the agent\'s yaml frontmatter / .md filename stem)',
	},

	// ---- Def ID (used by Promote, optional override for Retire) ----
	{
		displayName: 'Def ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['promote'] } },
		description: 'Specific def_id to act on. Versions are returned by List Versions.',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['agentDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},

	// ---- Description (Create / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version. Helps audit the lineage later.',
	},

	// ---- Provider (Create / Fork) ----
	// Folded into overlay.provider by executeAgentDef. Default '' leaves the
	// provider unset so it falls through to the Overlay JSON / loomcycle
	// default (preserves the pre-existing create behaviour). Selecting
	// `code-js` marks this as a deterministic JavaScript agent (RFC J).
	{
		displayName: 'Provider',
		name: 'agentProvider',
		type: 'options',
		default: '',
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		options: [
			{
				name: 'Anthropic',
				value: 'anthropic',
				description: 'Anthropic Claude models',
			},
			{
				name: 'Code-JS (Deterministic JavaScript)',
				value: 'code-js',
				description:
					'Synthetic provider — the agent runs inline JavaScript instead of an LLM (RFC J). Enter the code below; it is ingested via code_body (loomcycle ≥ v0.20). Requires LOOMCYCLE_CODE_AGENTS_ENABLED=1 on the host.',
			},
			{
				name: 'DeepSeek',
				value: 'deepseek',
				description: 'DeepSeek models',
			},
			{
				name: 'Default (Set via Overlay JSON)',
				value: '',
				description: 'Leave the provider unset — configure it in the Overlay JSON below, or let loomcycle apply its default',
			},
			{
				name: 'Google Gemini',
				value: 'gemini',
				description: 'Google Gemini models',
			},
			{
				name: 'Ollama',
				value: 'ollama',
				description: 'Local Ollama models',
			},
			{
				name: 'OpenAI',
				value: 'openai',
				description: 'OpenAI models',
			},
		],
		description:
			'Optional provider for this agent definition, folded into the overlay as `provider`. Providers are operator-defined in loomcycle.yaml; for any not listed, set `provider` in the Overlay JSON instead. The model still comes from the Overlay JSON (omit it for code-js).',
	},

	// ---- code-js JavaScript body (Create / Fork, provider=code-js) ----
	// v0.20.0 (commit 1c896c2): code-js JS is ingested INLINE via
	// overlay.code_body — no host filesystem bind. executeAgentDef folds this
	// field into overlay.code_body. jsEditor (not codeNodeEditor) gives a plain
	// JS editor WITHOUT n8n's $json/$input autocomplete, which would be
	// misleading for loomcycle-runtime JS. Empty ⇒ loomcycle falls back to the
	// host agent_code/<name>/index.js path (inline wins when present).
	{
		displayName: 'JavaScript Code',
		name: 'code',
		type: 'string',
		typeOptions: { editor: 'jsEditor', rows: 12 },
		default: '',
		displayOptions: {
			show: { resource: ['agentDef'], operation: ['create', 'fork'], agentProvider: ['code-js'] },
		},
		description:
			'Inline JavaScript source for this code-js agent, ingested via `code_body` (loomcycle ≥ v0.20). It is compiled + content-hashed at registration. Leave empty to fall back to `agent_code/&lt;name&gt;/index.js` on the host.',
	},

	// ---- code-js gate reminder (Create / Fork, provider=code-js) ----
	{
		displayName: 'Requires Code Agents Enabled on Loomcycle',
		name: 'codeJsNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: { resource: ['agentDef'], operation: ['create', 'fork'], agentProvider: ['code-js'] },
		},
		description:
			'The loomcycle host must run with `LOOMCYCLE_CODE_AGENTS_ENABLED=1` or registration is refused. Inline code is operator-trust (same posture as the Bash tool), compiled at create, and capped at ~256 KB. Leave the model unset in the Overlay JSON.',
	},

	// ---- Overlay JSON (Create / Fork) ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description:
			'JSON object containing the agent\'s content-bearing fields (e.g. model, max_iterations, allowed_tools, system_prompt). For Fork this is merged onto the parent. For Create this defines the initial row. The Provider dropdown above overrides any `provider` key set here.',
	},

	// ---- Promote-After-Create (Create / Fork) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately. If false, the new row exists but no agent uses it until a separate Promote call.',
	},

	// ---- Content SHA256 (Verify) ----
	{
		displayName: 'Content SHA256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['verify'] } },
		description: 'Local content_sha256 (typically from `loomcycle hash agent &lt;path&gt;`) to compare against the deployed active row',
	},
];
