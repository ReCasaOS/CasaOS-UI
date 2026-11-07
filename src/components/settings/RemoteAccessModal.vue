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
							<b-button class="ml-1" size="is-small" type="is-text" @click="copyAddress(remote.addr)">{{ copied === remote.addr ? $t('Copied') : $t('Copy') }}</b-button>
						</p>
						<p v-if="remote.error">{{ $t('Not connected: {error}', { error: remote.error }) }}</p>
						<p v-else-if="remote.connected">{{ $t('Connected to the private network') }}</p>
						<p v-else>{{ $t('Not connected to the private network') }}</p>
					</div>
					<b-button v-if="remote.alone" :disabled="busy" outlined rounded size="is-small" type="is-danger" @click="confirmOff">{{ $t('Turn remote access off') }}</b-button>
					<p v-else class="is-size-7">{{ $t('Remote access comes with the master role: disabling the master turns it off.') }}</p>

					<div class="settings-card">
						<div class="is-flex is-align-items-center is-justify-content-space-between mb-2">
							<p class="has-text-weight-medium">{{ $t('Phones and PCs') }}</p>
							<span>
								<b-button v-if="!adding" :disabled="busy" size="is-small" type="is-text" @click="addDevice">{{ $t('Add a phone or PC') }}</b-button>
								<b-button :disabled="busy" size="is-small" type="is-text" @click="refresh">{{ $t('Refresh') }}</b-button>
							</span>
						</div>
						<div v-if="adding" class="remote-add mb-3">
							<p class="remote-code">{{ adding.code }}
								<b-button class="remote-code-copy" size="is-small" type="is-text" @click="copyValue(adding.code)">{{ copied === adding.code ? $t('Copied') : $t('Copy') }}</b-button>
							</p>
							<template v-if="remaining > 0">
								<p class="is-size-7 mb-2">{{ $t('valid for {time}', { time: countdown }) }}</p>
								<div class="buttons mb-2">
									<b-button v-for="p in platforms" :key="p.id" size="is-small" rounded :aria-pressed="String(platform === p.id)" :type="platform === p.id ? 'is-primary' : ''" @click="platform = p.id">{{ p.label }}</b-button>
								</div>
								<ol class="remote-steps">
									<li v-for="(step, i) in steps" :key="platform + i">{{ step }}</li>
								</ol>
								<p class="remote-command">
									<code>{{ platform === 'windows' ? loginCommand : addingRelay }}</code>
									<b-button class="remote-relay-copy" size="is-small" type="is-text" @click="copyValue(platform === 'windows' ? loginCommand : addingRelay)">{{ copied === (platform === 'windows' ? loginCommand : addingRelay) ? $t('Copied') : $t('Copy') }}</b-button>
								</p>
								<p class="is-size-7 mt-2">{{ $t('A page then opens in the browser: type the code shown above.') }}</p>
								<p class="is-size-7 mt-1">{{ $t('Already using the Tailscale app for another network? Add an account in the app first: one network is active at a time.') }}</p>
							</template>
							<template v-else>
								<p class="mb-2">{{ $t('This code has expired.') }}</p>
								<b-button :disabled="busy" size="is-small" rounded @click="addDevice">{{ $t('New code') }}</b-button>
							</template>
							<div class="mt-2">
								<b-button size="is-small" rounded type="is-primary" @click="doneAdding">{{ $t('Done adding') }}</b-button>
							</div>
						</div>
						<p v-if="!devices.length" class="is-size-7">{{ $t('No phone or PC yet.') }}</p>
						<ul v-else>
							<li v-for="d in devices" :key="d.id" class="mb-2 remote-item">
								<span class="has-text-weight-medium">{{ d.hostname }}</span>
								<span class="is-size-7 ml-1">{{ d.online ? $t('Online') : $t('Offline') }}</span>
								<span v-if="lastSeen(d)" class="is-size-7 ml-1">{{ $t('last seen {time}', { time: lastSeen(d) }) }}</span>
								<b-button class="ml-1" :disabled="busy" size="is-small" type="is-text" @click="confirmRemove(d)">{{ $t('Remove') }}</b-button>
							</li>
						</ul>
					</div>
					<div v-if="boxes.length" class="settings-card">
						<p class="has-text-weight-medium mb-2">{{ $t('Boxes') }}</p>
						<ul>
							<li v-for="b in boxes" :key="b.id" class="mb-2 remote-item">
								<span class="has-text-weight-medium">{{ b.name }}</span>
								<span v-if="!b.online" class="is-size-7 ml-1">{{ $t('Offline') }}</span>
								<template v-if="b.addr">
									<span class="ml-1">http://{{ b.addr }}</span>
									<b-button class="ml-1 box-copy" size="is-small" type="is-text" @click="copyAddress(b.addr)">{{ copied === b.addr ? $t('Copied') : $t('Copy') }}</b-button>
								</template>
								<span v-else class="is-size-7 ml-1">{{ $t('not on the private network') }}</span>
							</li>
						</ul>
					</div>
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
import escape from 'lodash/escape'
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
			copied: '',
			// GET /v1/fleet/remote: devices, and boxes on a master; the relay is asked only on open, refresh and removal
			list: null,
			// the code being shown: { code, expires_at }; the countdown only reads the clock, never the network
			adding: null,
			now: Date.now(),
			platform: 'ios',
			addRequest: 0,
		}
	},
	computed: {
		remote() {
			return this.view?.remote || null
		},
		devices() {
			return this.list?.devices || []
		},
		boxes() {
			return this.list?.boxes || []
		},
		addingRelay() {
			return this.remote?.relay || ''
		},
		remaining() {
			const end = this.adding ? new Date(this.adding.expires_at).getTime() : 0
			return Number.isNaN(end) ? 0 : Math.max(0, Math.ceil((end - this.now) / 1000))
		},
		countdown() {
			const m = String(Math.floor(this.remaining / 60)).padStart(2, '0')
			return `${m}:${String(this.remaining % 60).padStart(2, '0')}`
		},
		platforms() {
			return [
				{ id: 'ios', label: this.$t('iPhone / iPad') },
				{ id: 'android', label: 'Android' },
				{ id: 'windows', label: 'Windows' },
				{ id: 'mac', label: 'Mac' },
			]
		},
		loginCommand() {
			return `tailscale login --login-server=${this.addingRelay}`
		},
		steps() {
			const relay = this.addingRelay
			const steps = {
				ios: [
					this.$t('Open the Tailscale app, then the menu at the top right.'),
					this.$t('Choose "Use a custom coordination server".'),
					this.$t('Type the relay address: {relay}', { relay }),
					this.$t('Choose "Log in".'),
				],
				android: [
					this.$t('Open the Tailscale app, then its settings.'),
					this.$t('Choose "Accounts", then open the "⋮" menu.'),
					this.$t('Choose "Use an alternate server".'),
					this.$t('Type the relay address: {relay}', { relay }),
					this.$t('Choose "Log in".'),
				],
				windows: [
					this.$t('The app has no field for this: open a terminal and run this command.'),
				],
				mac: [
					this.$t('Option+click the Tailscale icon in the menu bar.'),
					this.$t('Choose "Debug", then "Custom Login Server", then "Add Account".'),
					this.$t('Type the relay address: {relay}', { relay }),
				],
			}
			return steps[this.platform]
		},
		officialRelay() {
			return this.view?.default_relay || OFFICIAL_RELAY
		},
		notOfficial() {
			return this.relay.trim().replace(/\/+$/, '') !== this.officialRelay.replace(/\/+$/, '')
		},
	},
	mounted() {
		this.load().then(() => this.remote && this.loadList())
	},
	beforeUnmount() {
		clearTimeout(this.copyTimer)
		this.addRequest++
		this.stopTicker()
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
		// an error here leaves the rest of the window and the last list in place
		async loadList() {
			try {
				const res = await fleetApi.remote()
				this.list = res?.data?.data || null
				this.error = ''
			} catch (e) {
				this.error = this.readable(e)
			}
		},
		refresh() {
			this.busy = true
			return this.loadList().finally(() => (this.busy = false))
		},
		lastSeen(d) {
			const t = d.last_seen ? new Date(d.last_seen) : null
			return t && !Number.isNaN(t.getTime()) ? t.toLocaleString() : ''
		},
		confirmRemove(d) {
			this.$buefy.dialog.confirm({
				title: this.$t('Remove this device?'),
				message: this.$t('{name} will no longer reach this box.', { name: escape(d.hostname) }),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Remove'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: async () => {
					this.busy = true
					this.error = ''
					try {
						await fleetApi.removeDevice(d.id)
						await this.loadList()
					} catch (e) {
						this.error = this.readable(e)
					} finally {
						this.busy = false
					}
				},
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
			const known = [
				[/relay is full/i, 'The relay is full'],
				[/does not offer remote access yet/i, 'This relay does not offer remote access yet'],
				[/no longer knows this box's network/i, 'The relay no longer knows this box\'s network: turn remote access off and on again'],
				[/too many codes not used yet/i, 'Too many codes are not used yet: use or wait for them to expire'],
				[/is a member of a fleet/i, 'This box is a member of a fleet: it has no remote access of its own'],
				[/typed by hand/i, 'The master runs at an address typed by hand: move it onto a relay (Fleet settings) to get remote access.'],
				[/loopback only/i, 'The gateway only listens on this box: remote access needs it reachable from the network'],
				[/already runs over another relay/i, 'Remote access already runs over another relay: turn it off first'],
			]
			// the core's texts are matched whatever the status: it answers 400 for some and 409 for others
			const hit = known.find(([re]) => re.test(text))
			if (hit) {
				return this.$t(hit[1])
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
				onConfirm: () => {
					this.list = null
					return this.run(() => fleetApi.setRemote({ enabled: false }))
				},
			})
		},
		copyAddress(addr) {
			return this.copyValue(`http://${addr}`, addr)
		},
		async addDevice() {
			const request = ++this.addRequest
			this.busy = true
			this.error = ''
			this.stopTicker()
			try {
				const res = await fleetApi.addDevice()
				// closed, or Done pressed, while the code was being fetched
				if (request !== this.addRequest) {
					return
				}
				this.adding = res.data.data
				this.now = Date.now()
				this.ticker = setInterval(() => {
					this.now = Date.now()
					if (this.remaining <= 0) {
						this.stopTicker()
					}
				}, 1000)
			} catch (e) {
				if (request === this.addRequest) {
					this.adding = null
					this.error = this.readable(e)
				}
			} finally {
				this.busy = false
			}
		},
		doneAdding() {
			this.addRequest++
			this.stopTicker()
			this.adding = null
			return this.loadList()
		},
		stopTicker() {
			clearInterval(this.ticker)
			this.ticker = null
		},
		async copyValue(text, key = text) {
			try {
				await copy(text)
				this.copied = key
				clearTimeout(this.copyTimer)
				this.copyTimer = setTimeout(() => (this.copied = ''), 2000)
			} catch {
				this.error = this.$t('The address could not be copied')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.remote-code {
	font-family: monospace;
	font-size: 2rem;
	letter-spacing: 0.1em;
}
.remote-command {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0 0.5rem;
	code {
		overflow-wrap: anywhere;
	}
}
.remote-steps {
	list-style: decimal;
	padding-left: 1.25rem;
	margin-bottom: 0.5rem;
}
.remote-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0 0.25rem;
	overflow-wrap: anywhere;
}
</style>
