<template>
	<div class="modal-card fleet-settings-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Fleet') }}</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('Several boxes seen and driven from one of them: this box can be the master the others join, or join a master with the code it gives.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<template v-if="view">
				<!-- the role is chosen while there is none; an active role is left from its own button -->
				<b-field>
					<b-radio v-model="role" :disabled="view.role !== 'none'" native-value="none">{{ $t('None') }}</b-radio>
					<b-radio v-model="role" :disabled="view.role !== 'none'" native-value="master">{{ $t('This box is the master') }}</b-radio>
					<b-radio v-model="role" :disabled="view.role !== 'none'" native-value="member">{{ $t('This box joins a fleet') }}</b-radio>
				</b-field>

				<template v-if="role === 'master'">
					<template v-if="view.role === 'master'">
						<div class="settings-card">
							<p class="mb-1">{{ $t('Address the boxes join it at') }}: <span class="has-text-weight-medium">{{ view.master.address }}</span></p>
							<template v-if="view.relay">
								<p class="mb-1">{{ $t('Relay server') }}: <span class="has-text-weight-medium">{{ view.relay }}</span></p>
								<p v-if="view.net?.addr" class="mb-1">{{ $t('Address on the private network') }}: <span class="has-text-weight-medium">{{ view.net.addr }}</span></p>
							</template>
							<p>{{ $t('{count} boxes in the fleet', { count: boxes.length }) }}</p>
						</div>
						<div class="buttons">
							<b-button rounded size="is-small" type="is-primary" @click="openPage">{{ $t('Open the Fleet page') }}</b-button>
							<b-button :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmDisable">{{ $t('Disable the master role') }}</b-button>
						</div>
						<!-- the same relay again renews a fleet the relay lost -->
						<template v-if="view.relay">
							<b-field :label="$t('Relay server')">
								<b-input v-model="relay" name="relay" placeholder="https://" type="url" />
							</b-field>
							<b-button v-if="notOfficial" class="mb-2 px-0" size="is-small" type="is-text" @click="relay = officialRelay">{{ $t('Use the official relay') }}</b-button>
							<b-button :disabled="busy" :loading="busy" outlined rounded size="is-small" @click="confirmRelay">{{ $t('Change the relay') }}</b-button>
						</template>
					</template>
					<template v-else>
						<template v-if="relayCapable">
							<b-field :label="$t('Relay server')" :message="$t('The official ReCasaOS relay unless you run your own')">
								<b-input v-model="relay" name="relay" placeholder="https://" type="url" />
							</b-field>
							<b-button v-if="notOfficial" class="mb-2 px-0" size="is-small" type="is-text" @click="relay = officialRelay">{{ $t('Use the official relay') }}</b-button>
							<p class="is-size-7 mb-3">{{ $t('The relay sees which boxes connect and when, never what they exchange.') }}</p>
							<b-field>
								<b-switch v-model="advanced" size="is-small">{{ $t('Advanced settings') }}</b-switch>
							</b-field>
						</template>
						<!-- an older core knows no relay: the address is the only way -->
						<b-field v-if="advanced || !relayCapable" :label="$t('Address the boxes join it at')">
							<b-input v-model="address" name="address" placeholder="https://" type="url" />
						</b-field>
						<b-button :disabled="busy" :loading="busy" rounded size="is-small" type="is-primary" @click="enable">{{ $t('Enable') }}</b-button>
					</template>
				</template>

				<template v-else-if="role === 'member'">
					<template v-if="view.role === 'member'">
						<p class="mb-1">{{ $t('Master: {url}', { url: view.member.master_url }) }}</p>
						<p :class="netStatus ? 'mb-1' : 'mb-3'">{{ memberStatus }}</p>
						<p v-if="netStatus" class="mb-3">{{ netStatus }}</p>
						<b-button :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmLeave">{{ $t('Leave the fleet') }}</b-button>
					</template>
					<template v-else>
						<b-field :label="$t('Paste the enrolment code')">
							<b-input v-model="code" rows="3" type="textarea" />
						</b-field>
						<b-button :disabled="!code.trim()" :loading="busy" rounded size="is-small" type="is-primary" @click="join">{{ $t('Join') }}</b-button>
					</template>
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
import { forgetFleet, openFleet } from '@/components/Fleet/entry'
import events from '@/events/events'
import { OFFICIAL_RELAY, fleetApi } from '@/service/fleet'

const HTTPS = /^https:\/\/.+/i

// What the member's last error says when the master turned it away (its code was revoked or replaced): the core's
// own sentence, or an HTTP refusal. A bare "refused" is not one: "connection refused" is a master that is down.
const REFUSED = /^refused by the master$|\b(?:401|403|unauthori[sz]ed|forbidden|revoked)\b/i

export default {
	name: 'FleetModal',
	emits: ['close'],
	data() {
		return {
			// GET /v1/fleet: { role, master: { address, boxes }, member: { master_url, connected, since, last_error } },
			// default_relay (always, on a core with the relay flow), and over a relay (absent otherwise): relay, net: { connected, addr, error }
			view: null,
			error: '',
			role: 'none',
			address: '',
			relay: OFFICIAL_RELAY,
			// the address field: a master already reachable at its own address, without a relay
			advanced: false,
			code: '',
			busy: false,
		}
	},
	computed: {
		// default_relay is always announced by a core that has the relay flow; an older core knows none of the three
		relayCapable() {
			const v = this.view
			return !!(v?.default_relay || v?.relay || v?.master?.relay)
		},
		officialRelay() {
			return this.view?.default_relay || OFFICIAL_RELAY
		},
		// the field holds another relay than the official one (a trailing slash is the same relay)
		notOfficial() {
			return this.relay.trim().replace(/\/+$/, '') !== this.officialRelay.replace(/\/+$/, '')
		},
		boxes() {
			return Array.isArray(this.view?.master?.boxes) ? this.view.master.boxes : []
		},
		memberStatus() {
			const m = this.view?.member || {}
			if (m.connected) {
				const since = new Date(m.since)
				return this.$t('Connected since {time}', { time: Number.isNaN(since.getTime()) ? '—' : since.toLocaleString() })
			}
			if (!m.last_error) {
				return this.$t('Not connected yet')
			}
			return REFUSED.test(m.last_error) ? this.$t('Refused by the master') : this.$t('Not connected: {error}', { error: m.last_error })
		},
		// a member over a relay: its place on the private network, apart from its tunnel to the master
		netStatus() {
			const net = this.view?.relay && this.view.net
			if (!net) {
				return ''
			}
			if (net.connected) {
				return this.$t('Connected to the private network')
			}
			return net.error ? this.$t('Not connected to the private network: {error}', { error: net.error }) : this.$t('Not connected to the private network')
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
				this.role = ['master', 'member'].includes(this.view.role) ? this.view.role : 'none'
				this.address = typeof this.view.master?.address === 'string' ? this.view.master.address : ''
				this.relay = this.view.remote?.relay || this.view.relay || this.view.default_relay || OFFICIAL_RELAY
			}).catch(() => {
				this.view = null
				this.error = this.$t('The fleet could not be read.')
			})
		},
		// the card in the grid and the Fleet page follow the role
		changed() {
			forgetFleet()
			this.$EventBus.$emit(events.FLEET_CHANGED)
			return this.load()
		},
		async run(call) {
			this.busy = true
			this.error = ''
			try {
				await call()
				this.code = ''
				await this.changed()
			} catch (e) {
				this.error = this.readable(e)
			} finally {
				this.busy = false
			}
		},
		// the core's refusal, in the owner's language where the relay is the cause; shown as text, never as HTML
		readable(e) {
			const status = e?.response?.status
			const message = e?.response?.data?.message
			if (status === 429) {
				return this.$t('The relay is busy, try again later')
			}
			if (status === 502) {
				return this.$t('Relay unreachable')
			}
			if (status === 409 && /another private network/i.test(message)) {
				return this.$t('This box is already in another private network')
			}
			if (status === 409 && /limit of boxes/i.test(message)) {
				return this.$t('The relay refused: the fleet is full')
			}
			return (typeof message === 'string' && message) || e?.message || this.$t('Could not be read')
		},
		enable() {
			// an address typed under advanced settings is the old flow, without a relay (what an older core takes)
			const address = this.advanced || !this.relayCapable ? this.address.trim() : ''
			if (address || !this.relayCapable) {
				if (!HTTPS.test(address)) {
					this.error = this.$t('The address must start with https://')
					return
				}
				this.run(() => this.becomeMaster({ address }))
				return
			}
			const relay = this.relay.trim()
			if (!HTTPS.test(relay)) {
				this.error = this.$t('The relay must start with https://')
				return
			}
			this.run(() => this.becomeMaster({ relay }))
		},
		// The master is a box of its own fleet from the start. If it cannot add itself, the role stays on and
		// "Add this box" on the Fleet page is the way to try again.
		async becomeMaster(fields) {
			await fleetApi.setMaster({ enabled: true, ...fields })
			try {
				await fleetApi.addBox({ name: window.location.hostname, url: '', self: true })
			} catch (e) {
				this.error = this.$t('This box could not add itself to its fleet: {error}', { error: this.readable(e) })
			}
		},
		confirmDisable() {
			this.$buefy.dialog.confirm({
				title: this.$t('Disable the master role?'),
				message: (this.view?.relay ? this.$t('Disabling the master also deletes the fleet at the relay') : this.$t('The list of boxes is erased.'))
					+ (this.view?.remote ? ` ${this.$t('Your phones and PCs lose remote access too.')}` : ''),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Disable'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.setMaster({ enabled: false, address: this.address })),
			})
		},
		confirmRelay() {
			const relay = this.relay.trim()
			if (!HTTPS.test(relay)) {
				this.error = this.$t('The relay must start with https://')
				return
			}
			this.error = ''
			this.$buefy.dialog.confirm({
				title: this.$t('Change the relay?'),
				message: this.$t('The codes already given stop working: every box needs a new code.'),
				type: 'is-warning',
				hasIcon: true,
				confirmText: this.$t('Change the relay'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.setRelay(relay)),
			})
		},
		async join() {
			const code = this.code.trim()
			this.busy = true
			this.error = ''
			try {
				await fleetApi.join(code)
				this.code = ''
				await this.changed()
			} catch (e) {
				// the core refuses once while remote access is on: the owner decides, the code stays in the field
				if (e?.response?.status === 409 && /has remote access/i.test(e.response.data?.message)) {
					this.confirmJoinLeavingRemote(code)
				} else {
					this.error = this.readable(e)
				}
			} finally {
				this.busy = false
			}
		},
		confirmJoinLeavingRemote(code) {
			this.$buefy.dialog.confirm({
				title: this.$t('Join this fleet and turn remote access off?'),
				message: this.$t('Your phones and PCs lose access to this box. Add them again on the master afterwards.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Join'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.join(code, { leaveRemote: true })),
			})
		},
		confirmLeave() {
			this.$buefy.dialog.confirm({
				title: this.$t('Leave the fleet?'),
				message: this.$t('This box forgets its master and stops answering it.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Leave'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.leave()),
			})
		},
		openPage() {
			this.$emit('close')
			openFleet(this.$buefy, this.$store.state)
		},
	},
}
</script>
