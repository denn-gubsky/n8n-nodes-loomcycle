import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		scheduleDef: vi.fn(),
		listAllSchedules: vi.fn(),
		getScheduleState: vi.fn(),
		runScheduleNow: vi.fn(),
		pauseSchedule: vi.fn(),
		resumeSchedule: vi.fn(),
		webhookDef: vi.fn(),
		createChannel: vi.fn(),
		updateChannel: vi.fn(),
		releaseChannel: vi.fn(),
		history: vi.fn(),
		path: vi.fn(),
		memorySearch: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleSchedule } from '../../../nodes/LoomCycleSchedule/LoomCycleSchedule.node';
import { LoomCycleWebhook } from '../../../nodes/LoomCycleWebhook/LoomCycleWebhook.node';
import { LoomCycleChannel } from '../../../nodes/LoomCycleChannel/LoomCycleChannel.node';
import { LoomCycleHistory } from '../../../nodes/LoomCycleHistory/LoomCycleHistory.node';
import { LoomCyclePath } from '../../../nodes/LoomCyclePath/LoomCyclePath.node';
import { LoomCycleMemory } from '../../../nodes/LoomCycleMemory/LoomCycleMemory.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
	Object.values(mockClient).forEach((fn) => fn.mockResolvedValue({}));
});

type NodeLike = { execute: (this: never) => Promise<unknown> };
function exec(node: NodeLike, params: Record<string, unknown>, credentials?: Record<string, unknown>) {
	return (node.execute as unknown as (this: unknown) => Promise<unknown>).call(makeExecuteContext({ params, credentials }));
}
const overlayOf = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls[0][0] as { overlay: Record<string, unknown> }).overlay;

describe('LoomCycle Schedule — delivery and runtime state', () => {
	const base = { resource: 'scheduleDef', operation: 'create', name: 's', schedule: '0 9 * * *', promote: true };

	it('an agent schedule sends what it always did, with no delivery key', async () => {
		await exec(new LoomCycleSchedule() as unknown as NodeLike, { ...base, agent: 'a', prompt: 'go', additionalFields: {} });
		const o = overlayOf(mockClient.scheduleDef);
		expect(o).not.toHaveProperty('delivery');
		expect(o).toMatchObject({ agent: 'a', schedule: '0 9 * * *' });
	});

	it('a team schedule sends team, literal vars and input, and no agent', async () => {
		await exec(new LoomCycleSchedule() as unknown as NodeLike, {
			...base,
			delivery: 'team',
			deliveryTeam: 'triage',
			teamInput: 'daily',
			teamVars: { variable: [{ name: 'tone', value: 'brief' }] },
			additionalFields: { concurrencyPolicy: 'replace', maxFires: 5 },
		});
		const o = overlayOf(mockClient.scheduleDef);
		expect(o).toMatchObject({ delivery: 'team', team: 'triage', input: 'daily', vars: { tone: 'brief' }, concurrency_policy: 'replace', max_fires: 5 });
		expect(o).not.toHaveProperty('agent');
	});

	it('a channel schedule drops a stale overlap policy the server would refuse', async () => {
		await exec(new LoomCycleSchedule() as unknown as NodeLike, {
			...base,
			delivery: 'channel',
			deliveryChannel: 'ticks',
			additionalFields: { concurrencyPolicy: 'allow' },
		});
		const o = overlayOf(mockClient.scheduleDef);
		expect(o).toMatchObject({ delivery: 'channel', channel: 'ticks' });
		expect(o).not.toHaveProperty('concurrency_policy');
	});

	it('runtime ops address the schedule by def_id', async () => {
		const node = new LoomCycleSchedule() as unknown as NodeLike;
		for (const operation of ['getState', 'runNow', 'pause', 'resume']) {
			await exec(node, { resource: 'scheduleDef', operation, scheduleDefId: 'def_1' });
		}
		await exec(node, { resource: 'scheduleDef', operation: 'listAll' });
		expect(mockClient.getScheduleState).toHaveBeenCalledWith('def_1');
		expect(mockClient.runScheduleNow).toHaveBeenCalledWith('def_1');
		expect(mockClient.pauseSchedule).toHaveBeenCalledWith('def_1');
		expect(mockClient.resumeSchedule).toHaveBeenCalledWith('def_1');
		expect(mockClient.listAllSchedules).toHaveBeenCalled();
		expect(mockClient.scheduleDef).not.toHaveBeenCalled();
	});
});

describe('LoomCycle Webhook — delivery and verification', () => {
	const base = { resource: 'webhookDef', operation: 'create', name: 'w', enabled: true, promote: true, overlay: '{}' };

	// Regression: before 4.5.0 a channel webhook was sent as {channel} with no
	// delivery, which the server reads as an agent spawn and refuses.
	it('a channel webhook says delivery: channel, and a saved channel-only workflow is read as one', async () => {
		await exec(new LoomCycleWebhook() as unknown as NodeLike, { ...base, webhookDelivery: 'channel', channel: 'inbox' });
		expect(overlayOf(mockClient.webhookDef)).toMatchObject({ delivery: 'channel', channel: 'inbox' });
		mockClient.webhookDef.mockClear();
		await exec(new LoomCycleWebhook() as unknown as NodeLike, { ...base, channel: 'inbox' });
		expect(overlayOf(mockClient.webhookDef)).toMatchObject({ delivery: 'channel', channel: 'inbox' });
		expect(overlayOf(mockClient.webhookDef)).not.toHaveProperty('agent');
	});

	it('an agent webhook sends no delivery key, as before', async () => {
		await exec(new LoomCycleWebhook() as unknown as NodeLike, { ...base, agent: 'triager' });
		const o = overlayOf(mockClient.webhookDef);
		expect(o).toMatchObject({ agent: 'triager' });
		expect(o).not.toHaveProperty('delivery');
		expect(o).not.toHaveProperty('channel');
	});

	it('a team webhook sends JSONPath vars', async () => {
		await exec(new LoomCycleWebhook() as unknown as NodeLike, {
			...base,
			webhookDelivery: 'team',
			webhookTeam: 'pr-review',
			webhookTeamVars: { variable: [{ name: 'repo', value: '$.repository.full_name' }] },
		});
		expect(overlayOf(mockClient.webhookDef)).toMatchObject({
			delivery: 'team',
			team: 'pr-review',
			vars: { repo: '$.repository.full_name' },
		});
	});

	it('verification fields merge onto the Advanced Overlay auth and win key by key', async () => {
		await exec(new LoomCycleWebhook() as unknown as NodeLike, {
			...base,
			agent: 'a',
			overlay: '{"auth":{"kind":"hmac","header":"X-Sig","secret":"$cred:old"}}',
			verification: { verificationCredential: '$cred:new', provider: 'github', events: 'push, pull_request' },
		});
		const o = overlayOf(mockClient.webhookDef);
		expect(o.auth).toEqual({ kind: 'hmac', header: 'X-Sig', secret: '$cred:new' });
		expect(o).toMatchObject({ provider: 'github', events: ['push', 'pull_request'] });
	});

	it('refuses a literal verification secret before sending', async () => {
		await expect(
			exec(new LoomCycleWebhook() as unknown as NodeLike, { ...base, agent: 'a', verification: { verificationCredential: 'hunter2' } }),
		).rejects.toBeInstanceOf(NodeOperationError);
		expect(mockClient.webhookDef).not.toHaveBeenCalled();
	});
});

describe('LoomCycle Channel — held channels and publish hooks', () => {
	it('Create sends hold and the publish hooks', async () => {
		await exec(new LoomCycleChannel() as unknown as NodeLike, {
			resource: 'channel',
			operation: 'createChannel',
			channelName: 'gated',
			channelSettings: { hold: true, publishHooks: ['moderate'] },
		});
		expect(mockClient.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'gated', hold: true, hooks: { channel_publish: ['moderate'] } }),
		);
	});

	it('Update sends hold false and an empty hook selection as a removal', async () => {
		await exec(new LoomCycleChannel() as unknown as NodeLike, {
			resource: 'channel',
			operation: 'updateChannel',
			channelName: 'gated',
			updateSettings: { hold: false, publishHooks: [] },
		});
		expect(mockClient.updateChannel).toHaveBeenCalledWith('gated', { hold: false, hooks: {} });
	});

	it('Update leaves hold and hooks alone when they were not added', async () => {
		await exec(new LoomCycleChannel() as unknown as NodeLike, {
			resource: 'channel',
			operation: 'updateChannel',
			channelName: 'gated',
			updateSettings: { description: 'x' },
		});
		expect(mockClient.updateChannel).toHaveBeenCalledWith('gated', { description: 'x' });
	});

	it('Release delivers N held messages, per user when scoped', async () => {
		await exec(
			new LoomCycleChannel() as unknown as NodeLike,
			{ resource: 'channel', operation: 'release', channel: 'gated', scope: 'user', releaseCount: 3 },
			{ userId: 'u7' },
		);
		expect(mockClient.releaseChannel).toHaveBeenCalledWith('gated', { scope: 'user', count: 3, scope_id: 'u7' });
	});
});

describe('Paging and time windows', () => {
	it('History Search matches what was said only when asked, and Get pages turns', async () => {
		const node = new LoomCycleHistory() as unknown as NodeLike;
		await exec(node, { resource: 'history', operation: 'search', scope: 'self', query: 'refund', match: 'title' });
		expect(mockClient.history.mock.calls[0][0]).not.toHaveProperty('match');
		await exec(node, { resource: 'history', operation: 'search', scope: 'self', query: 'refund', match: 'content' });
		expect(mockClient.history.mock.calls[1][0]).toMatchObject({ match: 'content' });
		await exec(node, { resource: 'history', operation: 'get', scope: 'self', sessionId: 's1', turnPaging: { maxTurns: 20, skipTurns: 40 } });
		expect(mockClient.history.mock.calls[2][0]).toMatchObject({ op: 'get', session_id: 's1', limit: 20, offset: 40 });
	});

	it('Path List pages only when asked away from the default', async () => {
		const node = new LoomCyclePath() as unknown as NodeLike;
		await exec(node, { resource: 'path', operation: 'ls', path: '/', scope: 'agent', pageSize: 500 });
		expect(mockClient.path.mock.calls[0][0]).not.toHaveProperty('limit');
		await exec(node, { resource: 'path', operation: 'ls', path: '/', scope: 'agent', pageSize: 50, cursor: 'c1' });
		expect(mockClient.path.mock.calls[1][0]).toMatchObject({ limit: 50, cursor: 'c1' });
	});

	it('Memory Search sends a time window in RFC 3339, and nothing when unset', async () => {
		const node = new LoomCycleMemory() as unknown as NodeLike;
		await exec(node, { resource: 'memory', operation: 'search', query: 'q', scope: 'user', scopeID: 'u1', searchOptions: {} });
		expect(mockClient.memorySearch.mock.calls[0][0]).not.toHaveProperty('when');
		await exec(node, {
			resource: 'memory',
			operation: 'search',
			query: 'q',
			scope: 'user',
			scopeID: 'u1',
			searchOptions: { whenFrom: '2026-10-01T00:00:00.000Z', whenAsOf: '2026-10-20T12:00:00.000Z' },
		});
		expect(mockClient.memorySearch.mock.calls[1][0].when).toEqual({
			from: '2026-10-01T00:00:00.000Z',
			as_of: '2026-10-20T12:00:00.000Z',
		});
	});
});
