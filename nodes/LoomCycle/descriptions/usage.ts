import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `usage` resource — token/cost attribution
 * (RFC AV, loomcycle ≥ v1.10) and per-scope token budgets (RFC AW, ≥ v1.11),
 * plus the instance capability report (`GET /v1/config`, ≥ v1.38).
 *
 * The FinOps surface, **read-only**: what was spent, which key paid for it, and
 * what ceilings apply. Pairs naturally with an n8n schedule that posts a cost
 * report, or a branch that reacts to the `limits[]` a Run reports on a budget
 * crossing.
 *
 * Budget WRITES are deliberately absent. They stay operator-only even for a
 * tenant member (the RFC CB carve-out), and setting a ceiling is an operator act
 * belonging in the loomcycle CLI / Web UI — not something a workflow should do
 * as a side effect. `setLimit` is also a full-row upsert, so a partially-filled
 * n8n form would silently clear the tier it left blank.
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

	// ---- Shared admin tenant focus ----
	{
		displayName: 'Tenant',
		name: 'tenant',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['usage'], operation: ['usageReport', 'listLimits'] },
		},
		description:
			'Admin-only tenant focus. Ignored for a tenant-scoped principal, which always sees only its own tenant.',
	},
];
