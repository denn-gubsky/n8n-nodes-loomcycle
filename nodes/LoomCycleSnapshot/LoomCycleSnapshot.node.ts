import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadSnapshots } from '../LoomCycle/helpers/loadOptions';
import { snapshotOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Snapshot — runtime snapshot lifecycle (create / list / get /
 * restore / delete / export-URL, loomcycle v0.8.17+). Backup + restore the
 * substrate state from n8n — e.g. snapshot before a deploy, restore on
 * rollback.
 */
export class LoomCycleSnapshot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Snapshot',
		name: 'loomCycleSnapshot',
		icon: 'file:LoomCycleSnapshot.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Backup + restore loomcycle runtime snapshots',
		defaults: { name: 'LoomCycle Snapshot' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'snapshot' },
			...snapshotOps,
		],
	};

	methods = {
		loadOptions: {
			loadSnapshots,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'snapshot');
	}
}
