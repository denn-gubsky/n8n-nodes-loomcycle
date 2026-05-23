import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollOnce } from '../../../nodes/LoomCycleRunCompleted/helpers/poll';

function makeCtx() {
	const staticData: Record<string, unknown> = {};
	return {
		emit: vi.fn(),
		emitError: vi.fn(),
		helpers: { returnJsonArray: (items: unknown[]) => items },
		getNode: () => ({ name: 'LoomCycle Test', type: 'loomCycleRunCompleted' }),
		getWorkflowStaticData: (_kind: string) => staticData,
	};
}

type LoopThis = Parameters<typeof Function.prototype.call>[0];

describe('pollOnce', () => {
	let ctx: ReturnType<typeof makeCtx>;
	beforeEach(() => {
		ctx = makeCtx();
	});

	it('calls listUserAgents once per requested status', async () => {
		const listUserAgents = vi.fn().mockResolvedValue([]);
		await pollOnce.call(ctx as unknown as LoopThis, {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: ['completed', 'failed'],
			intervalMs: 0,
			signal: new AbortController().signal,
		});
		expect(listUserAgents).toHaveBeenCalledTimes(2);
	});

	it('falls back to all 3 terminal statuses when statuses is empty', async () => {
		const listUserAgents = vi.fn().mockResolvedValue([]);
		await pollOnce.call(ctx as unknown as LoopThis, {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: [],
			intervalMs: 0,
			signal: new AbortController().signal,
		});
		expect(listUserAgents).toHaveBeenCalledTimes(3);
	});

	it('emits new rows + dedups across invocations', async () => {
		const listUserAgents = vi
			.fn()
			.mockResolvedValueOnce([{ agent_id: 'a1', status: 'completed' }])
			.mockResolvedValueOnce([
				{ agent_id: 'a1', status: 'completed' }, // dedup'd
				{ agent_id: 'a2', status: 'completed' },
			]);
		const signal = new AbortController().signal;
		const opts = {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: ['completed'] as const,
			intervalMs: 0,
			signal,
		};

		await pollOnce.call(ctx as unknown as LoopThis, { ...opts, statuses: ['completed'] });
		expect(ctx.emit).toHaveBeenCalledTimes(1);
		expect((ctx.emit.mock.calls[0][0] as unknown[][])[0]).toHaveLength(1);

		await pollOnce.call(ctx as unknown as LoopThis, { ...opts, statuses: ['completed'] });
		expect(ctx.emit).toHaveBeenCalledTimes(2);
		expect((ctx.emit.mock.calls[1][0] as unknown[][])[0]).toHaveLength(1);
	});

	it('forwards parentAgentId to listUserAgents opts', async () => {
		const listUserAgents = vi.fn().mockResolvedValue([]);
		await pollOnce.call(ctx as unknown as LoopThis, {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: ['completed'],
			parentAgentId: 'parent-xyz',
			intervalMs: 0,
			signal: new AbortController().signal,
		});
		const opts = listUserAgents.mock.calls[0][1] as { parentAgentId?: string };
		expect(opts.parentAgentId).toBe('parent-xyz');
	});

	it('does not emit when no fresh rows', async () => {
		const listUserAgents = vi.fn().mockResolvedValue([]);
		await pollOnce.call(ctx as unknown as LoopThis, {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: ['completed'],
			intervalMs: 0,
			signal: new AbortController().signal,
		});
		expect(ctx.emit).not.toHaveBeenCalled();
	});

	it('skips rows without agent_id (substrate edge case)', async () => {
		const listUserAgents = vi.fn().mockResolvedValue([{ status: 'completed' }, { agent_id: '', status: 'completed' }]);
		await pollOnce.call(ctx as unknown as LoopThis, {
			client: { listUserAgents } as unknown as Parameters<typeof pollOnce>[0]['client'],
			userId: 'u1',
			statuses: ['completed'],
			intervalMs: 0,
			signal: new AbortController().signal,
		});
		expect(ctx.emit).not.toHaveBeenCalled();
	});
});
