import type {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import type { AgentStatus } from '@loomcycle/client';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { wrapLoomcycleError } from '../LoomCycle/helpers/errors';
import { runSseLoop, runSseListenOnce } from './helpers/sse';
import { runPollLoop, pollOnce } from './helpers/poll';

/**
 * `LoomCycle: Run Completed` — trigger that fires when a loomcycle
 * agent run reaches a terminal state (completed / failed / cancelled).
 *
 * Two transports, operator-selectable via the `mode` parameter:
 *   - `sse` (default): persistent stream via streamUserRunStates. The
 *     adapter handles the substrate's 30-min server-side cap by
 *     yielding cleanly; our loop transparently re-opens. parentAgentId
 *     filter and debug toggle are forwarded.
 *   - `poll`: periodic listUserAgents calls with workflow-static
 *     dedup. Use when the deployment can't sustain long-lived SSE
 *     (reverse-proxy issues, Cloudflare workers, etc.).
 */
export class LoomCycleRunCompleted implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Run Completed',
		name: 'loomCycleRunCompleted',
		icon: 'file:LoomCycleRunCompleted.svg',
		group: ['trigger'],
		version: 1,
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
				displayName: 'Transport',
				name: 'mode',
				type: 'options',
				default: 'sse',
				options: [
					{
						name: 'SSE (Push)',
						value: 'sse',
						description: 'Persistent stream; near-zero latency. Requires reverse-proxy SSE support.',
					},
					{
						name: 'Polling',
						value: 'poll',
						description: 'Periodic list calls with dedup. Use when SSE is not viable.',
					},
				],
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'intervalSec',
				type: 'number',
				default: 30,
				typeOptions: { minValue: 5, maxValue: 3600 },
				displayOptions: { show: { mode: ['poll'] } },
				description: 'How frequently to poll for new terminal-state rows',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Agent Name',
						name: 'agent',
						type: 'string',
						default: '',
						description: 'Narrow to runs of a specific agent name (SSE mode only)',
					},
					{
						displayName: 'Parent Agent ID',
						name: 'parentAgentId',
						type: 'string',
						default: '',
						description: 'Narrow to sub-runs of a specific parent agent_id',
					},
					{
						displayName: 'Surface Stream Open/Close Events',
						name: 'emitClose',
						type: 'boolean',
						default: false,
						description: 'Whether to emit synthetic `{__meta:"stream_close"}` rows when the SSE stream reconnects. SSE mode only.',
					},
					{
						displayName: 'Reconnect Backoff (Ms)',
						name: 'reconnectBackoffMs',
						type: 'number',
						default: 1000,
						typeOptions: { minValue: 100, maxValue: 60000 },
						description: 'Base backoff between SSE reconnects. Multiplied by attempt count (capped at 4×).',
					},
				],
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const statuses = (this.getNodeParameter('statuses', ['completed']) as string[]) ?? ['completed'];
		const mode = (this.getNodeParameter('mode', 'sse') as string) ?? 'sse';
		const intervalSec = (this.getNodeParameter('intervalSec', 30) as number) ?? 30;
		const additionalFields = (this.getNodeParameter('additionalFields', {}) as Record<string, unknown>) ?? {};

		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		if (!userId) {
			throw wrapLoomcycleError(
				new Error('User ID required — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		const ac = new AbortController();

		const agent = (additionalFields.agent as string) || undefined;
		const parentAgentId = (additionalFields.parentAgentId as string) || undefined;
		const emitClose = (additionalFields.emitClose as boolean) ?? false;
		const reconnectBackoffMs = (additionalFields.reconnectBackoffMs as number) ?? 1000;

		// Background loop — fire-and-forget. n8n's closeFunction aborts
		// the controller; both loops respect it cooperatively.
		if (mode === 'poll') {
			void runPollLoop.call(this, {
				client,
				userId,
				statuses: statuses as AgentStatus[],
				parentAgentId,
				intervalMs: intervalSec * 1000,
				signal: ac.signal,
			});
		} else {
			void runSseLoop.call(this, {
				client,
				userId,
				statuses,
				parentAgentId,
				agent,
				debug: emitClose,
				emitClose,
				signal: ac.signal,
				reconnectBackoffMs,
			});
		}

		// Single-shot path used when the operator clicks "Execute step" /
		// "Listen for Test Event" in the n8n editor. Routes by Transport:
		//   - sse:  briefly subscribe and emit the next live event (30s
		//           window), so editor test mode actually exercises the
		//           SSE wire path the operator selected.
		//   - poll: one pollOnce iteration — emits a snapshot of currently-
		//           matching rows. workflowStaticData doesn't persist
		//           between editor test runs, so dedup is best-effort here
		//           (it's authoritative only in production / published
		//           mode).
		async function manualTriggerFunction(this: ITriggerFunctions): Promise<void> {
			if (mode === 'sse') {
				await runSseListenOnce.call(this, {
					client,
					userId,
					statuses,
					parentAgentId,
					agent,
					timeoutMs: 30_000,
				});
				return;
			}
			const oneShotAc = new AbortController();
			await pollOnce.call(this, {
				client,
				userId,
				statuses: statuses as AgentStatus[],
				parentAgentId,
				intervalMs: 0,
				signal: oneShotAc.signal,
			});
		}

		return {
			closeFunction: async () => {
				ac.abort();
			},
			manualTriggerFunction: manualTriggerFunction.bind(this),
		};
	}
}
