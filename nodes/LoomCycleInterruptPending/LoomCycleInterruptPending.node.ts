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

const SEEN_KEY = 'interruptPending';

/**
 * `LoomCycle: Interrupt Pending` — polling trigger that fires when an agent
 * raises a new pending Interruption.ask for the watched user_id.
 *
 * Uses n8n's `poll()` framework (no timers — Cloud rule): each tick does ONE
 * `listUserInterrupts(userId, {status: 'pending'})`, diffs against per-workflow
 * dedup state (keyed by interrupt_id), and emits only newly-seen asks. Wire
 * the output to a human channel (Slack / email / form) and feed the answer
 * back through the LoomCycle Interruption → Resolve op to unblock the agent.
 */
export class LoomCycleInterruptPending implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Interrupt Pending',
		name: 'loomCycleInterruptPending',
		icon: 'file:LoomCycleInterruptPending.svg',
		group: ['trigger'],
		version: 1,
		polling: true,
		description: 'Fires when a loomcycle agent raises a new pending interruption (question) for a user',
		defaults: { name: 'LoomCycle: Interrupt Pending' },
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
				description: 'User_id to watch for pending interrupts. Empty = use the credential\'s Default User ID.',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		if (!userId) {
			throw wrapLoomcycleError(
				new Error('User ID required — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		let resp;
		try {
			resp = await client.listUserInterrupts(userId, { status: 'pending' });
		} catch (err) {
			throw wrapLoomcycleError(err, this.getNode());
		}

		const interrupts = resp.interrupts ?? [];
		const seen = readSeenSet(this, SEEN_KEY);
		const fresh = interrupts.filter((r) => !seen.has(r.interrupt_id));

		if (fresh.length === 0) return null;

		for (const r of fresh) seen.add(r.interrupt_id);
		writeSeenSet(this, SEEN_KEY, seen);

		return [fresh.map((r) => ({ json: r as unknown as IDataObject }))];
	}
}
