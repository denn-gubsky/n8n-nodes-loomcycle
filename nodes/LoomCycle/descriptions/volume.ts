import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `volume` resource — loomcycle Filesystem
 * Volumes (RFC AH, loomcycle ≥ v1.1). A Volume is a named read-only or
 * read-write filesystem root an agent can be bound to; since v1.1 Volumes are
 * the ONLY way an agent gets filesystem access (the old
 * READ_ROOT/WRITE_ROOT/BASH_CWD env vars were removed).
 *
 * Volumes are FLAT, not versioned: a VolumeDef points at mutable on-disk
 * state, so there is no fork/promote/retire chain. The lifecycle is
 * create / get / delete / purge, mapped to `client.volumeDef(...)`. Two
 * read views — List (the persistent universe: static floor + the tenant's
 * dynamic VolumeDefs) and List Ephemeral (live run-scoped volumes) — wrap
 * `client.listVolumes()` / `client.listEphemeralVolumes()`.
 *
 * The runtime DERIVES the on-disk path inside its `dynamic_root` (callers
 * never supply one), so create takes only a name + mode. Names + modes are
 * tenant-scoped; host paths are redacted for non-operator callers.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const volumeOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['volume'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Provision a new dynamic volume (the runtime derives its on-disk path)',
				action: 'Create a volume',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Unmap a volume — drops the mapping but leaves the files on disk',
				action: 'Delete a volume mapping',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Fetch a single volume definition by name',
				action: 'Get a volume',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List the persistent volume universe — static floor + the tenant\'s dynamic volumes',
				action: 'List persistent volumes',
			},
			{
				name: 'List Ephemeral',
				value: 'listEphemeral',
				description: 'List live run-scoped ephemeral volumes (auto-purged when their run completes)',
				action: 'List ephemeral volumes',
			},
			{
				name: 'Purge',
				value: 'purge',
				description: 'Destructive: drop the mapping AND remove the volume\'s directory tree',
				action: 'Purge a volume',
			},
		],
		default: 'list',
	},

	// ---- Create: new name + mode ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['volume'], operation: ['create'] } },
		description: 'Name for the new volume. Must not collide with a static (yaml) volume name — the substrate refuses that (yaml is ground truth).',
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'rw',
		displayOptions: { show: { resource: ['volume'], operation: ['create'] } },
		options: [
			{ name: 'Read-Write (Rw)', value: 'rw' },
			{ name: 'Read-Only (Ro)', value: 'ro' },
		],
		description: 'Whether bound agents may write to the volume. Read-only volumes are enforced by the substrate (and honoured even by the Bashbox sandbox).',
	},

	// ---- Get / Delete / Purge: existing volume name (dropdown) ----
	{
		displayName: 'Volume Name or ID',
		name: 'volumeName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadVolumes' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['volume'], operation: ['get', 'delete', 'purge'] } },
		description:
			'Volume to target, from GET /v1/_volumes (badged static / dynamic + mode). Delete / Purge succeed only on dynamic volumes — the substrate refuses the static floor. Or specify a name via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];
