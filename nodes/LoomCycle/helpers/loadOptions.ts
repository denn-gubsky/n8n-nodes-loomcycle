import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import type { LibraryEntry } from '@loomcycle/client';
import { getClient } from './client';
import { redactBearerFragments } from './errors';

/**
 * Build the dropdown's instructional fallback option after a failed
 * loadOptions call. The message MUST run through `redactBearerFragments`
 * because the wire-error string can echo back server-side header fragments
 * (CLAUDE.md §security.6 — the bearer never reaches operator UIs).
 */
function failedToLoadOption(label: string, err: unknown): INodePropertyOptions {
	const msg = redactBearerFragments((err as Error).message ?? '');
	return { name: `— failed to load ${label} (${msg}); type the name manually —`, value: '' };
}

/**
 * loadOptions methods for dynamic n8n parameter dropdowns.
 *
 * Each method MUST be defensive — n8n re-evaluates loadOptions on every
 * parameter render, so failures here block the operator from configuring
 * the node. On any error, return a single instructional placeholder
 * option so the dropdown remains usable (the operator can switch to
 * manual entry via the "Use Expression" toggle).
 */

/**
 * Format a `LibraryEntry.source` field as an operator-facing description
 * shown as the dropdown option's tooltip / secondary text. Library v2
 * (loomcycle v0.9.3) tags every entry as yaml-static, dynamic-only, or
 * both — exposing that lets operators tell a yaml-baseline agent from
 * one created via AgentDef at a glance.
 */
function libraryEntryDescription(entry: LibraryEntry<unknown>): string {
	const parts: string[] = [];
	switch (entry.source) {
		case 'static-only':
			parts.push('yaml-static');
			break;
		case 'dynamic-only':
			parts.push('dynamic AgentDef');
			break;
		case 'both':
			parts.push('yaml + dynamic');
			break;
	}
	if (typeof entry.latest_version === 'number') {
		parts.push(`v${entry.latest_version}`);
	}
	if (entry.version_count > 0) {
		parts.push(`${entry.version_count} version${entry.version_count === 1 ? '' : 's'}`);
	}
	return parts.join(' · ');
}

/**
 * List spawnable agent names from the loomcycle agent library — both
 * yaml-static AND dynamically-registered AgentDefs, merged into one
 * source-tagged list. Wraps `client.listLibraryAgents()`
 * (@loomcycle/client v0.10.3+, wrapping GET /v1/_library/agents from
 * loomcycle v0.9.3+).
 *
 * Operator-trust scope: the library endpoint is bearer-only (no userId
 * required), so this dropdown works regardless of the credential's
 * Default User ID setting.
 */
export async function loadAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listLibraryAgents();
		const entries = [...resp.entries].sort((a, b) => a.name.localeCompare(b.name));
		if (entries.length === 0) {
			return [
				{
					name: '— no agents declared in loomcycle.yaml or AgentDef registry; type the agent name manually —',
					value: '',
				},
			];
		}
		return entries.map((entry) => ({
			name: entry.name,
			value: entry.name,
			description: libraryEntryDescription(entry),
		}));
	} catch (err) {
		return [failedToLoadOption('agents', err)];
	}
}

/**
 * List MCP server registrations from the loomcycle library — yaml-static
 * mcp_servers + dynamically-registered MCPServerDefs, merged into one
 * source-tagged list. Wraps `client.listLibraryMcpServers()` (loomcycle
 * v0.9.x), the MCP counterpart of `loadAgents`.
 *
 * Surfaces the curated / already-registered MCP servers as a dropdown so
 * an operator forking or rediscovering one doesn't have to type the name
 * by hand. Bearer-only (operator-trust); no userId required.
 */
export async function loadMcpLibrary(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listLibraryMcpServers();
		const entries = [...resp.entries].sort((a, b) => a.name.localeCompare(b.name));
		if (entries.length === 0) {
			return [
				{
					name: '— no MCP servers in loomcycle.yaml or the MCPServerDef registry; type the name manually —',
					value: '',
				},
			];
		}
		return entries.map((entry) => ({
			name: entry.name,
			value: entry.name,
			description: libraryEntryDescription(entry),
		}));
	} catch (err) {
		return [failedToLoadOption('MCP servers', err)];
	}
}

/**
 * List declared channels via GET /v1/_channels (admin endpoint;
 * shipped in loomcycle v0.9.x PR #173).
 */
export async function loadChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listChannels();
		const names = resp.channels.map((c) => c.name).sort();
		if (names.length === 0) {
			return [{ name: '— no channels declared in operator yaml; type the channel name manually —', value: '' }];
		}
		return names.map((name) => ({ name, value: name }));
	} catch (err) {
		return [failedToLoadOption('channels', err)];
	}
}

/**
 * List captured snapshots via GET /v1/_snapshots (loomcycle v0.8.18). Backs
 * the Get / Restore / Delete / Export-URL dropdowns on the Snapshot node. The
 * option label is the snapshot's `label` (falling back to its id) plus the id,
 * so operators can tell labelled backups apart.
 */
export async function loadSnapshots(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const entries = await client.listSnapshots({ limit: 200 });
		if (entries.length === 0) {
			return [{ name: '— no snapshots captured yet; create one or type an ID manually —', value: '' }];
		}
		return entries.map((s) => ({
			name: s.label ? `${s.label} (${s.id})` : s.id,
			value: s.id,
			description: `${s.created_at} · ${s.byte_size} bytes`,
		}));
	} catch (err) {
		return [failedToLoadOption('snapshots', err)];
	}
}

/**
 * List the caller's persistent volumes via GET /v1/_volumes (RFC AH,
 * loomcycle ≥ v1.1). Backs the Get / Delete / Purge name dropdown on the
 * Volume node. Each option is badged with its source (static floor vs the
 * tenant's dynamic VolumeDefs) + mode, so an operator can tell a managed
 * dynamic volume from the read-only static floor at a glance. Delete / Purge
 * only succeed on dynamic volumes; the substrate refuses static ones.
 */
export async function loadVolumes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listVolumes();
		const entries = [...resp.entries].sort((a, b) => a.name.localeCompare(b.name));
		if (entries.length === 0) {
			return [{ name: '— no volumes; create one or type a name manually —', value: '' }];
		}
		return entries.map((v) => ({
			name: v.name,
			value: v.name,
			description: `${v.source} · ${v.mode}${v.default ? ' · default' : ''}`,
		}));
	} catch (err) {
		return [failedToLoadOption('volumes', err)];
	}
}

/**
 * List known Memory scopes via GET /v1/_memory/scopes.
 */
export async function loadMemoryScopes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listMemoryScopes();
		const names = resp.scopes.map((s) => s.name).sort();
		if (names.length === 0) {
			return [{ name: '— no memory scopes; type the scope name manually —', value: '' }];
		}
		return names.map((name) => ({ name, value: name }));
	} catch (err) {
		return [failedToLoadOption('scopes', err)];
	}
}
