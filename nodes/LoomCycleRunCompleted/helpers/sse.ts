import type { IDataObject, ITriggerFunctions } from 'n8n-workflow';
import type { LoomcycleClient, RunStateEvent } from '@loomcycle/client';

/**
 * SSE-driven event loop for the LoomCycleRunCompleted trigger.
 *
 * Wraps `client.streamUserRunStates(userId, opts)` in an auto-reconnect
 * outer loop: when the iterator completes (server-side 30-min cap, or
 * a transient disconnect), the loop re-opens unless the abort signal
 * is fired.
 *
 * Adapter `debug: true` yields synthetic `{ kind: "close", payload:
 * { reason } }` items around real frames; we emit those as debug rows
 * so the operator can see reconnects when opted-in.
 *
 * On a non-abort error (network / 5xx / auth flip), the loop re-throws
 * via emitError so the n8n trigger lifecycle handles it.
 */

export interface SseOptions {
	client: LoomcycleClient;
	userId: string;
	statuses: string[];
	parentAgentId?: string;
	agent?: string;
	debug: boolean;
	emitClose: boolean;
	signal: AbortSignal;
	reconnectBackoffMs: number;
}

export async function runSseLoop(this: ITriggerFunctions, opts: SseOptions): Promise<void> {
	let attempt = 0;
	while (!opts.signal.aborted) {
		try {
			for await (const item of opts.client.streamUserRunStates(opts.userId, {
				statuses: opts.statuses.length > 0 ? (opts.statuses as RunStateEvent['status'][]) : undefined,
				agent: opts.agent,
				parentAgentId: opts.parentAgentId,
				debug: opts.debug,
				signal: opts.signal,
			})) {
				if (opts.signal.aborted) return;
				if (item.kind === 'event') {
					this.emit([this.helpers.returnJsonArray([item.payload as unknown as IDataObject])]);
				} else if (item.kind === 'close' && opts.emitClose) {
					this.emit([
						this.helpers.returnJsonArray([
							{
								__meta: 'stream_close',
								reason: (item as { payload?: { reason?: string } }).payload?.reason ?? '',
							} as IDataObject,
						]),
					]);
				}
			}
			attempt = 0; // clean stream end → reset backoff
		} catch (err) {
			if (opts.signal.aborted) return;
			attempt += 1;
			this.emitError(err as Error);
			if (attempt >= 5) return; // give up after 5 reconnects without ever yielding
			await sleep(opts.reconnectBackoffMs * Math.min(attempt, 4), opts.signal);
		}
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
