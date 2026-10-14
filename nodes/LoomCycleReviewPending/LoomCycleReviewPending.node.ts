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

const SEEN_KEY = 'reviewPending';

/**
 * `LoomCycle: Review Pending` — polling trigger that fires when a run's
 * finished answer is HELD for an operator's verdict (RFC DJ review holds: a
 * run spawned with Hold for Review, or an agent_stop hook that answered
 * "hold"). The human-in-the-loop partner of Interrupt Pending: route the held
 * answer to a person, then rule on it with Run → Review.
 *
 * Uses n8n's `poll()` framework (no timers — Cloud rule). Each tick does ONE
 * `listUserAgents(userId, {status: 'running', awaitedState: ['review']})`
 * (loomcycle ≥ v1.113). The `awaited_state` check is repeated here because an
 * older server ignores the filter and would return every running run.
 *
 * The dedup state is the set of runs held at the last poll, not every run ever
 * seen: a rejected answer that comes back revised is held again, and must fire
 * again.
 */
export class LoomCycleReviewPending implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Review Pending',
		name: 'loomCycleReviewPending',
		icon: 'file:LoomCycleReviewPending.svg',
		group: ['trigger'],
		version: 1,
		polling: true,
		description: "Fires when a loomcycle run's answer is held for an operator's review",
		defaults: { name: 'LoomCycle: Review Pending' },
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
				description: "User_id whose runs to watch. Empty = use the credential's Default User ID.",
			},
			{
				displayName: 'Agent',
				name: 'agent',
				type: 'string',
				default: '',
				description: 'Only fire for runs of this agent. Empty = every agent.',
			},
			{
				displayName: 'Rule on each hold with Run → Review',
				name: 'reviewNotice',
				type: 'notice',
				default: '',
				description:
					'Each item is a held run. Approve it, or reject it with feedback to have it revise, using the LoomCycle Run node\'s Review operation and the item\'s run_id. A hold that nobody rules on ends the run as rejected. Requires loomcycle ≥ v1.113.',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const agentFilter = ((this.getNodeParameter('agent', '') as string) ?? '').trim();
		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		if (!userId) {
			throw wrapLoomcycleError(
				new Error('User ID required — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		let rows;
		try {
			rows = await client.listUserAgents(userId, { status: 'running', awaitedState: ['review'] });
		} catch (err) {
			throw wrapLoomcycleError(err, this.getNode());
		}

		const held = rows.filter(
			(a) => a.awaited_state === 'review' && Boolean(a.run_id) && (!agentFilter || a.agent === agentFilter),
		);
		const previouslyHeld = readSeenSet(this, SEEN_KEY);
		const fresh = held.filter((a) => !previouslyHeld.has(a.run_id as string));

		writeSeenSet(this, SEEN_KEY, new Set(held.map((a) => a.run_id as string)));

		if (fresh.length === 0) return null;
		return [fresh.map((a) => ({ json: a as unknown as IDataObject }))];
	}
}
