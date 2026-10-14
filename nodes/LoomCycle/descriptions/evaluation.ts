import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `evaluation` resource (loomcycle ≥ v1.113,
 * `POST /v1/_evaluation`). Scores recorded against runs, rolled up per
 * definition version — the substrate side of an eval loop that n8n schedules.
 *
 *   - Submit                 → submitEvaluation(runId, score, {dimensions, judgement, rationale})
 *   - Get                    → getEvaluation(evalId)
 *   - List for Run           → listEvaluationsForRun(runId, {limit})
 *   - List for Definition    → listEvaluationsForDef(defId, {limit})
 *   - Aggregate              → aggregateEvaluations(defId, {includeLineage})
 *
 * Scope rule (one rule on HTTP, gRPC and MCP): a `substrate:tenant` token may
 * use every op in its own tenant; an isolated user or tenant member may only
 * submit its OWN run's score from inside that run, which a workflow is not —
 * so this node needs a tenant-level token.
 *
 * Op options array is alphabetised by name.
 */
export const evaluationOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['evaluation'] } },
		options: [
			{
				name: 'Aggregate',
				value: 'aggregate',
				description: 'Roll up the scores of one definition version: mean, median, min, max, latest, per dimension',
				action: 'Aggregate evaluations',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Read one evaluation by its ID',
				action: 'Get an evaluation',
			},
			{
				name: 'List for Definition',
				value: 'listForDef',
				description: 'List the evaluations of runs of one definition version',
				action: 'List evaluations for a definition',
			},
			{
				name: 'List for Run',
				value: 'listForRun',
				description: 'List every evaluation of one run',
				action: 'List evaluations for a run',
			},
			{
				name: 'Submit',
				value: 'submit',
				description: 'Record a score against a run. Each submit adds another evaluation.',
				action: 'Submit an evaluation',
			},
		],
		default: 'submit',
	},
	{
		displayName: 'Needs a tenant-level token (substrate:tenant). A user or member token may only score its own run from inside that run.',
		name: 'evaluationScopeNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['evaluation'] } },
	},
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['evaluation'], operation: ['submit', 'listForRun'] } },
		description: 'The run_id to score or list',
	},
	{
		displayName: 'Score',
		name: 'score',
		type: 'number',
		default: 0,
		required: true,
		typeOptions: { numberPrecision: 3 },
		displayOptions: { show: { resource: ['evaluation'], operation: ['submit'] } },
		description: 'The overall score. Pick one convention and keep to it, for example 0 to 1 or -1 to 1. 0 is a real score.',
	},
	{
		displayName: 'Additional Fields',
		name: 'evaluationFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['evaluation'], operation: ['submit'] } },
		options: [
			{
				displayName: 'Dimensions',
				name: 'dimensions',
				type: 'fixedCollection',
				placeholder: 'Add Dimension',
				default: {},
				typeOptions: { multipleValues: true },
				options: [
					{
						name: 'dimension',
						displayName: 'Dimension',
						values: [
							{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true, placeholder: 'correctness' },
							{ displayName: 'Value', name: 'value', type: 'number', default: 0, typeOptions: { numberPrecision: 3 } },
						],
					},
				],
				description: 'Named axes, each with its own score',
			},
			{
				displayName: 'Judgement (JSON)',
				name: 'judgement',
				type: 'json',
				default: '{}',
				description: 'Any structured detail to keep with the score, e.g. which checks failed',
			},
			{
				displayName: 'Rationale',
				name: 'rationale',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Why this score, in plain words',
			},
		],
	},
	{
		displayName: 'Evaluation ID',
		name: 'evalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'eval_…',
		displayOptions: { show: { resource: ['evaluation'], operation: ['get'] } },
	},
	{
		displayName: 'Definition ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'def_…',
		displayOptions: { show: { resource: ['evaluation'], operation: ['listForDef', 'aggregate'] } },
		description: 'The agent definition version, as an Agent Definition node or a run\'s spec.agent_version returns it',
	},
	{
		displayName: 'Max Rows',
		name: 'maxRows',
		type: 'number',
		default: 100,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['evaluation'], operation: ['listForRun', 'listForDef'] } },
		description: 'How many evaluations to return',
	},
	{
		displayName: 'Include Lineage',
		name: 'includeLineage',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['evaluation'], operation: ['aggregate'] } },
		description: 'Whether to add the evaluations of the versions this one was forked from',
	},
];
