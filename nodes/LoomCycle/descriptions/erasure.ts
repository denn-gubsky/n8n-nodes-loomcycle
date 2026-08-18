import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `erasure` resource — subject erasure
 * (RFC BL P5, loomcycle ≥ v1.45). Report or remove everything a deployment
 * holds about one SUBJECT, across every plane. The natural home for a GDPR
 * data-subject-request workflow, which is exactly the kind of thing n8n is
 * used to build.
 *
 * Three tiers, and the distinction matters:
 *   - **tier1_covered** — deletable with existing primitives (chats, user
 *     memory, SQL Memory scopes, path entries).
 *   - **tier2_uncovered** — subject-keyed but nothing deleted it before
 *     (credentials, interrupts, token limits, usage ledger). Execute removes
 *     tiers 1 AND 2.
 *   - **tier3_residue** — facts ABOUT the subject living in scopes they do not
 *     own, reachable only by tracing provenance from their chats.
 *
 * The load-bearing warning, straight from the live response: tier-3 residue is
 * traceable ONLY through the subject's chats, which Execute deletes. It is
 * measured before anything is removed, but once the chats are gone no later
 * query can find it — so a report run afterwards shows residue 0 while those
 * facts remain. **The Execute response is the only durable record of what was
 * not reached.** Persist it downstream; do not drop the node's output.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const erasureOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['erasure'] } },
		options: [
			{
				name: 'Execute',
				value: 'execute',
				description: 'Remove tiers 1 and 2 for a subject. Dry run unless you explicitly commit.',
				action: 'Erase a subject',
			},
			{
				name: 'Report',
				value: 'report',
				description: 'Read-only: what this deployment holds about a subject, in three tiers',
				action: 'Report on a subject',
			},
		],
		default: 'report',
	},

	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['erasure'] } },
		description: 'The user ID whose footprint to report on or erase',
	},
	{
		displayName: 'Tenant',
		name: 'tenant',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['erasure'] } },
		description:
			'Admin-only tenant focus; a tenant-scoped credential is confined to its own regardless. An ADMIN token MUST set it — a subject ID is only unique within a tenant, so the server refuses rather than guessing. Use an empty string explicitly for the default tenant on a single-tenant install.',
	},

	// ---- The commit gate ----
	{
		// dry_run defaults TRUE server-side and the node keeps that default: an
		// erasure is irreversible, so committing has to be a deliberate act
		// rather than the fallback behaviour of a misconfigured node.
		displayName: 'Commit (Irreversible)',
		name: 'commit',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['erasure'], operation: ['execute'] } },
		description:
			'Whether to actually delete. Off (default) performs a DRY RUN reporting exactly what would go, changing nothing. Turning this on requires the confirmation below and is IRREVERSIBLE.',
	},
	{
		displayName: 'Confirm Subject',
		name: 'confirmSubject',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['erasure'], operation: ['execute'], commit: [true] } },
		description:
			'Retype the subject ID exactly to confirm a live erasure. The substrate requires this to match, and the node checks it first so a mismatch fails before any wire call rather than part-way through.',
	},
	{
		displayName: 'The Execute response is THE ONLY DURABLE RECORD of tier-3 residue — facts about the subject that erasure could not reach. Residue is measured before deletion, but it is traceable only through the subject\'s chats, which Execute removes: a report run afterwards will show residue 0 while those facts remain. Persist this node\'s output. Note also that the usage / cost ledger is retained by design (accounting records), and that erasure is disabled entirely unless the deployment sets LOOMCYCLE_AUDIT_LOG_PATH (loomcycle ≥ v1.55).',
		name: 'erasureResidueNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['erasure'], operation: ['execute'] } },
	},
	{
		displayName: 'In tier3_residue, `rows: 0` together with `sessions_examined: 0` means UNDETERMINABLE, not none — there were no chats to trace provenance through. Only `rows: 0` with a non-zero `sessions_examined` means genuinely nothing found. A fact written about the subject WITHOUT provenance is unreachable by any mechanism and is not counted at all.',
		name: 'erasureResidueReadingNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['erasure'] } },
	},
];
