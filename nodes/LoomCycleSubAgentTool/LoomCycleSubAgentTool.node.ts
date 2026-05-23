import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { z } from 'zod';
import type { RunOptions } from '@loomcycle/client';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { buildSegments } from '../LoomCycle/helpers/segments';
import { drainRunStream } from '../LoomCycle/helpers/streaming';
import { buildTool } from '../_shared/clusterTool';

/**
 * `LoomCycle Sub-Agent Tool` — cluster sub-node that lets the parent
 * n8n AI Agent delegate to a loomcycle agent. When the parent invokes
 * the tool with a prompt, this node spawns the configured loomcycle
 * agent, blocks until it terminates, and returns the drained final
 * text.
 *
 * Useful for: handing off to a specialised loomcycle agent (code-
 * generation, research, evaluation, etc.) while the n8n AI Agent
 * remains the user-facing orchestrator.
 */
const SubAgentInputSchema = z.object({
	prompt: z.string().describe('Prompt sent to the loomcycle agent'),
	sessionId: z.string().optional().describe('Optional session_id to continue an existing session'),
});

export class LoomCycleSubAgentTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Sub-Agent Tool',
		name: 'loomCycleSubAgentTool',
		icon: 'file:LoomCycleSubAgentTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Delegates to a configured loomcycle agent — the parent AI Agent calls this tool with a prompt',
		defaults: { name: 'LoomCycle Sub-Agent Tool' },
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
				default: 'loomcycle_sub_agent',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 3 },
				default: 'Delegate a task to a specialised loomcycle agent. Pass the task as the prompt; receive the agent\'s final text.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
			{
				displayName: 'Agent Name or ID',
				name: 'agent',
				type: 'string',
				default: '',
				required: true,
				description: 'Loomcycle agent name to spawn — must be declared in operator yaml or registered dynamically',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'Per-tool override of user_id. Falls through to credential default.',
			},
			{
				displayName: 'User Tier',
				name: 'userTier',
				type: 'string',
				default: '',
				description: 'Per-tool override of user_tier. Falls through to credential default.',
			},
			{
				displayName: 'Treat Prompt as Untrusted',
				name: 'treatPromptAsUntrusted',
				type: 'boolean',
				default: true,
				description:
					'Whether to wrap the prompt as an untrusted-block segment. Defaults true here because the prompt is model-supplied (the parent AI Agent\'s tool-call argument).',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_sub_agent') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const agent = this.getNodeParameter('agent', 0) as string;
		const userIdParam = this.getNodeParameter('userId', 0, '') as string;
		const userTierParam = this.getNodeParameter('userTier', 0, '') as string;
		const treatPromptAsUntrusted = this.getNodeParameter('treatPromptAsUntrusted', 0, true) as boolean;

		const client = await getClient(this);
		const userIdDefault = await getCredentialDefault(this, 'userId');
		const userTierDefault = await getCredentialDefault(this, 'userTier');

		const userId = userIdParam || userIdDefault;
		const userTier = userTierParam || userTierDefault;

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: SubAgentInputSchema,
			fn: async (args) => {
				const runOpts: RunOptions = {
					agent,
					segments: buildSegments(args.prompt, treatPromptAsUntrusted),
				};
				if (userId) runOpts.userId = userId;
				if (userTier) runOpts.userTier = userTier;
				if (args.sessionId) runOpts.sessionId = args.sessionId;

				const result = await drainRunStream(client.runStreaming(runOpts));
				// Return the finalText directly (string contract) so the parent
				// AI Agent treats it as the tool's textual output. Metadata
				// like usage/sessionId/agentId are dropped — too noisy for the
				// agent's context. Operators wanting those should use the
				// action node's Spawn op instead.
				return result.finalText;
			},
		});

		return { response: tool };
	}
}
