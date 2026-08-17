import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { ImageMediaType, PromptContent, PromptSegment } from '@loomcycle/client';

/** The four media types loomcycle accepts on an `image` content block (RFC AT). */
const SUPPORTED_IMAGE_TYPES: readonly ImageMediaType[] = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
];

/** An image content block, already base64-encoded and media-type-validated. */
export type ImagePart = { media_type: ImageMediaType; data: string };

/**
 * Wrap an operator-supplied prompt string into the PromptSegment[] shape
 * loomcycle's runStreaming expects.
 *
 * By default the prompt is wrapped as `trusted-text` — appropriate for
 * operator-authored prompts. When the caller knows the prompt contains
 * user-supplied content (e.g. a Slack message body, an HTTP webhook
 * payload), they should set `asUntrusted: true` to use the
 * `untrusted-block` segment kind, which loomcycle treats as data rather
 * than instruction.
 *
 * `images` (RFC AT, loomcycle ≥ v1.7) appends `image` content blocks to the
 * same user segment. They follow the text block because the text is what
 * instructs the model about the images. Build them with
 * {@link readImageParts}.
 */
export function buildSegments(
	prompt: string,
	asUntrusted = false,
	images: ImagePart[] = [],
): PromptSegment[] {
	const text: PromptContent = asUntrusted
		? { type: 'untrusted-block', kind: 'text', text: prompt }
		: { type: 'trusted-text', text: prompt };

	const imageParts: PromptContent[] = images.map((img) => ({
		type: 'image',
		media_type: img.media_type,
		data: img.data,
	}));

	return [{ role: 'user', content: [text, ...imageParts] }];
}

/**
 * Read named binary properties off the current input item and turn them into
 * loomcycle `image` content blocks (RFC AT, loomcycle ≥ v1.7).
 *
 * `csv` is a comma-separated list of n8n binary property names (typically
 * `data` — what most upstream nodes emit). Empty / blank returns `[]`, so the
 * wire payload stays byte-identical for the no-image case.
 *
 * Two deliberate choices:
 *
 *  - We go through `getBinaryDataBuffer` rather than reading `IBinaryData.data`
 *    directly. n8n may keep large binaries on the filesystem rather than inline,
 *    in which case `.data` is a reference, not the bytes.
 *  - The media type is validated here rather than deferred to the substrate.
 *    loomcycle errors the run *before* the provider call for a non-vision model
 *    or an unsupported type, which surfaces to the operator as an opaque run
 *    failure; a NodeOperationError naming the offending property is far more
 *    actionable.
 *
 * There is deliberately no URL form on the wire — accepting one would make
 * loomcycle fetch arbitrary hosts (RFC AT §6, an SSRF refusal), so base64 is
 * the only path and the encoding happens here.
 */
export async function readImageParts(
	ctx: IExecuteFunctions,
	i: number,
	csv: unknown,
): Promise<ImagePart[]> {
	if (typeof csv !== 'string' || csv.trim() === '') return [];

	const names = csv
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s !== '');
	if (names.length === 0) return [];

	const parts: ImagePart[] = [];
	for (const name of names) {
		const meta = ctx.helpers.assertBinaryData(i, name);
		const mimeType = (meta.mimeType ?? '').toLowerCase();
		if (!SUPPORTED_IMAGE_TYPES.includes(mimeType as ImageMediaType)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Binary property "${name}" has media type "${meta.mimeType ?? 'unknown'}", which loomcycle does not accept as image input. Supported: ${SUPPORTED_IMAGE_TYPES.join(', ')}.`,
				{ itemIndex: i },
			);
		}
		const buf = await ctx.helpers.getBinaryDataBuffer(i, name);
		parts.push({ media_type: mimeType as ImageMediaType, data: buf.toString('base64') });
	}
	return parts;
}
