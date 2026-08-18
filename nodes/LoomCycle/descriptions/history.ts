import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `history` resource — past chats as first-class
 * objects (RFC BE, loomcycle ≥ v1.20). A "chat" is a conversation session; the
 * owner is resolved server-side from the run identity and never sent on the
 * wire, so you pick a SCOPE selector rather than an owner id. Cross-scope reads
 * fold to an opaque not-found.
 *
 * Replaced the removed `Context op=history`.
 *
 * **Verified live on v1.55, and worth knowing before you use Search:** `search`
 * matches the chat TITLE only — a case-insensitive substring, no content or
 * summary search. A query describing what a conversation was *about* returns
 * nothing even when a chat's own summary is entirely on that subject. **Related**
 * is the semantic path; it scores chats by meaning and is what you actually want
 * for "find the conversation about X".
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const historyOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['history'] } },
		options: [
			{
				name: 'Annotate',
				value: 'annotate',
				description: 'Set a chat\'s description and tags. The tag set REPLACES the existing one.',
				action: 'Annotate a chat',
			},
			{
				name: 'Archive',
				value: 'archive',
				description: 'Archive or unarchive a chat. Archived chats are excluded from listings by default.',
				action: 'Archive a chat',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Fetch one chat\'s metadata and transcript, as events, Markdown, or just the conversation turns',
				action: 'Get a chat',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List chats with filters on status, activity window, tag, title and pinned state',
				action: 'List chats',
			},
			{
				name: 'Pin',
				value: 'pin',
				description: 'Pin or unpin a chat. Pinned chats are exempt from retention sweeps.',
				action: 'Pin a chat',
			},
			{
				name: 'Recap',
				value: 'recap',
				description: 'Return a summary of a chat rather than its full transcript',
				action: 'Recap a chat',
			},
			{
				name: 'Related',
				value: 'related',
				description: 'Find semantically similar chats — by free-text query, or to another chat. The real content-aware search.',
				action: 'Find related chats',
			},
			{
				name: 'Rename',
				value: 'rename',
				description: 'Set a chat\'s title. Worth doing: the title is the only thing Search matches.',
				action: 'Rename a chat',
			},
			{
				name: 'Resume',
				value: 'resume',
				description: 'Get a continuation handle for a chat so a new run can pick it up',
				action: 'Resume a chat',
			},
			{
				name: 'Search',
				value: 'search',
				description: 'Substring match on the chat TITLE ONLY — not content. Use Related to search by meaning.',
				action: 'Search chats by title',
			},
		],
		default: 'list',
	},

	// ---- Scope: every op ----
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'self',
		displayOptions: { show: { resource: ['history'] } },
		options: [
			{ name: 'Self (This Agent\'s Chats)', value: 'self' },
			{ name: 'User (This End-User\'s Chats)', value: 'user' },
			{ name: 'Tenant (This Tenant\'s Chats)', value: 'tenant' },
			{ name: 'Global (All Tenants — Admin Only)', value: 'global' },
		],
		description:
			'Whose chats to address. The owner ID is resolved server-side from the authenticated principal, never sent — this only selects WHICH owner set. `global` is admin-only and is refused rather than filtered; a delegated per-user token is capped to self and user.',
	},

	// ---- Session ID: the single-chat ops ----
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['history'],
				operation: ['get', 'rename', 'annotate', 'pin', 'archive', 'recap', 'resume'],
			},
		},
		description: 'The chat (session) ID to target. List and Related both return these.',
	},

	// ---- Get ----
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		default: '',
		displayOptions: { show: { resource: ['history'], operation: ['get'] } },
		options: [
			{
				name: 'Events (Structured)',
				value: '',
				description: 'The full structured event array — every runtime event, not just the conversation',
			},
			{
				name: 'Markdown (Full Transcript)',
				value: 'markdown',
				description: 'Metadata header plus every event, rendered as Markdown',
			},
			{
				name: 'Conversation (Turns Only)',
				value: 'conversation',
				description: 'Only the user and assistant turns — no header, no tool traffic, no runtime payloads',
			},
		],
		description:
			'How to render the transcript. Pick **Conversation** when feeding a chat to a model: it strips tool traffic and runtime events, which is usually most of the tokens and none of the meaning.',
	},

	// ---- List / Search filters ----
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['history'], operation: ['list', 'search'] } },
		options: [
			{
				displayName: 'From',
				name: 'from',
				type: 'dateTime',
				default: '',
				description: 'Lower bound on last activity',
			},
			{
				displayName: 'Include Archived',
				name: 'includeArchived',
				type: 'boolean',
				default: false,
				description: 'Whether to include archived chats, which are excluded by default',
			},
			{
				displayName: 'Include Internal',
				name: 'includeInternal',
				type: 'boolean',
				default: false,
				description:
					'Whether to include chats served by loomcycle\'s own maintenance agents. Excluded by default because they are runtime bookkeeping rather than conversations — turn it on to debug a background pass.',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Pagination offset',
			},
			{
				displayName: 'Pinned Only',
				name: 'pinnedOnly',
				type: 'boolean',
				default: false,
				description: 'Whether to restrict results to pinned chats',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Running', value: 'running' },
				],
				description: 'Filter by derived chat status',
			},
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				default: '',
				description: 'Return only chats carrying this exact tag',
			},
			{
				displayName: 'Title Contains',
				name: 'titleContains',
				type: 'string',
				default: '',
				description: 'Case-insensitive substring match on the title (List only)',
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'dateTime',
				default: '',
				description: 'Upper bound on last activity',
			},
		],
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['history'], operation: ['search'] } },
		description:
			'Case-insensitive substring matched against the chat TITLE. It does NOT search transcripts or summaries — a query describing what a conversation was about will return nothing. Use Related for that.',
	},

	// ---- Related ----
	{
		displayName: 'Match By',
		name: 'relatedBy',
		type: 'options',
		default: 'query',
		displayOptions: { show: { resource: ['history'], operation: ['related'] } },
		options: [
			{ name: 'Query (Free Text)', value: 'query' },
			{ name: 'Session (Chats Like This One)', value: 'session' },
		],
		description: 'Find chats similar to a free-text query, or to another chat. The substrate accepts one or the other, never both.',
	},
	{
		displayName: 'Query',
		name: 'relatedQuery',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['history'], operation: ['related'], relatedBy: ['query'] } },
		description: 'Free text matched semantically against chat titles and summaries. Each hit carries a similarity score.',
	},
	{
		displayName: 'Session ID',
		name: 'relatedSessionId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['history'], operation: ['related'], relatedBy: ['session'] } },
		description: 'Find chats similar to this one. Its title and summary are the source, and it is excluded from the results.',
	},

	// ---- Annotate / rename / pin / archive ----
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['history'], operation: ['rename'] } },
		description: 'New title for the chat. Since Search matches titles only, a meaningful title is what makes a chat findable.',
	},
	{
		displayName: 'Description',
		name: 'chatDescription',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: { show: { resource: ['history'], operation: ['annotate'] } },
		description: 'New description for the chat',
	},
	{
		displayName: 'Tags (Comma-Separated)',
		name: 'tags',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['history'], operation: ['annotate'] } },
		description:
			'New tag set. This REPLACES the existing tags rather than adding to them, so send the full set — leave empty to leave them untouched.',
	},
	{
		displayName: 'Pinned',
		name: 'pinned',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['history'], operation: ['pin'] } },
		description: 'Whether to pin the chat. Pinning also exempts it from retention sweeps (RFC BM).',
	},
	{
		displayName: 'Archived',
		name: 'archived',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['history'], operation: ['archive'] } },
		description: 'Whether to archive the chat. Turn off to unarchive.',
	},

	// ---- Limit: list / search / related ----
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['history'], operation: ['list', 'search', 'related'] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Each chat in a listing carries its rolling SUMMARY, which for a long conversation can be many kilobytes. A large limit therefore returns a lot of data — page with Offset rather than raising the limit (the server caps it at 500 regardless), and prefer Recap when you only need the gist of one chat.',
		name: 'historySummarySizeNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['history'], operation: ['list', 'search', 'related'] } },
	},
];
