<template>
	<div class="fleet-backups">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else-if="data">
			<div v-if="!data.notify" class="fleet-backups-notify" role="alert">
				<backup-mark :label="$t('No alert channel is set on the master: nothing will warn you.')" level="warning" />
				<span class="fleet-backups-notify-text">{{ $t('No alert channel is set on the master: nothing will warn you.') }}</span>
				<button class="button is-small is-rounded" type="button" @click="openAlerts">{{ $t('Set up alerts') }}</button>
			</div>

			<p v-if="!data.boxes.length" class="has-text-centered py-4 has-text-full-03">{{ $t('No box in the fleet yet') }}</p>

			<template v-else>
				<div :class="summaryClass" class="fleet-backups-summary" role="status">
					<backup-mark :label="summaryText" :level="summaryLevel" />
					<span class="has-text-weight-semibold">{{ summaryText }}</span>
				</div>

				<b-table :data="sorted"
					:loading="loading"
					:mobile-cards="false"
					:opened-detailed="open"
					:show-detail-icon="false"
					class="is-size-7"
					custom-row-key="box_id"
					detail-key="box_id"
					detailed>
					<b-table-column v-slot="{ row }" :label="$t('Box')" field="name">
						<!-- Task 3 adds a leading checkbox cell before this one -->
						<button :aria-expanded="isOpen(row)" class="fleet-backups-toggle" type="button" @click="toggle(row)">
							<span aria-hidden="true">{{ isOpen(row) ? '▾' : '▸' }}</span>
							<span class="has-text-weight-medium">{{ row.name }}</span>
						</button>
					</b-table-column>

					<b-table-column v-slot="{ row }" :label="$t('State')" field="state">
						<div class="fleet-backups-state">
							<backup-mark :label="boxWord(row)" :level="levelOf(row)" />
							<span>{{ boxWord(row) }}</span>
						</div>
						<div v-if="!row.online || row.stale" class="has-text-full-03" :title="when(row.polled_at)">{{ readText(row) }}</div>
					</b-table-column>

					<b-table-column v-slot="{ row }" :label="$t('Last success')" field="lastOk">
						<span v-if="lastOk(row)" :title="when(lastOk(row))">{{ age(lastOk(row)) }}</span>
						<span v-else class="has-text-full-03">—</span>
					</b-table-column>

					<b-table-column v-slot="{ row }" :label="$t('Next backup')" field="next">
						<span v-if="next(row)">{{ when(next(row)) }}</span>
						<span v-else class="has-text-full-03">—</span>
					</b-table-column>

					<b-table-column v-slot="{ row }" :label="$t('Last verification')" field="verify">
						<span v-if="lastVerify(row)" :title="when(lastVerify(row))">{{ age(lastVerify(row)) }}</span>
						<span v-else class="has-text-full-03">—</span>
					</b-table-column>

					<template #detail="{ row }">
						<p v-if="row.error" class="fleet-backups-box-error">{{ row.error }}</p>
						<p v-if="!couples(row).length" class="has-text-full-03">{{ $t('No backup is scheduled on this box') }}</p>
						<table v-else class="table is-narrow fleet-backups-couples">
							<thead>
								<tr>
									<th>{{ $t('App') }}</th>
									<th>{{ $t('Destination') }}</th>
									<th>{{ $t('State') }}</th>
									<th>{{ $t('Last run') }}</th>
									<th>{{ $t('Next backup') }}</th>
									<th>{{ $t('Verification') }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="c in couples(row)" :key="`${c.app}/${c.destination}`">
									<td class="has-text-weight-medium">{{ c.app }}</td>
									<td>{{ c.destination }}</td>
									<td>
										<div class="fleet-backups-state">
											<backup-mark :label="stateWord(c.state)" :level="stateLevel(c.state)" />
											<span>{{ stateWord(c.state) }}</span>
											<b-tag v-if="c.running" size="is-small" type="is-info">{{ $t('Running') }}</b-tag>
										</div>
										<div v-if="c.last_error" class="fleet-backups-error">{{ c.last_error }}</div>
									</td>
									<td>
										<template v-if="c.last_run_at">{{ when(c.last_run_at) }} <span class="has-text-full-03">({{ age(c.last_run_at) }})</span></template>
										<span v-else class="has-text-full-03">—</span>
									</td>
									<td>
										<template v-if="c.next_slot">{{ when(c.next_slot) }}</template>
										<span v-else class="has-text-full-03">—</span>
									</td>
									<td class="fleet-backups-verify">
										<div class="fleet-backups-state">
											<backup-mark :label="verifyWord(c)" :level="verifyLevel(c)" />
											<span>{{ verifyWord(c) }}</span>
											<span v-if="c.verify && c.verify.at" class="has-text-full-03">({{ age(c.verify.at) }})</span>
										</div>
										<div v-if="c.verify && c.verify.error" class="fleet-backups-error">{{ c.verify.error }}</div>
										<div v-if="c.restic && c.restic_check" class="fleet-backups-state fleet-backups-check">
											<backup-mark :label="checkWord(c)" :level="c.restic_check.ok ? 'ok' : 'danger'" />
											<span>{{ checkWord(c) }}</span>
											<span v-if="c.restic_check.at" class="has-text-full-03">({{ age(c.restic_check.at) }})</span>
										</div>
										<div v-if="c.restic_check && c.restic_check.error" class="fleet-backups-error">{{ c.restic_check.error }}</div>
									</td>
									<!-- Task 3: the per-couple actions and the result of the last one come here -->
								</tr>
							</tbody>
						</table>
					</template>
				</b-table>
			</template>
		</template>
	</div>
</template>

<script>
import BackupMark from './BackupMark.vue'
import { ageText, boxLevel, couplesOf, lastOkOf, lastVerifyOf, nextOf, stateLevel, summaryOf } from './backupsData'
import { BACKUP_WORDS, VERIFY_WORDS } from './fleetWords'
import { fleetApi } from '@/service/fleet'
import { createPoller } from '@/components/Stats/poller'

const WORST_FIRST = { danger: 0, warning: 1, none: 2, ok: 3 }

export default {
	name: 'BackupsTab',
	components: { BackupMark },
	data() {
		return {
			data: null,
			loading: true,
			error: false,
			// the box ids whose detail is open
			open: [],
			now: new Date(),
			// the newest read: an older answer never replaces a newer one
			ticket: 0,
		}
	},
	computed: {
		summary() {
			return summaryOf(this.data?.boxes ?? [])
		},
		summaryLevel() {
			if (this.summary.allGreen) {
				return 'ok'
			}
			return this.summary.problems > 0 ? 'danger' : 'warning'
		},
		summaryClass() {
			return `is-${this.summaryLevel}`
		},
		summaryText() {
			const { allGreen, problems, offline, unknown } = this.summary
			if (allGreen) {
				return this.$t('Everything is green')
			}
			return [
				problems === 1 && this.$t('{n} problem', { n: 1 }),
				problems > 1 && this.$t('{n} problems', { n: problems }),
				offline && this.$t('{n} offline', { n: offline }),
				unknown && this.$t('{n} unknown', { n: unknown }),
			].filter(Boolean).join(', ')
		},
		// the boxes in trouble first
		sorted() {
			return [...(this.data?.boxes ?? [])].sort((a, b) => WORST_FIRST[boxLevel(a)] - WORST_FIRST[boxLevel(b)] || a.name.localeCompare(b.name))
		},
	},
	created() {
		this.poller = createPoller({ run: () => this.load(), intervalMs: 30000 })
	},
	mounted() {
		document.addEventListener('visibilitychange', this.onVisibility)
		this.poller.start()
	},
	beforeUnmount() {
		document.removeEventListener('visibilitychange', this.onVisibility)
		this.poller.stop()
	},
	methods: {
		stateLevel,
		onVisibility() {
			this.poller.visibilityChanged()
		},
		async load() {
			const ticket = ++this.ticket
			try {
				const res = await fleetApi.backups()
				const data = res?.data?.data
				if (!Array.isArray(data?.boxes)) {
					throw new TypeError('not a backups answer')
				}
				if (ticket === this.ticket) {
					this.data = data
					this.now = new Date()
					this.error = false
				}
			} catch {
				// including a 409: this node is not a master
				if (ticket === this.ticket) {
					this.error = true
				}
			}
			if (ticket === this.ticket) {
				this.loading = false
			}
		},
		retry() {
			this.loading = true
			this.error = false
			this.poller.now()
		},
		// The alerts settings are a modal of the top bar's menu; open the same one from here.
		openAlerts() {
			return import('../settings/AlertsModal.vue').then(({ default: AlertsModal }) => {
				this.$buefy.modal.open({ component: AlertsModal, hasModalCard: true, trapFocus: true, canCancel: ['escape'], scroll: 'keep', animation: 'zoom-in' })
			})
		},
		isOpen(box) {
			return this.open.includes(box.box_id)
		},
		toggle(box) {
			this.open = this.isOpen(box) ? this.open.filter(id => id !== box.box_id) : [...this.open, box.box_id]
		},
		couples: couplesOf,
		lastOk: lastOkOf,
		next: nextOf,
		lastVerify: lastVerifyOf,
		levelOf: boxLevel,
		age(iso) {
			return ageText(iso, this.now, (key, params) => this.$t(key, params))
		},
		when(iso) {
			const date = iso ? new Date(iso) : null
			return date && date.getFullYear() >= 2000 ? date.toLocaleString() : ''
		},
		readText(box) {
			return box.polled_at ? this.$t('Last read {age}', { age: this.age(box.polled_at) }) : this.$t('Never read')
		},
		stateWord(state) {
			return this.$t(BACKUP_WORDS[state] ?? BACKUP_WORDS.unknown)
		},
		// the box's state in one word; a box that cannot be vouched for says so instead of its last state
		boxWord(box) {
			if (!box.online) {
				return this.$t('Offline')
			}
			if (box.stale) {
				return this.$t('Out of date')
			}
			const level = boxLevel(box)
			if (level === 'ok') {
				return this.stateWord('ok')
			}
			if (level === 'danger') {
				// danger without a failed state is a failed verification
				return box.state === 'failed' ? this.stateWord('failed') : this.$t('Verification failed')
			}
			// a state that says ok on a box that is not green is not a reason to look away
			return this.stateWord(box.state === 'ok' ? 'unknown' : box.state)
		},
		verifyWord(couple) {
			return this.$t(VERIFY_WORDS[couple.verify?.state] ?? VERIFY_WORDS.unknown)
		},
		// only a passed verification is green; running, not_verifiable, none and unknown are grey
		verifyLevel(couple) {
			const state = couple.verify?.state
			if (state === 'passed') {
				return 'ok'
			}
			return state === 'failed' ? 'danger' : 'none'
		},
		checkWord(couple) {
			return `${this.$t('Integrity check')}: ${couple.restic_check.ok ? this.$t('Passed') : this.$t('Failed')}`
		},
	},
}
</script>

<style lang="scss" scoped>
.fleet-backups-notify,
.fleet-backups-summary {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem 0.75rem;
	align-items: center;
	margin-bottom: 0.75rem;
	padding: 0.625rem 0.875rem;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 0.875rem;
	background: rgba(255, 255, 255, 0.06);
}

.fleet-backups-notify {
	border-color: #ffb44c;
}

.fleet-backups-notify-text {
	flex: 1 1 14rem;
}

.fleet-backups-summary {
	&.is-ok {
		border-color: #3dd26b;
	}

	&.is-danger {
		border-color: #f14668;
	}

	&.is-warning {
		border-color: #ffb44c;
	}
}

.fleet-backups-toggle {
	display: inline-flex;
	gap: 0.5rem;
	align-items: center;
	min-height: 2.25rem;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
}

.fleet-backups-state {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	align-items: center;
}

.fleet-backups-error,
.fleet-backups-box-error {
	margin-top: 0.25rem;
	color: #f14668;
	overflow-wrap: anywhere;
}

.fleet-backups-couples {
	width: 100%;
	background: transparent;
}
</style>
