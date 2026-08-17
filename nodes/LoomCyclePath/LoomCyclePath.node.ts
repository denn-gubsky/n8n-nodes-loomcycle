import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { pathOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Path — the Path VFS (RFC AL, loomcycle ≥ v1.4). A Unix-like
 * virtual filesystem that names resources (Memory entries, Volume mounts,
 * Documents) by human-readable paths: resolve / ls / stat / mkdir / mv / rm.
 * Paths are free-form (no dropdown); scope + tenant resolve server-side.
 */
export class LoomCyclePath implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Path',
		name: 'loomCyclePath',
		icon: 'file:LoomCyclePath.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Name + organise loomcycle resources via the Path VFS',
		defaults: { name: 'LoomCycle Path' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'path' },
			...pathOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'path');
	}
}
