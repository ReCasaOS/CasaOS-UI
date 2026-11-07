<template>
	<div class="modal-card fleet-settings-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Remote access') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<template v-if="view">
				<!-- on -->
				<template v-if="remote">
					<div class="settings-card">
						<p class="mb-1">{{ $t('Relay server') }}: <span class="has-text-weight-medium">{{ remote.relay }}</span></p>
						<p class="mb-1">
							{{ $t('Address of this box: http://{addr}', { addr: remote.addr }) }}
							<b-button class="ml-1" size="is-small" type="is-text" @click="copyAddress">{{ copied ? $t('Copied') : $t('Copy') }}</b-button>
						</p>
						<p v-if="remote.error">{{ $t('Not connected: {error}', { error: remote.error }) }}</p>
						<p v-else-if="remote.connected">{{ $t('Connected to the private network') }}</p>
						<p v-else>{{ $t('Not connected to the private network') }}</p>
					</div>
					<b-button v-if="remote.alone" :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmOff">{{ $t('Turn remote access off') }}</b-button>
					<p v-else class="is-size-7">{{ $t('Remote access comes with the master role: disabling the master turns it off.') }}</p>
				</template>

				<p v-else-if="view.role === 'member'">{{ $t("Phones and PCs are added on the master's dashboard.") }}</p>
				<p v-else-if="view.role === 'master' && !view.master?.relay">{{ $t('The master runs at an address typed by hand: move it onto a relay (Fleet settings) to get remote access.') }}</p>

				<!-- off -->
				<template v-else>
					<p class="settings-intro mb-3">{{ $t('Reach this box from your phone or PC, from anywhere, through the official Tailscale app. Nothing is opened on the internet.') }}</p>
					<b-field :label="$t('Relay server')">
						<b-input v-model="relay" name="relay" placeholder="https://" type="url" />
					</b-field>
					<b-button v-if="notOfficial" class="mb-2 px-0" size="is-small" type="is-text" @click="relay = officialRelay">{{ $t('Use the official relay') }}</b-button>
					<p class="is-size-7 mb-3">{{ $t('The relay sees which devices connect and when, never what they exchange.') }}</p>
					<b-button :disabled="busy" :loading="busy" rounded size="is-small" type="is-primary" @click="enable">{{ $t('Turn remote access on') }}</b-button>
				</template>
			</template>
			<b-loading v-else :active="!error" :is-full-page="false" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import { OFFICIAL_RELAY, fleetApi } from '@/service/fleet'

const HTTPS = /^https:\/\/.+/i

export default {
	name: 'RemoteAccessModal',
	emits: ['close'],
	data() {
		return {
			// GET /v1/fleet: role, master, member, default_relay, and remote: { relay, addr, connected, error, alone } when on
			view: null,
			error: '',
			relay: OFFICIAL_RELAY,
			busy: false,
			copied: false,
		}
	},
	computed: {
		remote() {
			return this.view?.remote || null
		},
		officialRelay() {
			return this.view?.default_relay || OFFICIAL_RELAY
		},
		notOfficial() {
			return this.relay.trim().replace(/\/+$/, '') !== this.officialRelay.replace(/\/+$/, '')
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		load() {
			return fleetApi.status().then((res) => {
				const view = res?.data?.data
				this.view = view && typeof view === 'object' ? view : { role: 'none' }
				this.relay = this.view.default_relay || OFFICIAL_RELAY
			}).catch(() => {
				this.view = null
				this.error = this.$t('The fleet could not be read.')
			})
		},
		async run(call) {
			this.busy = true
			this.error = ''
			try {
				await call()
				await this.load()
			} catch (e) {
				this.error = this.readable(e)
			} finally {
				this.busy = false
			}
		},
		// the core's refusal, in the owner's language; shown as text, never as HTML
		readable(e) {
			const status = e?.response?.status
			const message = e?.response?.data?.message
			const text = typeof message === 'string' ? message : ''
			if (status === 404 || status === 405) {
				return this.$t('This box\'s system is too old for remote access: update it first')
			}
			if (status === 429) {
				return this.$t('The relay is busy, try again later')
			}
			if (status === 502) {
				return this.$t('Relay unreachable')
			}
			if (status === 503 && /relay is full/i.test(text)) {
				return this.$t('The relay is full')
			}
			if (status === 409) {
				if (/does not offer remote access yet/i.test(text)) {
					return this.$t('This relay does not offer remote access yet')
				}
				if (/no longer knows this box's network/i.test(text)) {
					return this.$t('The relay no longer knows this box\'s network: turn remote access off and on again')
				}
				if (/too many codes not used yet/i.test(text)) {
					return this.$t('Too many codes are not used yet: use or wait for them to expire')
				}
				if (/is a member of a fleet/i.test(text)) {
					return this.$t('This box is a member of a fleet: it has no remote access of its own')
				}
				if (/typed by hand/i.test(text)) {
					return this.$t('The master runs at an address typed by hand: move it onto a relay (Fleet settings) to get remote access.')
				}
				if (/loopback only/i.test(text)) {
					return this.$t('The gateway only listens on this box: remote access needs it reachable from the network')
				}
			}
			return text || e?.message || this.$t('Could not be read')
		},
		enable() {
			const relay = this.relay.trim()
			if (!HTTPS.test(relay)) {
				this.error = this.$t('The relay must start with https://')
				return
			}
			this.run(() => fleetApi.setRemote({ enabled: true, relay }))
		},
		confirmOff() {
			this.$buefy.dialog.confirm({
				title: this.$t('Turn remote access off?'),
				message: this.$t('Your phones and PCs lose access to this box. To come back, you will have to add them again.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Turn off'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.setRemote({ enabled: false })),
			})
		},
		async copyAddress() {
			await copy(`http://${this.remote.addr}`)
			this.copied = true
			setTimeout(() => (this.copied = false), 2000)
		},
	},
}
</script>
