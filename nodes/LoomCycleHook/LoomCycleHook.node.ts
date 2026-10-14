import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadHookDefNames } from '../LoomCycle/helpers/loadOptions';
import { hookOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Hook — HookDef admin (RFC DK, loomcycle ≥ v1.96): create, fork,
 * promote, retire, verify and delete reusable hook definitions. A webhook body
 * typically points at a LoomCycle: Hook Call trigger, so an n8n workflow
 * answers the hook. Replaces the register / list / delete operations, whose
 * wire API loomcycle v1.97 removed.
 */
export class LoomCycleHook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Hook',
		name: 'loomCycleHook',
		icon: 'file:LoomCycleHook.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Define reusable loomcycle hooks that gate tool calls, runs and channel messages',
		defaults: { name: 'LoomCycle Hook' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'hook' },
			...hookOps,
		],
	};

	methods = {
		loadOptions: {
			loadHookDefNames,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'hook');
	}
}
