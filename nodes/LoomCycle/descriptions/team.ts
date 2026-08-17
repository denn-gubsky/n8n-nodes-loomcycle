import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `team` resource — Agent Teams (RFC AP,
 * loomcycle ≥ v1.17.1). A TeamDef is a versioned STATE-MACHINE GRAPH of agent
 * roles: states carry a handler (a single agent, a parallel fan-out, a
 * consolidator, or a terminal) and transitions are gated on each state's
 * outcome. It is the closest thing loomcycle has to an n8n workflow, executed
 * inside the substrate rather than on the canvas.
 *
 * Unlike the other Def families this maps to SEVEN TYPED adapter methods
 * (`listTeams` / `getTeamDef` / `createTeam` / `forkTeam` / `deleteTeam` /
 * `runTeam` / `renderTeamDiagram`) rather than one op-discriminated call, so it
 * does not reuse `buildSubstrateInput`.
 *
 * Three substrate ops have NO adapter wrapper and are therefore absent here:
 * `promote`, `retire` and `verify`. That has a real consequence documented on
 * the Fork op below — see the README's upstream-gaps note.
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
				name: 'Create',
				value: 'create',
				description: 'Author a new team from a workflow graph. Promoted to active immediately.',
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
				description: 'Save an edited graph as a new version of an existing team. NOT promoted — see the field notes.',
				action: 'Fork a team',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Fetch one version\'s full record by def_id, including its editable graph',
				action: 'Get a team version',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List every team the caller may see, each with its version roll-up',
				action: 'List teams',
			},
			{
				name: 'Render Diagram',
				value: 'renderDiagram',
				description: 'Render the team\'s ACTIVE version as a Mermaid state diagram',
				action: 'Render a team diagram',
			},
			{
				name: 'Run',
				value: 'run',
				description: 'Walk the state graph, spawning each state\'s agent until a terminal state',
				action: 'Run a team',
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
			show: { resource: ['team'], operation: ['fork', 'delete', 'renderDiagram'] },
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
		displayOptions: { show: { resource: ['team'], operation: ['get'] } },
		description: 'The team version to fetch, e.g. `tdf_…`. Create / Fork return this in their response.',
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
		displayName: 'A Fork is created UNPROMOTED, so it does not become the team\'s active version. Name-addressed operations (Run by name, Render Diagram) keep resolving to the previously active version. The adapter exposes no promote method yet, so reach a fork by its returned def_id — Run accepts one — or promote it via the loomcycle CLI / Web UI / MCP.',
		name: 'forkPromoteNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['fork'] } },
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
		displayName: 'A Run walks the whole graph synchronously, spawning an agent per state — it can be long. It runs under the same admission a normal run gets (token budget, operator-key scope, depth), so a budget ceiling stops it. Bind a Board Chunk ID to make progress durable and resumable.',
		name: 'runDurationNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['team'], operation: ['run'] } },
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
