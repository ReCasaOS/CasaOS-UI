<template>
	<div class="fleet-containers">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<div class="fleet-filters">
				<button v-for="chip in chips" :key="chip.key" :aria-pressed="stateFilter === chip.key" :class="{ 'is-selected': stateFilter === chip.key }" class="fleet-chip" type="button" @click="stateFilter = chip.key">
					{{ chip.label }}
					<span class="fleet-chip-count">{{ counts[chip.key] }}</span>
				</button>
				<span class="fleet-toolbar-gap"></span>
				<input v-model="search" :aria-label="$t('Search')" :placeholder="$t('Search')" class="input is-small fleet-search" type="search">
				<div class="select is-small">
					<select v-model="boxFilter" :aria-label="$t('Box')" class="fleet-filter-box">
						<option value="">{{ $t('All boxes') }}</option>
						<option v-for="box in boxes" :key="box.id" :value="box.id">{{ box.name }}</option>
					</select>
				</div>
			</div>

			<div class="fleet-toolbar fleet-selectbar">
				<span class="has-text-weight-semibold">{{ $t('{count} selected', { count: selected.length }) }}</span>
				<span class="fleet-toolbar-gap"></span>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.start)">{{ $t('Start') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.stop)">{{ $t('Stop') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.restart)">{{ $t('Restart') }}</b-button>
				<b-button :disabled="!updatable.length" rounded size="is-small" type="is-primary" @click="act(actions.app.update, updatable)">{{ $t('Update') }}</b-button>
			</div>

			<div class="fleet-list">
				<b-loading :active="loading && !rows.length" :is-full-page="false" />

				<section v-for="group in groups" :key="group.id" :aria-label="group.name" class="fleet-group">
					<header class="fleet-group-head">
						<b-checkbox :aria-label="$t('Select all of {name}', { name: group.name })" :disabled="!actionableOf(group.rows).length" :model-value="allChecked(group.rows)" @update:model-value="toggleAll(group.rows)" />
						<h4>{{ group.name }}</h4>
						<span :class="group.error ? 'is-offline' : 'is-online'" aria-hidden="true" class="fleet-dot"></span>
						<span class="is-size-7">{{ groupStatus(group) }}</span>
						<span v-if="!group.error" class="is-size-7 has-text-full-03">{{ $t('{running} of {total} running', { running: runningIn(group), total: totalIn(group) }) }}</span>
					</header>

					<!-- a box whose grid could not be read says so once, instead of a row -->
					<p v-if="group.error" class="fleet-group-note has-text-full-03">{{ group.error === 'offline' ? $t('Box offline') : $t('Could not be read') }}</p>

					<div v-for="row in group.rows" :key="row.key" :class="{ 'is-readonly': !row.actionable, 'is-checked': isChecked(row) }" class="fleet-row">
						<b-checkbox :aria-label="row.title" :disabled="!row.actionable" :model-value="isChecked(row)" @update:model-value="toggle(row)" />
						<span :style="{ background: `hsl(${hue(row.title)}, 45%, 32%)` }" aria-hidden="true" class="fleet-letter">{{ row.title.charAt(0).toUpperCase() }}</span>
						<span :title="row.actionable ? '' : $t('Not controllable from the fleet (a v1 app or a container outside an app)')" class="fleet-row-title">{{ row.title }}</span>
						<span class="fleet-row-tags">
							<b-tag v-if="row.status" :type="stateType(row.status)" size="is-small">{{ stateWord(row.status) }}</b-tag>
							<b-tag v-if="row.updateAvailable" size="is-small" type="is-info">{{ $t('Update ready') }}</b-tag>
							<b-tag v-if="!row.actionable" :title="$t('Not controllable from the fleet (a v1 app or a container outside an app)')" size="is-small">{{ $t('View only') }}</b-tag>
						</span>
						<!-- its own slot, empty or not, so that the tags never wrap around it and the columns stay aligned -->
						<span class="fleet-row-backup"><backup-mark v-if="backupMarks[row.key]" v-bind="backupMarks[row.key]" /></span>
						<span class="fleet-row-result"><result-cell :result="results[row.key] || null" /></span>
						<span v-if="row.actionable" class="fleet-row-actions">
							<template v-if="row.status === 'running'">
								<button :aria-label="$t('Restart {name}', { name: row.title })" :title="$t('Restart')" class="fleet-icon-button" type="button" @click="act(actions.app.restart, [row])"><fleet-icon name="restart" /></button>
								<button :aria-label="$t('Stop {name}', { name: row.title })" :title="$t('Stop')" class="fleet-icon-button" type="button" @click="act(actions.app.stop, [row])"><fleet-icon name="stop" /></button>
							</template>
							<button v-else :aria-label="$t('Start {name}', { name: row.title })" :title="$t('Start')" class="fleet-icon-button" type="button" @click="act(actions.app.start, [row])"><fleet-icon name="play" /></button>
							<button v-if="row.updateAvailable" :aria-label="$t('Update {name}', { name: row.title })" :title="$t('Update')" class="fleet-icon-button" type="button" @click="act(actions.app.update, [row])"><fleet-icon name="update" /></button>
						</span>
					</div>
				</section>

				<p v-if="!loading && !groups.length" class="has-text-centered py-4 has-text-full-03">{{ $t('No container matches this filter') }}</p>
			</div>
		</template>
	</div>
</template>

<script>
import tabMixin from './tabMixin'
import ResultCell from './ResultCell.vue'
import FleetIcon from './FleetIcon.vue'
import BackupMark from './BackupMark.vue'
import { badgeFor, vouchedFor } from './backupsData'
import { actions } from './bulk'
import { CONTAINER_FILTERS, containerRows, countRows, failureCode, groupByBox, sortRows } from './fleetData'
import { STATE_WORDS } from './fleetWords'
import { badgeOfApp } from '@/components/backup/backupStatus'
import { fleetApi } from '@/service/fleet'

export default {
	name: 'ContainersTab',
	components: { ResultCell, FleetIcon, BackupMark },
	mixins: [tabMixin],
	data() {
		return {
			sources: ['grid'],
			intervalMs: 10000,
			actions,
			boxFilter: '',
			stateFilter: 'all',
			search: '',
			// box id → that box's backups as the master last read them; empty when they could not be read
			backupBoxes: {},
			backupTicket: 0,
		}
	},
	computed: {
		boxes() {
			const seen = new Map()
			this.rows.forEach(r => seen.set(r.boxId, { id: r.boxId, name: r.boxName }))
			return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
		},
		chips() {
			return [
				{ key: 'all', label: this.$t('All') },
				{ key: 'running', label: this.$t('Running') },
				{ key: 'stopped', label: this.$t('Stopped') },
				{ key: 'update', label: this.$t('To update') },
			]
		},
		counts() {
			return countRows(this.rows, CONTAINER_FILTERS)
		},
		// a box that could not be read keeps its line, unless a filter or a search is looking for containers
		filtered() {
			const text = this.search.trim().toLowerCase()
			const narrowed = this.stateFilter !== 'all' || text !== ''
			const keep = r => (!this.boxFilter || r.boxId === this.boxFilter) && (r.error ? !narrowed : CONTAINER_FILTERS[this.stateFilter](r) && (!text || r.title.toLowerCase().includes(text)))
			return sortRows(this.rows.filter(keep))
		},
		groups() {
			return groupByBox(this.filtered)
		},
		// row key → { level, label } for the compose apps that have a backup schedule; built once for the rows and backups
		backupMarks() {
			const marks = {}
			for (const row of this.rows) {
				const box = row.error || row.type !== 'v2app' ? null : this.backupBoxes[row.boxId]
				const kind = box ? badgeFor(box, row.id) : null
				if (!kind) {
					continue
				}
				// a box the master cannot vouch for says nothing of what it stored last; a failed verification has its own word
				const own = vouchedFor(box) ? badgeOfApp(box.couples, row.id, this.$t) : null
				const label = own?.kind === kind ? own.title : this.$t(kind === 'failed' ? 'Verification failed' : 'Backup state unknown')
				marks[row.key] = { level: { ok: 'ok', failed: 'danger', attention: 'none' }[kind], label }
			}
			return marks
		},
		updatable() {
			return this.selected.filter(r => r.updateAvailable)
		},
	},
	methods: {
		// the backups are read with the containers, once for the pass; a failure leaves the containers and no mark
		load() {
			return Promise.all([tabMixin.methods.load.call(this), this.readBackups()])
		},
		async readBackups() {
			const ticket = ++this.backupTicket
			let boxes = {}
			try {
				const list = (await fleetApi.backups())?.data?.data?.boxes
				if (Array.isArray(list)) {
					boxes = Object.fromEntries(list.map(b => [b.box_id, b]))
				}
			} catch {}
			if (ticket === this.backupTicket) {
				this.backupBoxes = boxes
			}
		},
		build(box, answers) {
			if (answers.grid.ok) {
				return containerRows(box, answers.grid.data)
			}
			return [{ key: `${box.id}/!`, boxId: box.id, boxName: box.name, id: '', title: '', status: '', updateAvailable: false, type: '', actionable: false, error: failureCode(answers.grid) }]
		},
		// the counts of a box are the box's own, not the filter's
		runningIn(group) {
			return this.rows.filter(r => r.boxId === group.id && r.status === 'running').length
		},
		totalIn(group) {
			return this.rows.filter(r => r.boxId === group.id && !r.error).length
		},
		groupStatus(group) {
			if (!group.error) {
				return this.$t('Online')
			}
			return group.error === 'offline' ? this.$t('Offline') : this.$t('Could not be read')
		},
		// a stable colour for an app without an icon, from its name
		hue(title) {
			return [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
		},
		stateWord(status) {
			return STATE_WORDS[status] ? this.$t(STATE_WORDS[status]) : status
		},
		stateType(status) {
			if (status === 'running') {
				return 'is-success'
			}
			if (['exited', 'dead'].includes(status)) {
				return 'is-danger'
			}
			// paused and restarting are in between: amber; anything else a box says is shown plain
			return ['paused', 'restarting'].includes(status) ? 'is-warning' : 'is-dark'
		},
	},
}
</script>
