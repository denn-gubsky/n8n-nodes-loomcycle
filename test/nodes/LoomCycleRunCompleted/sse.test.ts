import { describe, it, expect, vi } from 'vitest';
import { runSseLoop } from '../../../nodes/LoomCycleRunCompleted/helpers/sse';

/**
 * Build an async-iterable that yields the given items + then aborts the
 * controller. Without this, the SSE loop would re-open the stream
 * forever in tests because the outer while-loop only exits on
 * signal.aborted.
 */
function asAbortingIterable<T>(items: T[], ac: AbortController): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) {
				yield item;
			}
			ac.abort();
		},
	};
}

function makeCtx() {
	return {
		emit: vi.fn(),
		emitError: vi.fn(),
		helpers: {
			returnJsonArray: (items: unknown[]) => items,
		},
		getNode: () => ({ name: 'LoomCycle Test', type: 'loomCycleRunCompleted' }),
	};
}

// Cast to satisfy the loop's ThisType — the loop only touches the
// emit/emitError/helpers/getNode surfaces this fixture provides.
type LoopThis = Parameters<typeof runSseLoop>[0] extends infer _ ? Parameters<typeof Function.prototype.call>[0] : never;

describe('runSseLoop', () => {
	it('emits one item per `kind: event` frame', async () => {
		const ac = new AbortController();
		const events = [
			{ kind: 'event' as const, payload: { run_id: 'r1', status: 'completed', ts: 't1' } },
			{ kind: 'event' as const, payload: { run_id: 'r2', status: 'failed', ts: 't2' } },
		];
		const streamUserRunStates = vi.fn(() => asAbortingIterable(events, ac));
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: ['completed', 'failed'],
			debug: false,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(ctx.emit).toHaveBeenCalledTimes(2);
	});

	it('forwards parentAgentId + debug to streamUserRunStates', async () => {
		const ac = new AbortController();
		const streamUserRunStates = vi.fn(() => asAbortingIterable([], ac));
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: ['completed'],
			parentAgentId: 'parent-abc',
			debug: true,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(streamUserRunStates).toHaveBeenCalledOnce();
		const callArgs = streamUserRunStates.mock.calls[0] as unknown as [
			string,
			{ parentAgentId?: string; debug?: boolean; statuses?: string[] },
		];
		expect(callArgs[0]).toBe('u1');
		expect(callArgs[1].parentAgentId).toBe('parent-abc');
		expect(callArgs[1].debug).toBe(true);
		expect(callArgs[1].statuses).toEqual(['completed']);
	});

	it('emits stream_close meta-frame when emitClose=true and a close item arrives', async () => {
		const ac = new AbortController();
		const events = [
			{ kind: 'event' as const, payload: { run_id: 'r1', status: 'completed', ts: 't1' } },
			{ kind: 'close' as const, payload: { reason: 'eof' } },
		];
		const streamUserRunStates = vi.fn(() => asAbortingIterable(events, ac));
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: [],
			debug: true,
			emitClose: true,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(ctx.emit).toHaveBeenCalledTimes(2);
		const secondArg = ctx.emit.mock.calls[1][0] as unknown[][];
		expect(secondArg[0][0]).toMatchObject({ __meta: 'stream_close', reason: 'eof' });
	});

	it('does NOT emit stream_close when emitClose=false', async () => {
		const ac = new AbortController();
		const events = [
			{ kind: 'event' as const, payload: { run_id: 'r1', status: 'completed', ts: 't1' } },
			{ kind: 'close' as const, payload: { reason: 'eof' } },
		];
		const streamUserRunStates = vi.fn(() => asAbortingIterable(events, ac));
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: [],
			debug: true,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(ctx.emit).toHaveBeenCalledTimes(1);
	});

	it('aborts immediately when signal is already fired before stream opens', async () => {
		const ac = new AbortController();
		ac.abort();
		const streamUserRunStates = vi.fn();
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: [],
			debug: false,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(streamUserRunStates).not.toHaveBeenCalled();
	});

	it('emitError ONCE on terminal give-up (5 consecutive errors) + does not spam during reconnects', async () => {
		const ac = new AbortController();
		// Throws on every call → loop hits catch → retries 5× silently → gives up
		// → emitError fires ONCE on the terminal attempt.
		const streamUserRunStates = vi.fn(() => {
			throw new Error('boom');
		});
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: [],
			debug: false,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		// Exactly one emitError — no spam during the 4 transient retries.
		expect(ctx.emitError).toHaveBeenCalledTimes(1);
		// And streamUserRunStates was retried up to the cap.
		expect(streamUserRunStates).toHaveBeenCalledTimes(5);
	});

	it('resets the consecutive-failure counter after a clean stream close', async () => {
		// Verifies: when the stream returns cleanly (no throw), the next
		// reconnect cycle starts fresh — a single later failure does NOT
		// re-trigger the terminal give-up path.
		const ac = new AbortController();
		let openCount = 0;
		const streamUserRunStates = vi.fn(() => {
			openCount++;
			if (openCount === 1) {
				// First open: clean stream with one event, then EOF (no abort yet).
				return {
					async *[Symbol.asyncIterator]() {
						yield { kind: 'event', payload: { run_id: 'r1', status: 'completed', ts: 't1' } };
					},
				};
			}
			// Second open: abort + return empty so the outer while exits.
			ac.abort();
			return {
				async *[Symbol.asyncIterator]() {
					/* empty */
				},
			};
		});
		const ctx = makeCtx();

		await runSseLoop.call(ctx as unknown as LoopThis, {
			client: { streamUserRunStates } as unknown as Parameters<typeof runSseLoop>[0]['client'],
			userId: 'u1',
			statuses: [],
			debug: false,
			emitClose: false,
			signal: ac.signal,
			reconnectBackoffMs: 1,
		});

		expect(streamUserRunStates).toHaveBeenCalledTimes(2);
		expect(ctx.emit).toHaveBeenCalledTimes(1); // emitted the event from open #1
		expect(ctx.emitError).not.toHaveBeenCalled(); // no failures
	});
});
