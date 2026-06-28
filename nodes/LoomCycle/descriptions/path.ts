import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `path` resource — the loomcycle Path VFS
 * (RFC AL, loomcycle ≥ v1.4). A Unix-like virtual filesystem that names
 * resources (Memory entries, Volume mounts, Documents) by human-readable
 * paths (e.g. /docs/launch). Op-discriminated, mapped to `client.path(...)`:
 * resolve / ls / stat / mkdir / mv / rm.
 *
 * Scope (agent / user / tenant) + tenant are resolved server-side from the
 * authenticated principal — they are a routing hint here, never an authority
 * grant. Path is a NAMING layer: a resource opts into a name elsewhere
 * (Memory.set, VolumeDef.create, Document.create_document); these ops read /
 * reorganise that namespace. `mkdir` is effectively a no-op (directories are
 * implicit) but is exposed for parity.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const pathOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['path'] } },
		options: [
			{
				name: 'List',
				value: 'ls',
				description: 'List the entries directly under a path (optionally recursive)',
				action: 'List a path',
			},
			{
				name: 'Make Directory',
				value: 'mkdir',
				description: 'Create a directory entry (directories are implicit, so this is a no-op marker)',
				action: 'Make a directory',
			},
			{
				name: 'Move',
				value: 'mv',
				description: 'Rename / move a path to a new location (a cheap dirent update)',
				action: 'Move a path',
			},
			{
				name: 'Remove',
				value: 'rm',
				description: 'Remove a path entry (use Recursive to remove a path with descendants)',
				action: 'Remove a path',
			},
			{
				name: 'Resolve',
				value: 'resolve',
				description: 'Resolve a path to its dirent + backing resource reference',
				action: 'Resolve a path',
			},
			{
				name: 'Stat',
				value: 'stat',
				description: 'Fetch metadata for a single path entry',
				action: 'Stat a path',
			},
		],
		default: 'ls',
	},

	// ---- Shared: the path + scope ----
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		default: '',
		required: true,
		placeholder: '/docs/launch',
		displayOptions: { show: { resource: ['path'] } },
		description: 'Absolute path, e.g. /docs/launch. Segments are [a-zA-Z0-9._-]; ".." is rejected.',
	},
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'agent',
		displayOptions: { show: { resource: ['path'] } },
		options: [
			{ name: 'Agent', value: 'agent' },
			{ name: 'User', value: 'user' },
			{ name: 'Tenant (Shared)', value: 'tenant' },
		],
		description:
			'Which tree to operate on. `user` keys on the authenticated principal\'s subject; `tenant` is shared across the tenant. The scope is resolved server-side from the bearer — this is a routing hint, not an authority grant.',
	},

	// ---- Move: destination ----
	{
		displayName: 'Destination Path',
		name: 'to',
		type: 'string',
		default: '',
		required: true,
		placeholder: '/docs/launch-2026',
		displayOptions: { show: { resource: ['path'], operation: ['mv'] } },
		description: 'New path to move / rename the entry to',
	},

	// ---- List / Remove: recursive ----
	{
		displayName: 'Recursive',
		name: 'recursive',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['path'], operation: ['ls', 'rm'] } },
		description: 'Whether to list all descendants (List) or remove a path that has descendants (Remove). Remove refuses a non-empty path without this.',
	},

	// ---- List: kind filter ----
	{
		displayName: 'Kind Filter',
		name: 'kindFilter',
		type: 'options',
		default: '',
		displayOptions: { show: { resource: ['path'], operation: ['ls'] } },
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Directory', value: 'directory' },
			{ name: 'Document', value: 'document' },
			{ name: 'Memory Entry', value: 'memory_entry' },
			{ name: 'Volume Mount', value: 'volume_mount' },
		],
		description: 'Restrict a List to entries of one kind. Any = no filter.',
	},
];
