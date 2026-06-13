import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { operatorTokenDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Operator Token — OperatorTokenDef admin (RFC L, loomcycle v0.17
 * multi-tenant authorization). Exposes only the non-secret lifecycle — Get /
 * List / Retire — because the substrate's create / rotate return the token
 * plaintext, which must never enter n8n execution data (CLAUDE.md §6). Mint +
 * rotate via the loomcycle Web UI / CLI.
 */
export class LoomCycleOperatorToken implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Operator Token',
		name: 'loomCycleOperatorToken',
		icon: 'file:LoomCycleOperatorToken.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Get / List / Retire loomcycle operator tokens (mint + rotate elsewhere)',
		defaults: { name: 'LoomCycle Operator Token' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'operatorTokenDef' },
			...operatorTokenDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'operatorTokenDef');
	}
}
