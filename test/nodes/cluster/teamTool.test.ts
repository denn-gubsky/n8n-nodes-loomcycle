import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runTeam: vi.fn(),
		renderTeamDiagram: vi.fn(),
		listTeams: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleTeamTool } from '../../../nodes/LoomCycleTeamTool/LoomCycleTeamTool.node';
import { makeSupplyDataContext, invokeSupplyData, makeExecuteContext, invokeExecute } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

type Tool = { name: string; description: string; invoke: (args: unknown) => Promise<string> };

async function teamTool(params: Record<string, unknown> = {}): Promise<Tool> {
	const node = new LoomCycleTeamTool();
	const ctx = makeSupplyDataContext({
		params: {
			toolName: 'team',
			toolDescription: 'delegate to a team',
			teamName: 'triage',
			boardOptions: {},
			...params,
		},
	});
	const result = await invokeSupplyData(node, ctx);
	return result.response as Tool;
}

describe('LoomCycleTeamTool', () => {
	it('supplyData returns a tool with the configured name + description', async () => {
		const tool = await teamTool();
		expect(tool.name).toBe('team');
		expect(tool.description).toContain('delegate to a team');
	});

	it('run delegates the task to the pinned team by name', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'completed', trace: [] });
		const tool = await teamTool();
		const out = await tool.invoke({ op: 'run', input: 'classify this ticket' });
		expect(mockClient.runTeam).toHaveBeenCalledWith({
			name: 'triage',
			input: 'classify this ticket',
		});
		expect(JSON.parse(out)).toMatchObject({ status: 'completed' });
	});

	it('run is the default op when the model omits it', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'completed' });
		const tool = await teamTool();
		await tool.invoke({ input: 'do the thing' });
		expect(mockClient.runTeam).toHaveBeenCalledWith({ name: 'triage', input: 'do the thing' });
	});

	// The team is pinned by the operator, not chosen by the model: a team's
	// states name arbitrary handler agents, so a model-selected team would reach
	// agents outside its own tool ceiling. A team name in the tool args must be
	// ignored, and a def_id must never be reachable.
	it('ignores any team the model tries to supply and never sends a def_id', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'completed' });
		const tool = await teamTool({ teamName: 'triage' });
		await tool.invoke({ op: 'run', input: 'x', name: 'privileged-team', defId: 'tdf_evil' });
		const arg = mockClient.runTeam.mock.calls[0][0];
		expect(arg.name).toBe('triage');
		expect(arg).not.toHaveProperty('defId');
	});

	it('describe renders the pinned team diagram without running it', async () => {
		mockClient.renderTeamDiagram.mockResolvedValue({ diagram: 'stateDiagram-v2', format: 'mermaid' });
		const tool = await teamTool();
		const out = await tool.invoke({ op: 'describe' });
		expect(mockClient.renderTeamDiagram).toHaveBeenCalledWith('triage');
		expect(mockClient.runTeam).not.toHaveBeenCalled();
		expect(JSON.parse(out)).toMatchObject({ format: 'mermaid' });
	});

	it('run without input returns an actionable error rather than an empty task', async () => {
		const tool = await teamTool();
		const out = await tool.invoke({ op: 'run' });
		expect(JSON.parse(out).error).toContain('input is required');
		expect(mockClient.runTeam).not.toHaveBeenCalled();
	});

	it('reports a misconfigured node when no team is pinned', async () => {
		const tool = await teamTool({ teamName: '' });
		const out = await tool.invoke({ op: 'run', input: 'x' });
		expect(JSON.parse(out).error).toContain('No team is configured');
		expect(mockClient.runTeam).not.toHaveBeenCalled();
	});

	it('forwards the operator-configured board binding', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'completed' });
		const tool = await teamTool({ boardOptions: { boardChunkId: 'c1', boardScope: 'agent' } });
		await tool.invoke({ op: 'run', input: 'x' });
		expect(mockClient.runTeam).toHaveBeenCalledWith({
			name: 'triage',
			input: 'x',
			boardChunkId: 'c1',
			boardScope: 'agent',
		});
	});

	// boardScope qualifies a board chunk, so alone it is meaningless.
	it('omits board scope when no board chunk is configured', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'completed' });
		const tool = await teamTool({ boardOptions: { boardScope: 'agent' } });
		await tool.invoke({ op: 'run', input: 'x' });
		const arg = mockClient.runTeam.mock.calls[0][0];
		expect(arg).not.toHaveProperty('boardScope');
		expect(arg).not.toHaveProperty('boardChunkId');
	});

	// Authoring ops stay on the action node — a model able to author a team could
	// name any handler agent and thereby escape its own tool ceiling.
	it('does not expose authoring ops', async () => {
		const tool = await teamTool();
		for (const op of ['create', 'fork', 'delete', 'get', 'list']) {
			let message = '';
			try {
				const out = await tool.invoke({ op, name: 'triage', input: 'x' });
				message = (JSON.parse(out) as { error?: string }).error ?? out;
			} catch (err) {
				message = (err as Error).message;
			}
			expect(message).toBeTruthy();
		}
		expect(mockClient.runTeam).not.toHaveBeenCalled();
		expect(mockClient.renderTeamDiagram).not.toHaveBeenCalled();
	});

	it('execute() serves the n8n Tools Agent path', async () => {
		mockClient.runTeam.mockResolvedValue({ status: 'iteration_cap' });
		const node = new LoomCycleTeamTool();
		const ctx = makeExecuteContext({
			params: {
				toolName: 'team',
				toolDescription: 'd',
				teamName: 'triage',
				boardOptions: {},
			},
			inputJson: { op: 'run', input: 'classify' },
		});
		const out = await invokeExecute(node, ctx);
		expect(mockClient.runTeam).toHaveBeenCalledWith({ name: 'triage', input: 'classify' });
		// iteration_cap is a legitimate terminal outcome, not an error — it must
		// reach the agent as data so it can decide what to do next.
		expect(out[0][0].json).toMatchObject({ status: 'iteration_cap' });
	});
});
