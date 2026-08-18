import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		document: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleDocumentTool } from '../../../nodes/LoomCycleDocumentTool/LoomCycleDocumentTool.node';
import { LoomCycleFactTool } from '../../../nodes/LoomCycleFactTool/LoomCycleFactTool.node';
import { makeSupplyDataContext, invokeSupplyData, makeExecuteContext, invokeExecute } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

type Tool = { name: string; description: string; invoke: (args: unknown) => Promise<string> };

/**
 * Invoke a tool and normalise BOTH failure modes to a message. An op outside
 * the schema's enum is rejected by langchain's own Zod validation before our
 * `fn` runs (a thrown rejection), whereas a semantic failure inside `fn` comes
 * back as our `{error}` envelope string. Both mean "the agent cannot do this".
 */
async function invokeForFailure(tool: Tool, args: unknown): Promise<string> {
	try {
		const out = await tool.invoke(args);
		const parsed = JSON.parse(out) as { error?: string };
		return parsed.error ?? out;
	} catch (err) {
		return (err as Error).message;
	}
}

async function documentTool(params: Record<string, unknown> = {}): Promise<Tool> {
	const node = new LoomCycleDocumentTool();
	const ctx = makeSupplyDataContext({
		params: { toolName: 'doc', toolDescription: 'author documents', defaultScope: 'user', ...params },
	});
	const result = await invokeSupplyData(node, ctx);
	return result.response as Tool;
}

async function factTool(params: Record<string, unknown> = {}): Promise<Tool> {
	const node = new LoomCycleFactTool();
	const ctx = makeSupplyDataContext({
		params: {
			toolName: 'fact',
			toolDescription: 'record facts',
			defaultScope: 'user',
			allowWrites: true,
			...params,
		},
	});
	const result = await invokeSupplyData(node, ctx);
	return result.response as Tool;
}

describe('LoomCycleDocumentTool', () => {
	it('supplyData returns a tool with the configured name + description', async () => {
		const tool = await documentTool();
		expect(tool.name).toBe('doc');
		expect(tool.description).toContain('author documents');
	});

	it('applies the node default scope when the model omits one', async () => {
		mockClient.document.mockResolvedValue({ documents: [] });
		const tool = await documentTool({ defaultScope: 'agent' });
		await tool.invoke({ op: 'documents_summary' });
		expect(mockClient.document).toHaveBeenCalledWith({ op: 'documents_summary', scope: 'agent' });
	});

	it('lets a model-supplied scope override the node default', async () => {
		mockClient.document.mockResolvedValue({ documents: [] });
		const tool = await documentTool({ defaultScope: 'agent' });
		await tool.invoke({ op: 'documents_summary', scope: 'tenant' });
		expect(mockClient.document.mock.calls[0][0].scope).toBe('tenant');
	});

	// Absent `tags` means "unchanged" while [] means "clear", so a defaulted
	// empty array would let a model wipe tags as a side effect of a body edit.
	it('omits every field the model did not supply', async () => {
		mockClient.document.mockResolvedValue({});
		const tool = await documentTool();
		await tool.invoke({ op: 'update_chunk', id: 'c1', body: 'revised' });
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'update_chunk',
			scope: 'user',
			id: 'c1',
			body: 'revised',
		});
	});

	it('forwards a full create_chunk payload', async () => {
		mockClient.document.mockResolvedValue({ id: 'c9' });
		const tool = await documentTool();
		await tool.invoke({
			op: 'create_chunk',
			document_id: 'd1',
			parent_id: 'c0',
			title: 'Decision',
			body: 'We ship Friday.',
			type: 'decision',
			tags: ['area/backend'],
		});
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'create_chunk',
			scope: 'user',
			document_id: 'd1',
			parent_id: 'c0',
			title: 'Decision',
			body: 'We ship Friday.',
			type: 'decision',
			tags: ['area/backend'],
		});
	});

	it('returns a readable error when create_chunk omits document_id', async () => {
		const tool = await documentTool();
		const out = await tool.invoke({ op: 'create_chunk', body: 'orphan' });
		expect(JSON.parse(out).error).toContain('document_id is required');
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	// The destructive + administrative ops stay operator-only on the action node.
	it('rejects ops outside the curated read/append subset', async () => {
		const tool = await documentTool();
		for (const op of ['delete_document', 'delete_chunk', 'sync', 'import_canvas', 'define_type']) {
			const message = await invokeForFailure(tool, { op, id: 'd1' });
			expect(message).toBeTruthy();
		}
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	it('execute() serves the n8n Tools Agent path with the same payload', async () => {
		mockClient.document.mockResolvedValue({ chunks: [] });
		const node = new LoomCycleDocumentTool();
		const ctx = makeExecuteContext({
			params: { toolName: 'doc', toolDescription: 'd', defaultScope: 'user' },
			inputJson: { op: 'query_chunks', type: 'decision', limit: 5 },
		});
		const out = await invokeExecute(node, ctx);
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'query_chunks',
			scope: 'user',
			type: 'decision',
			limit: 5,
		});
		expect(out[0][0].json).toMatchObject({ chunks: [] });
	});
});

describe('LoomCycleFactTool', () => {
	it('forwards a fact write with its source span', async () => {
		mockClient.document.mockResolvedValue({ created: true });
		const tool = await factTool();
		await tool.invoke({
			op: 'upsert_chunk',
			document_id: 'd1',
			subject: 'alice',
			type: 'person',
			natural_key: 'alice/tz',
			body: 'Alice works in CET.',
			source_quote: 'I am based in Berlin.',
		});
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'upsert_chunk',
			scope: 'user',
			document_id: 'd1',
			subject: 'alice',
			type: 'person',
			natural_key: 'alice/tz',
			body: 'Alice works in CET.',
			source_quote: 'I am based in Berlin.',
		});
	});

	// document_id is required by the substrate (verified live) — a fact is a
	// chunk, so it must live in a document.
	it('returns a readable error when upsert omits document_id', async () => {
		const tool = await factTool();
		const out = await tool.invoke({ op: 'upsert_chunk', subject: 'alice', body: 'x' });
		expect(JSON.parse(out).error).toContain('document_id is required');
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	it('remember requires text', async () => {
		const tool = await factTool();
		const out = await tool.invoke({ op: 'remember' });
		expect(JSON.parse(out).error).toContain('text is required');
	});

	// A judge verdict is the substrate's integrity check; an agent ruling on its
	// own fact would collapse it into self-attestation. Superseding mis-pairs
	// silently. Both stay on the action node.
	it('does not expose judge, supersede or propose_entity', async () => {
		const tool = await factTool();
		for (const op of ['judge_fact', 'supersede_chunk', 'propose_entity']) {
			const message = await invokeForFailure(tool, { op, id: 'f1', verdict: 'supported', reason: 'r' });
			expect(message).toBeTruthy();
		}
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	it('read-only mode blocks writes with an actionable message but still recalls', async () => {
		mockClient.document.mockResolvedValue({ facts: [] });
		const tool = await factTool({ allowWrites: false });

		const blocked = await tool.invoke({ op: 'remember', text: 'Alice prefers async standups.' });
		expect(JSON.parse(blocked).error).toContain('read-only');
		expect(mockClient.document).not.toHaveBeenCalled();

		const allowed = await tool.invoke({ op: 'list_facts', type: 'person' });
		expect(JSON.parse(allowed)).toMatchObject({ facts: [] });
		expect(mockClient.document).toHaveBeenCalledOnce();
	});

	it('forwards include_refuted and include_retired only when asked', async () => {
		mockClient.document.mockResolvedValue({ facts: [] });
		const tool = await factTool();

		await tool.invoke({ op: 'list_facts', type: 'person' });
		expect(mockClient.document.mock.calls[0][0]).not.toHaveProperty('include_refuted');
		expect(mockClient.document.mock.calls[0][0]).not.toHaveProperty('include_retired');

		mockClient.document.mockClear();
		await tool.invoke({ op: 'list_facts', type: 'person', include_refuted: true, include_retired: true });
		expect(mockClient.document.mock.calls[0][0].include_refuted).toBe(true);
		expect(mockClient.document.mock.calls[0][0].include_retired).toBe(true);
	});

	it('execute() serves the n8n Tools Agent path', async () => {
		mockClient.document.mockResolvedValue({ answer: 'CET', source_quote: 'I am based in Berlin.' });
		const node = new LoomCycleFactTool();
		const ctx = makeExecuteContext({
			params: { toolName: 'fact', toolDescription: 'd', defaultScope: 'user', allowWrites: true },
			inputJson: { op: 'verbatim_answer', query: 'what timezone is alice in' },
		});
		const out = await invokeExecute(node, ctx);
		expect(mockClient.document).toHaveBeenCalledWith({
			op: 'verbatim_answer',
			scope: 'user',
			query: 'what timezone is alice in',
		});
		expect(out[0][0].json).toMatchObject({ answer: 'CET' });
	});
});

// A model is MORE likely to hit the path-vs-ID trap than a human: told "the
// document is at /documents/news/tech-news", it will pass exactly that. The
// substrate takes document_id verbatim, so the result would be an invisible
// orphan chunk reported as success. The thrown message becomes the tool result,
// so the model can read it and retry correctly.
describe('Path-vs-ID guard on the Tool sub-nodes', () => {
	it('Document Tool refuses a path as document_id and names the remedy', async () => {
		const tool = await documentTool();
		const out = await tool.invoke({
			op: 'create_chunk',
			document_id: '/documents/news/tech-news',
			body: 'x',
		});
		const err = (JSON.parse(out) as { error?: string }).error ?? '';
		expect(err).toContain('looks like a Path');
		expect(err).toContain('get_document');
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	it('Fact Tool refuses a path as document_id', async () => {
		const tool = await factTool();
		const out = await tool.invoke({
			op: 'upsert_chunk',
			document_id: '/documents/news/tech-news',
			subject: 'x',
			body: 'y',
		});
		expect((JSON.parse(out) as { error?: string }).error).toContain('looks like a Path');
		expect(mockClient.document).not.toHaveBeenCalled();
	});

	it('both still accept a real hex document ID', async () => {
		mockClient.document.mockResolvedValue({ id: 'c1' });
		const doc = await documentTool();
		await doc.invoke({ op: 'create_chunk', document_id: 'eeb875af6f6d9deb5b26a24c56c38b9e', body: 'x' });
		expect(mockClient.document.mock.calls[0][0].document_id).toBe('eeb875af6f6d9deb5b26a24c56c38b9e');

		mockClient.document.mockClear();
		const fact = await factTool();
		await fact.invoke({ op: 'upsert_chunk', document_id: 'eeb875af6f6d9deb5b26a24c56c38b9e', body: 'y' });
		expect(mockClient.document.mock.calls[0][0].document_id).toBe('eeb875af6f6d9deb5b26a24c56c38b9e');
	});
});
