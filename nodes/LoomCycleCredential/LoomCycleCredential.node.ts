import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { credentialOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Credential — manage loomcycle's own encrypted credential store
 * (create or rotate / get / list / delete). The secret value is read from a
 * LoomCycle Secret credential, so it never lands in a node parameter. Stored
 * credentials are referenced as `$cred:<name>` in MCP headers, hook headers
 * and signing secrets.
 */
export class LoomCycleCredential implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Credential',
		name: 'loomCycleCredential',
		icon: 'file:LoomCycleCredential.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Store secrets in loomcycle for $cred: references, without putting them in the workflow',
		defaults: { name: 'LoomCycle Credential' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{ name: 'loomCycleApi', required: true },
			{
				name: 'loomCycleSecretApi',
				required: true,
				displayOptions: { show: { operation: ['create'] } },
			},
		],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'credential' },
			...credentialOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'credential');
	}
}
