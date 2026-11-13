<template>
	<div>
		<div v-if="visible" class="share-guard-section">
			<!-- the protection of every shared app: the switch in the head, the box's settings under it -->
			<section class="settings-card p-0 _protection">
				<div class="_head">
					<span class="_tile" aria-hidden="true"><b-icon icon="shield-check-outline" /></span>
					<div class="_text">
						<p class="_name">{{ $t('Protection of shared apps') }}</p>
						<p class="is-size-7 _has-text-gray">{{ view.supported ? $t('Firewall, address lists, countries, request limit and bans, for every shared app.') : $t('Update ReCasaOS to protect shared apps') }}</p>
					</div>
					<b-switch v-if="view.supported" ref="protect" :key="switchKey" :model-value="view.protection" :disabled="busy" @update:model-value="toggle">{{ $t('Protect shared apps') }}</b-switch>
				</div>
				<div v-if="view.supported && (error || view.protection)" class="_body">
					<b-message v-if="error" class="mb-0" size="is-small" type="is-danger">{{ error }}</b-message>
					<template v-if="view.protection">
						<p class="_sub">{{ $t('Settings for every shared app') }}</p>
						<b-message v-if="boxText" class="mb-0" size="is-small" type="is-danger">{{ boxText }}</b-message>
						<guard-policy-form :policy="view.box" :busy="boxBusy" :error="boxError" @save="saveBox" />
					</template>
				</div>
			</section>

			<template v-if="view.supported">
				<section v-if="view.relay && view.relay.supported" class="settings-card relay-block">
					<b-switch :key="`f${relayKey}`" :model-value="view.relay.filter" :disabled="relayBusy" @update:model-value="setRelay({ filter: $event })">{{ $t('Filtering by the relay') }}</b-switch>
					<p class="is-size-7 _has-text-gray">{{ $t('The relay cuts addresses known as malicious before they reach your box.') }}</p>
					<p class="is-size-7 _has-text-gray">{{ view.protection ? $t('Protection of the box is on.') : $t('Protection of the box is off.') }}</p>
					<b-message v-if="relayError" class="mb-0" size="is-small" type="is-danger">{{ relayError }}</b-message>
					<template v-if="view.relay.share_bans">
						<b-switch :key="`s${relayKey}`" :model-value="true" :disabled="relayBusy" @update:model-value="setRelay({ share_bans: $event })">{{ $t('Share my bans') }}</b-switch>
						<p class="is-size-7">{{ $t('Your reports added {n} addresses to the community list this month', { n: view.relay.contributed_month }) }}</p>
					</template>
					<relay-join v-else :relay="view.relay" :waves="view.waves || []" :busy="relayBusy" @join="setRelay({ share_bans: true, consent: true })" />
				</section>

				<section class="settings-card p-0">
					<share-people @code="showCode" />
				</section>

				<section v-if="view.protection" class="settings-card _journal">
					<guard-journal :app="null" :title="$t('Events')" :hint="$t('What the protection refused for every shared app, and the addresses banned right now.')" />
				</section>
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
import RelayJoin from './RelayJoin.vue'
import SharePeople from './SharePeople.vue'
import { guardErrorText } from './guardWords'
import { sharedApps } from './shareWords'
import { publicShare } from '@/service/publicShare'
import { applyGuard, refreshGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

const SEEN = 'share-guard-ddos-seen'

export default {
	name: 'ShareGuardSection',
	components: { GuardJournal, GuardPolicyForm, RelayJoin, SharePeople },
	data() {
		return { shareGuard, publicShare, busy: false, error: '', boxBusy: false, boxError: '', boxText: '', switchKey: 0, relayBusy: false, relayError: '', relayKey: 0, shown: null, copied: false }
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
		async setRelay(body) {
			this.relayBusy = true
			this.relayError = ''
			try {
				await applyGuard(shareGuardApi.setRelay(body))
			} catch (e) {
				this.relayError = guardErrorText(e, this.$t)
				// the core may have saved it all the same; draw the switches again from the store
				await refreshGuard({ force: true })
				this.relayKey++
			} finally {
				this.relayBusy = false
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

<style lang="scss" scoped>
.share-guard-section {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	margin-bottom: 1rem;

	> .settings-card {
		margin-bottom: 0;
	}
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

	.relay-block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
	}

	._sub {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--casa-text-hint);
	}
}
</style>
