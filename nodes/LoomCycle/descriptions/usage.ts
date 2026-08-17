import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `usage` resource — token/cost attribution
 * (RFC AV, loomcycle ≥ v1.10) and per-scope token budgets (RFC AW, ≥ v1.11),
 * plus the instance capability report (`GET /v1/config`, ≥ v1.38).
 *
 * The FinOps surface: what was spent, which key paid for it, and what ceilings
 * apply. Pairs naturally with an n8n schedule that posts a cost report, or a
 * branch that reacts to the `limits[]` a Run reports on a budget crossing.
 *
 * Budget WRITES stay operator-only even for a tenant member (the RFC CB
 * carve-out), so Set / Delete Limit need an operator credential.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const usageOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['usage'] } },
		options: [
			{
				name: 'Delete Limit',
				value: 'deleteLimit',
				description: 'Remove a budget, making the scope unlimited again',
				action: 'Delete a token budget',
			},
			{
				name: 'Get Config',
				value: 'getConfig',
				description: 'Instance identity, feature matrix, live provider / model cascade and configured limits',
				action: 'Get instance config',
			},
			{
				name: 'List Limits',
				value: 'listLimits',
				description: 'Per-scope token budgets with live month-to-date usage',
				action: 'List token budgets',
			},
			{
				name: 'Set Limit',
				value: 'setLimit',
				description: 'Upsert one token budget. A full-row upsert — read the field notes.',
				action: 'Set a token budget',
			},
			{
				name: 'Usage Report',
				value: 'usageReport',
				description: 'Token + cost aggregates grouped by tenant / user / provider / model / source',
				action: 'Get a usage report',
			},
		],
		default: 'usageReport',
	},

	// ---- Usage report ----
	{
		displayName: 'Group By',
		name: 'groupBy',
		type: 'multiOptions',
		default: [],
		displayOptions: { show: { resource: ['usage'], operation: ['usageReport'] } },
		options: [
			{ name: 'Model', value: 'model' },
			{ name: 'Provider', value: 'provider' },
			{ name: 'Source', value: 'source' },
			{ name: 'Tenant', value: 'tenant' },
			{ name: 'User', value: 'user' },
		],
		description:
			'Dimensions to aggregate over. Empty = the server default (tenant + source). Group by `source` for the operator-vs-tenant split — which key actually paid.',
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		default: '',
		displayOptions: { show: { resource: ['usage'], operation: ['usageReport'] } },
		description: 'Inclusive lower bound of the reporting window. Empty = unbounded.',
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'dateTime',
		default: '',
		displayOptions: { show: { resource: ['usage'], operation: ['usageReport'] } },
		description: 'Inclusive upper bound of the reporting window. Empty = unbounded.',
	},

	// ---- Budgets ----
	{
		displayName: 'Scope',
		name: 'limitScope',
		type: 'options',
		default: 'tenant',
		required: true,
		displayOptions: { show: { resource: ['usage'], operation: ['setLimit', 'deleteLimit'] } },
		options: [
			{ name: 'Operator (Global)', value: 'operator', description: 'Admin-only: the deployment-wide ceiling' },
			{ name: 'Tenant', value: 'tenant' },
			{ name: 'User', value: 'user' },
		],
		description: 'Which scope the budget applies to. The operator-global scope is admin-only (403 otherwise).',
	},
	{
		displayName: 'Scope ID',
		name: 'limitScopeId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['usage'], operation: ['setLimit', 'deleteLimit'] } },
		description: 'Required for scope=user (the subject); leave empty for tenant, and for the operator-global scope',
	},
	{
		displayName: 'Soft Limit',
		name: 'softLimit',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['usage'], operation: ['setLimit'] } },
		description:
			'Monthly token ceiling that WARNS but does not block — crossing it emits a `limit` event a Run surfaces in its `limits[]` array. 0 = leave this tier unlimited.',
	},
	{
		displayName: 'Hard Limit',
		name: 'hardLimit',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['usage'], operation: ['setLimit'] } },
		description: 'Monthly token ceiling that REFUSES the next run at admission once crossed. 0 = leave this tier unlimited.',
	},
	{
		displayName: 'Set Limit is a FULL-ROW UPSERT: a tier left at 0 is not "unchanged", it is CLEARED to unlimited. To raise a soft limit while keeping a hard one, send both. Budget writes stay operator-only even for a tenant member, so these two ops need an operator credential.',
		name: 'setLimitUpsertNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['usage'], operation: ['setLimit'] } },
	},

	// ---- Shared admin tenant focus ----
	{
		displayName: 'Tenant',
		name: 'tenant',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['usage'], operation: ['usageReport', 'listLimits', 'setLimit', 'deleteLimit'] },
		},
		description:
			'Admin-only tenant focus. Ignored for a tenant-scoped principal, which always sees only its own tenant. On Set Limit a cross-tenant value is admin-only (403 otherwise).',
	},
];
