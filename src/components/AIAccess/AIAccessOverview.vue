<template>
	<div class="modal-card ai-access-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('AI access') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" data-error size="is-small" type="is-danger">
				{{ $t('The tokens cannot be read for now.') }}
			</b-message>

			<p v-else-if="!status">
				{{ $t('Loading…') }}
			</p>

			<template v-else>
				<div class="settings-card">
					<p class="is-size-7 has-text-full-03">
						{{ $t('An assistant you choose can read and manage this box, with a token you create here.') }}
						{{ $t('It works for an assistant running on a computer of the same network as this box.') }}
					</p>
					<p class="is-size-7 mt-2" data-status>
						{{ actionsLine }}
					</p>
				</div>

				<div class="settings-card">
					<b-message v-if="revokeError" class="mb-3" data-revoke-error size="is-small" type="is-danger">
						{{ $t(revokeError) }}
					</b-message>
					<p v-if="tokensError" class="is-size-7 has-text-danger" data-tokens-error>
						{{ $t('The tokens cannot be read for now.') }}
						<b-button data-action="retry" rounded size="is-small" @click="loadTokens">
							{{ $t('Retry') }}
						</b-button>
					</p>
					<p v-else-if="!tokens.length" class="is-size-7 has-text-full-03" data-empty>
						{{ $t('No token yet: no assistant can connect.') }}
					</p>
					<table v-else class="table is-fullwidth is-size-7 ai-access-modal__table">
						<thead>
							<tr>
								<th>{{ $t('Name') }}</th>
								<th>{{ $t('Level') }}</th>
								<th>{{ $t('Created') }}</th>
								<th>{{ $t('Last used') }}</th>
								<th><span class="is-sr-only">{{ $t('Actions') }}</span></th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="token in tokens" :key="token.id" data-token-row>
								<td class="ai-access-modal__name">
									{{ token.name }}
								</td>
								<td>{{ token.level === 'full' ? $t('Everything') : $t('Read only') }}</td>
								<td>{{ when(token.created) }}</td>
								<td>{{ when(token.last_used) || $t('Never') }}</td>
								<td class="has-text-right">
									<b-button :aria-label="$t('Revoke {name}', { name: token.name })" data-action="revoke" rounded size="is-small" type="is-danger is-light" @click="askRevoke(token)">
										{{ $t('Revoke') }}
									</b-button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div v-if="created" class="settings-card" data-created>
					<p class="has-text-weight-bold mb-2">
						{{ $t('Copy it now: it will not be shown again.') }}
					</p>
					<label class="label is-size-7" for="ai-access-token">{{ $t('Token') }}</label>
					<div class="ai-access-modal__copy mb-3">
						<input id="ai-access-token" :value="created.token" autocomplete="off" class="input is-small ai-access-modal__mono" data-token readonly type="text" @focus="$event.target.select()">
						<b-button data-copy="token" rounded size="is-small" @click="copyValue('token', created.token)">
							{{ copied === 'token' ? $t('Copied (token)') : $t('Copy') }}
						</b-button>
					</div>
					<label class="label is-size-7" for="ai-access-command">{{ $t('Command') }}</label>
					<div class="ai-access-modal__copy mb-3">
						<input id="ai-access-command" :value="command" class="input is-small ai-access-modal__mono" data-command readonly type="text" @focus="$event.target.select()">
						<b-button data-copy="command" rounded size="is-small" @click="copyValue('command', command)">
							{{ copied === 'command' ? $t('Copied (token)') : $t('Copy') }}
						</b-button>
					</div>
					<label class="label is-size-7" for="ai-access-url">{{ $t('URL') }}</label>
					<div class="ai-access-modal__copy mb-3">
						<input id="ai-access-url" :value="url" class="input is-small ai-access-modal__mono" data-url readonly type="text" @focus="$event.target.select()">
						<b-button data-copy="url" rounded size="is-small" @click="copyValue('url', url)">
							{{ copied === 'url' ? $t('Copied (token)') : $t('Copy') }}
						</b-button>
					</div>
					<label class="label is-size-7" for="ai-access-header">{{ $t('Header') }}</label>
					<div class="ai-access-modal__copy mb-3">
						<input id="ai-access-header" :value="header" class="input is-small ai-access-modal__mono" data-header readonly type="text" @focus="$event.target.select()">
						<b-button data-copy="header" rounded size="is-small" @click="copyValue('header', header)">
							{{ copied === 'header' ? $t('Copied (token)') : $t('Copy') }}
						</b-button>
					</div>
					<p v-if="!lanUrl && !localPage" class="is-size-7 has-text-danger mb-3" data-address-note>
						{{ $t('This address may not work for an assistant: it must reach this box on your local network.') }}
					</p>
					<p v-if="plainHttp" class="is-size-7 has-text-danger mb-3" data-http>
						{{ $t('On this address the token travels unencrypted on your network.') }}
					</p>
					<p v-if="copyError" class="is-size-7 has-text-danger mb-3" data-copy-error>
						{{ $t('This could not be copied') }}
					</p>
					<b-button data-action="done" rounded type="is-primary" @click="done">
						{{ $t('Done (token)') }}
					</b-button>
				</div>

				<form v-else class="settings-card" data-form @submit.prevent="create">
					<h4 class="has-text-weight-semibold mb-2">
						{{ $t('New token') }}
					</h4>
					<p v-if="full" class="is-size-7 has-text-full-03" data-limit>
						{{ $t('No more tokens can be created until one is revoked.') }}
					</p>
					<template v-else>
						<div class="field">
							<label class="label is-size-7" for="ai-access-name">{{ $t('Name') }}</label>
							<input id="ai-access-name" v-model="name" autocomplete="off" class="input" data-field="name" maxlength="60" required type="text">
						</div>
						<fieldset aria-describedby="ai-access-warning" class="field ai-access-modal__level">
							<legend class="label is-size-7">
								{{ $t('Level') }}
							</legend>
							<label class="radio">
								<input v-model="level" data-level="read" name="ai-access-level" type="radio" value="read">
								{{ $t('Read only') }}
							</label>
							<label class="radio">
								<input v-model="level" data-level="full" name="ai-access-level" type="radio" value="full">
								{{ $t('Everything') }}
							</label>
						</fieldset>
						<p v-if="level === 'full'" id="ai-access-warning" class="is-size-7 has-text-danger mb-3" data-warning role="note">
							{{ $t('A token with this level can change and delete things on this box. A stolen token, or an assistant misled by a booby-trapped text, can erase data. Whether the assistant asks before acting depends on the assistant.') }}
						</p>
						<p v-if="createError" class="is-size-7 has-text-danger mb-3" data-create-error>
							{{ $t(createError) }}
						</p>
						<b-button :disabled="!name.trim() || creating" :loading="creating" data-action="create" native-type="submit" rounded type="is-primary">
							{{ $t('Create') }}
						</b-button>
					</template>
				</form>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import escape from 'lodash/escape'
import { endpointUrl, isLocalHost, lanEndpoint } from './address'
import { mcpApi } from '@/service/mcp'

// the module refuses a twenty-first token
const MAX_TOKENS = 20

export default {
	name: 'AIAccessOverview',

	emits: ['close'],

	data() {
		return {
			status: null,
			tokens: [],
			error: false,
			// the list alone could not be read: shown in its card, never in place of the rest of the window
			tokensError: false,
			name: '',
			level: 'read',
			creating: false,
			createError: '',
			revokeError: '',
			// The token just created, as the module answered. Component state only: never the store,
			// the storage of the browser, an address or a log. Gone on Done, on closing, on unmount.
			created: null,
			copied: '',
			copyError: false,
			copyTimer: null,
		}
	},

	computed: {
		full() {
			return this.tokens.length >= MAX_TOKENS
		},
		actionsLine() {
			const actions = this.status.actions || {}
			const all = (actions.read || 0) + (actions.secret || 0) + (actions.change || 0) + (actions.danger || 0)
			if (all === 0) {
				return this.$t('The list of actions loads the first time an assistant connects.')
			}
			return this.$t('{read} read-only actions, {all} in all.', { read: actions.read || 0, all })
		},
		// the box's own answer when it is valid, else the address the page is open at
		// the box's own answer when it passes the allowlist, else null
		lanUrl() {
			return lanEndpoint(this.status?.lan_url)
		},
		url() {
			return this.lanUrl ?? endpointUrl(undefined, window.location.origin)
		},
		localPage() {
			return isLocalHost(window.location.hostname)
		},
		header() {
			return `Authorization: Bearer ${this.created?.token}`
		},
		// no escaping: the token is rcm_ + base64url, and the URL is the box's own answer, matched against a strict allowlist, or the browser's origin
		command() {
			return `claude mcp add --transport http recasaos ${this.url} --header "${this.header}"`
		},
		plainHttp() {
			return this.url.toLowerCase().startsWith('http:')
		},
	},

	created() {
		this.load()
	},

	beforeUnmount() {
		this.created = null
		clearTimeout(this.copyTimer)
	},

	methods: {
		async load() {
			try {
				const [status, tokens] = await Promise.all([mcpApi.status(), mcpApi.tokens()])
				this.status = status.data
				this.tokens = Array.isArray(tokens.data) ? tokens.data : []
				this.error = false
			} catch {
				this.error = true
			}
		},

		async loadTokens() {
			try {
				const tokens = await mcpApi.tokens()
				this.tokens = Array.isArray(tokens.data) ? tokens.data : []
				this.tokensError = false
			} catch {
				this.tokensError = true
			}
		},

		// the zero time of a token never used, and a date that cannot be read, show nothing
		when(value) {
			const date = new Date(value)
			return date.getFullYear() >= 2000 ? date.toLocaleString() : ''
		},

		async create() {
			if (this.creating || this.full || !this.name.trim()) {
				return
			}
			this.creating = true
			this.createError = ''
			try {
				this.created = (await mcpApi.create(this.name.trim(), this.level)).data
				this.name = ''
				this.level = 'read'
				this.copied = ''
				this.copyError = false
			} catch {
				this.createError = 'The token could not be created.'
			}
			this.creating = false
			// a refusal for the limit shows as the limit once the list is read again
			this.loadTokens()
		},

		done() {
			this.created = null
			this.copied = ''
			this.copyError = false
		},

		async copyValue(key, text) {
			try {
				await copy(text)
				this.copyError = false
				this.copied = key
				clearTimeout(this.copyTimer)
				this.copyTimer = setTimeout(() => (this.copied = ''), 2000)
			} catch {
				this.copyError = true
			}
		},

		askRevoke(token) {
			this.revokeError = ''
			this.$buefy.dialog.confirm({
				title: this.$t('Revoke'),
				// the dialog renders its message as HTML
				message: this.$t('Revoke the token "{name}"? The assistant that uses it can no longer connect.', { name: escape(token.name) }),
				type: 'is-danger',
				confirmText: this.$t('Revoke'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.revoke(token),
			})
		},

		async revoke(token) {
			try {
				await mcpApi.revoke(token.id)
			} catch (e) {
				const status = e?.response?.status
				if (status === 500) {
					this.revokeError = 'The revocation could not be saved: the token still works.'
					return
				}
				// 404: it is gone already, the list is read again below
				if (status !== 404) {
					this.revokeError = 'The token could not be revoked.'
					return
				}
			}
			this.revokeError = ''
			this.loadTokens()
		},
	},
}
</script>

<style lang="scss">
.ai-access-modal {
  &__mono {
    font-family: monospace;
  }

  &__table td {
    vertical-align: middle;
  }

  &__name {
    overflow-wrap: anywhere;
  }

  &__copy {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .input {
      flex: 1;
      min-width: 0;
    }
  }

  &__level .radio {
    margin-inline-end: 1rem;
  }
}
</style>
