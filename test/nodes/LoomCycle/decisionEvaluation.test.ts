import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		decide: vi.fn(),
		listDecisionModels: vi.fn(),
		submitEvaluation: vi.fn(),
		getEvaluation: vi.fn(),
		listEvaluationsForRun: vi.fn(),
		listEvaluationsForDef: vi.fn(),
		aggregateEvaluations: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { UnavailableError } from '@loomcycle/client';
import { LoomCycleDecision } from '../../../nodes/LoomCycleDecision/LoomCycleDecision.node';
import { LoomCycleEvaluation } from '../../../nodes/LoomCycleEvaluation/LoomCycleEvaluation.node';
import { wrapLoomcycleError } from '../../../nodes/LoomCycle/helpers/errors';
import { loadDecisionModels } from '../../../nodes/LoomCycle/helpers/loadOptions';
import { makeExecuteContext, makeLoadOptionsContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

const decide = (params: Record<string, unknown>) =>
	new LoomCycleDecision().execute.call(makeExecuteContext({ params: { resource: 'decision', operation: 'decide', ...params } }));
const evaluate = (params: Record<string, unknown>) =>
	new LoomCycleEvaluation().execute.call(makeExecuteContext({ params: { resource: 'evaluation', ...params } }));

const ANSWERS = {
	intent: { type: 'choice', choice: 'refund', probabilities: { refund: 0.9, other: 0.1 }, confidence: 0.8 },
	urgent: { type: 'noul', noul: 0 },
	tone: { type: 'score', score: 1.7, legend: {}, probabilities: {}, confidence: 0.5 },
};

describe('LoomCycle Decision', () => {
	it('builds choice, yes/no and score questions from fields', async () => {
		mockClient.decide.mockResolvedValue({ model: 'clef', answers: ANSWERS });
		await decide({
			state: '{"text":"I want my money back"}',
			questionsMode: 'fields',
			decisionModel: 'clef',
			questions: {
				question: [
					{ name: 'intent', type: 'choice', instructions: 'What do they want?', criteria: 'refund: asks for money back\nother' },
					{ name: 'urgent', type: 'noul', instructions: 'Is it urgent?', criteria: 'yes: mentions a deadline' },
					{ name: 'tone', type: 'score', instructions: 'How angry?', criteria: 'calm\nannoyed\nfurious' },
				],
			},
		});
		expect(mockClient.decide).toHaveBeenCalledWith({
			model: 'clef',
			state: { text: 'I want my money back' },
			questions: {
				intent: { type: 'choice', instructions: 'What do they want?', criteria: { refund: 'asks for money back', other: null } },
				urgent: { type: 'noul', instructions: 'Is it urgent?', criteria: { true: 'mentions a deadline' } },
				tone: { type: 'score', instructions: 'How angry?', criteria: ['calm', 'annoyed', 'furious'] },
			},
		});
	});

	it('adds plain values for branching, keeping a definite no as 0', async () => {
		mockClient.decide.mockResolvedValue({ model: 'clef', answers: ANSWERS });
		const out = await decide({ state: '{"a":1}', questionsMode: 'json', questionsJson: '{"intent":{"type":"choice","instructions":"x","criteria":{"a":null,"b":null}}}' });
		expect(out[0][0].json.values).toEqual({ intent: 'refund', urgent: 0, tone: 1.7 });
		expect(mockClient.decide.mock.calls[0][0]).not.toHaveProperty('model');
	});

	it('refuses an empty state and a duplicate question name before calling', async () => {
		await expect(decide({ state: '{}', questionsMode: 'json', questionsJson: '{"a":{}}' })).rejects.toBeInstanceOf(NodeOperationError);
		await expect(
			decide({
				state: '{"a":1}',
				questions: { question: [{ name: 'q', type: 'noul', instructions: 'x' }, { name: 'q', type: 'noul', instructions: 'y' }] },
			}),
		).rejects.toThrow(/Two questions are named "q"/);
		expect(mockClient.decide).not.toHaveBeenCalled();
	});

	it('reports a deployment with no decision models as unconfigured, not as down', () => {
		const node = { id: 'n', name: 'D', type: 't', typeVersion: 1, position: [0, 0], parameters: {} } as INode;
		const wrapped = wrapLoomcycleError(new UnavailableError('no models', { status: 503, code: 'decision_not_configured' }), node);
		expect(wrapped.message).toContain('has no decision models');
		expect(wrapped.message).not.toMatch(/unavailable/i);
	});

	it('the model dropdown marks the default', async () => {
		mockClient.listDecisionModels.mockResolvedValue({
			default: 'clef',
			models: [{ name: 'clef', provider: 'ollama', model: 'clef', limits: { max_questions: 64, min_options: 2, max_options: 26 } }],
		});
		const options = await loadDecisionModels.call(makeLoadOptionsContext({}));
		expect(options.map((o) => o.name)).toEqual(["The Deployment's Default", 'clef (default)']);
	});
});

describe('LoomCycle Evaluation', () => {
	it('Submit always sends the score, 0 included, plus only the extras given', async () => {
		mockClient.submitEvaluation.mockResolvedValue({ eval_id: 'eval_1' });
		await evaluate({ operation: 'submit', runId: 'r1', score: 0, evaluationFields: {} });
		expect(mockClient.submitEvaluation).toHaveBeenLastCalledWith('r1', 0, {});
		await evaluate({
			operation: 'submit',
			runId: 'r1',
			score: 0.8,
			evaluationFields: {
				dimensions: { dimension: [{ name: 'correctness', value: 0.9 }] },
				judgement: '{"flags":["late"]}',
				rationale: ' good ',
			},
		});
		expect(mockClient.submitEvaluation).toHaveBeenLastCalledWith('r1', 0.8, {
			dimensions: { correctness: 0.9 },
			judgement: { flags: ['late'] },
			rationale: 'good',
		});
	});

	it('Get, the two lists and Aggregate map to their methods', async () => {
		mockClient.getEvaluation.mockResolvedValue({});
		mockClient.listEvaluationsForRun.mockResolvedValue({ evaluations: [] });
		mockClient.listEvaluationsForDef.mockResolvedValue({ evaluations: [] });
		mockClient.aggregateEvaluations.mockResolvedValue({ count: 0 });
		await evaluate({ operation: 'get', evalId: 'eval_1' });
		await evaluate({ operation: 'listForRun', runId: 'r1', maxRows: 10 });
		await evaluate({ operation: 'listForDef', defId: 'def_1', maxRows: 20 });
		await evaluate({ operation: 'aggregate', defId: 'def_1', includeLineage: true });
		await evaluate({ operation: 'aggregate', defId: 'def_1' });
		expect(mockClient.getEvaluation).toHaveBeenCalledWith('eval_1');
		expect(mockClient.listEvaluationsForRun).toHaveBeenCalledWith('r1', { limit: 10 });
		expect(mockClient.listEvaluationsForDef).toHaveBeenCalledWith('def_1', { limit: 20 });
		expect(mockClient.aggregateEvaluations).toHaveBeenNthCalledWith(1, 'def_1', { includeLineage: true });
		expect(mockClient.aggregateEvaluations).toHaveBeenNthCalledWith(2, 'def_1', undefined);
	});
});
