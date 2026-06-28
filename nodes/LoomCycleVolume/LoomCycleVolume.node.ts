import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadVolumes } from '../LoomCycle/helpers/loadOptions';
import { volumeOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Volume — filesystem Volume lifecycle (RFC AH, loomcycle ≥ v1.1).
 * Provision named ro/rw filesystem roots for agents (create / get / delete /
 * purge) and list the persistent + ephemeral volume universe. Since v1.1
 * Volumes are the only mechanism by which an agent gets filesystem access.
 */
export class LoomCycleVolume implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Volume',
		name: 'loomCycleVolume',
		icon: 'file:LoomCycleVolume.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Provision + manage loomcycle filesystem volumes',
		defaults: { name: 'LoomCycle Volume' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'volume' },
			...volumeOps,
		],
	};

	methods = {
		loadOptions: {
			loadVolumes,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'volume');
	}
}
