import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `hook` resource — HookDef (RFC DK,
 * loomcycle ≥ v1.96): reusable, versioned hook definitions.
 *
 * loomcycle v1.97 removed the old global hook registration (POST /v1/hooks,
 * `registerHook`) together with its table, so this resource now manages
 * definitions instead. A HookDef fires on nothing by itself: an agent
 * definition (`hooks:` / a `tools[]` entry), a team state or a single run names
 * it. The natural n8n pairing is a `http` body whose URL is the
 * LoomCycle: Hook Call trigger, which turns an n8n workflow into the policy that
 * answers the hook.
 *
 * Create and Fork take the typed overlay (`HookDefOverlay` is closed: the server
 * refuses any key it does not know). Every create mints a new version, so the
 * default Create path is `ensureHookDef` — register only when the definition
 * changed — which keeps a re-run workflow from piling up identical versions.
 *
 * Op options array is alphabetised by name.
 */

const TOOL_EVENTS = ['pre', 'post', 'post_failure'];

export const hookOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['hook'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Define a hook (registers a new version only when the definition changed)',
				action: 'Create a hook definition',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a hook name and every one of its versions',
				action: 'Delete a hook definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Create a new version that replaces some fields of an existing one',
				action: 'Fork a hook definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Read the active version of a hook, or one version by definition ID',
				action: 'Get a hook definition',
			},
			{
				name: 'List Names',
				value: 'listNames',
				description: 'List every hook name with its version count and active version',
				action: 'List hook names',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List every version of one hook, newest first',
				action: 'List hook versions',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make one version the active one',
				action: 'Promote a hook version',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Retire a version, or bring a retired one back',
				action: 'Retire a hook version',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Check whether a hook is deployed and whether a content hash matches its active version',
				action: 'Verify a hook definition',
			},
		],
		default: 'create',
	},

	// ---- Name (create / fork / delete / list / verify; optional on get) ----
	{
		displayName: 'Hook Name or ID',
		name: 'hookName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadHookDefNames' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['fork', 'delete', 'list', 'verify'] } },
		description:
			'The hook to act on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'n8n-web-gate',
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		description:
			'The name agents, teams and runs use to attach this hook. Segments of letters, digits, _ and - joined by /. Creating an existing name adds a new version of it.',
	},
	{
		displayName: 'Hook Name or ID',
		name: 'hookName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadHookDefNames' },
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['get'] } },
		description:
			'Read this hook\'s active version. Leave empty and fill Definition ID to read one specific version instead. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Delete Removes Every Version',
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['delete'] } },
		description:
			'Delete removes the name and all of its versions. A run that started with one of them stops when it resumes. To take one version out of use, Retire it instead.',
	},

	// ---- Definition ID (get / promote / retire) ----
	{
		displayName: 'Definition ID',
		name: 'defId',
		type: 'string',
		default: '',
		placeholder: 'hdf_…',
		displayOptions: { show: { resource: ['hook'], operation: ['get'] } },
		description: 'One specific version to read. Takes precedence over the name.',
	},
	{
		displayName: 'Definition ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'hdf_…',
		displayOptions: { show: { resource: ['hook'], operation: ['promote', 'retire'] } },
		description: 'The version, as returned by Create, Fork or List Versions',
	},
	{
		displayName: 'Retired',
		name: 'retired',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['hook'], operation: ['retire'] } },
		description: 'Whether to retire the version. Turn off to bring a retired version back.',
	},

	// ---- Create: the definition ----
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		default: 'pre',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		options: [
			{ name: 'Agent Start', value: 'agent_start', description: 'Before the run\'s first model call. Answers: deny, or add context.' },
			{ name: 'Agent Stop', value: 'agent_stop', description: 'When the agent is about to finish. Answers: block (keep working), hold for review, or allow.' },
			{ name: 'Channel Publish', value: 'channel_publish', description: 'Each message published to a channel that attaches this hook. Answers: release, rewrite, drop or hold.' },
			{ name: 'Post (After Tool Call)', value: 'post', description: 'After a matched tool call. Can replace the result or add context.' },
			{ name: 'Post Compact', value: 'post_compact', description: 'After the conversation was compacted. Observe only.' },
			{ name: 'Post Failure (After a Failed Tool Call)', value: 'post_failure', description: 'After a matched tool call failed. Can replace the result or add context.' },
			{ name: 'Pre (Before Tool Call)', value: 'pre', description: 'Before a matched tool call. Can rewrite its input or deny it.' },
			{ name: 'Pre Compact', value: 'pre_compact', description: 'Before the conversation is compacted. Answers: deny.' },
			{ name: 'Run End', value: 'run_end', description: 'When the run has ended. Observe only.' },
			{ name: 'Sub-Agent Start', value: 'subagent_start', description: 'Before a sub-agent starts. Answers: deny, or add context.' },
			{ name: 'Sub-Agent Stop', value: 'subagent_stop', description: 'When a sub-agent finishes. Answers: deny, or add context.' },
		],
		description: 'What the hook answers. Wherever it is attached, it is attached under this event.',
	},
	{
		displayName: 'Match Tools',
		name: 'matchTools',
		type: 'string',
		default: '',
		placeholder: 'WebFetch, mcp__github__*',
		displayOptions: { show: { resource: ['hook'], operation: ['create'], event: TOOL_EVENTS } },
		description: 'Comma-separated tool names or trailing-* globs this hook wraps. Empty = every tool.',
	},
	{
		displayName: 'Body',
		name: 'bodyKind',
		type: 'options',
		default: 'http',
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		options: [
			{ name: 'Webhook', value: 'http', description: 'Loomcycle POSTs each call to a URL (for example a LoomCycle: Hook Call trigger) and acts on the answer' },
			{ name: 'Code (JavaScript)', value: 'code-js', description: 'Loomcycle runs a script in-process. Needs LOOMCYCLE_CODE_HOOKS_ENABLED=1.' },
		],
		description: 'How the hook decides',
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://n8n.example.com/webhook/…/hook',
		displayOptions: { show: { resource: ['hook'], operation: ['create'], bodyKind: ['http'] } },
		description:
			'Http:// or https:// URL loomcycle POSTs each call to. Copy it from a LoomCycle: Hook Call trigger to let that workflow answer. A private address (LAN, tailnet) must be on the loomcycle host\'s LOOMCYCLE_HOOKS_PRIVATE_HOST_ALLOWLIST.',
	},
	{
		displayName: 'Signing Credential',
		name: 'signingCredential',
		type: 'string',
		default: '',
		placeholder: '$cred:n8n-hook-signing',
		displayOptions: { show: { resource: ['hook'], operation: ['create'], bodyKind: ['http'] } },
		description:
			'A stored loomcycle credential, written as $cred:&lt;name&gt;, whose value signs every call (loomcycle ≥ v1.113). A literal secret is refused. Store it with the LoomCycle Credential node from a LoomCycle Secret credential, and give the LoomCycle: Hook Call trigger the same LoomCycle Secret so it can reject calls that did not come from loomcycle. The credential must be usable for this URL: unrestricted, or with Allowed URLs covering it (https only). A compare-only credential cannot sign; a call it cannot sign is not sent, and Fail Mode decides.',
	},
	{
		displayName: 'Headers',
		name: 'headers',
		type: 'fixedCollection',
		placeholder: 'Add Header',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['hook'], operation: ['create'], bodyKind: ['http'] } },
		options: [
			{
				name: 'header',
				displayName: 'Header',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true },
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						required: true,
						description: 'Put secrets in a stored credential and write $cred:&lt;name&gt; here, never the literal value',
					},
				],
			},
		],
		description: 'Headers sent with every call. X-Loomcycle-Signature, X-Loomcycle-Hook and X-Loomcycle-Delivery are reserved.',
	},
	{
		displayName: 'Code',
		name: 'code',
		type: 'string',
		typeOptions: { editor: 'jsEditor', rows: 12 },
		default: 'function hook(ev) {\n  return {};\n}',
		displayOptions: { show: { resource: ['hook'], operation: ['create'], bodyKind: ['code-js'] } },
		description: 'A script defining function hook(ev) that returns the decision. An empty object lets the call through.',
	},
	{
		displayName: 'Fail Mode',
		name: 'failMode',
		type: 'options',
		default: 'open',
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		options: [
			{ name: 'Open (Let the Call Through)', value: 'open', description: 'A hook that errors, times out or answers badly is ignored' },
			{ name: 'Closed (Stop the Call)', value: 'closed', description: 'A hook that errors, times out or answers badly stops the call' },
		],
		description: 'What happens when the hook itself fails',
	},
	{
		displayName: 'Timeout (Ms)',
		name: 'timeoutMs',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		description: 'Webhook: the whole call (default 5 000, max 60 000). Code: each run of the script (default 50, max 1 000). 0 = the default.',
	},
	{
		displayName: 'Shown to Whoever It Stops',
		name: 'hookDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		description: 'A short explanation shown when this hook denies, holds or rewrites something, including to a tenant that did not write it. The body is never shown.',
	},
	{
		displayName: 'Only If Changed',
		name: 'onlyIfChanged',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['hook'], operation: ['create'] } },
		description:
			'Whether to skip the write when the active version already has this exact definition. On, re-running the workflow does not add identical versions, and a changed definition becomes active. Off, every run adds a version.',
	},
	{
		displayName: 'Promote',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['hook'], operation: ['create'], onlyIfChanged: [false] } },
		description: 'Whether to make the new version the active one',
	},

	// ---- Fork ----
	{
		displayName: 'Parent Definition ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['fork'] } },
		description: 'The version to start from. Empty = the active version of the name.',
	},
	{
		displayName: 'Fields to Replace (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['fork'] } },
		description:
			'Top-level fields of the definition to replace: description, event, match, body, fail_mode, timeout_ms. A field set to null is cleared. Any other key is refused.',
	},
	{
		displayName: 'Promote',
		name: 'promote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['hook'], operation: ['fork'] } },
		description: 'Whether to make the fork the active version. Off by default: authoring and putting in force are two steps.',
	},

	// ---- Rationale (create / fork) ----
	{
		displayName: 'Rationale',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['create', 'fork'] } },
		description: 'Why this version exists. Stored on the version, not part of the definition, so changing only this is not a change.',
	},

	// ---- Verify ----
	{
		displayName: 'Content SHA-256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		placeholder: 'sha256:…',
		displayOptions: { show: { resource: ['hook'], operation: ['verify'] } },
		description: 'Hash to compare with the active version. Leave empty just to learn whether the hook is deployed.',
	},
];
