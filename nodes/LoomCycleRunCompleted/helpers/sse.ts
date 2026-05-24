import type { IDataObject, ITriggerFunctions } from 'n8n-workflow';
import type { LoomcycleClient } from '@loomcycle/client';

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

/**
 * Single-shot SSE listen for n8n's editor "Execute step" / manual
 * trigger path (n8n calls this via `manualTriggerFunction`). Subscribes
 * to `streamUserRunStates`, emits the FIRST `kind === "event"` row that
 * arrives via `this.emit`, then resolves. Times out cleanly without
 * emitting after `timeoutMs` so the editor regains control instead of
 * hanging indefinitely when no live run completes in the window.
 *
 * Why a dedicated helper (not just runSseLoop with `signal.abort()` on
 * first emit): we want a tight scope-of-life — no reconnect attempts,
 * no auto-backoff, no debug/close meta emits. The editor test mode is
 * "wait for the next real event, then quit." Anything else is noise.
 */
export interface SseListenOnceOptions {
	client: LoomcycleClient;
	userId: string;
	statuses: string[];
	parentAgentId?: string;
	agent?: string;
	timeoutMs: number;
}

export async function runSseListenOnce(
	this: ITriggerFunctions,
	opts: SseListenOnceOptions,
): Promise<void> {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
	try {
		for await (const item of opts.client.streamUserRunStates(opts.userId, {
			statuses: opts.statuses.length > 0 ? opts.statuses : undefined,
			agent: opts.agent,
			parentAgentId: opts.parentAgentId,
			signal: ac.signal,
		})) {
			if (item.kind === 'event') {
				this.emit([this.helpers.returnJsonArray([item.payload as unknown as IDataObject])]);
				return;
			}
			// close/open meta items: ignore in test mode — they're transport
			// telemetry, not real trigger events.
		}
	} catch (err) {
		// Clean timeout fires AbortError via the adapter's signal handling;
		// swallow it (no emit, editor returns control). Re-throw any other
		// failure (auth, network, etc.) so the editor surfaces it.
		if (ac.signal.aborted) return;
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

export async function runSseLoop(this: ITriggerFunctions, opts: SseOptions): Promise<void> {
	let attempt = 0;
	while (!opts.signal.aborted) {
		try {
			for await (const item of opts.client.streamUserRunStates(opts.userId, {
				statuses: opts.statuses.length > 0 ? opts.statuses : undefined,
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
			if (attempt >= 5) {
				// Terminal — no more reconnects. emitError ONCE so n8n's
				// trigger lifecycle deactivates rather than going silently
				// deaf. Earlier attempts swallow the error + backoff because
				// transient SSE drops are normal (30-min server cap,
				// reverse-proxy idle resets, etc).
				this.emitError(err as Error);
				return;
			}
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
