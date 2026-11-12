<template>
	<div v-if="app" class="share-app-guard mt-4">
		<p class="has-text-weight-medium mb-2">{{ $t('Access') }}</p>
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
		<div class="access-switch">
			<b-switch :key="`a${key}`" :model-value="protectedByCode" :disabled="busy" @update:model-value="toggle">{{ protectedByCode ? $t('Protected by code') : $t('Open to anyone') }}</b-switch>
		</div>
		<template v-if="protectedByCode">
			<p class="is-size-7 mt-2 people-line">{{ names.length ? names.join(', ') : $t('No one has access yet.') }}</p>
			<b-button class="manage-people" size="is-small" type="is-text" @click="$emit('manage')">{{ $t('Manage people') }}</b-button>
		</template>

		<template v-if="view.protection">
			<p class="has-text-weight-medium mt-4 mb-2">{{ $t('Protection') }}</p>
			<div :key="`m${key}`" class="protection-mode mb-2">
				<b-radio :model-value="own ? 'own' : 'same'" native-value="same" :disabled="busy" @update:model-value="setMode">{{ $t('Same as the box') }}</b-radio>
				<b-radio :model-value="own ? 'own' : 'same'" native-value="own" :disabled="busy" @update:model-value="setMode">{{ $t('Own settings') }}</b-radio>
			</div>
			<guard-policy-form v-if="own" :policy="view.box" :box="view.box" :override="app.override" :busy="busy" :error="formError" @save="saveOverride" />
			<p class="has-text-weight-medium mt-4 mb-2">{{ $t('Events') }}</p>
			<guard-journal :app="appName" :box-policy="view.box" />
		</template>
	</div>
</template>

<script>
import GuardJournal from './GuardJournal.vue'
import GuardPolicyForm from './GuardPolicyForm.vue'
import { guardErrorText } from './guardWords'
import { applyGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

export default {
	name: 'ShareAppGuard',
	components: { GuardJournal, GuardPolicyForm },
	props: {
		appName: { type: String, required: true },
	},
	// the parent closes its window and opens the Remote access one
	emits: ['manage'],
	data() {
		return { shareGuard, busy: false, error: '', formError: '', key: 0, own: !!shareGuard.view?.apps?.[this.appName]?.override }
	},
	computed: {
		// an older core, or no read yet: nothing shows and nothing is said
		view() {
			return shareGuard.ok && shareGuard.view?.supported ? shareGuard.view : null
		},
		app() {
			return this.view?.apps?.[this.appName]
		},
		protectedByCode() {
			return this.app?.access === 'code'
		},
		names() {
			return (this.view?.people || []).filter(p => p.apps.includes(this.appName)).map(p => p.name)
		},
	},
	watch: {
		// a saved or refreshed override decides the mode again
		'app.override': function (o) {
			this.own = !!o
		},
	},
	methods: {
		toggle(on) {
			if (!on) {
				return this.save('open')
			}
			this.$buefy.dialog.confirm({
				title: this.$t('Protect this app by code?'),
				message: this.$t('Mobile and sync apps (Jellyfin, Nextcloud, Home Assistant…) will no longer connect: only a web browser gets in.'),
				hasIcon: true,
				confirmText: this.$t('Turn on'),
				cancelText: this.$t('Cancel'),
				onCancel: () => this.key++,
				onConfirm: () => this.save('code'),
			})
		},
		setMode(mode) {
			if (mode === 'own') {
				this.own = true
			} else if (!this.app.override) {
				this.own = false
			} else {
				this.$buefy.dialog.confirm({
					title: this.$t('Use the settings of the box?'),
					message: this.$t('The own settings of this app are dropped.'),
					hasIcon: true,
					confirmText: this.$t('Use the box'),
					cancelText: this.$t('Cancel'),
					onCancel: () => this.key++,
					onConfirm: () => this.save(this.app.access, null),
				})
			}
		},
		saveOverride(override) {
			return this.save(this.app.access, override, true)
		},
		// the app's current override is kept unless one is given
		async save(access, override = this.app.override, fromForm = false) {
			this.busy = true
			this.error = ''
			this.formError = ''
			try {
				await applyGuard(shareGuardApi.setApp(this.appName, access, override))
			} catch (e) {
				const message = e?.response?.data?.message
				// the form highlights a refused field; any other failure is said above
				if (fromForm && typeof message === 'string' && message.startsWith('bad_policy')) {
					this.formError = message
				} else {
					this.error = guardErrorText(e, this.$t)
				}
				// the switch and the radios keep their own value: draw them again from the store
				this.key++
			} finally {
				this.busy = false
			}
		},
	},
}
</script>
