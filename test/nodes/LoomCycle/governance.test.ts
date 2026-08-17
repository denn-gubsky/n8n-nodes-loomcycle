import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		directoryUsers: vi.fn(),
		directoryInspect: vi.fn(),
		directoryTenants: vi.fn(),
		erasureReport: vi.fn(),
		erasureExecute: vi.fn(),
		listUsers: vi.fn(),
		createUser: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		mintUserToken: vi.fn(),
		listUserTokens: vi.fn(),
		revokeUserToken: vi.fn(),
		usageReport: vi.fn(),
		listLimits: vi.fn(),
		setLimit: vi.fn(),
		deleteLimit: vi.fn(),
		getConfig: vi.fn(),
		health: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleDirectory } from '../../../nodes/LoomCycleDirectory/LoomCycleDirectory.node';
import { LoomCycleErasure } from '../../../nodes/LoomCycleErasure/LoomCycleErasure.node';
import { LoomCycleUser } from '../../../nodes/LoomCycleUser/LoomCycleUser.node';
import { LoomCycleUsage } from '../../../nodes/LoomCycleUsage/LoomCycleUsage.node';
import { userOps } from '../../../nodes/LoomCycle/descriptions';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=directory', () => {
	it('List Users omits the tenant option entirely when unset', async () => {
		mockClient.directoryUsers.mockResolvedValue({ tenant: 't1', users: [] });
		const node = new LoomCycleDirectory();
		const ctx = makeExecuteContext({ params: { resource: 'directory', operation: 'users' } });
		await node.execute.call(ctx);
		expect(mockClient.directoryUsers).toHaveBeenCalledWith(undefined);
	});

	// For an admin token `""` selects the DEFAULT tenant, whereas omitting the
	// field makes the server refuse rather than guess — so an explicitly typed
	// empty string has to survive as an empty string.
	it('threads an explicitly empty tenant through rather than dropping it', async () => {
		mockClient.directoryInspect.mockResolvedValue({ subject: 'u1' });
		const node = new LoomCycleDirectory();
		const ctx = makeExecuteContext({
			params: { resource: 'directory', operation: 'inspect', subject: 'u1', tenant: '' },
		});
		await node.execute.call(ctx);
		expect(mockClient.directoryInspect).toHaveBeenCalledWith('u1', { tenant: '' });
	});

	it('Inspect forwards a named tenant', async () => {
		mockClient.directoryInspect.mockResolvedValue({ subject: 'u1' });
		const node = new LoomCycleDirectory();
		const ctx = makeExecuteContext({
			params: { resource: 'directory', operation: 'inspect', subject: 'u1', tenant: 'acme' },
		});
		await node.execute.call(ctx);
		expect(mockClient.directoryInspect).toHaveBeenCalledWith('u1', { tenant: 'acme' });
	});

	it('List Tenants takes no arguments', async () => {
		mockClient.directoryTenants.mockResolvedValue({ tenants: [] });
		const node = new LoomCycleDirectory();
		const ctx = makeExecuteContext({ params: { resource: 'directory', operation: 'tenants' } });
		await node.execute.call(ctx);
		expect(mockClient.directoryTenants).toHaveBeenCalledWith();
	});
});

describe('LoomCycle resource=erasure', () => {
	it('Report is read-only and never calls execute', async () => {
		mockClient.erasureReport.mockResolvedValue({ subject: 'u1', tier3_residue: { rows: 0 } });
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: { resource: 'erasure', operation: 'report', subject: 'u1' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.erasureReport).toHaveBeenCalledWith('u1', undefined);
		expect(mockClient.erasureExecute).not.toHaveBeenCalled();
		expect(result[0][0].json).toMatchObject({ subject: 'u1' });
	});

	// dryRun is sent EXPLICITLY rather than relying on the server default, so a
	// reader of the payload can see which mode the request is in.
	it('Execute sends dryRun true when Commit is off', async () => {
		mockClient.erasureExecute.mockResolvedValue({ dry_run: true, deleted: {} });
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: { resource: 'erasure', operation: 'execute', subject: 'u1' },
		});
		await node.execute.call(ctx);
		expect(mockClient.erasureExecute).toHaveBeenCalledWith('u1', { dryRun: true });
	});

	it('Execute sends dryRun false and the confirm string when committed', async () => {
		mockClient.erasureExecute.mockResolvedValue({ dry_run: false, deleted: { chats: 1 } });
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: {
				resource: 'erasure',
				operation: 'execute',
				subject: 'u1',
				commit: true,
				confirmSubject: 'u1',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.erasureExecute).toHaveBeenCalledWith('u1', { dryRun: false, confirm: 'u1' });
	});

	// The substrate requires confirm === subject; checking locally means a typo
	// cannot reach a destructive endpoint at all.
	it('Execute refuses a mismatched confirmation before any wire call', async () => {
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: {
				resource: 'erasure',
				operation: 'execute',
				subject: 'u1',
				commit: true,
				confirmSubject: 'u2',
			},
		});
		await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.erasureExecute).not.toHaveBeenCalled();
	});

	it('Execute refuses an empty confirmation', async () => {
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: { resource: 'erasure', operation: 'execute', subject: 'u1', commit: true },
		});
		await expect(node.execute.call(ctx)).rejects.toThrow(/must exactly match/);
		expect(mockClient.erasureExecute).not.toHaveBeenCalled();
	});

	// The response is the only durable record of tier-3 residue, so it must reach
	// the workflow verbatim rather than being summarised away.
	it('surfaces the residue record verbatim', async () => {
		const record = {
			dry_run: false,
			deleted: { chats: 1 },
			retained: { usage_ledger: 'retained by design' },
			residue: { rows: 4, scopes: ['agent:a1'], sessions_examined: 3, truncated: false },
			notes: ['THIS RESPONSE IS THE ONLY DURABLE RECORD'],
		};
		mockClient.erasureExecute.mockResolvedValue(record);
		const node = new LoomCycleErasure();
		const ctx = makeExecuteContext({
			params: {
				resource: 'erasure',
				operation: 'execute',
				subject: 'u1',
				commit: true,
				confirmSubject: 'u1',
			},
		});
		const result = await node.execute.call(ctx);
		expect(result[0][0].json).toEqual(record);
	});
});

describe('LoomCycle resource=user', () => {
	it('List needs no arguments — the tenant is server-derived', async () => {
		mockClient.listUsers.mockResolvedValue({ users: [] });
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({ params: { resource: 'user', operation: 'list' } });
		await node.execute.call(ctx);
		expect(mockClient.listUsers).toHaveBeenCalledWith();
	});

	it('Create sends subject, access mode and status', async () => {
		mockClient.createUser.mockResolvedValue({ subject: 'u1', access_mode: 'isolated' });
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({
			params: {
				resource: 'user',
				operation: 'create',
				subject: 'u1',
				displayName: 'Alice',
				accessMode: 'isolated',
				status: 'active',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.createUser).toHaveBeenCalledWith({
			subject: 'u1',
			display_name: 'Alice',
			access_mode: 'isolated',
			status: 'active',
		});
	});

	// Update is a PATCH: an omitted key leaves the column unchanged, so a blank
	// display name must not be sent as "" — that would clear it.
	it('Update omits a blank display name instead of clearing it', async () => {
		mockClient.updateUser.mockResolvedValue({ subject: 'u1' });
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({
			params: {
				resource: 'user',
				operation: 'update',
				subject: 'u1',
				displayName: '   ',
				accessMode: 'tenant',
				status: 'disabled',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.updateUser).toHaveBeenCalledWith('u1', {
			access_mode: 'tenant',
			status: 'disabled',
		});
	});

	it('Delete surfaces an envelope that says owned data survives', async () => {
		mockClient.deleteUser.mockResolvedValue(undefined);
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({
			params: { resource: 'user', operation: 'delete', subject: 'u1' },
		});
		const result = await node.execute.call(ctx);
		const json = result[0][0].json as Record<string, unknown>;
		expect(mockClient.deleteUser).toHaveBeenCalledWith('u1');
		expect(json.ok).toBe(true);
		expect(String(json.note)).toContain('Erasure');
	});

	it('List Tokens returns metadata only', async () => {
		mockClient.listUserTokens.mockResolvedValue({ subject: 'u1', tokens: [{ def_id: 'd1', active: true }] });
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({
			params: { resource: 'user', operation: 'listTokens', subject: 'u1' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.listUserTokens).toHaveBeenCalledWith('u1');
		// No plaintext ever appears in a list response.
		expect(JSON.stringify(result[0][0].json)).not.toContain('"token"');
	});

	it('Revoke Token targets one def_id', async () => {
		mockClient.revokeUserToken.mockResolvedValue({ def_id: 'd1', retired_at: 'now' });
		const node = new LoomCycleUser();
		const ctx = makeExecuteContext({
			params: { resource: 'user', operation: 'revokeToken', subject: 'u1', tokenDefId: 'd1' },
		});
		await node.execute.call(ctx);
		expect(mockClient.revokeUserToken).toHaveBeenCalledWith('u1', 'd1');
	});

	// SECURITY: mintUserToken returns the bearer plaintext once. It must be
	// absent from the op list AND refused by the executor — the same
	// defence-in-depth the Operator Token node uses.
	it('does not offer a mint operation', () => {
		const opParam = userOps[0] as { options: Array<{ value: string }> };
		const values = opParam.options.map((o) => o.value);
		expect(values).not.toContain('mint');
		expect(values).not.toContain('mintToken');
		expect(values).not.toContain('rotate');
	});

	it('refuses a mint operation even if one is forced through', async () => {
		const node = new LoomCycleUser();
		for (const operation of ['mint', 'mintToken', 'rotate']) {
			const ctx = makeExecuteContext({ params: { resource: 'user', operation, subject: 'u1' } });
			await expect(node.execute.call(ctx)).rejects.toThrow(/not available from n8n/);
		}
		expect(mockClient.mintUserToken).not.toHaveBeenCalled();
	});
});

describe('LoomCycle resource=usage', () => {
	it('Usage Report omits every unset filter', async () => {
		mockClient.usageReport.mockResolvedValue({ aggregates: [] });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({ params: { resource: 'usage', operation: 'usageReport' } });
		await node.execute.call(ctx);
		expect(mockClient.usageReport).toHaveBeenCalledWith({});
	});

	it('Usage Report forwards groupBy, window and tenant', async () => {
		mockClient.usageReport.mockResolvedValue({ aggregates: [] });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({
			params: {
				resource: 'usage',
				operation: 'usageReport',
				groupBy: ['provider', 'model'],
				from: '2026-08-01T00:00:00.000Z',
				to: '2026-08-31T23:59:59.000Z',
				tenant: 'acme',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.usageReport).toHaveBeenCalledWith({
			groupBy: ['provider', 'model'],
			from: '2026-08-01T00:00:00.000Z',
			to: '2026-08-31T23:59:59.000Z',
			tenant: 'acme',
		});
	});

	it('List Limits omits the options object without a tenant focus', async () => {
		mockClient.listLimits.mockResolvedValue({ limits: [] });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({ params: { resource: 'usage', operation: 'listLimits' } });
		await node.execute.call(ctx);
		expect(mockClient.listLimits).toHaveBeenCalledWith(undefined);
	});

	// Set Limit is a FULL-ROW UPSERT: an omitted tier is CLEARED to unlimited.
	// So 0 in the UI means "unlimited on this axis" and must not be sent as 0,
	// which the substrate would read as a zero ceiling refusing every run.
	it('Set Limit omits a tier left at zero rather than sending a zero ceiling', async () => {
		mockClient.setLimit.mockResolvedValue({ scope: 'tenant' });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({
			params: {
				resource: 'usage',
				operation: 'setLimit',
				limitScope: 'tenant',
				softLimit: 900000,
				hardLimit: 0,
			},
		});
		await node.execute.call(ctx);
		const body = mockClient.setLimit.mock.calls[0][0];
		expect(body).toEqual({ scope: 'tenant', soft_limit: 900000 });
		expect(body).not.toHaveProperty('hard_limit');
	});

	it('Set Limit forwards scope_id and tenant_id for a per-user budget', async () => {
		mockClient.setLimit.mockResolvedValue({ scope: 'user' });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({
			params: {
				resource: 'usage',
				operation: 'setLimit',
				limitScope: 'user',
				limitScopeId: 'u1',
				softLimit: 1000,
				hardLimit: 2000,
				tenant: 'acme',
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.setLimit).toHaveBeenCalledWith({
			scope: 'user',
			scope_id: 'u1',
			soft_limit: 1000,
			hard_limit: 2000,
			tenant_id: 'acme',
		});
	});

	it('Delete Limit surfaces an ok envelope for a void response', async () => {
		mockClient.deleteLimit.mockResolvedValue(undefined);
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({
			params: { resource: 'usage', operation: 'deleteLimit', limitScope: 'user', limitScopeId: 'u1' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.deleteLimit).toHaveBeenCalledWith('user', { scopeId: 'u1' });
		expect(result[0][0].json).toMatchObject({ ok: true, scope: 'user', scope_id: 'u1' });
	});

	it('Get Config takes no arguments', async () => {
		mockClient.getConfig.mockResolvedValue({ view: 'admin', instance: {} });
		const node = new LoomCycleUsage();
		const ctx = makeExecuteContext({ params: { resource: 'usage', operation: 'getConfig' } });
		const result = await node.execute.call(ctx);
		expect(mockClient.getConfig).toHaveBeenCalledWith();
		expect(result[0][0].json).toMatchObject({ view: 'admin' });
	});
});
