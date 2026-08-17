import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		document: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleDocument as LoomCycle } from '../../../nodes/LoomCycleDocument/LoomCycleDocument.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=document', () => {
	describe('Document lifecycle', () => {
		it('Create Document sends only op, scope, title and path', async () => {
			mockClient.document.mockResolvedValue({ document_id: 'd1', root_chunk_id: 'c0' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'create_document',
					scope: 'user',
					title: 'Launch plan',
					path: '/docs/launch',
				},
			});
			const result = await node.execute.call(ctx);
			// Exact payload: every unset field must be absent, not empty-string.
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'create_document',
				scope: 'user',
				title: 'Launch plan',
				path: '/docs/launch',
			});
			expect((result[0][0].json as Record<string, unknown>).result).toMatchObject({ document_id: 'd1' });
		});

		it('Documents Summary sends no identifiers at all', async () => {
			mockClient.document.mockResolvedValue({ documents: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'document', operation: 'documents_summary', scope: 'tenant' },
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({ op: 'documents_summary', scope: 'tenant' });
		});

		it('Get Document defaults scope to user when unset', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'document', operation: 'get_document', id: 'd1' },
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({ op: 'get_document', scope: 'user', id: 'd1' });
		});
	});

	describe('Chunks', () => {
		it('Create Chunk folds body, type, status, tags and fields', async () => {
			mockClient.document.mockResolvedValue({ chunk_id: 'c1' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'create_chunk',
					scope: 'user',
					documentId: 'd1',
					parentId: 'c0',
					title: 'Ship date',
					body: '## Ship date\n2026-07-01',
					type: 'decision',
					status: 'open',
					tags: 'area/backend, release',
					fields: '{"owner":"ops"}',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'create_chunk',
				scope: 'user',
				document_id: 'd1',
				parent_id: 'c0',
				title: 'Ship date',
				body: '## Ship date\n2026-07-01',
				type: 'decision',
				status: 'open',
				tags: ['area/backend', 'release'],
				fields: { owner: 'ops' },
			});
		});

		// Tags REPLACE-SET on update. An empty CSV must be omitted, because
		// sending [] would silently clear the chunk's existing tags.
		it('Update Chunk omits tags entirely when the CSV is empty', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'update_chunk',
					scope: 'user',
					id: 'c1',
					body: 'revised',
					tags: '',
				},
			});
			await node.execute.call(ctx);
			const arg = mockClient.document.mock.calls[0][0];
			expect(arg).not.toHaveProperty('tags');
			expect(arg.body).toBe('revised');
		});

		// Revision is optimistic concurrency; 0 means "no guard", not "revision 0".
		it('Update Chunk sends revision only when greater than zero', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctxNoGuard = makeExecuteContext({
				params: { resource: 'document', operation: 'update_chunk', scope: 'user', id: 'c1', revision: 0 },
			});
			await node.execute.call(ctxNoGuard);
			expect(mockClient.document.mock.calls[0][0]).not.toHaveProperty('revision');

			mockClient.document.mockClear();
			const ctxGuarded = makeExecuteContext({
				params: { resource: 'document', operation: 'update_chunk', scope: 'user', id: 'c1', revision: 7 },
			});
			await node.execute.call(ctxGuarded);
			expect(mockClient.document.mock.calls[0][0].revision).toBe(7);
		});

		it('Move Chunk sends the new parent', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'move_chunk',
					scope: 'user',
					id: 'c2',
					newParentId: 'c9',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'move_chunk',
				scope: 'user',
				id: 'c2',
				new_parent_id: 'c9',
			});
		});

		it('Reorder Chunk sends position zero rather than omitting it', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'document', operation: 'reorder_chunk', scope: 'user', id: 'c2', position: 0 },
			});
			await node.execute.call(ctx);
			// Position 0 is a legitimate destination (first sibling), unlike
			// revision 0 — so it must survive the omit-when-empty pass.
			expect(mockClient.document.mock.calls[0][0].position).toBe(0);
		});
	});

	describe('Edges + query', () => {
		it('Link Chunks sends both endpoints and the kind', async () => {
			mockClient.document.mockResolvedValue({});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'link_chunks',
					scope: 'user',
					fromId: 'c1',
					toId: 'c2',
					kind: 'depends_on',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'link_chunks',
				scope: 'user',
				from_id: 'c1',
				to_id: 'c2',
				kind: 'depends_on',
			});
		});

		it('Query Chunks forwards structured filters and the SQL escape hatch', async () => {
			mockClient.document.mockResolvedValue({ chunks: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'query_chunks',
					scope: 'user',
					documentId: 'd1',
					type: 'decision',
					status: 'open',
					tagPrefix: 'area',
					underPath: '/docs',
					sql: 'SELECT 1',
					limit: 25,
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'query_chunks',
				scope: 'user',
				document_id: 'd1',
				type: 'decision',
				status: 'open',
				tag_prefix: 'area',
				under_path: '/docs',
				sql: 'SELECT 1',
				limit: 25,
			});
		});
	});

	describe('Markdown + canvas IO', () => {
		it('Export Markdown sends include_metadata explicitly, including when false', async () => {
			mockClient.document.mockResolvedValue({ markdown: '# x' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'export_md',
					scope: 'user',
					id: 'd1',
					includeMetadata: false,
				},
			});
			await node.execute.call(ctx);
			// Sent explicitly: false is meaningful (clean prose, no round-trip),
			// so it must not be dropped as falsy.
			expect(mockClient.document.mock.calls[0][0].include_metadata).toBe(false);
		});

		it('Import Canvas parses the canvas JSON', async () => {
			mockClient.document.mockResolvedValue({ document_id: 'd2' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'import_canvas',
					scope: 'user',
					canvas: '{"nodes":[{"id":"n1"}],"edges":[]}',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document.mock.calls[0][0].canvas).toEqual({
				nodes: [{ id: 'n1' }],
				edges: [],
			});
		});
	});

	describe('Assets (RFC BO)', () => {
		it('Set Asset base64-encodes the binary property and forwards its media type', async () => {
			mockClient.document.mockResolvedValue({ ok: true });
			const b64 = Buffer.from([0x89, 0x50]).toString('base64');
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'set_asset',
					scope: 'user',
					id: 'c5',
					assetBinaryProperty: 'data',
				},
				binary: { data: { mimeType: 'image/png', data: b64 } },
			});
			await node.execute.call(ctx);
			const arg = mockClient.document.mock.calls[0][0];
			expect(arg.data).toBe(b64);
			expect(arg.media_type).toBe('image/png');
		});
	});

	describe('Federation (RFC CE)', () => {
		it('Set Remote sends the source name and remote ref', async () => {
			mockClient.document.mockResolvedValue({ bound: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'document',
					operation: 'set_remote',
					scope: 'user',
					id: 'd1',
					source: 'peer-a',
					remoteRef: 'doc-42',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({
				op: 'set_remote',
				scope: 'user',
				id: 'd1',
				source: 'peer-a',
				remote_ref: 'doc-42',
			});
		});

		it('Sync defaults to pull and forwards push when chosen', async () => {
			mockClient.document.mockResolvedValue({ synced: 3 });
			const node = new LoomCycle();
			const ctxDefault = makeExecuteContext({
				params: { resource: 'document', operation: 'sync', scope: 'user', id: 'd1' },
			});
			await node.execute.call(ctxDefault);
			expect(mockClient.document.mock.calls[0][0].direction).toBe('pull');

			mockClient.document.mockClear();
			const ctxPush = makeExecuteContext({
				params: { resource: 'document', operation: 'sync', scope: 'user', id: 'd1', direction: 'push' },
			});
			await node.execute.call(ctxPush);
			expect(mockClient.document.mock.calls[0][0].direction).toBe('push');
		});

		it('Diff Remote sends no direction — it reports both without touching either side', async () => {
			mockClient.document.mockResolvedValue({ only_local: [], only_remote: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'document', operation: 'diff_remote', scope: 'user', id: 'd1' },
			});
			await node.execute.call(ctx);
			expect(mockClient.document).toHaveBeenCalledWith({ op: 'diff_remote', scope: 'user', id: 'd1' });
		});
	});
});
