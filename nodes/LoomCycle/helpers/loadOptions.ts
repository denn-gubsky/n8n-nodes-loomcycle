import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { getClient, getCredentialDefault } from './client';

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
 * List agent names currently active for the credential's default user_id.
 * Returns recent / running agent definitions visible via /v1/users/{id}/agents.
 */
export async function loadAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const userId = await getCredentialDefault(this, 'userId');
		if (!userId) {
			return [
				{
					name: '— set Default User ID on the credential to enable dropdown, or type the agent name manually —',
					value: '',
				},
			];
		}
		const client = await getClient(this);
		const agents = await client.listUserAgents(userId);
		const names = Array.from(new Set(agents.map((a) => a.agent))).sort();
		if (names.length === 0) {
			return [{ name: '— no running agents for this user; type the agent name manually —', value: '' }];
		}
		return names.map((name) => ({ name, value: name }));
	} catch (err) {
		return [
			{
				name: `— failed to load agents (${(err as Error).message}); type the name manually —`,
				value: '',
			},
		];
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
		return [
			{
				name: `— failed to load channels (${(err as Error).message}); type the name manually —`,
				value: '',
			},
		];
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
		return [
			{
				name: `— failed to load scopes (${(err as Error).message}); type the name manually —`,
				value: '',
			},
		];
	}
}
