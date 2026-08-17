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
 *
 * Falls back to `runnableAgents()` (GET /v1/_runnable-agents, RFC BY /
 * loomcycle v1.51) when the Library read fails. The Library is part of the
 * operator def-plane, so a DELEGATED per-user token (RFC BX) is refused there
 * — but that same token holds `runs:read` and so can list what it may actually
 * run. Without this fallback the agent dropdown is permanently empty for every
 * member-token credential. The fallback list is lean (name + source, no version
 * roll-up), which is why it is second rather than first.
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
	} catch (libraryErr) {
		try {
			const client = await getClient(this);
			const resp = await client.runnableAgents();
			const agents = [...(resp.agents ?? [])].sort((a, b) => a.name.localeCompare(b.name));
			if (agents.length === 0) {
				return [{ name: '— no runnable agents for this credential; type the agent name manually —', value: '' }];
			}
			return agents.map((a) => ({ name: a.name, value: a.name, description: a.source }));
		} catch {
			// Report the LIBRARY error, not the fallback's — the library read is
			// the operator-facing path and its message is the diagnostic one.
			return [failedToLoadOption('agents', libraryErr)];
		}
	}
}

/**
 * The two non-provider entries the AgentDef Provider dropdown must always
 * offer, regardless of what the deployment reports.
 *
 * `''` leaves provider unset so it falls through to the Overlay JSON /
 * loomcycle's default. `code-js` is a SYNTHETIC provider (RFC J) — the agent
 * runs inline JavaScript instead of an LLM, so it is gated by
 * LOOMCYCLE_CODE_AGENTS_ENABLED rather than appearing in the provider cascade,
 * and it drives the conditional code-body editor via
 * `displayOptions.show.agentProvider`. Sourcing the list purely from
 * `getConfig()` would silently remove both.
 */
const STATIC_PROVIDER_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Default (Set via Overlay JSON)',
		value: '',
		description: 'Leave the provider unset — configure it in the Overlay JSON below, or let loomcycle apply its default',
	},
	{
		name: 'Code-JS (Deterministic JavaScript)',
		value: 'code-js',
		description:
			'Synthetic provider — the agent runs inline JavaScript instead of an LLM (RFC J). Enter the code below; it is ingested via code_body (loomcycle ≥ v0.20). Requires LOOMCYCLE_CODE_AGENTS_ENABLED=1 on the host.',
	},
];

/**
 * List the providers this deployment actually has configured, via GET /v1/config
 * (loomcycle v1.38), prepended with the two synthetic entries above.
 *
 * This replaces a hardcoded five-provider list that could neither reflect a
 * deployment's real cascade nor name a provider loomcycle gained later.
 * `getConfig` reports an `active` flag per provider; inactive ones are still
 * offered (badged), because an operator may legitimately author an AgentDef
 * against a provider they are about to enable.
 *
 * On failure it degrades to the synthetic entries alone rather than an error
 * placeholder — unset and code-js remain valid choices even when the config
 * read fails, and the operator can still type a provider via an expression.
 */
export async function loadAgentProviders(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.getConfig();
		const providers = [...(resp.providers ?? [])].sort((a, b) => a.provider.localeCompare(b.provider));
		return [
			...STATIC_PROVIDER_OPTIONS,
			...providers.map((p) => ({
				name: p.provider,
				value: p.provider,
				description: p.active ? 'active' : 'configured, not active',
			})),
		];
	} catch {
		return STATIC_PROVIDER_OPTIONS;
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

/**
 * List the teams visible to the caller via GET /v1/_teamdef/names (RFC AP,
 * loomcycle ≥ v1.17.1). Backs the name dropdown on the Team node's Fork /
 * Delete / Render Diagram / Run ops.
 *
 * `names` arrives as a Go nil-slice — null rather than [] when empty — so the
 * nullish guard is load-bearing, not defensive noise. Each option is badged with
 * its version roll-up so an operator can tell a team with an unpromoted fork
 * from one whose latest version is live.
 */
export async function loadTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const client = await getClient(this);
		const resp = await client.listTeams();
		const entries = [...(resp.names ?? [])].sort((a, b) => a.name.localeCompare(b.name));
		if (entries.length === 0) {
			return [{ name: '— no teams defined; create one or type a name manually —', value: '' }];
		}
		return entries.map((t) => {
			const parts: string[] = [];
			if (typeof t.latest_version === 'number') parts.push(`latest v${t.latest_version}`);
			if (typeof t.version_count === 'number') {
				parts.push(`${t.version_count} version${t.version_count === 1 ? '' : 's'}`);
			}
			// Worth surfacing: a retired active pointer means name-addressed Run
			// and Render Diagram have nothing live to resolve to.
			if (t.active_retired === true) parts.push('active version retired');
			return { name: t.name, value: t.name, description: parts.join(' · ') };
		});
	} catch (err) {
		return [failedToLoadOption('teams', err)];
	}
}
