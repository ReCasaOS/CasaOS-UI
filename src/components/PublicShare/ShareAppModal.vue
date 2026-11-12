<template>
	<div class="modal-card share-app">
		<header class="modal-card-head">
			<div>
				<h3 class="title is-header">{{ $t('Share on the Internet') }}</h3>
				<p class="is-size-7">{{ appTitle }}</p>
			</div>
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
					<template v-if="!shared">
						<p class="mb-2">{{ $t('This app will be reachable by anyone who knows the address. Only its own login page protects it.') }}</p>
						<p class="mb-2 is-size-7">{{ $t('Some apps must know their public address (Nextcloud: trusted_domains); see their documentation.') }}</p>
						<p v-if="!sharedApps(status).length" class="mb-2 is-size-7">
							<a :href="status.tos_url" rel="noopener noreferrer" target="_blank">{{ $t('By turning it on, you accept the terms of service of Let\'s Encrypt.') }}</a>
						</p>
					</template>
					<p v-if="entry?.error && !shared" class="mb-2 share-error">{{ entryError }}</p>
					<b-switch :disabled="!ready || busy || !entry || (!!entry.error && !shared)" :model-value="on" @update:model-value="toggle">{{ $t('Share on the Internet') }}</b-switch>
					<template v-if="shared">
						<p class="mt-3 share-url">
							<a :href="entry.url" rel="noopener noreferrer" target="_blank">{{ entry.url }}</a>
							<b-button class="ml-1" size="is-small" type="is-text" :aria-label="$t('Copy')" @click="copyValue(entry.url)">{{ copied ? $t('Copied') : $t('Copy') }}</b-button>
						</p>
						<p class="is-size-7">{{ certLine }}</p>
						<p v-if="tunnelLine" class="is-size-7">{{ tunnelLine }}</p>
						<share-app-guard :app-name="appName" @manage="openRemoteAccess" />
					</template>
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
.share-url,
.share-error {
	overflow-wrap: anywhere;
}
</style>
