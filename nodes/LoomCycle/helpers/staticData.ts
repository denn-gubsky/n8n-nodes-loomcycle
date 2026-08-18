import type { IDataObject, IPollFunctions, ITriggerFunctions, IWebhookFunctions } from 'n8n-workflow';

/**
 * Typed wrappers around n8n's per-node `getWorkflowStaticData('node')`.
 *
 * Trigger nodes use this to persist dedup state across invocations.
 * Polling triggers especially need it — without dedup the same row
 * would emit on every poll tick. The webhook-based Change Event trigger
 * needs it for the opposite reason: loomcycle's push delivery is
 * at-least-once and resumes from its own persisted cursor after a
 * restart, so a batch can legitimately arrive twice.
 *
 * n8n persists this object to the workflow row; values must be JSON-
 * serialisable. We use string sets (stored as arrays + Set on access)
 * with an explicit cap to avoid unbounded growth on long-running
 * workflows.
 */

interface DedupShape {
	seen?: string[];
	cursor?: string;
}

/** Any context that exposes per-node static data. */
type StaticDataCtx = IPollFunctions | ITriggerFunctions | IWebhookFunctions;

const DEFAULT_CAP = 1000;

export function readSeenSet(
	ctx: StaticDataCtx,
	key: string,
): Set<string> {
	const data = ctx.getWorkflowStaticData('node') as IDataObject;
	const slot = (data[key] ?? {}) as DedupShape;
	return new Set(slot.seen ?? []);
}

export function writeSeenSet(
	ctx: StaticDataCtx,
	key: string,
	seen: Set<string>,
	cap = DEFAULT_CAP,
): void {
	const trimmed = seen.size > cap ? new Set(Array.from(seen).slice(-cap)) : seen;
	const data = ctx.getWorkflowStaticData('node') as IDataObject;
	const slot = (data[key] ?? {}) as DedupShape;
	slot.seen = Array.from(trimmed);
	data[key] = slot;
}

export function readCursor(
	ctx: StaticDataCtx,
	key: string,
): string {
	const data = ctx.getWorkflowStaticData('node') as IDataObject;
	const slot = (data[key] ?? {}) as DedupShape;
	return slot.cursor ?? '';
}

export function writeCursor(
	ctx: StaticDataCtx,
	key: string,
	cursor: string,
): void {
	const data = ctx.getWorkflowStaticData('node') as IDataObject;
	const slot = (data[key] ?? {}) as DedupShape;
	slot.cursor = cursor;
	data[key] = slot;
}
