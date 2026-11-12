<template>
	<div v-if="app" class="share-app-guard mt-3">
		<b-message v-if="error && !formError" class="mb-0" size="is-small" type="is-danger">{{ error }}</b-message>

		<!-- who gets in: open to anyone, or by code, with the people who have one -->
		<section class="settings-card p-0 _access">
			<div class="_head">
				<span class="_tile is-warn" aria-hidden="true"><b-icon :icon="protectedByCode ? 'lock-outline' : 'lock-open-variant-outline'" /></span>
				<div class="_text">
					<p class="_name">{{ $t('Access') }}</p>
					<p class="is-size-7 _has-text-gray">{{ protectedByCode ? $t('Only people with an access code get in.') : $t('Anyone who knows the address gets in; only the app\'s own login page protects it.') }}</p>
				</div>
				<div class="access-switch">
					<b-switch :key="`a${key}`" :model-value="protectedByCode" :disabled="busy" @update:model-value="toggle">{{ protectedByCode ? $t('Protected by code') : $t('Open to anyone') }}</b-switch>
				</div>
			</div>
			<div v-if="protectedByCode" class="_body _people">
				<span class="is-size-7 _has-text-gray">{{ $t('People') }}</span>
				<span class="is-size-7 people-line">{{ names.length ? names.join(', ') : $t('No one has access yet.') }}</span>
				<b-button class="manage-people ml-auto" size="is-small" type="is-text" @click="$emit('manage')">{{ $t('Manage people') }}</b-button>
			</div>
		</section>

		<template v-if="view.protection">
			<!-- the protection: the box's settings, or this app's own -->
			<section :class="{ 'is-own': own }" class="settings-card p-0 _protection">
				<div class="_head">
					<span class="_tile" aria-hidden="true"><b-icon icon="shield-check-outline" /></span>
					<div class="_text">
						<p class="_name">{{ $t('Protection') }}</p>
						<p class="is-size-7 _has-text-gray">{{ $t('Firewall, address lists, countries, request limit, bans. A block ticked "Same as the box" follows the box.') }}</p>
					</div>
					<div :key="`m${key}`" class="protection-mode">
						<b-radio :model-value="own ? 'own' : 'same'" native-value="same" :disabled="busy" @update:model-value="setMode">{{ $t('Same as the box') }}</b-radio>
						<b-radio :model-value="own ? 'own' : 'same'" native-value="own" :disabled="busy" @update:model-value="setMode">{{ $t('Own settings') }}</b-radio>
					</div>
				</div>
				<div v-if="own" class="_body">
					<guard-policy-form :policy="view.box" :box="view.box" :override="app.override" :busy="busy" :error="formError" @save="saveOverride" />
				</div>
			</section>

			<!-- what the protection refused, and who is banned right now -->
			<section class="settings-card p-0 _journal">
				<div class="_head">
					<span class="_tile is-plain" aria-hidden="true"><b-icon icon="format-list-bulleted" /></span>
					<div class="_text">
						<p class="_name">{{ $t('Events') }}</p>
						<p class="is-size-7 _has-text-gray">{{ $t('What the protection refused for this app, and the addresses banned right now.') }}</p>
					</div>
				</div>
				<div class="_body">
					<guard-journal :app="appName" />
				</div>
			</section>
		</template>
	</div>
</template>

<script>
import GuardJournal from './GuardJournal.vue'
import GuardPolicyForm from './GuardPolicyForm.vue'
import { guardErrorText } from './guardWords'
import { applyGuard, refreshGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

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
				// the form says and highlights a refused field itself; any other failure is said above
				if (fromForm && typeof message === 'string' && message.startsWith('bad_policy:')) {
					this.formError = message
				}
				this.error = guardErrorText(e, this.$t)
				// the core may have saved it all the same; the switch and the radios keep their own value: draw them
				// again from the store
				await refreshGuard({ force: true })
				this.key++
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.share-app-guard {
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

	._tile.is-warn {
		background: rgba($warning, 0.18);
		color: $warning;
	}

	._tile.is-plain {
		background: var(--casa-hover-tint);
		color: var(--casa-text-hint);
	}

	._people {
		flex-flow: row wrap;
		align-items: center;
		gap: 0.5rem;
	}

	._protection.is-own {
		border-color: $primary;
	}

	.protection-mode {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}
}
</style>
