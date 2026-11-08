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

				<div class="fleet-backups-bar">
					<span class="has-text-weight-semibold">{{ $t('{n} selected', { n: selectedRows.length }) }}</span>
					<span class="fleet-backups-bar-gap"></span>
					<b-button :disabled="!selectedRows.length" rounded size="is-small" type="is-primary" @click="backupNow">{{ $t('Back up now') }}</b-button>
					<b-button :disabled="!selectedRows.length" rounded size="is-small" @click="openSchedule">{{ $t('Schedule verification…') }}</b-button>
				</div>

				<b-table :checked-rows="checkedRows"
					:custom-is-checked="sameBox"
					:data="sorted"
					:loading="loading"
					:mobile-cards="false"
					:opened-detailed="open"
					:show-detail-icon="false"
					checkable
					class="is-size-7"
					custom-row-key="box_id"
					detail-key="box_id"
					detailed
					@update:checked-rows="checkedRows = $event">
					<b-table-column v-slot="{ row }" :label="$t('Box')" field="name">
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

					<b-table-column v-slot="{ row }" :label="$t('Result')" field="result">
						<result-cell :result="results[row.box_id] || null" class="fleet-backups-result" />
					</b-table-column>

					<template #detail="{ row }">
						<p v-if="row.error" class="fleet-backups-box-error">{{ row.error }}</p>
						<!-- no couples because nothing could be read is not "nothing is scheduled" -->
						<p v-if="!couples(row).length && neverRead(row)" class="fleet-backups-unread has-text-full-03">{{ $t('Not read yet') }}</p>
						<p v-else-if="!couples(row).length && row.error" class="fleet-backups-unread has-text-full-03">{{ $t('The backups of this box could not be read') }}</p>
						<p v-else-if="!couples(row).length" class="has-text-full-03">{{ $t('No backup is scheduled on this box') }}</p>
						<table v-else class="table is-narrow fleet-backups-couples">
							<thead>
								<tr>
									<th>{{ $t('App') }}</th>
									<th>{{ $t('Destination') }}</th>
									<th>{{ $t('State') }}</th>
									<th>{{ $t('Last run') }}</th>
									<th>{{ $t('Next backup') }}</th>
									<th>{{ $t('Verification') }}</th>
									<th>{{ $t('Actions') }}</th>
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
									<td class="fleet-backups-actions">
										<div class="fleet-backups-buttons">
											<b-button rounded size="is-small" @click="backupOne(row, c)">{{ $t('Back up') }}</b-button>
											<b-button v-if="c.restic" rounded size="is-small" @click="resticCheck(row, c)">{{ $t('Check repository') }}</b-button>
											<b-button v-else
												:disabled="!c.last_ok_stamp"
												:title="c.last_ok_stamp ? '' : $t('Nothing to verify yet: no backup has succeeded')"
												rounded
												size="is-small"
												@click="verifyCouple(row, c)">{{ $t('Verify') }}</b-button>
										</div>
										<result-cell :result="coupleResults[coupleKey(row, c)] || null" />
									</td>
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
import ResultCell from './ResultCell.vue'
import VerificationScheduleModal from './VerificationScheduleModal.vue'
import { actions, runBulk } from './bulk'
import { ageText, boxLevel, couplesOf, lastOkOf, lastVerifyOf, nextOf, stateLevel, summaryOf } from './backupsData'
import { BACKUP_WORDS, VERIFY_WORDS } from './fleetWords'
import { fleetApi } from '@/service/fleet'
import { createPoller } from '@/components/Stats/poller'

const WORST_FIRST = { danger: 0, warning: 1, none: 2, ok: 3 }

export default {
	name: 'BackupsTab',
	components: { BackupMark, ResultCell },
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
			checkedRows: [],
			// box id → { state, message }, the last grouped action's
			results: {},
			// "box/app/destination" → { state, message }, the last action on that couple
			coupleResults: {},
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
		// the ticked boxes as the list has them now, as the rows a grouped action takes
		selectedRows() {
			const ids = new Set(this.checkedRows.map(r => r.box_id))
			return (this.data?.boxes ?? []).filter(b => ids.has(b.box_id)).map(b => ({ key: b.box_id, id: b.box_id, name: b.name }))
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
		clearTimeout(this.refreshTimer)
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
		sameBox(a, b) {
			return a.box_id === b.box_id
		},
		coupleKey: (box, c) => `${box.box_id}/${c.app}/${c.destination}`,
		// the box answers at once and runs on: read again a moment later
		refreshSoon() {
			clearTimeout(this.refreshTimer)
			this.refreshTimer = setTimeout(() => this.poller.now(), 3000)
		},
		// One call per row, a result per row, kept in `store` under the row's key.
		async act(call, rows, store, keep = false) {
			const running = Object.fromEntries(rows.map(r => [r.key, { state: 'running', message: '' }]))
			this[store] = keep ? { ...this[store], ...running } : running
			const done = await runBulk(rows, call)
			this[store] = { ...this[store], ...Object.fromEntries(done) }
			this.refreshSoon()
		},
		backupNow() {
			return this.act(actions.box.backupNow, this.selectedRows, 'results')
		},
		couple(box, c, call) {
			return this.act(call, [{ key: this.coupleKey(box, c), id: box.box_id }], 'coupleResults', true)
		},
		backupOne(box, c) {
			return this.couple(box, c, row => actions.box.backupOne(row, { app: c.app, destination: c.destination }))
		},
		verifyCouple(box, c) {
			return this.couple(box, c, row => actions.box.verifyCouple(row, { app: c.app, destination: c.destination, stamp: c.last_ok_stamp }))
		},
		resticCheck(box, c) {
			return this.couple(box, c, row => actions.box.resticCheck(row, { destination: c.destination }))
		},
		openSchedule() {
			const rows = this.selectedRows
			const carried = (this.data?.boxes ?? []).find(b => b.verification_schedule && rows.some(r => r.id === b.box_id))
			this.$buefy.modal.open({
				component: VerificationScheduleModal,
				props: { rows, current: carried?.verification_schedule ?? null, afterApply: () => this.refreshSoon() },
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},
		// the box has never been read: no couples because there was nothing to read from
		neverRead(box) {
			return !box.polled_at || new Date(box.polled_at).getFullYear() < 2000
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

.fleet-backups-bar {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
	margin-bottom: 0.5rem;
}

.fleet-backups-bar-gap {
	flex: 1 1 auto;
}

.fleet-backups-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}

// a refusal names an app and a reason: let it wrap
.fleet-backups-actions :deep(.fleet-result),
.fleet-backups-result :deep(.fleet-result) {
	white-space: normal;
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
