import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { wrapLoomcycleError } from '../LoomCycle/helpers/errors';
import { readSeenSet, writeSeenSet } from '../LoomCycle/helpers/staticData';

const SEEN_KEY = 'runCompleted';

/**
 * `LoomCycle: Run Completed` — polling trigger that fires when a loomcycle
 * agent run reaches a terminal state (completed / failed / cancelled).
 *
 * Uses n8n's `poll()` framework: n8n invokes `poll()` on the schedule the
 * operator configures (Poll Times), and each call does ONE `listUserAgents`
 * fetch, diffs against per-workflow dedup state, and emits only newly-
 * terminal runs. No timers / SSE in node code — n8n Cloud forbids timer
 * primitives (`setTimeout`, `node:timers`, …) in community nodes, so the
 * earlier SSE-push + long-poll transport was replaced by scheduled polling
 * (v3.0.0). Latency is now the poll interval rather than near-instant.
 */
export class LoomCycleRunCompleted implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Run Completed',
		name: 'loomCycleRunCompleted',
		icon: 'file:LoomCycleRunCompleted.svg',
		group: ['trigger'],
		version: 1,
		polling: true,
		description: 'Fires when a loomcycle agent run reaches a terminal state (completed/failed/cancelled)',
		defaults: { name: 'LoomCycle: Run Completed' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'User_id to watch. Empty = use the credential\'s Default User ID.',
			},
			{
				displayName: 'Statuses',
				name: 'statuses',
				type: 'multiOptions',
				default: ['completed'],
				options: [
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Failed', value: 'failed' },
				],
				description: 'Which terminal statuses fire this trigger',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Parent Agent ID',
						name: 'parentAgentId',
						type: 'string',
						default: '',
						description: 'Narrow to sub-runs of a specific parent agent_id',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const statuses = (this.getNodeParameter('statuses', ['completed']) as string[]) ?? ['completed'];
		const additionalFields = (this.getNodeParameter('additionalFields', {}) as Record<string, unknown>) ?? {};
		const parentAgentId = (additionalFields.parentAgentId as string) || undefined;

		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		if (!userId) {
			throw wrapLoomcycleError(
				new Error('User ID required — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		let agents;
		try {
			agents = await client.listUserAgents(userId);
		} catch (err) {
			throw wrapLoomcycleError(err, this.getNode());
		}

		const wanted = new Set(statuses);
		const seen = readSeenSet(this, SEEN_KEY);
		const fresh = agents.filter((a) => {
			const row = a as unknown as { agent_id: string; status: string; parent_agent_id?: string };
			if (!wanted.has(row.status)) return false;
			if (parentAgentId && row.parent_agent_id !== parentAgentId) return false;
			return !seen.has(row.agent_id);
		});

		if (fresh.length === 0) return null;

		for (const a of fresh) seen.add((a as unknown as { agent_id: string }).agent_id);
		writeSeenSet(this, SEEN_KEY, seen);

		return [fresh.map((a) => ({ json: a as unknown as IDataObject }))];
	}
}
