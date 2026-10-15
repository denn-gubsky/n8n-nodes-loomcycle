import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IExecuteFunctions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		createCredential: vi.fn(),
		getCredential: vi.fn(),
		listCredentials: vi.fn(),
		deleteCredential: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { SubstrateToolRefusedError } from '@loomcycle/client';
import { LoomCycleCredential } from '../../../nodes/LoomCycleCredential/LoomCycleCredential.node';
import { credentialOps } from '../../../nodes/LoomCycle/descriptions';
import { makeExecuteContext } from './_helpers';

const SECRET = 'xoxb-not-a-real-token-1234567890';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

function run(params: Record<string, unknown>, opts: { secret?: string; continueOnFail?: boolean } = {}) {
	const ctx = makeExecuteContext({
		params: { resource: 'credential', credentialScope: 'tenant', ...params },
		continueOnFail: opts.continueOnFail,
	});
	const base = ctx.getCredentials;
	(ctx as unknown as { getCredentials: IExecuteFunctions['getCredentials'] }).getCredentials = (async (type: string) =>
		type === 'loomCycleSecretApi' ? { value: opts.secret ?? SECRET } : base.call(ctx, type)) as IExecuteFunctions['getCredentials'];
	return new LoomCycleCredential().execute.call(ctx);
}

describe('LoomCycle Credential', () => {
	it('takes the secret from a credential, never from a node parameter', () => {
		const params = credentialOps.map((p) => p.name);
		expect(params).not.toContain('value');
		expect(params).not.toContain('secret');
		const node = new LoomCycleCredential();
		const secretCred = node.description.credentials?.find((c) => c.name === 'loomCycleSecretApi');
		expect(secretCred?.displayOptions?.show?.operation).toEqual(['create']);
	});

	it('Create sends the value from the LoomCycle Secret credential, and returns only metadata', async () => {
		mockClient.createCredential.mockResolvedValue({ name: 'slack', scope: 'tenant', status: 'stored' });
		const out = await run({ operation: 'create', credentialName: ' slack ', urlPolicy: 'keep', credentialFields: {} });
		expect(mockClient.createCredential).toHaveBeenCalledWith({ scope: 'tenant', name: 'slack', value: SECRET });
		expect(JSON.stringify(out)).not.toContain(SECRET);
	});

	it('Create distinguishes no restriction, sent nowhere, and only these URLs', async () => {
		mockClient.createCredential.mockResolvedValue({});
		await run({ operation: 'create', credentialName: 'a', urlPolicy: 'keep' });
		expect(mockClient.createCredential.mock.calls[0][0]).not.toHaveProperty('allowed_urls');
		await run({ operation: 'create', credentialName: 'a', urlPolicy: 'none' });
		expect(mockClient.createCredential.mock.calls[1][0].allowed_urls).toEqual([]);
		await run({ operation: 'create', credentialName: 'a', urlPolicy: 'list', allowedUrls: 'https://a.example, https://b.example/x' });
		expect(mockClient.createCredential.mock.calls[2][0].allowed_urls).toEqual(['https://a.example', 'https://b.example/x']);
		await expect(run({ operation: 'create', credentialName: 'a', urlPolicy: 'list', allowedUrls: ' ' })).rejects.toThrow(
			/at least one https URL/,
		);
	});

	it('Create sends an RFC 3339 expiry and a username when set', async () => {
		mockClient.createCredential.mockResolvedValue({});
		await run({
			operation: 'create',
			credentialName: 'git',
			urlPolicy: 'keep',
			credentialFields: { expiresAt: '2027-01-31T10:00:00.000Z', username: 'x-access-token' },
		});
		expect(mockClient.createCredential.mock.calls[0][0]).toMatchObject({
			expires_at: '2027-01-31T10:00:00.000Z',
			username: 'x-access-token',
		});
	});

	it('refuses an empty secret before calling loomcycle', async () => {
		await expect(run({ operation: 'create', credentialName: 'a' }, { secret: '' })).rejects.toThrow(/empty Secret Value/);
		expect(mockClient.createCredential).not.toHaveBeenCalled();
	});

	it('SECURITY — a refused create does not echo the secret into the output', async () => {
		mockClient.createCredential.mockRejectedValue(
			new SubstrateToolRefusedError('refused', { status: 422, bodyText: 'expires_at must be in the future' }),
		);
		const out = await run({ operation: 'create', credentialName: 'a' }, { continueOnFail: true });
		expect(JSON.stringify(out)).not.toContain(SECRET);
	});

	it('Get, List and Delete pass scope and name only', async () => {
		mockClient.getCredential.mockResolvedValue({});
		mockClient.listCredentials.mockResolvedValue({ credentials: [] });
		mockClient.deleteCredential.mockResolvedValue({ deleted: true });
		await run({ operation: 'get', credentialName: 'a', credentialScope: 'user' });
		await run({ operation: 'list', credentialScope: 'user' });
		await run({ operation: 'delete', credentialName: 'a' });
		expect(mockClient.getCredential).toHaveBeenCalledWith({ scope: 'user', name: 'a' });
		expect(mockClient.listCredentials).toHaveBeenCalledWith('user');
		expect(mockClient.deleteCredential).toHaveBeenCalledWith({ scope: 'tenant', name: 'a' });
	});
});
