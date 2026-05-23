import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { getClient, getCredentialDefault } from './client';
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
 * Suggest agent names from this user's recent run history.
 *
 * NOTE: this is a HINT only, not a full library list. Loomcycle has no
 * wire endpoint that returns the agent library (yaml-defined +
 * AgentDef-registered names). The closest read is /v1/users/{id}/agents,
 * which lists running / recently-completed *instances* — we de-dup by
 * agent name and surface that as a "names you've used before"
 * suggestion. Brand-new yaml agents that haven't been spawned yet will
 * NOT appear; operators must type the name manually for those.
 *
 * Tracking the full-library endpoint as a Phase 0 follow-up
 * (GET /v1/_agents in loomcycle).
 */
export async function loadRecentAgentNames(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	try {
		const userId = await getCredentialDefault(this, 'userId');
		if (!userId) {
			return [
				{
					name: '— set Default User ID on the credential to enable suggestions, or type the agent name manually —',
					value: '',
				},
			];
		}
		const client = await getClient(this);
		const agents = await client.listUserAgents(userId);
		const names = Array.from(new Set(agents.map((a) => a.agent))).sort();
		if (names.length === 0) {
			return [
				{
					name: '— no recent runs for this user; type the agent name from your loomcycle.yaml or AgentDef registry —',
					value: '',
				},
			];
		}
		return names.map((name) => ({ name, value: name }));
	} catch (err) {
		return [failedToLoadOption('recent agent names', err)];
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
