import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadTeams } from '../LoomCycle/helpers/loadOptions';
import { teamOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Team — Agent Teams (RFC AP, loomcycle ≥ v1.17.1).
 *
 * A TeamDef is a versioned state-machine graph of agent roles: states carry a
 * handler (a single agent, a parallel fan-out, a consolidator, or a terminal)
 * and transitions are gated on each state's outcome. Run walks the graph,
 * spawning an agent per state until it reaches a terminal — and bound to a
 * Document chunk task board it persists progress and resumes across runs.
 *
 * The closest analogue loomcycle has to an n8n workflow, executed inside the
 * substrate rather than on the canvas: n8n designs and triggers it, loomcycle
 * runs it with the reproducibility and admission control the substrate provides.
 */
export class LoomCycleTeam implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Team',
		name: 'loomCycleTeam',
		icon: 'file:LoomCycleTeam.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Author + run loomcycle agent teams as state-machine workflows',
		defaults: { name: 'LoomCycle Team' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'team' },
			...teamOps,
		],
	};

	methods = {
		loadOptions: {
			loadTeams,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'team');
	}
}
