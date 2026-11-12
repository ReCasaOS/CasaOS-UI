<template>
	<div v-if="status && !hidden" class="settings-card share-section">
		<p class="has-text-weight-medium mb-2">{{ $t('Public sharing') }}</p>
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
		<p v-if="!status.supported" class="mb-2">{{ reason }}</p>
		<template v-if="!status.name && status.supported">
			<p class="mb-1">{{ $t('Choose the name of this box') }}</p>
			<p class="is-size-7 mb-2">{{ $t('Your apps will answer at https://<app>.<name>.{domain}', { domain: status.domain }) }}</p>
			<share-name-form />
		</template>
		<template v-else-if="status.name">
			<p class="mb-1">{{ $t('Public name: {name}', { name: status.name }) }}</p>
			<p class="mb-1">{{ certLine }}</p>
			<p v-if="tunnelLine" class="mb-2">{{ tunnelLine }}</p>
			<ul v-if="shared.length">
				<li v-for="a in shared" :key="a.name" class="mb-2 share-item">
					<span class="has-text-weight-medium">{{ a.label || a.name }}</span>
					<a v-if="a.url" class="ml-1" :href="a.url" target="_blank" rel="noopener noreferrer">{{ a.url }}</a>
					<b-button v-if="a.url" class="ml-1" size="is-small" type="is-text" :aria-label="$t('Copy')" @click="copyValue(a.url)">{{ copied === a.url ? $t('Copied') : $t('Copy') }}</b-button>
					<b-button class="ml-1" :disabled="busy" size="is-small" type="is-text" @click="stop(a.name)">{{ $t('Stop sharing') }}</b-button>
					<p v-if="a.error" class="is-size-7 share-error">{{ errorText(a.error) }}</p>
				</li>
			</ul>
			<p v-else class="is-size-7">{{ $t('No app is shared. Share one from its card on the home page.') }}</p>
			<b-button v-if="shared.length" class="mt-2" :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmStopAll">{{ $t('Stop all sharing') }}</b-button>
		</template>
	</div>
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
.share-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0 0.25rem;
	overflow-wrap: anywhere;
}
.share-error {
	flex-basis: 100%;
}
</style>
