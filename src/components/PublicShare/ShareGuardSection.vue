<template>
	<div>
		<div v-if="visible" class="settings-card share-guard-section">
			<p class="has-text-weight-medium mb-2">{{ $t('Protection of shared apps') }}</p>
			<p v-if="!view.supported" class="update-sentence">{{ $t('Update ReCasaOS to protect shared apps') }}</p>
			<template v-else>
				<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
				<b-switch ref="protect" :key="switchKey" :model-value="view.protection" :disabled="busy" @update:model-value="toggle">{{ $t('Protect shared apps') }}</b-switch>

				<template v-if="view.protection">
					<p class="has-text-weight-medium mt-3 mb-2">{{ $t('Settings for every shared app') }}</p>
					<b-message v-if="boxText" class="mb-3" size="is-small" type="is-danger">{{ boxText }}</b-message>
					<guard-policy-form :policy="view.box" :busy="boxBusy" :error="boxError" @save="saveBox" />
				</template>

				<share-people class="mt-4" @code="showCode" />

				<template v-if="view.protection">
					<p class="has-text-weight-medium mt-4 mb-2">{{ $t('Events') }}</p>
					<guard-journal :app="null" />
				</template>
			</template>
		</div>
		<!-- outside the section: a failed read of the view must not take the code away before it is seen -->
		<b-modal v-if="shown" :model-value="true" has-modal-card trap-focus aria-role="dialog" aria-modal @close="closeCode">
			<div class="modal-card" style="width: auto">
				<header class="modal-card-head"><p class="modal-card-title">{{ $t('Code for {name}', { name: shown.name }) }}</p></header>
				<section class="modal-card-body has-text-centered">
					<p class="is-size-3 has-text-weight-bold code-value">{{ shown.code }}</p>
					<b-button class="mt-2 copy-code" size="is-small" @click="copyCode">{{ copied ? $t('Copied') : $t('Copy') }}</b-button>
					<p class="mt-3 is-size-7">{{ $t('This code will not be shown again.') }}</p>
				</section>
				<footer class="modal-card-foot"><b-button class="close-code" type="is-primary" @click="closeCode">{{ $t('Close') }}</b-button></footer>
			</div>
		</b-modal>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
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
		return { shareGuard, publicShare, busy: false, error: '', boxBusy: false, boxError: '', boxText: '', switchKey: 0, shown: null, copied: false }
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
	beforeUnmount() {
		this.shown = null
		clearTimeout(this.copyTimer)
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
				onCancel: () => this.redraw(),
				onConfirm: () => {
					try {
						localStorage.setItem(SEEN, '1')
					} catch { /* shown again next time */ }
					return this.setProtection(true)
				},
			})
		},
		showCode(shown) {
			this.shown = shown
			this.copied = false
		},
		closeCode() {
			this.shown = null
		},
		async copyCode() {
			try {
				await copy(this.shown.code)
				this.copied = true
				clearTimeout(this.copyTimer)
				this.copyTimer = setTimeout(() => (this.copied = false), 2000)
			} catch {
				this.error = this.$t('This could not be copied')
			}
		},
		// a new switch, focused like the one it replaces (the finally that enables it runs before the tick)
		redraw() {
			this.switchKey++
			this.$nextTick(() => this.$refs.protect?.focus())
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
				// the core may have saved it all the same; the switch keeps its own value: draw it again from the store
				await refreshGuard({ force: true })
				this.redraw()
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
				// the form highlights and says a refused field; any other failure is said here
				if (typeof message === 'string' && message.startsWith('bad_policy:')) {
					this.boxError = message
				} else {
					this.boxText = guardErrorText(e, this.$t)
				}
				await refreshGuard({ force: true })
			} finally {
				this.boxBusy = false
			}
		},
	},
}
</script>
