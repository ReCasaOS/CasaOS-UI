<template>
	<div class="fleet-vms">
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
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.start)">{{ $t('Start') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.shutdown)">{{ $t('Stop') }}</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="act(actions.vm.reboot)">{{ $t('Restart') }}</b-button>
				<b-button :disabled="!selected.length" outlined rounded size="is-small" type="is-danger" @click="confirmForceOff">{{ $t('Force off') }}</b-button>
			</div>

			<div class="fleet-vm-grid">
				<b-loading :active="loading && !rows.length" :is-full-page="false" />

				<article v-for="row in cards" :key="row.key" :aria-label="row.title" :class="{ 'is-checked': isChecked(row) }" class="fleet-vm">
					<header class="fleet-vm-head">
						<div class="fleet-vm-title">
							<h4>{{ row.title }}</h4>
							<div class="fleet-vm-sub">
								<span class="has-text-full-03">{{ $t('on {box}', { box: row.boxName }) }}</span>
								<b-tag v-if="row.state" :type="stateType(row.state)" size="is-small">{{ stateWord(row.state) }}</b-tag>
							</div>
						</div>
						<b-checkbox :aria-label="row.title" :model-value="isChecked(row)" @update:model-value="toggle(row)" />
					</header>
					<dl class="fleet-vm-facts">
						<div>
							<dt class="has-text-full-03">{{ $t('vCPUs') }}</dt>
							<dd>{{ row.vcpus !== null ? row.vcpus : '—' }}</dd>
						</div>
						<div>
							<dt class="has-text-full-03">{{ $t('Memory') }}</dt>
							<dd>{{ row.memoryMib !== null ? $t('{n} MiB', { n: row.memoryMib }) : '—' }}</dd>
						</div>
						<div>
							<dt class="has-text-full-03">{{ $t('OS') }}</dt>
							<dd>{{ row.os || '—' }}</dd>
						</div>
					</dl>
					<footer class="fleet-vm-foot">
						<span class="fleet-row-result"><result-cell :result="results[row.key] || null" /></span>
						<template v-if="row.state === 'running'">
							<button :aria-label="$t('Restart {name}', { name: row.title })" :title="$t('Restart')" class="fleet-icon-button" type="button" @click="act(actions.vm.reboot, [row])"><fleet-icon name="restart" /></button>
							<button :aria-label="$t('Stop {name}', { name: row.title })" :title="$t('Stop')" class="fleet-icon-button" type="button" @click="act(actions.vm.shutdown, [row])"><fleet-icon name="power" /></button>
						</template>
						<button v-else :aria-label="$t('Start {name}', { name: row.title })" :title="$t('Start')" class="fleet-icon-button" type="button" @click="act(actions.vm.start, [row])"><fleet-icon name="play" /></button>
					</footer>
				</article>

				<p v-if="!loading && !cards.length && !unreadable.length" class="fleet-vm-empty has-text-centered py-4 has-text-full-03">{{ $t('No virtual machine matches this filter') }}</p>
			</div>

			<!-- a box whose VMs could not be read is named once, below the cards -->
			<ul v-if="unreadable.length" class="fleet-vm-notes has-text-full-03 is-size-7">
				<li v-for="row in unreadable" :key="row.key">
					<strong>{{ row.boxName }}</strong>: {{ row.error === 'offline' ? $t('Box offline') : $t('Could not be read') }}
				</li>
			</ul>
		</template>
	</div>
</template>

<script>
import tabMixin from './tabMixin'
import ResultCell from './ResultCell.vue'
import FleetIcon from './FleetIcon.vue'
import { actions } from './bulk'
import { VM_FILTERS, countRows, failureCode, sortRows, vmRows } from './fleetData'
import { VM_STATE_WORDS } from './fleetWords'

export default {
	name: 'VmsTab',
	components: { ResultCell, FleetIcon },
	mixins: [tabMixin],
	data() {
		return {
			sources: ['vms'],
			intervalMs: 10000,
			actions,
			boxFilter: '',
			stateFilter: 'all',
		}
	},
	computed: {
		boxes() {
			const seen = new Map()
			this.rows.filter(r => !r.error).forEach(r => seen.set(r.boxId, { id: r.boxId, name: r.boxName }))
			return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
		},
		chips() {
			return [
				{ key: 'all', label: this.$t('All') },
				{ key: 'running', label: this.$t('Running') },
				{ key: 'stopped', label: this.$t('Stopped') },
				{ key: 'attention', label: this.$t('Needs attention') },
			]
		},
		counts() {
			return countRows(this.rows, VM_FILTERS)
		},
		cards() {
			return sortRows(this.rows.filter(r => !r.error && (!this.boxFilter || r.boxId === this.boxFilter) && VM_FILTERS[this.stateFilter](r)))
		},
		unreadable() {
			return sortRows(this.rows.filter(r => r.error && (!this.boxFilter || r.boxId === this.boxFilter)))
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
			if (['crashed', 'shut-off'].includes(state)) {
				return 'is-danger'
			}
			// paused is in between: amber; anything else a box says is shown plain
			return state === 'paused' ? 'is-warning' : 'is-dark'
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
