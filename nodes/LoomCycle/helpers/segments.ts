import type { PromptSegment } from '@loomcycle/client';

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
 */
export function buildSegments(prompt: string, asUntrusted = false): PromptSegment[] {
	if (asUntrusted) {
		return [
			{
				role: 'user',
				content: [{ type: 'untrusted-block', kind: 'text', text: prompt }],
			},
		];
	}
	return [
		{
			role: 'user',
			content: [{ type: 'trusted-text', text: prompt }],
		},
	];
}
