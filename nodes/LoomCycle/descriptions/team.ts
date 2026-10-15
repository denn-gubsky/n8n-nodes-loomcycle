import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `team` resource — Agent Teams (RFC AP,
 * loomcycle ≥ v1.17.1). A TeamDef is a versioned STATE-MACHINE GRAPH of agent
 * roles: states carry a handler (a single agent, a parallel fan-out, a
 * consolidator, or a terminal) and transitions are gated on each state's
 * outcome. It is the closest thing loomcycle has to an n8n workflow, executed
 * inside the substrate rather than on the canvas.
 *
 * Unlike the other Def families this maps to TYPED adapter methods (create,
 * fork, promote, retire, verify, list versions, run, the walk's breakpoints and
 * its team channels) rather than one op-discriminated call, so it does not
 * reuse `buildSubstrateInput`. Promote / Retire / Verify have been on the adapter
 * since loomcycle v1.77 (the node exposes them from 4.2.0); verifying an unsaved
 * graph needs v1.105, team channels v1.108, fork-with-promote v1.113.
 *
 * A walk is a run (loomcycle ≥ v1.77): Run returns its `run_id`, which Cancel
 * Walk, List Walk Runs and the breakpoint ops take.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const teamOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['team'] } },
		options: [
			{
				name: 'Cancel Walk',
				value: 'cancelWalk',
				description: 'Stop a running walk and every agent it started, by the walk\'s run ID',
				action: 'Cancel a team walk',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Author a new team from a workflow graph (made active unless Promote is off)',
				action: 'Create a team',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Hard-remove a whole team by name — every version plus the active pointer',
				action: 'Delete a team',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Save an edited graph as a new version of an existing team (not made active unless Promote is on)',
				action: 'Fork a team',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Fetch one version\'s full record by def_id, including its editable graph',
				action: 'Get a team version',
			},
			{
				name: 'Get Breakpoints',
				value: 'getBreakpoints',
				description: 'Read the breakpoints armed on a live walk',
				action: 'Get the breakpoints of a walk',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List every team the caller may see, each with its version roll-up',
				action: 'List teams',
			},
			{
				name: 'List Channels',
				value: 'listChannels',
				description: 'List the channels a team declares, with message and held counts',
				action: 'List the channels of a team',
			},
			{
				name: 'List Versions',
				value: 'listVersions',
				description: 'List every version of one team, newest first',
				action: 'List the versions of a team',
			},
			{
				name: 'List Walk Runs',
				value: 'listWalkRuns',
				description: 'List the runs of one walk: the walk itself and every member, oldest first',
				action: 'List the runs of a walk',
			},
			{
				name: 'Peek Channel',
				value: 'peekChannel',
				description: 'Read a team channel\'s messages without consuming them',
				action: 'Peek a team channel',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make one version the team\'s active one, the version a run by name executes',
				action: 'Promote a team version',
			},
			{
				name: 'Release Channel',
				value: 'releaseChannel',
				description: 'Deliver messages a held team channel is storing',
				action: 'Release a team channel',
			},
			{
				name: 'Render Diagram',
				value: 'renderDiagram',
				description: 'Render the team\'s ACTIVE version as a Mermaid state diagram',
				action: 'Render a team diagram',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Retire a version, or bring a retired one back',
				action: 'Retire a team version',
			},
			{
				name: 'Run',
				value: 'run',
				description: 'Walk the state graph, spawning each state\'s agent until a terminal state',
				action: 'Run a team',
			},
			{
				name: 'Set Breakpoints',
				value: 'setBreakpoints',
				description: 'Replace the breakpoints armed on a live walk',
				action: 'Set the breakpoints of a walk',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Check a deployed team against a content hash, or check an unsaved graph before saving it',
				action: 'Verify a team',
			},
		],
		default: 'list',
	},

	// ---- Name: create / fork / delete / render ----
	{
		displayName: 'Team Name or ID',
		name: 'teamName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadTeams' },
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['team'],
				operation: [
					'fork',
					'delete',
					'renderDiagram',
					'listVersions',
					'verify',
					'listChannels',
					'peekChannel',
					'releaseChannel',
				],
			},
		},
		description:
			'Team to target. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		// Free text on Create: the team does not exist yet, so a dropdown of
		// existing names would be actively misleading.
		displayName: 'Team Name',
		name: 'teamName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['create'] } },
		description: 'Name for the new team. Must be unique within the tenant.',
	},

	// ---- Def ID: get ----
	{
		displayName: 'Def ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['get', 'promote', 'retire'] } },
		description: 'The team version, e.g. `tdf_…`. Create, Fork and List Versions return it.',
	},
	{
		displayName: 'Retired',
		name: 'retired',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['team'], operation: ['retire'] } },
		description: 'Whether to retire the version. Turn off to bring a retired version back.',
	},

	// ---- The graph ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		typeOptions: { rows: 12 },
		default:
			'{\n  "entry": "draft",\n  "states": [\n    { "state": "draft", "handler": { "kind": "agent", "agent": "researcher" } },\n    { "state": "done", "handler": { "kind": "terminal" } }\n  ],\n  "transitions": [\n    { "from": "draft", "to": "done", "on": "success" }\n  ]\n}',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['create', 'fork'] } },
		description:
			'The workflow graph. Keys: `entry` (the starting state ID), `states` (each `{state, handler}` where handler.kind is one of **agent** / **parallel** / **consolidator** / **terminal**), `transitions` (each `{from, to, on}`, gated on the source state\'s outcome such as `success` or `pushback`), plus optional `max_iterations` (per-state cycle cap; 0 = default) and `colors` (presentation only, excluded from the content hash). Validated server-side BEFORE any write — a dangling transition, a parallel state with no consolidator, or an unreachable state is refused rather than stored. On Fork, `states` and `transitions` replace the parent\'s wholesale; other top-level fields merge per-field.',
	},
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['create', 'fork'] } },
		description: 'Operator-visible rationale for this version',
	},
	{
		displayName: 'Promote',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['team'], operation: ['create'] } },
		description: 'Whether to make the new team active at once. Off = author it and put it in force later with Promote.',
	},
	{
		displayName: 'Promote',
		name: 'promote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['team'], operation: ['fork'] } },
		description:
			'Whether to make the fork the active version. Off (the default) leaves name-addressed operations (Run by name, Render Diagram) on the previous version until you Promote it; Run can still reach the fork by its def_id.',
	},
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['fork'] } },
		description: 'The version to fork. Empty = the team\'s active version.',
	},

	// ---- Verify ----
	{
		displayName: 'Check',
		name: 'verifyMode',
		type: 'options',
		default: 'hash',
		displayOptions: { show: { resource: ['team'], operation: ['verify'] } },
		options: [
			{ name: 'Deployed Version Against a Hash', value: 'hash', description: 'Drift check for a team kept in source control' },
			{ name: 'Unsaved Graph', value: 'draft', description: 'Every problem a save would hit, with a JSON path for each, without saving' },
		],
		description: 'What to verify',
	},
	{
		displayName: 'Content SHA-256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'sha256:…',
		displayOptions: { show: { resource: ['team'], operation: ['verify'], verifyMode: ['hash'] } },
		description: 'The hash to compare with the active version. A team that is not deployed answers deployed: false.',
	},
	{
		displayName: 'Graph (JSON)',
		name: 'draftOverlay',
		type: 'json',
		typeOptions: { rows: 10 },
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['verify'], verifyMode: ['draft'] } },
		description: 'The graph you are about to save, in the same shape as Create / Fork take',
	},
	{
		displayName: 'Check As',
		name: 'draftAs',
		type: 'options',
		default: 'create',
		displayOptions: { show: { resource: ['team'], operation: ['verify'], verifyMode: ['draft'] } },
		options: [
			{ name: 'Create', value: 'create' },
			{ name: 'Fork', value: 'fork' },
		],
		description: 'Whether the graph would be saved as a new team or as a fork of the existing one',
	},

	// ---- Run ----
	{
		displayName: 'Target By',
		name: 'runTargetBy',
		type: 'options',
		default: 'name',
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
		options: [
			{ name: 'Name (Active Version)', value: 'name' },
			{ name: 'Def ID (A Specific Version)', value: 'defId' },
		],
		description: 'Run the team\'s active version by name, or pin an exact version by def_id. Def ID is how you run an unpromoted fork.',
	},
	{
		displayName: 'Team Name or ID',
		name: 'runTeamName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadTeams' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['run'], runTargetBy: ['name'] } },
		description:
			'Team whose active version to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Def ID',
		name: 'runDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['run'], runTargetBy: ['defId'] } },
		description: 'Exact team version to run, e.g. `tdf_…`',
	},
	{
		displayName: 'Input',
		name: 'input',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
		description: 'The initial task handed to the entry state\'s agent',
	},
	{
		displayName: 'Board Options',
		name: 'boardOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
		options: [
			{
				displayName: 'Board Chunk ID',
				name: 'boardChunkId',
				type: 'string',
				default: '',
				description:
					'Bind the walk to a Document chunk task board (RFC BT P4). Each transition persists `chunk.status` = the current team state, so progress is durable — and a later Run RESUMES from that persisted status instead of restarting. Omit for an ephemeral run.',
			},
			{
				displayName: 'Board Scope',
				name: 'boardScope',
				type: 'options',
				default: 'user',
				options: [
					{ name: 'Agent', value: 'agent' },
					{ name: 'User', value: 'user' },
				],
				description: 'Document scope of the board chunk. Only agent and user — a task board cannot live in tenant scope.',
			},
		],
	},
	{
		displayName: 'Wait for the Walk to Finish',
		name: 'waitForWalk',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
		description:
			'Whether to block until the walk ends and return its per-state trace. Off = start it detached and return its run_id at once (loomcycle ≥ v1.77); the walk carries on by itself — follow it with List Walk Runs, the Run Completed trigger, or Cancel Walk.',
	},
	{
		displayName: 'Variables',
		name: 'runVars',
		type: 'fixedCollection',
		placeholder: 'Add Variable',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
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
		description:
			"Set the team's declared variables for this walk (`${var.&lt;name&gt;}`; loomcycle ≥ v1.104). Only names the team declares are accepted; the rest keep their defaults. At most 4 KiB in all.",
	},
	{
		displayName: 'Walk Options',
		name: 'walkOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
		options: [
			{
				displayName: 'Ask a Human at the Iteration Cap',
				name: 'interruptOnCap',
				type: 'boolean',
				default: false,
				description:
					'Whether a state that reaches its iteration cap asks a human (an interruption) to continue, reroute or abort, instead of ending the walk with iteration_cap. An unanswered ask aborts the walk.',
			},
			{
				displayName: 'Breakpoints (Comma-Separated)',
				name: 'breakpoints',
				type: 'string',
				default: '',
				placeholder: 'draft, review:review, wave',
				description: 'Pause the walk at these points: `&lt;state&gt;` (before it dispatches), `&lt;state&gt;:review` (hold its answer) or `wave`',
			},
			{
				displayName: 'Hold States for Review (Comma-Separated)',
				name: 'reviewStates',
				type: 'string',
				default: '',
				description: 'Hold the answer of each run these states start for an operator\'s verdict (Run → Review on the member\'s run_id)',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'Makes starting the walk safe to retry: a second Run with the same key starts nothing and returns the walk the key holds, marked deduplicated. Not with a board chunk.',
			},
			{
				displayName: 'Review Time Limit (Seconds)',
				name: 'reviewTtlSeconds',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'How long each review hold waits before it ends as rejected. 0 = the server default.',
			},
		],
	},
	{
		displayName: 'A walk run to the end spawns an agent per state and can take long. It runs under the same admission a normal run gets (token budget, operator-key scope, depth), so a budget ceiling stops it. Bind a Board Chunk ID to make progress durable and resumable, or turn off Wait for the Walk to Finish.',
		name: 'runDurationNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
	},

	// ---- Walk ops: the walk's run_id ----
	{
		displayName: 'Walk Run ID',
		name: 'walkRunId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['team'], operation: ['cancelWalk', 'listWalkRuns', 'getBreakpoints', 'setBreakpoints'] },
		},
		description: 'The walk\'s run_id, as Run returns it',
	},
	{
		displayName: 'Breakpoints (Comma-Separated)',
		name: 'setBreakpointList',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['setBreakpoints'] } },
		description: 'The whole new set: `&lt;state&gt;`, `&lt;state&gt;:before_dispatch`, `&lt;state&gt;:review` or `wave`. Empty = clear them all.',
	},
	{
		displayName: 'Review Time Limit (Seconds)',
		name: 'setBreakpointTtl',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['team'], operation: ['setBreakpoints'] } },
		description: 'Change the review deadline of the walk\'s holds. 0 = leave it.',
	},
	{
		displayName: 'Page Size',
		name: 'pageSize',
		type: 'number',
		default: 100,
		typeOptions: { minValue: 1, maxValue: 1000 },
		displayOptions: { show: { resource: ['team'], operation: ['listWalkRuns'] } },
		description: 'How many runs to return (at most 1 000)',
	},
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['listWalkRuns'] } },
		description: 'The next_cursor of a previous page. Empty = the first page.',
	},

	// ---- Team channels ----
	{
		displayName: 'Channel Name',
		name: 'teamChannel',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['peekChannel', 'releaseChannel'] } },
		description: 'The channel\'s local name inside the team, as List Channels shows it',
	},
	{
		displayName: 'Channel Options',
		name: 'channelOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['team'], operation: ['peekChannel', 'releaseChannel'] } },
		options: [
			{
				displayName: 'Count',
				name: 'count',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 1000 },
				description: 'Release: how many held messages to deliver, oldest first (at most 1 000)',
			},
			{
				displayName: 'From Cursor',
				name: 'fromCursor',
				type: 'string',
				default: '',
				description: 'Peek: start after this cursor',
			},
			{
				displayName: 'Max Messages',
				name: 'maxMessages',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Peek: how many messages to return',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'For a user-scoped team channel: whose layer to read or release',
			},
		],
	},

	// ---- Render Diagram ----
	{
		displayName: 'Highlight State',
		name: 'highlightState',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['renderDiagram'] } },
		description:
			'Optionally outline one state in bold — e.g. a board chunk\'s current status, to show where a walk has reached. Empty = no highlight.',
	},
];
