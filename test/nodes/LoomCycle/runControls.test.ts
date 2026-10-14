import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import type { AgentEvent } from '@loomcycle/client';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		getRun: vi.fn(),
		hookDef: vi.fn(),
		createConfiguredRun: vi.fn(),
		updateConfiguredRun: vi.fn(),
		startConfiguredRun: vi.fn(),
		deleteConfiguredRun: vi.fn(),
		listChildRuns: vi.fn(),
		reviewRun: vi.fn(),
		retuneRun: vi.fn(),
		getRunConfig: vi.fn(),
		getEffectiveConfig: vi.fn(),
		getRunPrompt: vi.fn(),
		deleteRunTree: vi.fn(),
		listModels: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleRun } from '../../../nodes/LoomCycleRun/LoomCycleRun.node';
import { runOps } from '../../../nodes/LoomCycle/descriptions';
import { loadModels } from '../../../nodes/LoomCycle/helpers/loadOptions';
import { asAsyncIterable, makeExecuteContext, makeLoadOptionsContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

function run(params: Record<string, unknown>, opts: { continueOnFail?: boolean } = {}) {
	return new LoomCycleRun().execute.call(
		makeExecuteContext({ params: { resource: 'run', ...params }, continueOnFail: opts.continueOnFail }),
	);
}

const finished = (runId = 'r1') =>
	asAsyncIterable([
		{ type: 'agent', agent_id: 'a1', run_id: runId },
		{ type: 'text', text: '{"ok":true}' },
		{ type: 'done', stop_reason: 'end_turn' },
	] as AgentEvent[]);

describe('LoomCycle: Run — v1.113 run controls', () => {
	describe('Spawn settings', () => {
		it('sends every set override and start-only setting, and nothing for untouched fields', async () => {
			mockClient.runStreaming.mockReturnValue(finished());
			mockClient.hookDef.mockImplementation(async ({ name }: { name: string }) => ({
				definition: { event: name === 'gate' ? 'pre' : 'run_end' },
			}));
			await run({
				operation: 'spawn',
				agent: 'researcher',
				prompt: 'go',
				additionalFields: {
					idempotencyKey: ' order-42 ',
					maxWallSeconds: 600,
					model: 'sonnet',
					effort: 'high',
					maxIterations: 8,
					review: true,
					reviewTtlSeconds: 900,
					toolChoiceMode: 'tool',
					toolChoiceName: 'WebFetch',
					toolChoiceUntil: 'first_call',
					contextMode: 'recap',
					maxContextTokens: 32000,
					noTrace: true,
					runHooks: ['gate', 'audit'],
					maxTokens: 0,
					provider: '',
				},
			});
			const opts = mockClient.runStreaming.mock.calls[0][0];
			expect(opts).toMatchObject({
				agent: 'researcher',
				idempotencyKey: 'order-42',
				maxWallSeconds: 600,
				model: 'sonnet',
				effort: 'high',
				maxIterations: 8,
				review: true,
				reviewTtlSeconds: 900,
				toolChoice: { mode: 'tool', name: 'WebFetch', until: 'first_call' },
				context: { mode: 'recap' },
				maxContextTokens: 32000,
				retention: 'none',
				hooks: { pre: ['gate'], run_end: ['audit'] },
			});
			expect(opts).not.toHaveProperty('maxTokens');
			expect(opts).not.toHaveProperty('provider');
			expect(opts).not.toHaveProperty('outputFormat');
		});

		it('leaves the wire body unchanged when no new field is set', async () => {
			mockClient.runStreaming.mockReturnValue(finished());
			await run({ operation: 'spawn', agent: 'a', prompt: 'q', additionalFields: {} });
			expect(Object.keys(mockClient.runStreaming.mock.calls[0][0]).sort()).toEqual(['agent', 'segments']);
		});

		it('attaches each named hook under the event its definition answers', async () => {
			mockClient.runStreaming.mockReturnValue(finished());
			mockClient.hookDef.mockResolvedValue({ definition: {} });
			await expect(
				run({ operation: 'spawn', agent: 'a', prompt: 'q', additionalFields: { runHooks: ['ghost'] } }),
			).rejects.toThrow(/no active version/);
			expect(mockClient.runStreaming).not.toHaveBeenCalled();
		});

		it('refuses Tool Choice "Specific Tool" without a tool name', async () => {
			await expect(
				run({ operation: 'spawn', agent: 'a', prompt: 'q', additionalFields: { toolChoiceMode: 'tool' } }),
			).rejects.toBeInstanceOf(NodeOperationError);
		});

		it('returns the parsed answer as structured when an output schema is set', async () => {
			mockClient.runStreaming.mockReturnValue(finished('r9'));
			mockClient.getRun.mockResolvedValue({ result: { final_text: '{"ok":true}', structured: { ok: true } } });
			const out = await run({
				operation: 'spawn',
				agent: 'a',
				prompt: 'q',
				additionalFields: { outputSchema: '{"type":"object","properties":{"ok":{"type":"boolean"}}}' },
			});
			expect(mockClient.runStreaming.mock.calls[0][0].outputFormat).toEqual({
				type: 'json_schema',
				name: 'result',
				schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});
			expect(mockClient.getRun).toHaveBeenCalledWith('r9');
			expect(out[0][0].json.structured).toEqual({ ok: true });
		});

		it('does not read a result for a run held for review', async () => {
			mockClient.runStreaming.mockReturnValue(
				asAsyncIterable([
					{ type: 'agent', agent_id: 'a1', run_id: 'r1' },
					{ type: 'awaiting_review', awaiting_review: { round: 1 } },
				] as AgentEvent[]),
			);
			const out = await run({
				operation: 'spawn',
				agent: 'a',
				prompt: 'q',
				additionalFields: { review: true, outputSchema: '{"type":"object"}' },
			});
			expect(mockClient.getRun).not.toHaveBeenCalled();
			expect(out[0][0].json.awaitingReview).toEqual({ round: 1 });
		});
	});

	describe('Drafts', () => {
		it('offers no secret, session or idempotency field on a draft', () => {
			const draftFields = runOps.find((p) => p.name === 'draftFields');
			const names = (draftFields?.options as Array<{ name: string }>).map((o) => o.name);
			for (const forbidden of ['sessionId', 'userBearer', 'userCredentials', 'idempotencyKey']) {
				expect(names).not.toContain(forbidden);
			}
			expect(names).toContain('maxIterations');
		});

		it('Create Draft sends the run options without starting', async () => {
			mockClient.createConfiguredRun.mockResolvedValue({ run_id: 'r1', status: 'configured' });
			const out = await run({
				operation: 'createDraft',
				agent: 'a',
				prompt: 'q',
				draftFields: { maxIterations: 3 },
			});
			expect(mockClient.createConfiguredRun).toHaveBeenCalledWith(
				expect.objectContaining({ agent: 'a', maxIterations: 3 }),
			);
			expect(out[0][0].json).toMatchObject({ status: 'configured' });
		});

		it('Update Draft patches the prompt and settings, and refuses an empty patch', async () => {
			mockClient.updateConfiguredRun.mockResolvedValue({ run_id: 'r1' });
			await run({ operation: 'updateDraft', runId: 'r1', draftPrompt: 'new', draftFields: { model: 'haiku' } });
			const [runId, patch] = mockClient.updateConfiguredRun.mock.calls[0];
			expect(runId).toBe('r1');
			expect(patch.model).toBe('haiku');
			expect(patch.segments[0].content[0]).toEqual({ type: 'trusted-text', text: 'new' });
			await expect(run({ operation: 'updateDraft', runId: 'r1', draftFields: {} })).rejects.toBeInstanceOf(
				NodeOperationError,
			);
		});

		it('Start Draft passes the bearer and credentials at start and drains the run', async () => {
			mockClient.startConfiguredRun.mockReturnValue(finished('r1'));
			const out = await run({
				operation: 'startDraft',
				runId: 'r1',
				startFields: { userBearer: 'ub', userCredentials: { credential: [{ name: 'gh', value: '$cred:gh' }] } },
			});
			expect(mockClient.startConfiguredRun).toHaveBeenCalledWith('r1', {
				userBearer: 'ub',
				userCredentials: { gh: '$cred:gh' },
			});
			expect(out[0][0].json).toMatchObject({ runId: 'r1', finalText: '{"ok":true}' });
		});

		it('Delete Draft confirms what it deleted', async () => {
			mockClient.deleteConfiguredRun.mockResolvedValue(undefined);
			const out = await run({ operation: 'deleteDraft', runId: 'r1' });
			expect(out[0][0].json).toEqual({ deleted: true, run_id: 'r1' });
		});
	});

	describe('Review and Retune', () => {
		it('Review approves without feedback, and drops a stale feedback value', async () => {
			mockClient.reviewRun.mockResolvedValue({ decision: 'approve', delivered: true });
			await run({ operation: 'review', runId: 'r1', decision: 'approve', feedback: 'left over' });
			expect(mockClient.reviewRun).toHaveBeenCalledWith('r1', 'approve', undefined);
		});

		it('Review rejects with feedback', async () => {
			mockClient.reviewRun.mockResolvedValue({ decision: 'reject', delivered: true });
			await run({ operation: 'review', runId: 'r1', decision: 'reject', feedback: 'cite sources' });
			expect(mockClient.reviewRun).toHaveBeenCalledWith('r1', 'reject', { feedback: 'cite sources' });
		});

		it('Retune sends an explicit false for review and interactive', async () => {
			mockClient.retuneRun.mockResolvedValue({ retuned: true });
			await run({ operation: 'retune', runId: 'r1', overrides: { review: false, interactive: false, model: 'opus' } });
			expect(mockClient.retuneRun).toHaveBeenCalledWith('r1', { model: 'opus', review: false, interactive: false });
		});

		it('Retune refuses a request that changes nothing', async () => {
			await expect(run({ operation: 'retune', runId: 'r1', overrides: { maxTokens: 0 } })).rejects.toBeInstanceOf(
				NodeOperationError,
			);
			expect(mockClient.retuneRun).not.toHaveBeenCalled();
		});
	});

	describe('Reads and deletion', () => {
		it('Get Run Config reads the chosen view', async () => {
			mockClient.getRunConfig.mockResolvedValue({ v: 'o' });
			mockClient.getEffectiveConfig.mockResolvedValue({ v: 'e' });
			mockClient.getRunPrompt.mockResolvedValue({ v: 'p' });
			expect((await run({ operation: 'getRunConfig', runId: 'r1', configView: 'overrides' }))[0][0].json).toEqual({ v: 'o' });
			expect((await run({ operation: 'getRunConfig', runId: 'r1', configView: 'effective' }))[0][0].json).toEqual({ v: 'e' });
			expect((await run({ operation: 'getRunConfig', runId: 'r1', configView: 'prompt' }))[0][0].json).toEqual({ v: 'p' });
		});

		it('List Children pages with limit and cursor', async () => {
			mockClient.listChildRuns.mockResolvedValue({ agents: [], next_cursor: '' });
			await run({ operation: 'listChildren', runId: 'r1', pageSize: 50, cursor: 'c2' });
			expect(mockClient.listChildRuns).toHaveBeenCalledWith('r1', { limit: 50, cursor: 'c2' });
		});

		it('Get Run and Delete Run Tree address the run by run_id', async () => {
			mockClient.getRun.mockResolvedValue({ run_id: 'r1' });
			mockClient.deleteRunTree.mockResolvedValue({ deleted_runs: 2 });
			await run({ operation: 'getRun', runId: 'r1' });
			await run({ operation: 'deleteRunTree', runId: 'r1' });
			expect(mockClient.getRun).toHaveBeenCalledWith('r1');
			expect(mockClient.deleteRunTree).toHaveBeenCalledWith('r1');
		});
	});

	it('the model dropdown lists chat aliases only, after an inherit option', async () => {
		mockClient.listModels.mockResolvedValue({
			aliases: {
				sonnet: { provider: 'anthropic', model: 'claude-sonnet' },
				clef: { provider: 'ollama', model: 'clef', kind: 'decision' },
				haiku: { provider: 'anthropic', model: 'claude-haiku', kind: 'chat' },
			},
		});
		const options = await loadModels.call(makeLoadOptionsContext({}));
		expect(options.map((o) => o.value)).toEqual(['', 'haiku', 'sonnet']);
	});
});
