<template>
	<div class="modal-card share-app">
		<header class="modal-card-head">
			<span class="_tile" aria-hidden="true"><b-icon icon="web" /></span>
			<div class="_text">
				<h3 class="title is-header">{{ $t('Share on the Internet') }}</h3>
				<p class="is-size-7 _has-text-gray">{{ appTitle }}<template v-if="shared"> · <span class="_mono">{{ host }}</span></template></p>
			</div>
			<span v-if="status && status.name && !status.reason" :class="shared ? 'is-ok' : ''" class="_chip">{{ shared ? $t('Shared') : $t('Not shared') }}</span>
		</header>

		<section class="modal-card-body">
			<p v-if="!status && ready">{{ $t('Could not be read') }}</p>
			<template v-else-if="status">
				<template v-if="status.reason">
					<p class="mb-2">{{ reason }}</p>
					<b-button v-if="status.reason === 'remote-access'" rounded size="is-small" type="is-primary" @click="openRemoteAccess">{{ $t('Open Remote access') }}</b-button>
				</template>
				<template v-else-if="!status.name">
					<p class="mb-1">{{ $t('Choose the name of this box') }}</p>
					<p class="is-size-7 mb-2">{{ $t('Your apps will answer at https://<app>.<name>.{domain}', { domain: status.domain }) }}</p>
					<share-name-form />
				</template>
				<template v-else>
					<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
					<!-- the address: the switch in the head of the card, the address under it, what is known of it in chips -->
					<section class="settings-card p-0 _address">
						<div class="_head">
							<b-switch :disabled="!ready || busy || !entry || (!!entry.error && !shared)" :model-value="on" @update:model-value="toggle">{{ $t('Share on the Internet') }}</b-switch>
							<template v-if="shared">
								<a :href="entry.url" class="share-url _grow" rel="noopener noreferrer" target="_blank">{{ entry.url }}</a>
								<b-button rounded size="is-small" :aria-label="$t('Copy')" @click="copyValue(entry.url)">{{ copied ? $t('Copied') : $t('Copy') }}</b-button>
							</template>
						</div>
						<div class="_body">
							<template v-if="!shared">
								<p>{{ $t('This app will be reachable by anyone who knows the address. Only its own login page protects it.') }}</p>
								<p class="is-size-7 _has-text-gray">{{ $t('Some apps must know their public address (Nextcloud: trusted_domains); see their documentation.') }}</p>
								<p v-if="!sharedApps(status).length" class="is-size-7">
									<a :href="status.tos_url" rel="noopener noreferrer" target="_blank">{{ $t('By turning it on, you accept the terms of service of Let\'s Encrypt.') }}</a>
								</p>
								<p v-if="entry?.error" class="share-error has-text-danger is-size-7">{{ entryError }}</p>
							</template>
							<p v-else class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
								<span v-if="tunnelLine" class="_chip is-ok">{{ tunnelLine }}</span>
								<span class="_chip">{{ certLine }}</span>
								<span class="is-size-7 _has-text-gray">{{ $t('Some apps must know their public address (Nextcloud: trusted_domains); see their documentation.') }}</span>
							</p>
						</div>
					</section>
					<share-app-guard v-if="shared" :app-name="appName" @manage="openRemoteAccess" />
				</template>
			</template>
		</section>

		<footer class="modal-card-foot">
			<b-button rounded size="is-small" @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import ShareAppGuard from './ShareAppGuard.vue'
import ShareNameForm from './ShareNameForm.vue'
import { appEntry, certText, reasonText, shareErrorText, sharedApps, tunnelText } from './shareWords'
import { apply, publicShare, publicShareApi, refresh } from '@/service/publicShare'
import { refreshGuard } from '@/service/shareGuard'

export default {
	name: 'ShareAppModal',
	components: { ShareAppGuard, ShareNameForm },
	props: {
		appName: { type: String, required: true },
		appTitle: { type: String, default: '' },
	},
	emits: ['close'],
	data() {
		// `ready`: the forced read of the mount has settled, so none can land after a write and bring an older status back
		return { publicShare, ready: false, busy: false, error: '', copied: false, on: false }
	},
	computed: {
		status() {
			return publicShare.ok ? publicShare.status : null
		},
		entry() {
			return appEntry(this.status, this.appName)
		},
		shared() {
			return this.entry?.shared === true
		},
		reason() {
			return reasonText(this.status.reason, this.$t)
		},
		entryError() {
			return shareErrorText({ response: { data: { message: this.entry.error } } }, this.$t)
		},
		certLine() {
			return certText(this.status.cert, this.$i18n.locale.replace('_', '-'), this.$t)
		},
		tunnelLine() {
			return tunnelText(this.status, this.$t)
		},
		// the public host, for the head: the address without its scheme
		host() {
			return String(this.entry?.url || '').replace(/^https?:\/\//, '')
		},
	},
	watch: {
		shared: {
			immediate: true,
			handler(v) {
				this.on = v
			},
		},
	},
	async mounted() {
		refreshGuard()
		try {
			await refresh({ force: true })
		} finally {
			this.ready = true
		}
	},
	beforeUnmount() {
		clearTimeout(this.copyTimer)
	},
	methods: {
		sharedApps,
		async toggle(value) {
			this.on = value
			this.busy = true
			this.error = ''
			try {
				await apply(value ? publicShareApi.share(this.appName) : publicShareApi.unshare(this.appName))
				// the app joins or leaves the protection view at once, not at the next read
				refreshGuard({ force: true })
			} catch (e) {
				this.error = shareErrorText(e, this.$t)
			} finally {
				this.busy = false
				this.on = this.shared
			}
		},
		openRemoteAccess() {
			this.$emit('close')
			return import('../settings/RemoteAccessModal.vue').then(({ default: RemoteAccessModal }) => {
				this.$buefy.modal.open({
					component: RemoteAccessModal,
					hasModalCard: true,
					trapFocus: true,
					canCancel: ['escape'],
					scroll: 'keep',
					animation: 'zoom-in',
				})
			})
		},
		async copyValue(text) {
			try {
				await copy(text)
				this.error = ''
				this.copied = true
				clearTimeout(this.copyTimer)
				this.copyTimer = setTimeout(() => (this.copied = false), 2000)
			} catch {
				this.error = this.$t('This could not be copied')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.share-app {
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

		&.is-warn {
			background: rgba($warning, 0.18);
			color: $warning;
		}
	}

	.modal-card-head {
		gap: 0.75rem;
		align-items: center;
	}

	._mono {
		font-family: ui-monospace, sfmono-regular, menlo, consolas, monospace;
	}

	._grow {
		flex: 1 1 16rem;
		min-width: 0;
	}

	.share-url,
	.share-error {
		overflow-wrap: anywhere;
	}

	// the cards of the guard section are the same anatomy, one under the other
	:deep(.share-app-guard) {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
}
</style>
