import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		listTeams: vi.fn(),
		getTeamDef: vi.fn(),
		createTeam: vi.fn(),
		forkTeam: vi.fn(),
		deleteTeam: vi.fn(),
		runTeam: vi.fn(),
		renderTeamDiagram: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleTeam as LoomCycle } from '../../../nodes/LoomCycleTeam/LoomCycleTeam.node';
import { loadTeams } from '../../../nodes/LoomCycle/helpers/loadOptions';
import { makeExecuteContext, makeLoadOptionsContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

const GRAPH = {
	entry: 'draft',
	states: [
		{ state: 'draft', handler: { kind: 'agent', agent: 'researcher' } },
		{ state: 'done', handler: { kind: 'terminal' } },
	],
	transitions: [{ from: 'draft', to: 'done', on: 'success' }],
};

describe('LoomCycle resource=team', () => {
	describe('List', () => {
		// `names` is a Go nil-slice: null, not [], when empty. Normalising spares
		// every downstream expression a null check.
		it('normalises a null names slice to an empty array', async () => {
			mockClient.listTeams.mockResolvedValue({ names: null });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({ params: { resource: 'team', operation: 'list' } });
			const result = await node.execute.call(ctx);
			expect(mockClient.listTeams).toHaveBeenCalledOnce();
			expect((result[0][0].json as Record<string, unknown>).names).toEqual([]);
		});

		it('passes through a populated roll-up', async () => {
			mockClient.listTeams.mockResolvedValue({
				names: [{ name: 'triage', version_count: 2, latest_version: 2 }],
			});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({ params: { resource: 'team', operation: 'list' } });
			const result = await node.execute.call(ctx);
			expect((result[0][0].json as Record<string, unknown>).names).toHaveLength(1);
		});
	});

	describe('Create + Fork', () => {
		it('Create parses the graph and folds the description into the overlay', async () => {
			mockClient.createTeam.mockResolvedValue({ def_id: 'tdf_1', version: 1, promoted: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'create',
					teamName: 'triage',
					overlay: JSON.stringify(GRAPH),
					defDescription: 'first cut',
				},
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.createTeam).toHaveBeenCalledWith('triage', {
				...GRAPH,
				description: 'first cut',
			});
			expect(result[0][0].json).toMatchObject({ def_id: 'tdf_1', promoted: true });
		});

		it('Create omits description when blank', async () => {
			mockClient.createTeam.mockResolvedValue({ def_id: 'tdf_1' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'create', teamName: 'triage', overlay: JSON.stringify(GRAPH) },
			});
			await node.execute.call(ctx);
			expect(mockClient.createTeam.mock.calls[0][1]).not.toHaveProperty('description');
		});

		// Verified live: a fork lands promoted:false, so it stays unreachable by
		// name. The node surfaces the response verbatim so an operator can see
		// that and grab the def_id.
		it('Fork surfaces the unpromoted response verbatim', async () => {
			mockClient.forkTeam.mockResolvedValue({ def_id: 'tdf_2', version: 2, promoted: false });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'fork',
					teamName: 'triage',
					overlay: JSON.stringify(GRAPH),
				},
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.forkTeam).toHaveBeenCalledWith('triage', GRAPH);
			expect(result[0][0].json).toMatchObject({ def_id: 'tdf_2', promoted: false });
		});

		// An invalid graph is refused server-side anyway, but a JSON typo should
		// name itself here rather than arriving as a graph-validation error.
		it('Create refuses malformed graph JSON before any wire call', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'create', teamName: 'triage', overlay: '{not json' },
			});
			await expect(node.execute.call(ctx)).rejects.toThrow();
			expect(mockClient.createTeam).not.toHaveBeenCalled();
		});
	});

	describe('Get + Delete + Render Diagram', () => {
		it('Get fetches by def_id', async () => {
			mockClient.getTeamDef.mockResolvedValue({ def_id: 'tdf_1', definition: GRAPH });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'get', defId: 'tdf_1' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.getTeamDef).toHaveBeenCalledWith('tdf_1');
			expect(result[0][0].json).toMatchObject({ def_id: 'tdf_1' });
		});

		it('Delete removes the whole team by name', async () => {
			mockClient.deleteTeam.mockResolvedValue({ name: 'triage', deleted: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'delete', teamName: 'triage' },
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.deleteTeam).toHaveBeenCalledWith('triage');
			expect(result[0][0].json).toMatchObject({ deleted: true });
		});

		it('Render Diagram omits the options object when no state is highlighted', async () => {
			mockClient.renderTeamDiagram.mockResolvedValue({ diagram: 'stateDiagram-v2', format: 'mermaid' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'renderDiagram', teamName: 'triage' },
			});
			await node.execute.call(ctx);
			expect(mockClient.renderTeamDiagram).toHaveBeenCalledWith('triage', undefined);
		});

		it('Render Diagram forwards a highlighted state', async () => {
			mockClient.renderTeamDiagram.mockResolvedValue({ diagram: 'stateDiagram-v2' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'renderDiagram',
					teamName: 'triage',
					highlightState: 'draft',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.renderTeamDiagram).toHaveBeenCalledWith('triage', { highlightState: 'draft' });
		});
	});

	describe('Run', () => {
		it('Run targets the active version by name', async () => {
			mockClient.runTeam.mockResolvedValue({ status: 'completed', trace: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'run',
					runTargetBy: 'name',
					runTeamName: 'triage',
					input: 'classify this ticket',
				},
			});
			const result = await node.execute.call(ctx);
			expect(mockClient.runTeam).toHaveBeenCalledWith({
				name: 'triage',
				input: 'classify this ticket',
			});
			expect(result[0][0].json).toMatchObject({ status: 'completed' });
		});

		// Running by def_id is how an unpromoted fork is reachable at all, given
		// the adapter exposes no promote method.
		it('Run pins an exact version by def_id and never sends a name', async () => {
			mockClient.runTeam.mockResolvedValue({ status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'run',
					runTargetBy: 'defId',
					runDefId: 'tdf_2',
					input: 'x',
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runTeam.mock.calls[0][0];
			expect(arg.defId).toBe('tdf_2');
			expect(arg).not.toHaveProperty('name');
		});

		it('Run binds a Document chunk task board with its scope', async () => {
			mockClient.runTeam.mockResolvedValue({ status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'run',
					runTargetBy: 'name',
					runTeamName: 'triage',
					boardOptions: { boardChunkId: 'c1', boardScope: 'agent' },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.runTeam).toHaveBeenCalledWith({
				name: 'triage',
				boardChunkId: 'c1',
				boardScope: 'agent',
			});
		});

		// boardScope alone is meaningless — it qualifies a board chunk that is not
		// there — so it must not reach the wire on its own.
		it('Run omits board scope when no board chunk is bound', async () => {
			mockClient.runTeam.mockResolvedValue({ status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'team',
					operation: 'run',
					runTargetBy: 'name',
					runTeamName: 'triage',
					boardOptions: { boardScope: 'agent' },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.runTeam.mock.calls[0][0];
			expect(arg).not.toHaveProperty('boardScope');
			expect(arg).not.toHaveProperty('boardChunkId');
		});

		it('Run omits an empty input', async () => {
			mockClient.runTeam.mockResolvedValue({ status: 'completed' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'team', operation: 'run', runTargetBy: 'name', runTeamName: 'triage', input: '   ' },
			});
			await node.execute.call(ctx);
			expect(mockClient.runTeam).toHaveBeenCalledWith({ name: 'triage' });
		});
	});

	describe('loadTeams', () => {
		it('badges each team with its version roll-up', async () => {
			mockClient.listTeams.mockResolvedValue({
				names: [
					{ name: 'triage', version_count: 3, latest_version: 3 },
					{ name: 'audit', version_count: 1, latest_version: 1 },
				],
			});
			const ctx = makeLoadOptionsContext({});
			const out = await loadTeams.call(ctx);
			expect(out.map((o) => o.value)).toEqual(['audit', 'triage']);
			expect(out[1].description).toBe('latest v3 · 3 versions');
		});

		// A retired active pointer means name-addressed Run and Render Diagram
		// have nothing live to resolve to — worth seeing in the picker.
		it('flags a team whose active version is retired', async () => {
			mockClient.listTeams.mockResolvedValue({
				names: [{ name: 'stale', version_count: 1, latest_version: 1, active_retired: true }],
			});
			const ctx = makeLoadOptionsContext({});
			const out = await loadTeams.call(ctx);
			expect(out[0].description).toContain('active version retired');
		});

		it('handles the null names slice without throwing', async () => {
			mockClient.listTeams.mockResolvedValue({ names: null });
			const ctx = makeLoadOptionsContext({});
			const out = await loadTeams.call(ctx);
			expect(out).toHaveLength(1);
			expect(out[0].value).toBe('');
			expect(out[0].name).toContain('no teams defined');
		});
	});
});
