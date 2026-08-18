import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { directoryOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Directory — read-only deployment directory (loomcycle ≥ v1.46).
 *
 * Lists the subjects with run activity, aggregates one subject's whole footprint
 * in a single call, and enumerates tenants for an admin token. There is no
 * create or update: a "user" here is DERIVED from run activity rather than
 * stored. Removing a footprint is the sibling LoomCycle Erasure node.
 */
export class LoomCycleDirectory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Directory',
		name: 'loomCycleDirectory',
		icon: 'file:LoomCycleDirectory.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Inspect who is in the deployment and what is held for them',
		defaults: { name: 'LoomCycle Directory' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'directory' },
			...directoryOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'directory');
	}
}
