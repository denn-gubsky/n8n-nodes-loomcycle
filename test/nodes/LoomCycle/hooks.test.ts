import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		ensureHookDef: vi.fn(),
		createHookDef: vi.fn(),
		forkHookDef: vi.fn(),
		hookDef: vi.fn(),
		listHookDefNames: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleHook as LoomCycle } from '../../../nodes/LoomCycleHook/LoomCycleHook.node';
import { hookOps } from '../../../nodes/LoomCycle/descriptions';
import { loadHookDefNames } from '../../../nodes/LoomCycle/helpers/loadOptions';
import { makeExecuteContext, makeLoadOptionsContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

function run(params: Record<string, unknown>) {
	return new LoomCycle().execute.call(makeExecuteContext({ params: { resource: 'hook', ...params } }));
}

describe('LoomCycle Hook (HookDef)', () => {
	it('offers exactly the HookDef operations, and none of the removed registration ones', () => {
		const op = hookOps.find((p) => p.name === 'operation');
		const values = (op?.options as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(['create', 'delete', 'fork', 'get', 'listNames', 'list', 'promote', 'retire', 'verify']);
		expect(values).not.toContain('register');
	});

	it('Create assembles a webhook definition and registers it only if changed', async () => {
		mockClient.ensureHookDef.mockResolvedValue({ name: 'gate', defId: 'hdf_1', version: 1, changed: true });
		const out = await run({
			operation: 'create',
			name: 'gate',
			event: 'pre',
			matchTools: 'WebFetch, mcp__github__*',
			bodyKind: 'http',
			url: 'https://n8n.example.com/webhook/x/hook',
			signingCredential: '$cred:n8n-hook-signing',
			headers: { header: [{ name: 'X-Team', value: 'sec' }] },
			failMode: 'closed',
			timeoutMs: 3000,
			hookDescription: 'Outbound fetch policy',
			onlyIfChanged: true,
			defDescription: 'first cut',
		});
		expect(mockClient.ensureHookDef).toHaveBeenCalledWith(
			'gate',
			{
				event: 'pre',
				match: { tools: ['WebFetch', 'mcp__github__*'] },
				body: {
					kind: 'http',
					url: 'https://n8n.example.com/webhook/x/hook',
					headers: { 'X-Team': 'sec' },
					signing_secret: '$cred:n8n-hook-signing',
				},
				fail_mode: 'closed',
				timeout_ms: 3000,
				description: 'Outbound fetch policy',
			},
			{ description: 'first cut' },
		);
		expect(mockClient.createHookDef).not.toHaveBeenCalled();
		expect(out[0][0].json).toMatchObject({ changed: true, defId: 'hdf_1' });
	});

	it('Create with Only If Changed off mints a version with the chosen promote', async () => {
		mockClient.createHookDef.mockResolvedValue({ def_id: 'hdf_2' });
		await run({
			operation: 'create',
			name: 'gate',
			event: 'agent_stop',
			bodyKind: 'code-js',
			code: 'function hook(ev) { return {}; }',
			onlyIfChanged: false,
			promote: false,
		});
		expect(mockClient.createHookDef).toHaveBeenCalledWith(
			'gate',
			{ event: 'agent_stop', body: { kind: 'code-js', code: 'function hook(ev) { return {}; }' }, fail_mode: 'open' },
			{ promote: false },
		);
		expect(mockClient.ensureHookDef).not.toHaveBeenCalled();
	});

	it('Create drops a stale tool match on a run event, which the server would refuse', async () => {
		mockClient.ensureHookDef.mockResolvedValue({ changed: false });
		await run({
			operation: 'create',
			name: 'g',
			event: 'run_end',
			matchTools: 'WebFetch',
			bodyKind: 'http',
			url: 'https://x/y',
		});
		const overlay = mockClient.ensureHookDef.mock.calls[0][1] as Record<string, unknown>;
		expect(overlay.match).toBeUndefined();
	});

	it('Create refuses a literal signing secret before it is sent', async () => {
		await expect(
			run({ operation: 'create', name: 'g', event: 'pre', bodyKind: 'http', url: 'https://x/y', signingCredential: 'hunter2' }),
		).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.ensureHookDef).not.toHaveBeenCalled();
		expect(mockClient.createHookDef).not.toHaveBeenCalled();
	});

	it('Fork sends the JSON fields to replace, unpromoted by default', async () => {
		mockClient.forkHookDef.mockResolvedValue({ def_id: 'hdf_3', promoted: false });
		await run({ operation: 'fork', hookName: 'gate', overlay: '{"timeout_ms": 2000, "match": null}', parentDefId: 'hdf_1' });
		expect(mockClient.forkHookDef).toHaveBeenCalledWith(
			'gate',
			{ timeout_ms: 2000, match: null },
			{ promote: false, parentDefId: 'hdf_1' },
		);
	});

	it('Fork refuses fields that are not a JSON object', async () => {
		await expect(run({ operation: 'fork', hookName: 'gate', overlay: '[1,2]' })).rejects.toBeInstanceOf(
			NodeOperationError,
		);
	});

	it('Get prefers a Definition ID, falls back to the name, and refuses neither', async () => {
		mockClient.hookDef.mockResolvedValue({ def_id: 'hdf_1' });
		await run({ operation: 'get', hookName: 'gate', defId: 'hdf_9' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'get', def_id: 'hdf_9' });
		await run({ operation: 'get', hookName: 'gate' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'get', name: 'gate' });
		await expect(run({ operation: 'get' })).rejects.toBeInstanceOf(NodeOperationError);
	});

	it('Promote, Retire, Verify, List Versions and Delete map to their ops', async () => {
		mockClient.hookDef.mockResolvedValue({});
		await run({ operation: 'promote', defId: 'hdf_3' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'promote', def_id: 'hdf_3' });
		await run({ operation: 'retire', defId: 'hdf_3', retired: false });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'retire', def_id: 'hdf_3', retired: false });
		await run({ operation: 'verify', hookName: 'gate' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'verify', name: 'gate' });
		await run({ operation: 'verify', hookName: 'gate', contentSha256: 'sha256:abc' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'verify', name: 'gate', content_sha256: 'sha256:abc' });
		await run({ operation: 'list', hookName: 'gate' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'list', name: 'gate' });
		await run({ operation: 'delete', hookName: 'gate' });
		expect(mockClient.hookDef).toHaveBeenLastCalledWith({ op: 'delete', name: 'gate' });
	});

	it('List Names returns the names array, empty when the server has none', async () => {
		mockClient.listHookDefNames.mockResolvedValue({ names: null });
		const out = await run({ operation: 'listNames' });
		expect(out[0][0].json).toEqual({ names: [] });
	});

	it('the name dropdown badges a hook with no active version', async () => {
		mockClient.listHookDefNames.mockResolvedValue({
			names: [
				{ name: 'b', version_count: 2, latest_version: 2, active_def_id: 'hdf_2', last_updated: '' },
				{ name: 'a', version_count: 1, latest_version: 1, last_updated: '' },
			],
		});
		const options = await loadHookDefNames.call(makeLoadOptionsContext({}));
		expect(options.map((o) => o.value)).toEqual(['a', 'b']);
		expect(options[0].description).toContain('no active version');
		expect(options[1].description).toBe('latest v2 · 2 versions');
	});
});
