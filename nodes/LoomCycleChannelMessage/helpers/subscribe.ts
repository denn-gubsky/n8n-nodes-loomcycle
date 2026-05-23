import type { IDataObject, ITriggerFunctions } from 'n8n-workflow';
import type { ChannelScope, LoomcycleClient } from '@loomcycle/client';
import { readCursor, writeCursor } from '../../LoomCycle/helpers/staticData';

/**
 * Long-poll subscribe loop for the LoomCycleChannelMessage trigger.
 *
 * Two delivery shapes:
 *   - `auto-ack` (default): direct subscribeChannel — substrate
 *     auto-commits the cursor on a non-empty batch (at-most-once).
 *   - `peek-ack`: peekChannel + ackChannel-after-emit. Survives
 *     workflow crashes between "loomcycle returned the batch" and
 *     "downstream node finished processing" (at-least-once).
 *
 * On any error, surfaces via emitError and waits one backoff before
 * retrying. The outer abort signal breaks both error-retry sleep and
 * the next long-poll round-trip.
 */

const CURSOR_KEY = 'channelMessageCursor';

export interface SubscribeOptions {
	client: LoomcycleClient;
	channel: string;
	scope: ChannelScope;
	userId?: string;
	deliveryMode: 'auto-ack' | 'peek-ack';
	maxMessages: number;
	waitMs: number;
	backoffMs: number;
	signal: AbortSignal;
}

export async function runSubscribeLoop(this: ITriggerFunctions, opts: SubscribeOptions): Promise<void> {
	while (!opts.signal.aborted) {
		try {
			const emitted = await subscribeOnce.call(this, opts);
			if (emitted === 0) {
				// long-poll returned empty (timed out); loop immediately
				continue;
			}
		} catch (err) {
			if (opts.signal.aborted) return;
			this.emitError(err as Error);
			await sleep(opts.backoffMs, opts.signal);
		}
	}
}

/**
 * Single long-poll round. Returns the number of messages emitted.
 * Exposed as a separate function so manualTriggerFunction can do a
 * one-shot listen.
 */
export async function subscribeOnce(this: ITriggerFunctions, opts: SubscribeOptions): Promise<number> {
	if (opts.deliveryMode === 'peek-ack') {
		const persistedCursor = readCursor(this, CURSOR_KEY);
		const resp = await opts.client.peekChannel(opts.channel, {
			scope: opts.scope,
			userId: opts.userId,
			fromCursor: persistedCursor || undefined,
			maxMessages: opts.maxMessages,
			signal: opts.signal,
		});
		const messages = resp.messages ?? [];
		if (messages.length === 0) {
			// Peek doesn't long-poll; sleep waitMs before next iteration
			// so we don't spin.
			await sleep(opts.waitMs, opts.signal);
			return 0;
		}
		this.emit([this.helpers.returnJsonArray(messages.map((m) => m as unknown as IDataObject))]);
		const lastCursor = messages[messages.length - 1].id;
		await opts.client.ackChannel(opts.channel, {
			scope: opts.scope,
			userId: opts.userId,
			cursor: lastCursor,
			signal: opts.signal,
		});
		writeCursor(this, CURSOR_KEY, lastCursor);
		return messages.length;
	}

	// auto-ack — direct subscribe
	const resp = await opts.client.subscribeChannel(opts.channel, {
		scope: opts.scope,
		userId: opts.userId,
		maxMessages: opts.maxMessages,
		waitMs: opts.waitMs,
		signal: opts.signal,
	});
	const messages = resp.messages ?? [];
	if (messages.length === 0) return 0;
	this.emit([this.helpers.returnJsonArray(messages.map((m) => m as unknown as IDataObject))]);
	return messages.length;
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
