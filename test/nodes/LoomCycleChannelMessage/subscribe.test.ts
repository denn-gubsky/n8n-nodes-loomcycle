import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribeOnce } from '../../../nodes/LoomCycleChannelMessage/helpers/subscribe';

function makeCtx() {
	const staticData: Record<string, unknown> = {};
	return {
		emit: vi.fn(),
		emitError: vi.fn(),
		helpers: { returnJsonArray: (items: unknown[]) => items },
		getNode: () => ({ name: 'LoomCycle Test', type: 'loomCycleChannelMessage' }),
		getWorkflowStaticData: (_kind: string) => staticData,
	};
}

type LoopThis = Parameters<typeof Function.prototype.call>[0];

describe('subscribeOnce — auto-ack mode', () => {
	let ctx: ReturnType<typeof makeCtx>;
	beforeEach(() => {
		ctx = makeCtx();
	});

	it('calls subscribeChannel + emits messages', async () => {
		const subscribeChannel = vi
			.fn()
			.mockResolvedValue({ channel: 'events', messages: [{ id: 'm1', value: { x: 1 } }], next_cursor: '' });
		const count = await subscribeOnce.call(ctx as unknown as LoopThis, {
			client: { subscribeChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'global',
			deliveryMode: 'auto-ack',
			maxMessages: 10,
			waitMs: 100,
			backoffMs: 100,
			signal: new AbortController().signal,
		});
		expect(subscribeChannel).toHaveBeenCalledWith(
			'events',
			expect.objectContaining({ scope: 'global', maxMessages: 10, waitMs: 100 }),
		);
		expect(ctx.emit).toHaveBeenCalledTimes(1);
		expect(count).toBe(1);
	});

	it('returns 0 + no emit on empty batch', async () => {
		const subscribeChannel = vi.fn().mockResolvedValue({ channel: 'events', messages: [], next_cursor: '' });
		const count = await subscribeOnce.call(ctx as unknown as LoopThis, {
			client: { subscribeChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'global',
			deliveryMode: 'auto-ack',
			maxMessages: 10,
			waitMs: 100,
			backoffMs: 100,
			signal: new AbortController().signal,
		});
		expect(count).toBe(0);
		expect(ctx.emit).not.toHaveBeenCalled();
	});

	it('forwards userId to subscribeChannel for scope=user', async () => {
		const subscribeChannel = vi.fn().mockResolvedValue({ channel: 'events', messages: [], next_cursor: '' });
		await subscribeOnce.call(ctx as unknown as LoopThis, {
			client: { subscribeChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'user',
			userId: 'u1',
			deliveryMode: 'auto-ack',
			maxMessages: 10,
			waitMs: 100,
			backoffMs: 100,
			signal: new AbortController().signal,
		});
		const callArgs = subscribeChannel.mock.calls[0] as [string, { userId?: string }];
		expect(callArgs[1].userId).toBe('u1');
	});
});

describe('subscribeOnce — peek-ack mode (at-least-once)', () => {
	let ctx: ReturnType<typeof makeCtx>;
	beforeEach(() => {
		ctx = makeCtx();
	});

	it('peeks + emits + acks with the last message id as cursor', async () => {
		const peekChannel = vi.fn().mockResolvedValue({
			channel: 'events',
			messages: [
				{ id: 'm1', value: { a: 1 } },
				{ id: 'm2', value: { a: 2 } },
			],
		});
		const ackChannel = vi.fn().mockResolvedValue({ ok: true });
		const count = await subscribeOnce.call(ctx as unknown as LoopThis, {
			client: { peekChannel, ackChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'global',
			deliveryMode: 'peek-ack',
			maxMessages: 10,
			waitMs: 100,
			backoffMs: 100,
			signal: new AbortController().signal,
		});
		expect(count).toBe(2);
		expect(ctx.emit).toHaveBeenCalledTimes(1);
		expect(ackChannel).toHaveBeenCalledWith(
			'events',
			expect.objectContaining({ cursor: 'm2', scope: 'global' }),
		);
	});

	it('persists the cursor across invocations via workflowStaticData', async () => {
		const peekChannel = vi
			.fn()
			.mockResolvedValueOnce({ channel: 'events', messages: [{ id: 'm1', value: { a: 1 } }] })
			.mockResolvedValueOnce({ channel: 'events', messages: [{ id: 'm2', value: { a: 2 } }] });
		const ackChannel = vi.fn().mockResolvedValue({ ok: true });
		const signal = new AbortController().signal;
		const baseOpts = {
			client: { peekChannel, ackChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'global' as const,
			deliveryMode: 'peek-ack' as const,
			maxMessages: 10,
			waitMs: 100,
			backoffMs: 100,
			signal,
		};

		await subscribeOnce.call(ctx as unknown as LoopThis, baseOpts);
		await subscribeOnce.call(ctx as unknown as LoopThis, baseOpts);

		// Second peek should pass fromCursor=m1 (persisted after first ack)
		const secondCallArgs = peekChannel.mock.calls[1] as [string, { fromCursor?: string }];
		expect(secondCallArgs[1].fromCursor).toBe('m1');
	});

	it('returns 0 + sleeps when peek is empty (no spin)', async () => {
		const peekChannel = vi.fn().mockResolvedValue({ channel: 'events', messages: [] });
		const ackChannel = vi.fn();
		const count = await subscribeOnce.call(ctx as unknown as LoopThis, {
			client: { peekChannel, ackChannel } as unknown as Parameters<typeof subscribeOnce>[0]['client'],
			channel: 'events',
			scope: 'global',
			deliveryMode: 'peek-ack',
			maxMessages: 10,
			waitMs: 5,
			backoffMs: 100,
			signal: new AbortController().signal,
		});
		expect(count).toBe(0);
		expect(ctx.emit).not.toHaveBeenCalled();
		expect(ackChannel).not.toHaveBeenCalled();
	});
});
