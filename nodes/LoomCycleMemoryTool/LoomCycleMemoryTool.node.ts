import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import type { LoomcycleClient } from '@loomcycle/client';
import { z } from 'zod';

import { getClient } from '../LoomCycle/helpers/client';
import { buildTool, executeToolFn } from '../_shared/clusterTool';

/**
 * `LoomCycle Memory Tool` — cluster sub-node that plugs into n8n's AI
 * Agent. Exposes loomcycle's Memory read surface as a single discriminated
 * tool the agent can call.
 *
 * Read-only in this sub-phase (mirroring the action-node Memory resource;
 * Set/Delete/Search land when `@loomcycle/client` exposes admin write
 * endpoints).
 */
const MemoryInputSchema = z.object({
	op: z
		.enum(['listScopes', 'listScopeIDs', 'listEntries', 'getEntry'])
		.describe('Which Memory operation to invoke'),
	scope: z
		.string()
		.optional()
		.describe('Memory scope (e.g. "agent", "user"). Required for listScopeIDs / listEntries / getEntry.'),
	scopeID: z
		.string()
		.optional()
		.describe('Identifier within the scope. Required for listEntries / getEntry.'),
	key: z.string().optional().describe('Entry key. Required for getEntry.'),
	prefix: z.string().optional().describe('Key prefix filter for listEntries'),
	limit: z.number().int().positive().optional().describe('Max number of entries to return (listEntries)'),
});

export class LoomCycleMemoryTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Memory Tool',
		name: 'loomCycleMemoryTool',
		icon: 'file:LoomCycleMemoryTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Loomcycle Memory ops (read-only) as a tool the AI Agent can call',
		defaults: { name: 'LoomCycle Memory Tool' },
		codex: { categories: ['AI'], subcategories: { AI: ['Tools'] } },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'string',
				default: 'loomcycle_memory',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent — must be unique across sibling tools',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 3 },
				default:
					'Read loomcycle Memory entries. Use op=listScopes to list scopes, op=listScopeIDs+scope to list ids, op=listEntries+scope+scopeID to list keys (optionally prefix/limit), op=getEntry+scope+scopeID+key to read a value.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_memory') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const client = await getClient(this);

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: MemoryInputSchema,
			fn: (args) => runMemoryOp(client, args),
		});

		return { response: tool };
	}

	/**
	 * n8n Tools Agent (v1.82+) calls `execute()` directly when the LLM
	 * invokes the tool. The tool-call args land in `getInputData()`;
	 * we share the same logic with `supplyData()` via `runMemoryOp`.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const client = await getClient(this);
		return executeToolFn.call(this, {
			schema: MemoryInputSchema,
			fn: (args) => runMemoryOp(client, args),
		});
	}
}

async function runMemoryOp(
	client: LoomcycleClient,
	args: z.infer<typeof MemoryInputSchema>,
): Promise<unknown> {
	switch (args.op) {
		case 'listScopes':
			return client.listMemoryScopes();
		case 'listScopeIDs':
			if (!args.scope) throw new Error('scope is required for listScopeIDs');
			return client.listMemoryScopeIDs(args.scope);
		case 'listEntries': {
			if (!args.scope || !args.scopeID) throw new Error('scope + scopeID required for listEntries');
			const opts: { prefix?: string; limit?: number } = {};
			if (args.prefix) opts.prefix = args.prefix;
			if (args.limit) opts.limit = args.limit;
			return client.listMemoryEntries(args.scope, args.scopeID, opts);
		}
		case 'getEntry':
			if (!args.scope || !args.scopeID || !args.key) {
				throw new Error('scope + scopeID + key required for getEntry');
			}
			return client.getMemoryEntry(args.scope, args.scopeID, args.key);
	}
}
