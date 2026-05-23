import type { IDataObject, ITriggerFunctions } from 'n8n-workflow';
import type { Agent, AgentStatus, LoomcycleClient } from '@loomcycle/client';
import { readSeenSet, writeSeenSet } from '../../LoomCycle/helpers/staticData';

/**
 * Polling-fallback event loop for the LoomCycleRunCompleted trigger.
 *
 * Calls `listUserAgents(userId, { status, parentAgentId? })` on a fixed
 * interval, dedups against `workflowStaticData[seenKey].seen` (a set of
 * agent_ids), emits any new rows whose status matches the operator's
 * filter. Terminal statuses go into the seen set; running rows are
 * skipped (we want the COMPLETION emit, not in-flight emits).
 *
 * Used when the operator's deployment can't sustain a long-lived SSE
 * connection (Cloudflare workers without WebSocket, naive nginx
 * `proxy_buffering on`, etc.).
 */

const SEEN_KEY = 'runCompletedSeen';

export interface PollOptions {
	client: LoomcycleClient;
	userId: string;
	statuses: AgentStatus[];
	parentAgentId?: string;
	intervalMs: number;
	signal: AbortSignal;
}

export async function runPollLoop(this: ITriggerFunctions, opts: PollOptions): Promise<void> {
	while (!opts.signal.aborted) {
		try {
			await pollOnce.call(this, opts);
		} catch (err) {
			if (opts.signal.aborted) return;
			this.emitError(err as Error);
			// fall through to wait then retry
		}
		await sleep(opts.intervalMs, opts.signal);
	}
}

export async function pollOnce(this: ITriggerFunctions, opts: PollOptions): Promise<void> {
	// listUserAgents takes a single `status` filter; iterate the
	// operator's selection. When empty, ask for all terminal statuses.
	const wanted = opts.statuses.length > 0 ? opts.statuses : (['completed', 'failed', 'cancelled'] as AgentStatus[]);

	const seen = readSeenSet(this, SEEN_KEY);
	const fresh: Agent[] = [];

	for (const status of wanted) {
		const rows = await opts.client.listUserAgents(opts.userId, {
			status,
			parentAgentId: opts.parentAgentId,
			signal: opts.signal,
		});
		for (const row of rows) {
			if (!row.agent_id || seen.has(row.agent_id)) continue;
			fresh.push(row);
			seen.add(row.agent_id);
		}
	}

	if (fresh.length > 0) {
		writeSeenSet(this, SEEN_KEY, seen);
		this.emit([this.helpers.returnJsonArray(fresh.map((r) => r as unknown as IDataObject))]);
	}
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const t = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(t);
			resolve();
		});
	});
}
