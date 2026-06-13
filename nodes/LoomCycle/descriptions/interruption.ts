import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `interruption` resource — human-in-the-loop
 * over loomcycle's Interruption.ask (v0.8.16). 3 ops:
 *
 *   - List for User → listUserInterrupts(userId, {status})
 *   - List for Run  → listRunInterrupts(runId, {status})
 *   - Resolve       → resolveInterrupt(runId, interruptId, {answer, resolvedBy})
 *
 * The pattern: an agent calls Interruption.ask and parks; the question
 * surfaces here (or via the LoomCycle: Interrupt Pending trigger); a human
 * answers in n8n (Slack/email/form); Resolve posts the answer back and the
 * agent unblocks. Requires loomcycle's consumer-MCP interruption backend so
 * an external resolver is accepted.
 *
 * Op options array is alphabetised by name.
 */
export const interruptionOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['interruption'] } },
		options: [
			{
				name: 'List for Run',
				value: 'listForRun',
				description: 'List interrupts emitted by a specific run',
				action: 'List interrupts for a run',
			},
			{
				name: 'List for User',
				value: 'listForUser',
				description: 'List interrupts addressable to a user_id',
				action: 'List interrupts for a user',
			},
			{
				name: 'Resolve',
				value: 'resolve',
				description: 'Answer a pending Interruption.ask so the parked agent unblocks',
				action: 'Resolve an interrupt',
			},
		],
		default: 'listForUser',
	},

	// ---- User ID (List for User) ----
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['interruption'], operation: ['listForUser'] } },
		description: 'User_id whose interrupts to list. Empty = use the credential\'s Default User ID.',
	},

	// ---- Run ID (List for Run / Resolve) ----
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['interruption'], operation: ['listForRun', 'resolve'] } },
		description: 'The run_id that raised the interrupt (from a Spawn output or the Interrupt Pending trigger)',
	},

	// ---- Status filter (List for User / List for Run) ----
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		default: 'pending',
		displayOptions: { show: { resource: ['interruption'], operation: ['listForUser', 'listForRun'] } },
		options: [
			{ name: 'Answered', value: 'answered' },
			{ name: 'Cancelled', value: 'cancelled' },
			{ name: 'Expired', value: 'expired' },
			{ name: 'Pending', value: 'pending' },
		],
		description: 'Filter the listing by interrupt status. Pending = awaiting a human answer.',
	},

	// ---- Resolve: interrupt id + answer ----
	{
		displayName: 'Interrupt ID',
		name: 'interruptId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['interruption'], operation: ['resolve'] } },
		description: 'The interrupt_id to resolve (from a List op or the Interrupt Pending trigger)',
	},
	{
		displayName: 'Answer',
		name: 'answer',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['interruption'], operation: ['resolve'] } },
		description: 'The human\'s answer. When the original ask declared options, this MUST be one of them (validated server-side).',
	},
	{
		displayName: 'Resolved By',
		name: 'resolvedBy',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['interruption'], operation: ['resolve'] } },
		description: 'Audit attribution for who resolved it (free-form). Empty = `client`.',
	},
];
