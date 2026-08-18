import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { userOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle User — tenant-owned users and delegated bearer tokens (RFC BX P2,
 * loomcycle ≥ v1.50). The tenant is always derived server-side, so no operation
 * takes one.
 *
 * Minting a token is deliberately absent: the substrate returns the bearer
 * plaintext once, and it must not land in n8n execution data.
 */
export class LoomCycleUser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle User',
		name: 'loomCycleUser',
		icon: 'file:LoomCycleUser.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage tenant users and their delegated tokens',
		defaults: { name: 'LoomCycle User' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'user' },
			...userOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'user');
	}
}
