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

	it('emitError on stream throw + gives up after 5 attempts', async () => {
		const ac = new AbortController();
		// Throws on call → loop hits catch → emitError → retries up to 5×.
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

		expect(ctx.emitError).toHaveBeenCalled();
		// Bound: at least 1 emitError, at most 5 (per the give-up cap in the loop).
		expect(ctx.emitError.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(ctx.emitError.mock.calls.length).toBeLessThanOrEqual(5);
	});
});
