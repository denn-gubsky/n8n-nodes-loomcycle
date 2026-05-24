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
