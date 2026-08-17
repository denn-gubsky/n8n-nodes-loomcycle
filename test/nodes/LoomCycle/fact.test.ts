import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		document: vi.fn(),
		documentSourceDef: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleFact } from '../../../nodes/LoomCycleFact/LoomCycleFact.node';
import { LoomCycleDocumentSource } from '../../../nodes/LoomCycleDocumentSource/LoomCycleDocumentSource.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=fact', () => {
	it('Upsert Fact carries the claim, its subject/type and its source span', async () => {
		mockClient.document.mockResolvedValue({ chunk_id: 'f1', verdict: 'supported' });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'upsert_chunk',
				scope: 'user',
				subject: 'alice',
				type: 'person',
				naturalKey: 'alice/timezone',
				documentId: 'd1',
				title: 'Timezone',
				body: 'Alice works in CET.',
				sourceQuote: 'I am based in Berlin, so CET.',
			},
		});
		await node.execute.call(ctx);
		// document_id is REQUIRED (verified live): a fact is still a chunk, so an
		// upsert without it is refused with
		// `create_chunk: missing required field: document_id`.
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'upsert_chunk',
			scope: 'user',
			subject: 'alice',
			type: 'person',
			natural_key: 'alice/timezone',
			document_id: 'd1',
			title: 'Timezone',
			body: 'Alice works in CET.',
			source_quote: 'I am based in Berlin, so CET.',
		});
	});

	// Verified live: List Facts filters on type (with subtype expansion) and
	// class; `subject` is accepted but silently IGNORED, so the node does not
	// offer it here and must not send it.
	it('List Facts filters by type and class, never by subject', async () => {
		mockClient.document.mockResolvedValue({ facts: [] });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'list_facts',
				scope: 'user',
				type: 'project',
				classFilter: 'evidential',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'list_facts',
			scope: 'user',
			type: 'project',
			class: 'evidential',
		});
		// include_refuted omitted by default, so withheld facts stay withheld.
		expect(mockClient.document.mock.calls[0][0]).not.toHaveProperty('include_refuted');
	});

	it('List Facts forwards include_refuted when auditing failures', async () => {
		mockClient.document.mockResolvedValue({ facts: [] });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'list_facts',
				scope: 'user',
				includeRefuted: true,
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.document.mock.calls[0][0].include_refuted).toBe(true);
	});

	it('Judge Fact sends the verdict and reason', async () => {
		mockClient.document.mockResolvedValue({ judged: true });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'judge_fact',
				scope: 'user',
				judgeId: 'f1',
				verdict: 'unsupported',
				reason: 'the span does not mention a timezone',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'judge_fact',
			scope: 'user',
			id: 'f1',
			verdict: 'unsupported',
			reason: 'the span does not mention a timezone',
		});
	});

	// The substrate refuses a verdict with no reason; refusing locally names the
	// missing field instead of surfacing an opaque 4xx.
	it('Judge Fact refuses to send a verdict without a reason', async () => {
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'judge_fact',
				scope: 'user',
				judgeId: 'f1',
				verdict: 'supported',
			},
		});
		await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	// judged_at / judged_by are server-stamped with no wire field — a caller able
	// to set them could launder a machine verdict into an operator one.
	it('Judge Fact never sends judged_at or judged_by', async () => {
		mockClient.document.mockResolvedValue({});
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'judge_fact',
				scope: 'user',
				judgeId: 'f1',
				verdict: 'supported',
				reason: 'quoted verbatim',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.document.mock.calls[0][0];
		expect(arg).not.toHaveProperty('judged_at');
		expect(arg).not.toHaveProperty('judged_by');
	});

	// Verified live: supersede_chunk takes TWO ids and no content — `id` is the
	// REPLACEMENT chunk, `supersedes_id` the retired one. The substrate refuses
	// each in turn if absent, so the original single-id shape failed every call.
	it('Supersede Fact links the replacement to the retired chunk and sends no body', async () => {
		mockClient.document.mockResolvedValue({ id: 'f2', supersedes: 'f1' });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'supersede_chunk',
				scope: 'user',
				id: 'f2',
				supersedesId: 'f1',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'supersede_chunk',
			scope: 'user',
			id: 'f2',
			supersedes_id: 'f1',
		});
		const arg = mockClient.document.mock.calls[0][0];
		expect(arg).not.toHaveProperty('body');
		expect(arg).not.toHaveProperty('source_quote');
	});

	it('Remember sends the statement as text', async () => {
		mockClient.document.mockResolvedValue({ chunk_id: 'f2' });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'remember',
				scope: 'user',
				subject: 'alice',
				type: 'person',
				text: 'Alice prefers async standups.',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.document.mock.calls[0][0]).toMatchObject({
			op: 'remember',
			text: 'Alice prefers async standups.',
		});
	});

	it('Verbatim Answer forwards the question and omits min_score at zero', async () => {
		mockClient.document.mockResolvedValue({ answer: null });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: {
				resource: 'fact',
				operation: 'verbatim_answer',
				scope: 'user',
				query: 'what timezone is alice in',
				minScore: 0,
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.document.mock.calls[0][0];
		expect(arg.query).toBe('what timezone is alice in');
		expect(arg).not.toHaveProperty('min_score');
	});

	// The bi-temporal surface: the substrate takes unix NANOSECONDS, the node
	// takes an n8n dateTime. ms -> ns is exact (x1e6), verified live against
	// valid_at / as_of on a real v1.55.
	describe('Bi-temporal fields', () => {
		it('Upsert Fact converts dateTime options to unix nanoseconds', async () => {
			mockClient.document.mockResolvedValue({ created: true });
			const node = new LoomCycleFact();
			const ctx = makeExecuteContext({
				params: {
					resource: 'fact',
					operation: 'upsert_chunk',
					scope: 'user',
					documentId: 'd1',
					subject: 'acme',
					type: 'project',
					body: 'Acme was in pilot phase.',
					factOptions: {
						validAt: '2026-01-01T00:00:00.000Z',
						class: 'evidential',
						confidence: 0.9,
					},
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.document.mock.calls[0][0];
			expect(arg.valid_at).toBe(1767225600000 * 1_000_000);
			expect(arg.class).toBe('evidential');
			expect(arg.confidence).toBe(0.9);
			// invalid_at unset means "still true" — sharply different from the epoch.
			expect(arg).not.toHaveProperty('invalid_at');
		});

		it('Upsert Fact omits confidence at zero rather than asserting no confidence', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycleFact();
			const ctx = makeExecuteContext({
				params: {
					resource: 'fact',
					operation: 'upsert_chunk',
					scope: 'user',
					documentId: 'd1',
					body: 'x',
					factOptions: { confidence: 0 },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document.mock.calls[0][0]).not.toHaveProperty('confidence');
		});

		it('Upsert Fact rejects an unparseable date instead of sending NaN', async () => {
			const node = new LoomCycleFact();
			const ctx = makeExecuteContext({
				params: {
					resource: 'fact',
					operation: 'upsert_chunk',
					scope: 'user',
					documentId: 'd1',
					body: 'x',
					factOptions: { validAt: 'not-a-date' },
				},
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
			expect(mockClient.document).not.toHaveBeenCalled();
		});

		it('List Facts converts As Of and forwards Include Retired', async () => {
			mockClient.document.mockResolvedValue({ facts: [] });
			const node = new LoomCycleFact();
			const ctx = makeExecuteContext({
				params: {
					resource: 'fact',
					operation: 'list_facts',
					scope: 'user',
					recallOptions: { asOf: '2025-06-01T00:00:00.000Z', includeRetired: true },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.document.mock.calls[0][0];
			expect(arg.as_of).toBe(1748736000000 * 1_000_000);
			expect(arg.include_retired).toBe(true);
		});

		// hops 0 is meaningful (starting chunks only), unlike confidence 0.
		it('Graph Recall sends hops zero and parses seed IDs', async () => {
			mockClient.document.mockResolvedValue({ facts: [] });
			const node = new LoomCycleFact();
			const ctx = makeExecuteContext({
				params: {
					resource: 'fact',
					operation: 'graph_recall',
					scope: 'user',
					graphOptions: { hops: 0, seedIds: 'c1, c2 , c3' },
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.document.mock.calls[0][0];
			expect(arg.hops).toBe(0);
			expect(arg.seed_ids).toEqual(['c1', 'c2', 'c3']);
		});
	});

	it('Verification Stats needs nothing but a scope', async () => {
		mockClient.document.mockResolvedValue({ checked: 12, total: 20 });
		const node = new LoomCycleFact();
		const ctx = makeExecuteContext({
			params: { resource: 'fact', operation: 'verification_stats', scope: 'tenant' },
		});
		await node.execute.call(ctx);
		expect(mockClient.document).toHaveBeenCalledWith({ op: 'verification_stats', scope: 'tenant' });
	});
});

describe('LoomCycle resource=documentSourceDef', () => {
	it('Create routes through the shared substrate-input builder', async () => {
		mockClient.documentSourceDef.mockResolvedValue({ def_id: 'ds1' });
		const node = new LoomCycleDocumentSource();
		const ctx = makeExecuteContext({
			params: {
				resource: 'documentSourceDef',
				operation: 'create',
				name: 'peer-a',
				overlay: '{"base_url":"https://peer.example","api_key_env":"PEER_KEY"}',
				promote: true,
			},
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.documentSourceDef).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'create',
				name: 'peer-a',
				// The overlay carries the env-var NAME, never a plaintext key.
				overlay: { base_url: 'https://peer.example', api_key_env: 'PEER_KEY' },
			}),
		);
		expect((result[0][0].json as Record<string, unknown>).result).toMatchObject({ def_id: 'ds1' });
	});

	it('List sends just the op and name', async () => {
		mockClient.documentSourceDef.mockResolvedValue({ versions: [] });
		const node = new LoomCycleDocumentSource();
		const ctx = makeExecuteContext({
			params: { resource: 'documentSourceDef', operation: 'list', name: 'peer-a' },
		});
		await node.execute.call(ctx);
		expect(mockClient.documentSourceDef).toHaveBeenCalledWith(
			expect.objectContaining({ op: 'list', name: 'peer-a' }),
		);
	});
});
