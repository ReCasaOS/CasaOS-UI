<template>
	<div class="fleet-vms">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<div class="fleet-toolbar">
				<span class="fleet-toolbar-gap"></span>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.start)">{{ $t('Start') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.shutdown)">{{ $t('Stop') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.reboot)">{{ $t('Restart') }}</b-button>
				<b-button :disabled="!selected.length" outlined rounded size="is-small" type="is-danger" @click="confirmForceOff">{{ $t('Force off') }}</b-button>
			</div>

			<b-table :checked-rows="checkedRows"
				:custom-is-checked="sameRow"
				:data="sorted"
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
					<!-- a box whose VMs could not be read has one row that says so -->
					<span v-if="row.error" class="has-text-full-03">{{ row.error === 'offline' ? $t('Box offline') : $t('Could not be read') }}</span>
					<span v-else>{{ row.title }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('State')" field="state">
					<b-tag v-if="row.state" :type="stateType(row.state)" size="is-small">{{ stateWord(row.state) }}</b-tag>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('vCPUs')" field="vcpus" numeric>
					<span v-if="row.vcpus !== null">{{ row.vcpus }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Memory')" field="memoryMib" numeric>
					<span v-if="row.memoryMib !== null">{{ $t('{n} MiB', { n: row.memoryMib }) }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('OS')" field="os">
					<span>{{ row.os }}</span>
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
import { failureCode, sortRows, vmRows } from './fleetData'
import { VM_STATE_WORDS } from './fleetWords'

export default {
	name: 'VmsTab',
	components: { ResultCell },
	mixins: [tabMixin],
	data() {
		return {
			sources: ['vms'],
			intervalMs: 10000,
			actions,
		}
	},
	computed: {
		sorted() {
			return sortRows(this.rows)
		},
	},
	methods: {
		// a box without the module (404) has no VMs and no row
		build(box, answers) {
			if (answers.vms.ok) {
				return vmRows(box, answers.vms.data)
			}
			if (answers.vms.status === 404) {
				return []
			}
			return [{ key: `${box.id}/!`, boxId: box.id, boxName: box.name, id: '', title: '', state: '', vcpus: null, memoryMib: null, os: '', actionable: false, error: failureCode(answers.vms) }]
		},
		stateWord(state) {
			return VM_STATE_WORDS[state] ? this.$t(VM_STATE_WORDS[state]) : state
		},
		stateType(state) {
			if (state === 'running') {
				return 'is-success'
			}
			return state === 'crashed' ? 'is-danger' : 'is-light'
		},
		confirmForceOff() {
			this.$buefy.dialog.confirm({
				title: this.$t('Force off {count} virtual machines?', { count: this.selected.length }),
				message: this.$t('The virtual machine is switched off at once, as if its power were cut, without shutting down its system. What it has not saved is lost and its disk can be damaged.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Force off'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				// the selection as it is when the person confirms
				onConfirm: () => this.act(this.actions.vm['force-off']),
			})
		},
	},
}
</script>
