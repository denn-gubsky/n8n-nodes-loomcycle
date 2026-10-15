import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		createTeam: vi.fn(),
		forkTeam: vi.fn(),
		listTeamVersions: vi.fn(),
		promoteTeam: vi.fn(),
		retireTeam: vi.fn(),
		verifyTeam: vi.fn(),
		runTeam: vi.fn(),
		cancelTurn: vi.fn(),
		listWalkRuns: vi.fn(),
		getRunBreakpoints: vi.fn(),
		setRunBreakpoints: vi.fn(),
		listTeamChannels: vi.fn(),
		peekTeamChannel: vi.fn(),
		releaseTeamChannel: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleTeam } from '../../../nodes/LoomCycleTeam/LoomCycleTeam.node';
import { teamOps } from '../../../nodes/LoomCycle/descriptions';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

function run(params: Record<string, unknown>) {
	return new LoomCycleTeam().execute.call(makeExecuteContext({ params: { resource: 'team', ...params } }));
}

const GRAPH = '{"entry":"a","states":[{"state":"a","handler":{"kind":"terminal"}}],"transitions":[]}';

describe('LoomCycle Team — v1.113 lifecycle and walks', () => {
	it('no longer tells the operator a fork cannot be promoted', () => {
		expect(teamOps.find((p) => p.name === 'forkPromoteNotice')).toBeUndefined();
		const op = teamOps.find((p) => p.name === 'operation');
		const values = (op?.options as Array<{ value: string }>).map((o) => o.value);
		for (const v of ['promote', 'retire', 'verify', 'listVersions', 'cancelWalk', 'listWalkRuns', 'setBreakpoints']) {
			expect(values).toContain(v);
		}
	});

	it('Create promotes by default and Fork does not, each sent explicitly', async () => {
		mockClient.createTeam.mockResolvedValue({ def_id: 'tdf_1' });
		mockClient.forkTeam.mockResolvedValue({ def_id: 'tdf_2' });
		await run({ operation: 'create', teamName: 't', overlay: GRAPH });
		expect(mockClient.createTeam.mock.calls[0][2]).toEqual({ promote: true });
		await run({ operation: 'fork', teamName: 't', overlay: GRAPH });
		expect(mockClient.forkTeam.mock.calls[0][2]).toEqual({ promote: false });
		await run({ operation: 'fork', teamName: 't', overlay: GRAPH, promote: true, parentDefId: 'tdf_1' });
		expect(mockClient.forkTeam.mock.calls[1][2]).toEqual({ promote: true, parentDefId: 'tdf_1' });
	});

	it('Promote, Retire and List Versions address versions by def_id / name', async () => {
		mockClient.promoteTeam.mockResolvedValue({ promoted: true });
		mockClient.retireTeam.mockResolvedValue({ retired: false });
		mockClient.listTeamVersions.mockResolvedValue({ versions: [] });
		await run({ operation: 'promote', defId: 'tdf_2' });
		await run({ operation: 'retire', defId: 'tdf_2', retired: false });
		await run({ operation: 'listVersions', teamName: 't' });
		expect(mockClient.promoteTeam).toHaveBeenCalledWith('tdf_2');
		expect(mockClient.retireTeam).toHaveBeenCalledWith('tdf_2', false);
		expect(mockClient.listTeamVersions).toHaveBeenCalledWith('t');
	});

	it('Verify checks a hash, or an unsaved graph as a create or fork', async () => {
		mockClient.verifyTeam.mockResolvedValue({ matches: true });
		await run({ operation: 'verify', teamName: 't', verifyMode: 'hash', contentSha256: 'sha256:x' });
		expect(mockClient.verifyTeam).toHaveBeenLastCalledWith('t', 'sha256:x');
		await run({ operation: 'verify', teamName: 't', verifyMode: 'draft', draftOverlay: GRAPH, draftAs: 'fork' });
		expect(mockClient.verifyTeam).toHaveBeenLastCalledWith('t', { overlay: JSON.parse(GRAPH), as: 'fork' });
	});

	it('Run sends variables, detach, review, breakpoints, idempotency and the cap ask', async () => {
		mockClient.runTeam.mockResolvedValue({ run_id: 'r_walk', status: 'running' });
		await run({
			operation: 'run',
			runTargetBy: 'name',
			runTeamName: 't',
			input: 'go',
			waitForWalk: false,
			runVars: { variable: [{ name: 'tone', value: 'casual' }] },
			walkOptions: {
				breakpoints: 'draft, review:review',
				reviewStates: 'review',
				reviewTtlSeconds: 600,
				idempotencyKey: ' press-1 ',
				interruptOnCap: true,
			},
		});
		expect(mockClient.runTeam).toHaveBeenCalledWith({
			name: 't',
			input: 'go',
			vars: { tone: 'casual' },
			mode: 'detach',
			breakpoints: ['draft', 'review:review'],
			review: ['review'],
			reviewTtlSeconds: 600,
			idempotencyKey: 'press-1',
			interruptOnCap: true,
		});
	});

	it('Run with nothing new set sends what it always did', async () => {
		mockClient.runTeam.mockResolvedValue({ steps: [] });
		await run({ operation: 'run', runTargetBy: 'name', runTeamName: 't', input: 'go' });
		expect(mockClient.runTeam).toHaveBeenCalledWith({ name: 't', input: 'go' });
	});

	it('walk ops take the walk run_id; an empty breakpoint set clears them', async () => {
		mockClient.cancelTurn.mockResolvedValue({ stopped: true });
		mockClient.listWalkRuns.mockResolvedValue({ agents: [], next_cursor: '' });
		mockClient.setRunBreakpoints.mockResolvedValue({ armed: [] });
		await run({ operation: 'cancelWalk', walkRunId: 'r_walk' });
		await run({ operation: 'listWalkRuns', walkRunId: 'r_walk', pageSize: 20 });
		await run({ operation: 'setBreakpoints', walkRunId: 'r_walk', setBreakpointList: '' });
		expect(mockClient.cancelTurn).toHaveBeenCalledWith('r_walk');
		expect(mockClient.listWalkRuns).toHaveBeenCalledWith('r_walk', { limit: 20 });
		expect(mockClient.setRunBreakpoints).toHaveBeenCalledWith('r_walk', [], undefined);
	});

	it('team channel ops send only the options that apply', async () => {
		mockClient.peekTeamChannel.mockResolvedValue({ messages: [] });
		mockClient.releaseTeamChannel.mockResolvedValue({ released_count: 2 });
		await run({ operation: 'peekChannel', teamName: 't', teamChannel: 'inbox', channelOptions: { maxMessages: 5, count: 9 } });
		expect(mockClient.peekTeamChannel).toHaveBeenCalledWith('t', 'inbox', { maxMessages: 5 });
		await run({ operation: 'releaseChannel', teamName: 't', teamChannel: 'inbox', channelOptions: { count: 2, userId: 'u1' } });
		expect(mockClient.releaseTeamChannel).toHaveBeenCalledWith('t', 'inbox', { userId: 'u1', count: 2 });
	});
});
