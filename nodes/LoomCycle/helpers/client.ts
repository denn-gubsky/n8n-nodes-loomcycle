import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	ITriggerFunctions,
	ISupplyDataFunctions,
} from 'n8n-workflow';
import { LoomcycleClient } from '@loomcycle/client';

/**
 * Build a LoomcycleClient from the n8n credential. Treats the credential
 * object as opaque — only the base URL + bearer leave this helper, and
 * even those go through the typed adapter (never raw fetch).
 *
 * Every action / trigger / cluster node uses this to construct its client.
 */
export async function getClient(
	ctx: IExecuteFunctions | ILoadOptionsFunctions | ITriggerFunctions | ISupplyDataFunctions,
): Promise<LoomcycleClient> {
	const creds = await ctx.getCredentials('loomCycleApi');
	const baseUrl = String(creds.baseUrl ?? '').trim();
	const authToken = String(creds.bearerToken ?? '').trim();

	return new LoomcycleClient({
		baseUrl: baseUrl || undefined,
		authToken: authToken || undefined,
	});
}

/**
 * Read a credential default safely. Used by action nodes to fall through
 * credential `userId` / `userTier` when the per-node parameter is empty.
 */
export async function getCredentialDefault(
	ctx: IExecuteFunctions | ILoadOptionsFunctions | ITriggerFunctions | ISupplyDataFunctions,
	field: 'userId' | 'userTier' | 'mcpUrl',
): Promise<string> {
	const creds = await ctx.getCredentials('loomCycleApi');
	return String(creds[field] ?? '').trim();
}
