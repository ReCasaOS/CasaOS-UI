<template>
	<div class="fleet-containers">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<div class="fleet-toolbar">
				<div class="select is-small">
					<select v-model="boxFilter" :aria-label="$t('Box')" class="fleet-filter-box">
						<option value="">{{ $t('All boxes') }}</option>
						<option v-for="box in boxes" :key="box.id" :value="box.id">{{ box.name }}</option>
					</select>
				</div>
				<div class="select is-small">
					<select v-model="stateFilter" :aria-label="$t('State')" class="fleet-filter-state">
						<option value="">{{ $t('All states') }}</option>
						<option v-for="state in states" :key="state" :value="state">{{ stateWord(state) }}</option>
					</select>
				</div>
				<span class="fleet-toolbar-gap"></span>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.start)">{{ $t('Start') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.stop)">{{ $t('Stop') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.app.restart)">{{ $t('Restart') }}</b-button>
				<b-button :disabled="!updatable.length" rounded size="is-small" type="is-primary" @click="act(actions.app.update, updatable)">{{ $t('Update') }}</b-button>
			</div>

			<b-table :checked-rows="checkedRows"
				:custom-is-checked="sameRow"
				:data="filtered"
				:is-row-checkable="row => row.actionable"
				:loading="loading"
				:mobile-cards="false"
				checkable
				class="is-size-7"
				custom-row-key="key"
				@update:checked-rows="checkedRows = $event">
				<b-table-column v-slot="{ row }" :label="$t('Box')" field="boxName">
					<span>{{ row.boxName }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Name')" field="title">
					<!-- a box whose grid could not be read has one row that says so -->
					<span v-if="row.error" class="has-text-full-03">{{ row.error === 'offline' ? $t('Box offline') : $t('Could not be read') }}</span>
					<span v-else :title="row.actionable ? '' : $t('Not controllable from the fleet (a v1 app or a container outside an app)')" :class="{ 'has-text-full-03': !row.actionable }">{{ row.title }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('State')" field="status">
					<b-tag v-if="row.status" :type="stateType(row.status)" size="is-small">{{ stateWord(row.status) }}</b-tag>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Update')" field="updateAvailable">
					<b-tag v-if="row.updateAvailable" size="is-small" type="is-info">{{ $t('Update ready') }}</b-tag>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Result')" field="result">
					<result-cell :result="results[row.key] || null" />
				</b-table-column>
			</b-table>
		</template>
	</div>
</template>

<script>
import tabMixin from './tabMixin'
import ResultCell from './ResultCell.vue'
import { actions } from './bulk'
import { containerRows, failureCode, sortRows } from './fleetData'
import { STATE_WORDS } from './fleetWords'

export default {
	name: 'ContainersTab',
	components: { ResultCell },
	mixins: [tabMixin],
	data() {
		return {
			sources: ['grid'],
			intervalMs: 10000,
			actions,
			boxFilter: '',
			stateFilter: '',
		}
	},
	computed: {
		boxes() {
			const seen = new Map()
			this.rows.forEach(r => seen.set(r.boxId, { id: r.boxId, name: r.boxName }))
			return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
		},
		states() {
			return [...new Set(this.rows.map(r => r.status).filter(Boolean))].sort()
		},
		filtered() {
			return sortRows(this.rows.filter(r => (!this.boxFilter || r.boxId === this.boxFilter) && (!this.stateFilter || r.status === this.stateFilter)))
		},
		updatable() {
			return this.selected.filter(r => r.updateAvailable)
		},
	},
	methods: {
		build(box, answers) {
			if (answers.grid.ok) {
				return containerRows(box, answers.grid.data)
			}
			return [{ key: `${box.id}/!`, boxId: box.id, boxName: box.name, id: '', title: '', status: '', updateAvailable: false, type: '', actionable: false, error: failureCode(answers.grid) }]
		},
		stateWord(status) {
			return STATE_WORDS[status] ? this.$t(STATE_WORDS[status]) : status
		},
		stateType(status) {
			if (status === 'running') {
				return 'is-success'
			}
			return ['exited', 'dead'].includes(status) ? 'is-danger' : 'is-light'
		},
	},
}
</script>
