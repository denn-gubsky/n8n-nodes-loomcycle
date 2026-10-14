import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * LoomCycle Secret — one secret value held in n8n's credential store.
 *
 * It exists so a secret never has to be typed into a node parameter, which
 * n8n saves in the workflow JSON and the execution data. Two nodes read it:
 *
 *   - LoomCycle Credential → Create copies the value into loomcycle's own
 *     encrypted credential store, where agents, MCP headers and hooks reach it
 *     as `$cred:<name>`.
 *   - LoomCycle: Hook Call verifies loomcycle's signed hook deliveries with it,
 *     when it is the value a HookDef's signing credential names.
 *
 * It authenticates nothing by itself, so it has no `authenticate` block and no
 * credential test.
 */
export class LoomCycleSecretApi implements ICredentialType {
	name = 'loomCycleSecretApi';

	displayName = 'LoomCycle Secret API';

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://github.com/denn-gubsky/n8n-nodes-loomcycle#credentials-in-loomcycle';

	properties: INodeProperties[] = [
		{
			displayName: 'Secret Value',
			name: 'value',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The secret itself: an API token, a webhook signing key. Stored only in n8n\'s credential store; the LoomCycle Credential node sends it to loomcycle once, encrypted at rest there.',
		},
	];
}
