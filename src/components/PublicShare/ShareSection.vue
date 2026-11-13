<template>
	<section v-if="status && !hidden" class="settings-card p-0 share-section">
		<div class="_head">
			<span class="_tile" aria-hidden="true"><b-icon icon="web" /></span>
			<div class="_text">
				<p class="_name">{{ $t('Public sharing') }}</p>
				<p v-if="status.name" class="is-size-7 _has-text-gray">{{ $t('Public name: {name}', { name: status.name }) }}</p>
			</div>
			<template v-if="status.name">
				<span v-if="tunnelLine" class="_chip is-ok">{{ tunnelLine }}</span>
				<span class="_chip">{{ certLine }}</span>
			</template>
		</div>
		<div class="_body">
			<b-message v-if="error" class="mb-0" size="is-small" type="is-danger">{{ error }}</b-message>
			<p v-if="!status.supported">{{ reason }}</p>
			<template v-if="!status.name && status.supported">
				<p>{{ $t('Choose the name of this box') }}</p>
				<p class="is-size-7 _has-text-gray">{{ $t('Your apps will answer at https://<app>.<name>.{domain}', { domain: status.domain }) }}</p>
				<share-name-form />
			</template>
			<template v-else-if="status.name">
				<!-- one row per shared app: its name, its address, Copy and Stop sharing at the right -->
				<ul v-if="shared.length" class="_apps">
					<li v-for="a in shared" :key="a.name" class="share-item">
						<span class="_app-name">{{ a.label || a.name }}</span>
						<a v-if="a.url" class="_url" :href="a.url" target="_blank" rel="noopener noreferrer">{{ a.url }}</a>
						<span class="_actions">
							<b-button v-if="a.url" rounded size="is-small" :aria-label="$t('Copy')" @click="copyValue(a.url)">{{ copied === a.url ? $t('Copied') : $t('Copy') }}</b-button>
							<b-button :disabled="busy" rounded size="is-small" @click="stop(a.name)">{{ $t('Stop sharing') }}</b-button>
						</span>
						<p v-if="a.error" class="is-size-7 share-error has-text-danger">{{ errorText(a.error) }}</p>
					</li>
				</ul>
				<p v-else class="is-size-7 _has-text-gray">{{ $t('No app is shared. Share one from its card on the home page.') }}</p>
			</template>
		</div>
		<div v-if="status.name && shared.length" class="_foot">
			<span class="is-size-7 _has-text-gray is-flex-grow-1">{{ $t('The name stays this box\'s when nothing is shared.') }}</span>
			<b-button :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmStopAll">{{ $t('Stop all sharing') }}</b-button>
		</div>
	</section>
</template>

<script>
import copy from 'clipboard-copy'
import escape from 'lodash/escape'
import ShareNameForm from './ShareNameForm.vue'
import { certText, reasonText, shareErrorText, sharedApps, tunnelText } from './shareWords'
import { apply, publicShare, publicShareApi, refresh } from '@/service/publicShare'
import { refreshGuard } from '@/service/shareGuard'

export default {
	name: 'ShareSection',
	components: { ShareNameForm },
	data() {
		return { publicShare, busy: false, error: '', copied: '' }
	},
	computed: {
		status() {
			return publicShare.ok ? publicShare.status : null
		},
		// remote access is off: the window above already offers it
		hidden() {
			return this.status?.reason === 'remote-access'
		},
		reason() {
			return reasonText(this.status.reason, this.$t)
		},
		shared() {
			return sharedApps(this.status)
		},
		certLine() {
			return certText(this.status.cert, this.$i18n.locale.replace('_', '-'), this.$t)
		},
		tunnelLine() {
			return tunnelText(this.status, this.$t)
		},
	},
	mounted() {
		refresh({ force: true })
	},
	beforeUnmount() {
		clearTimeout(this.copyTimer)
	},
	methods: {
		// the core's error of an app, in the owner's language
		errorText(message) {
			return shareErrorText({ response: { data: { message } } }, this.$t)
		},
		async run(call) {
			this.busy = true
			this.error = ''
			try {
				await apply(call())
				// an unshared app leaves the people form and the journal filter at once
				refreshGuard({ force: true })
			} catch (e) {
				this.error = shareErrorText(e, this.$t)
			} finally {
				this.busy = false
			}
		},
		stop(name) {
			return this.run(() => publicShareApi.unshare(name))
		},
		confirmStopAll() {
			this.$buefy.dialog.confirm({
				title: this.$t('Stop sharing every app?'),
				message: this.$t('Their public addresses stop answering. The name {name} stays this box\'s.', { name: escape(this.status.name) }),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Stop all sharing'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => publicShareApi.stopAll()),
			})
		},
		async copyValue(text) {
			try {
				await copy(text)
				this.copied = text
				clearTimeout(this.copyTimer)
				this.copyTimer = setTimeout(() => (this.copied = ''), 2000)
			} catch {
				this.error = this.$t('This could not be copied')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.share-section {
	._head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
	}

	._tile {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: rgba($primary, 0.12);
		color: $primary;
	}

	._text {
		flex: 1 1 14rem;
		min-width: 0;
	}

	._name {
		font-weight: 600;
		color: var(--casa-text-strong);
	}

	._body {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0 1rem 0.875rem;
	}

	._foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		border-top: 1px solid var(--casa-divider-soft);
	}

	._chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		height: 1.375rem;
		padding: 0 0.5625rem;
		border-radius: 0.6875rem;
		background: var(--casa-hover-tint);
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;

		&.is-ok {
			background: rgba($success, 0.16);
			color: $success;
		}
	}

	._apps {
		margin: 0;
		border: 1px solid var(--casa-divider-soft);
		border-radius: 0.625rem;
	}

	.share-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.75rem;
		min-height: 2.75rem;
		padding: 0.375rem 0.75rem;

		& + .share-item {
			border-top: 1px solid var(--casa-divider-soft);
		}
	}

	._app-name {
		flex: 0 0 9rem;
		font-weight: 500;
	}

	._url {
		flex: 1 1 14rem;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: ui-monospace, sfmono-regular, menlo, consolas, monospace;
		font-size: 0.8125rem;
	}

	._actions {
		display: flex;
		gap: 0.375rem;
		margin-left: auto;
	}

	.share-error {
		flex-basis: 100%;
		overflow-wrap: anywhere;
	}
}
</style>
