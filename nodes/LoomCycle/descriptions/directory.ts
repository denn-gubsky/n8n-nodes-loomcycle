import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `directory` resource — who is in this
 * deployment and what is held for them (loomcycle ≥ v1.46). **Read-only by
 * design**: a "user" here is DERIVED from run activity, not a stored record,
 * so there is nothing to write. Removing a subject's footprint is the separate
 * Erasure node, the only thing that reaches every plane.
 *
 * Verified against a live v1.55: `users` and `inspect` return their tenant
 * alongside the payload, and `tenants` refuses a tenant-scoped token outright
 * rather than returning a filtered list.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const directoryOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['directory'] } },
		options: [
			{
				name: 'Inspect Subject',
				value: 'inspect',
				description: 'Aggregate one subject\'s activity, chats, memory, documents, budget and usage in a single call',
				action: 'Inspect a subject',
			},
			{
				name: 'List Tenants',
				value: 'tenants',
				description: 'Enumerate tenants with derived counts. Requires an operator-admin token.',
				action: 'List tenants',
			},
			{
				name: 'List Users',
				value: 'users',
				description: 'List the subjects with run activity in the tenant',
				action: 'List users',
			},
		],
		default: 'users',
	},

	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['directory'], operation: ['inspect'] } },
		description: 'The user ID to aggregate. Get one from List Users.',
	},
	{
		displayName: 'Tenant',
		name: 'tenant',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['directory'], operation: ['users', 'inspect'] } },
		description:
			'Admin-only tenant focus. A tenant-scoped credential is confined to its own tenant regardless, so leave this empty for one. An ADMIN token must set it on Inspect — a subject ID is only unique within a tenant, so the server refuses rather than guessing; use an empty string explicitly for the default tenant on a single-tenant install.',
	},
	{
		displayName: 'A subject with no runs does not appear: the listing is derived from run activity, so an empty result means no ACTIVITY, not no users. On Inspect, an ABSENT key means that plane was not examined rather than empty — `documents` is missing when SQL Memory is not configured, and a non-empty `errors` array makes every count a lower bound.',
		name: 'directoryDerivedNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['directory'] } },
	},
];
