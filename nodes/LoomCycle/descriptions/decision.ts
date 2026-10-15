import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `decision` resource — decision models (RFC EB,
 * loomcycle ≥ v1.107). A decision model answers typed questions about a piece
 * of state — pick one option, yes / no, or a position on a scale — with a
 * probability for each answer and no prose. In n8n it is the cheap classifier
 * in front of an IF or Switch node: route a ticket, gate a step, score a draft.
 *
 *   - Decide       → client.decide({model, state, questions})
 *   - List Models  → client.listDecisionModels()
 *
 * A deployment with no `decision:` block answers 503 decision_not_configured.
 * The probabilities are a judgement, not a calibrated measurement.
 *
 * Op options array is alphabetised by name.
 */
export const decisionOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['decision'] } },
		options: [
			{
				name: 'Decide',
				value: 'decide',
				description: 'Ask a decision model one or more typed questions about some state',
				action: 'Ask a decision model',
			},
			{
				name: 'List Models',
				value: 'listModels',
				description: 'List the decision models this deployment declares, with their limits',
				action: 'List decision models',
			},
		],
		default: 'decide',
	},
	{
		displayName: 'Model Name or ID',
		name: 'decisionModel',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadDecisionModels' },
		default: '',
		displayOptions: { show: { resource: ['decision'], operation: ['decide'] } },
		description:
			'Which decision model answers. Empty = the deployment\'s default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'State (JSON)',
		name: 'state',
		type: 'json',
		default: '{\n  "text": "{{ $json.text }}"\n}',
		required: true,
		displayOptions: { show: { resource: ['decision'], operation: ['decide'] } },
		description:
			'What the questions are about: any JSON object. The model reads only this. It is never shortened to fit; an over-long request is refused.',
	},
	{
		displayName: 'Define Questions',
		name: 'questionsMode',
		type: 'options',
		default: 'fields',
		displayOptions: { show: { resource: ['decision'], operation: ['decide'] } },
		options: [
			{ name: 'Using Fields', value: 'fields' },
			{ name: 'Using JSON', value: 'json', description: 'The raw questions object, for generated or many questions' },
		],
	},
	{
		displayName: 'Questions',
		name: 'questions',
		type: 'fixedCollection',
		placeholder: 'Add Question',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['decision'], operation: ['decide'], questionsMode: ['fields'] } },
		options: [
			{
				name: 'question',
				displayName: 'Question',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'intent',
						description: 'The answer comes back under this name, e.g. `answers.intent`',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 'choice',
						options: [
							{ name: 'Choice (Pick One Option)', value: 'choice' },
							{ name: 'Score (A Position on a Scale)', value: 'score' },
							{ name: 'Yes / No', value: 'noul' },
						],
					},
					{
						displayName: 'Question',
						name: 'instructions',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'What does the customer want?',
						description: 'The question itself, in plain words',
					},
					{
						displayName: 'Options / Levels',
						name: 'criteria',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						placeholder: 'refund: asks for money back\nbug: reports something broken\nother',
						description:
							'Choice: one option per line, optionally `name: what it means` (2–26). Score: one level per line, LOWEST first (2–26). Yes / No: optional `yes: …` and `no: …` lines when the plain question is not enough.',
					},
				],
			},
		],
		description: '1–64 questions, all answered about the same state',
	},
	{
		displayName: 'Questions (JSON)',
		name: 'questionsJson',
		type: 'json',
		default:
			'{\n  "intent": {\n    "type": "choice",\n    "instructions": "What does the customer want?",\n    "criteria": { "refund": "asks for money back", "other": null }\n  }\n}',
		required: true,
		displayOptions: { show: { resource: ['decision'], operation: ['decide'], questionsMode: ['json'] } },
		description:
			'Questions keyed by name. Each is `{type: "choice", instructions, criteria: {option: description|null}}`, `{type: "noul", instructions, criteria?: {true?, false?}}` or `{type: "score", instructions, criteria: [lowest, …, highest]}`.',
	},
	{
		displayName: 'The output keeps the full answers (with probabilities) and adds `values` — one plain value per question (the chosen option, the yes probability, or the score) for an IF or Switch node. Probabilities are a judgement, not a calibrated measurement.',
		name: 'decideNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['decision'], operation: ['decide'] } },
	},
];
