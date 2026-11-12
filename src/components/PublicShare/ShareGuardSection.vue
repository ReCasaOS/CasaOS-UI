<template>
	<div v-if="visible" class="settings-card share-guard-section">
		<p class="has-text-weight-medium mb-2">{{ $t('Protection of shared apps') }}</p>
		<p v-if="!view.supported" class="update-sentence">{{ $t('Update ReCasaOS to protect shared apps') }}</p>
		<template v-else>
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
			<b-switch :model-value="view.protection" :disabled="busy" @update:model-value="toggle">{{ $t('Protect shared apps') }}</b-switch>

			<template v-if="view.protection">
				<p class="has-text-weight-medium mt-3 mb-2">{{ $t('Settings for every shared app') }}</p>
				<b-message v-if="boxText" class="mb-3" size="is-small" type="is-danger">{{ boxText }}</b-message>
				<guard-policy-form :policy="view.box" :busy="boxBusy" :error="boxError" @save="saveBox" />
			</template>

			<share-people class="mt-4" />

			<template v-if="view.protection">
				<p class="has-text-weight-medium mt-4 mb-2">{{ $t('Events') }}</p>
				<guard-journal :app="null" :box-policy="view.box" />
			</template>
		</template>
	</div>
</template>

<script>
import GuardJournal from './GuardJournal.vue'
import GuardPolicyForm from './GuardPolicyForm.vue'
import SharePeople from './SharePeople.vue'
import { guardErrorText } from './guardWords'
import { sharedApps } from './shareWords'
import { publicShare } from '@/service/publicShare'
import { applyGuard, refreshGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

const SEEN = 'share-guard-ddos-seen'

export default {
	name: 'ShareGuardSection',
	components: { GuardJournal, GuardPolicyForm, SharePeople },
	data() {
		return { shareGuard, publicShare, busy: false, error: '', boxBusy: false, boxError: '', boxText: '' }
	},
	computed: {
		view() {
			return shareGuard.ok ? shareGuard.view : null
		},
		visible() {
			return !!this.view && publicShare.ok && sharedApps(publicShare.status).length > 0
		},
	},
	mounted() {
		refreshGuard()
	},
	methods: {
		toggle(on) {
			if (!on || this.seen()) {
				return this.setProtection(on)
			}
			this.$buefy.dialog.confirm({
				title: this.$t('Turn protection on?'),
				message: this.$t('A ban on the box comes after the relay and your Internet connection: it does not stop a flood (DDoS).'),
				hasIcon: true,
				confirmText: this.$t('Turn on'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => {
					try {
						localStorage.setItem(SEEN, '1')
					} catch { /* shown again next time */ }
					return this.setProtection(true)
				},
			})
		},
		seen() {
			try {
				return localStorage.getItem(SEEN) === '1'
			} catch {
				return false
			}
		},
		async setProtection(on) {
			this.busy = true
			this.error = ''
			try {
				await applyGuard(shareGuardApi.setProtection(on))
			} catch (e) {
				this.error = guardErrorText(e, this.$t)
			} finally {
				this.busy = false
			}
		},
		async saveBox(policy) {
			this.boxBusy = true
			this.boxError = ''
			this.boxText = ''
			try {
				await applyGuard(shareGuardApi.setBox(policy))
			} catch (e) {
				const message = e?.response?.data?.message
				// the form highlights and says a refusal that has a message; any other failure is said here
				if (typeof message === 'string' && message) {
					this.boxError = message
				} else {
					this.boxText = guardErrorText(e, this.$t)
				}
			} finally {
				this.boxBusy = false
			}
		},
	},
}
</script>
