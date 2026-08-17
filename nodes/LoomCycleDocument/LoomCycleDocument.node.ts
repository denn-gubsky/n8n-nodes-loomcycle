import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { documentOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Document — the chunked-graph Document store (RFC AK, extended by
 * RFC BS / BO / CE; loomcycle ≥ v1.4 off-run, SQL Memory required).
 *
 * Documents are trees of typed chunks that also link across each other, so the
 * store is a graph. This node covers structure and content: document + chunk
 * lifecycle, edges and discovery, tags, types, querying, per-chunk history,
 * Markdown / JSON-Canvas import-export, image assets, and peer federation.
 *
 * The RFC CC fact tier is the sibling LoomCycle Fact node — same wire method,
 * different audience.
 */
export class LoomCycleDocument implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Document',
		name: 'loomCycleDocument',
		icon: 'file:LoomCycleDocument.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Author + query loomcycle chunked-graph documents',
		defaults: { name: 'LoomCycle Document' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'document' },
			...documentOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'document');
	}
}
