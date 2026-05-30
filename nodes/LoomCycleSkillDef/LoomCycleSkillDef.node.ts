import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { skillDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Skill Definition — versioned SkillDef admin (create / fork /
 * get / list / promote / retire / verify).
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleSkillDef implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Skill Definition',
		name: 'loomCycleSkillDef',
		icon: 'file:LoomCycleSkillDef.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage versioned loomcycle skill definitions over HTTP',
		defaults: { name: 'LoomCycle Skill Definition' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'skillDef' },
			...skillDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'skillDef');
	}
}
