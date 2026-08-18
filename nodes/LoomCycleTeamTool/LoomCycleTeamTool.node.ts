import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { z } from 'zod';
import type { LoomcycleClient } from '@loomcycle/client';

import { getClient } from '../LoomCycle/helpers/client';
import { loadTeams } from '../LoomCycle/helpers/loadOptions';
import { buildTool, executeToolFn } from '../_shared/clusterTool';

/**
 * `LoomCycle Team Tool` — cluster sub-node that lets the parent n8n AI Agent
 * delegate a whole task to a loomcycle **agent team** (RFC AP, loomcycle
 * ≥ v1.17.1) rather than to a single sub-agent.
 *
 * **FULL EDITION ONLY** — like the other Tool sub-nodes, it needs
 * `@langchain/core`, which n8n Cloud's scanner bans.
 *
 * The team is **pinned by the operator**, matching the house pattern set by
 * `LoomCycle Sub-Agent Tool`: the operator chooses the target, the model
 * supplies the task. That is not merely a convention here — it closes a real
 * escalation path. A team's states name arbitrary handler agents, so a model
 * free to run *any* team by name (let alone author one) could reach agents well
 * outside its own tool ceiling. Authoring ops (`create` / `fork` / `delete`)
 * are absent for the same reason and stay on the action node.
 *
 * Two ops: `run` delegates the task; `describe` renders the pinned team's graph
 * as Mermaid so the model can see the workflow it is handing work to before
 * committing to it.
 */
const TeamInputSchema = z.object({
	op: z
		.enum(['run', 'describe'])
		.optional()
		.describe('run (default) delegates the task to the team; describe returns the team\'s state-graph diagram without running anything'),
	input: z.string().optional().describe('The task handed to the team\'s entry state. Required for run.'),
});

export class LoomCycleTeamTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Team Tool',
		name: 'loomCycleTeamTool',
		icon: 'file:LoomCycleTeamTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Delegates a task to a configured loomcycle agent team — a whole state-machine workflow, not one agent',
		defaults: { name: 'LoomCycle Team Tool' },
		codex: { categories: ['AI'], subcategories: { AI: ['Tools'] } },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'string',
				default: 'loomcycle_team',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent — must be unique across sibling tools',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 4 },
				default:
					'Delegate a whole task to a loomcycle agent team — a multi-step workflow of specialised agents that hand off to each other until the work is done. Call with op=run and the task as input. Call with op=describe first if you want to see the team\'s workflow before delegating.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
			{
				displayName: 'Team Name or ID',
				name: 'teamName',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'loadTeams' },
				default: '',
				required: true,
				description:
					'The team this tool delegates to. Pinned by you, not chosen by the model: a team\'s states name arbitrary handler agents, so letting a model pick the team would let it reach agents outside its own tool ceiling. Choose from the list, or specify a name using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Board Options',
				name: 'boardOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Board Chunk ID',
						name: 'boardChunkId',
						type: 'string',
						default: '',
						description:
							'Bind the walk to a Document chunk task board (RFC BT P4) so each transition persists `chunk.status`. Progress becomes durable and a later run resumes from it — useful when the agent may be asked to continue the same piece of work across conversations.',
					},
					{
						displayName: 'Board Scope',
						name: 'boardScope',
						type: 'options',
						default: 'user',
						options: [
							{ name: 'Agent', value: 'agent' },
							{ name: 'User', value: 'user' },
						],
						description: 'Document scope of the board chunk. Only agent and user — a task board cannot live in tenant scope.',
					},
				],
			},
			{
				displayName: 'A team run walks the whole graph, spawning an agent per state, so it can take a while and consume a real share of the token budget — the parent agent will block on it. It runs under the same admission a normal run gets, so a budget ceiling stops it. Authoring ops (Create / Fork / Delete) are deliberately not exposed to the model; use the LoomCycle Team action node for those.',
				name: 'teamRunNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	methods = {
		loadOptions: {
			loadTeams,
		},
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_team') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const captures = await captureConfig(this);

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: TeamInputSchema,
			fn: (args) => runTeamOp(captures, args),
		});

		return { response: tool };
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const captures = await captureConfig(this);
		return executeToolFn.call(this, {
			schema: TeamInputSchema,
			fn: (args) => runTeamOp(captures, args),
		});
	}
}

interface TeamCaptures {
	client: LoomcycleClient;
	teamName: string;
	boardChunkId?: string;
	boardScope?: 'agent' | 'user';
}

/**
 * Read the operator's pinned config once, at supply/execute time — never per
 * tool call, so a model cannot influence which team it reaches.
 */
async function captureConfig(
	ctx: ISupplyDataFunctions | IExecuteFunctions,
): Promise<TeamCaptures> {
	const teamName = (ctx.getNodeParameter('teamName', 0, '') as string).trim();
	const boardOptions = ctx.getNodeParameter('boardOptions', 0, {}) as {
		boardChunkId?: string;
		boardScope?: string;
	};
	const client = await getClient(ctx);

	const captures: TeamCaptures = { client, teamName };
	if (boardOptions.boardChunkId) {
		captures.boardChunkId = boardOptions.boardChunkId;
		// Only meaningful alongside a board chunk, so never captured alone.
		if (boardOptions.boardScope) {
			captures.boardScope = boardOptions.boardScope as 'agent' | 'user';
		}
	}
	return captures;
}

async function runTeamOp(
	captures: TeamCaptures,
	args: z.infer<typeof TeamInputSchema>,
): Promise<unknown> {
	if (!captures.teamName) {
		throw new Error('No team is configured on this tool — set Team Name on the node.');
	}

	if (args.op === 'describe') {
		return captures.client.renderTeamDiagram(captures.teamName);
	}

	if (!args.input) {
		throw new Error('input is required for op=run — pass the task the team should work on');
	}

	// Addressed by NAME, so it always resolves the team's active version. The
	// model never supplies a def_id: pinning an arbitrary version would reopen
	// the same escalation the pinned name closes.
	const target: {
		name: string;
		input: string;
		boardChunkId?: string;
		boardScope?: 'agent' | 'user';
	} = { name: captures.teamName, input: args.input };
	if (captures.boardChunkId) {
		target.boardChunkId = captures.boardChunkId;
		if (captures.boardScope) target.boardScope = captures.boardScope;
	}

	return captures.client.runTeam(target);
}
