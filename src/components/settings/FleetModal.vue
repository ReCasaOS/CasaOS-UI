<template>
	<div class="modal-card fleet-settings-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Fleet') }}</h3>
		</header>

		<section class="modal-card-body">
			<p class="is-size-7 mb-3">
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
						<p class="mb-1">{{ $t('Address the boxes join it at') }}: <span class="has-text-weight-medium">{{ view.master.address }}</span></p>
						<p class="mb-3">{{ $t('{count} boxes in the fleet', { count: boxes.length }) }}</p>
						<div class="buttons">
							<b-button rounded size="is-small" type="is-primary" @click="openPage">{{ $t('Open the Fleet page') }}</b-button>
							<b-button outlined rounded size="is-small" type="is-danger" @click="confirmDisable">{{ $t('Disable the master role') }}</b-button>
						</div>
					</template>
					<template v-else>
						<b-field :label="$t('Address the boxes join it at')">
							<b-input v-model="address" placeholder="https://" type="url" />
						</b-field>
						<b-button :loading="busy" rounded size="is-small" type="is-primary" @click="enable">{{ $t('Enable') }}</b-button>
					</template>
				</template>

				<template v-else-if="role === 'member'">
					<template v-if="view.role === 'member'">
						<p class="mb-1">{{ $t('Master: {url}', { url: view.member.master_url }) }}</p>
						<p class="mb-3">{{ memberStatus }}</p>
						<b-button outlined rounded size="is-small" type="is-danger" @click="confirmLeave">{{ $t('Leave the fleet') }}</b-button>
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
import { fleetApi } from '@/service/fleet'

// What the member's last error says when the master turned it away (its code was revoked or replaced): the core's
// own sentence, or an HTTP refusal. A bare "refused" is not one: "connection refused" is a master that is down.
const REFUSED = /^refused by the master$|\b(?:401|403|unauthori[sz]ed|forbidden|revoked)\b/i

export default {
	name: 'FleetModal',
	emits: ['close'],
	data() {
		return {
			// GET /v1/fleet: { role, master: { address, boxes }, member: { master_url, connected, since, last_error } }
			view: null,
			error: '',
			role: 'none',
			address: '',
			code: '',
			busy: false,
		}
	},
	computed: {
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
				this.error = e?.response?.data?.message || e?.message || this.$t('Could not be read')
			} finally {
				this.busy = false
			}
		},
		enable() {
			const address = this.address.trim()
			if (!/^https:\/\/.+/i.test(address)) {
				this.error = this.$t('The address must start with https://')
				return
			}
			this.run(() => fleetApi.setMaster({ enabled: true, address }))
		},
		confirmDisable() {
			this.$buefy.dialog.confirm({
				title: this.$t('Disable the master role?'),
				message: this.$t('The list of boxes is erased.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Disable'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(() => fleetApi.setMaster({ enabled: false, address: this.address })),
			})
		},
		join() {
			const code = this.code.trim()
			this.run(() => fleetApi.join(code))
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
