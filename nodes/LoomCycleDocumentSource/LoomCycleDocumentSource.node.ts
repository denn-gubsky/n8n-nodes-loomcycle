import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { documentSourceDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Document Source — versioned DocumentSourceDef admin (RFC CE,
 * loomcycle ≥ v1.54). Registers a named peer loomcycle instance as a document
 * source, which the Document node's Set Remote / Sync / Diff Remote ops consume.
 * Operator-admin only.
 */
export class LoomCycleDocumentSource implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Document Source',
		name: 'loomCycleDocumentSource',
		icon: 'file:LoomCycleDocumentSource.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Register peer loomcycle instances as document sources',
		defaults: { name: 'LoomCycle Document Source' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'documentSourceDef' },
			...documentSourceDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'documentSourceDef');
	}
}
