<template>
	<div class="fleet-updates">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<div class="fleet-toolbar">
				<span class="fleet-toolbar-gap"></span>
				<b-button :disabled="!releases.length" rounded size="is-small" type="is-primary" @click="confirmRelease">{{ $t('Update ReCasaOS') }} ({{ releases.length }})</b-button>
				<b-button :disabled="!selected.length" rounded size="is-small" @click="confirmPackages">{{ $t('Update packages') }} ({{ selected.length }})</b-button>
				<b-button :disabled="!withApps.length" rounded size="is-small" @click="confirmApps">{{ $t('Update apps') }} ({{ withApps.length }})</b-button>
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
				<b-table-column v-slot="{ row }" :label="$t('Box')" field="name">
					<span class="has-text-weight-medium">{{ row.name }}</span>
					<div v-if="!row.online" class="has-text-full-03">{{ $t('Offline') }}</div>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('ReCasaOS')" field="current">
					<span v-if="isUpdating(row)">{{ $t('Updating…') }}</span>
					<template v-else-if="row.current">
						<span>{{ row.current }}</span>
						<template v-if="row.available && row.latest">
							<span> → {{ row.latest }}</span>
							<b-tag class="ml-1" size="is-small" type="is-info">{{ $t('Update ready') }}</b-tag>
						</template>
					</template>
					<span v-else class="has-text-full-03">{{ blank(row, 'version') }}</span>
					<div v-if="row.self" class="has-text-full-03">{{ $t('Update the master from its own settings') }}</div>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Automatic updates')" field="autoState">
					<span v-if="autoWord(row)">{{ autoWord(row) }}</span>
					<span v-else class="has-text-full-03">{{ blank(row, 'autoupdate') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Applications')" field="appUpdates">
					<span v-if="appRuns[row.id]">{{ runText(appRuns[row.id]) }}</span>
					<span v-else-if="row.appUpdates === 1">{{ $t('{n} app to update', { n: 1 }) }}</span>
					<span v-else-if="row.appUpdates > 1">{{ $t('{n} apps to update', { n: row.appUpdates }) }}</span>
					<span v-else class="has-text-full-03">{{ blank(row, 'grid') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('System packages')" field="packages">
					<!-- read on demand: the route runs apt-get update on the box -->
					<b-button v-if="!packagesText(row)" :disabled="!row.online" :loading="packages[row.id]?.checking === true" rounded size="is-small" @click="checkPackages(row)">{{ $t('Check') }}</b-button>
					<span v-else>{{ packagesText(row) }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Result')" field="result">
					<result-cell :result="results[row.key] || null" />
				</b-table-column>
			</b-table>
		</template>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import tabMixin from './tabMixin'
import ResultCell from './ResultCell.vue'
import { actions, followAppUpdates, followPackages } from './bulk'
import { packagesView, updatesRow } from './fleetData'
import { ask } from './fleetLoader'
import { AUTO_WORDS } from './fleetWords'

export default {
	name: 'UpdatesTab',
	components: { ResultCell },
	mixins: [tabMixin],
	data() {
		return {
			sources: ['version', 'autoupdate', 'grid'],
			intervalMs: 30000,
			actions,
			// box id → the version it had when its update was launched: "Updating…" until it answers another
			updating: {},
			// box id → { checking } | { count } | { error } | the update's status { state, error }
			packages: {},
			// box id → the run of its app updates, or { state, error }
			appRuns: {},
		}
	},
	computed: {
		sorted() {
			return [...this.rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
		},
		// the master's own box is updated from its own settings; a box that is current has nothing to take
		releases() {
			return this.selected.filter(r => !r.self && r.available)
		},
		withApps() {
			return this.selected.filter(r => r.appIds.length > 0)
		},
	},
	watch: {
		// a box back with another version is no longer updating
		rows(rows) {
			for (const row of rows) {
				if (this.updating[row.id] !== undefined && row.online && row.current && row.current !== this.updating[row.id]) {
					delete this.updating[row.id]
				}
			}
		},
	},
	// the followers stop with the tab: a tab switch unmounts it
	beforeUnmount() {
		this.gone = true
	},
	methods: {
		build(box, answers) {
			return { ...updatesRow(box, answers), actionable: box.online === true }
		},
		isUpdating(row) {
			return this.updating[row.id] !== undefined
		},
		autoWord(row) {
			return AUTO_WORDS[row.autoState] ? this.$t(AUTO_WORDS[row.autoState]) : ''
		},
		// what the packages cell says, or nothing while the Check button is the cell
		packagesText(row) {
			const p = this.packages[row.id]
			if (!p || p.checking) {
				return ''
			}
			if (p.state) {
				switch (p.state) {
					case 'succeeded':
						return this.$t('Up to date')
					case 'failed':
						return this.$t('Failed: {error}', { error: p.error || '' })
					case 'offline':
						return this.$t('Box offline')
					default:
						return this.$t('Updating…')
				}
			}
			if (p.error) {
				return p.error === 'offline' ? this.$t('Box offline') : this.$t('Could not be read')
			}
			if (p.supported === false) {
				return p.reason ? this.$t('Not supported: {reason}', { reason: p.reason }) : this.$t('Not supported here')
			}
			return p.count === 0 ? this.$t('Up to date') : this.$t('{count} packages pending', { count: p.count })
		},
		async checkPackages(row) {
			this.packages[row.id] = { checking: true }
			this.packages[row.id] = packagesView(await ask({ id: row.id, online: row.online }, 'packages'))
		},
		// updated/total, the names that failed, an ellipsis while the run goes on
		runText(run) {
			if (run.state) {
				return run.state === 'offline' ? this.$t('Box offline') : this.$t('Failed: {error}', { error: run.error || '' })
			}
			const apps = Array.isArray(run.apps) ? run.apps : []
			const failed = apps.filter(a => a?.state === 'failed').map(a => String(a.id))
			let text = `${apps.filter(a => a?.state === 'updated').length}/${apps.length}`
			if (failed.length) {
				text += ` — ${this.$t('Failed: {error}', { error: failed.join(', ') })}`
			}
			return run.finished_at ? text : `${text} …`
		},
		confirm(title, message, confirmText, onConfirm) {
			this.$buefy.dialog.confirm({ title, message: escape(message), confirmText, cancelText: this.$t('Cancel'), type: 'is-warning', hasIcon: true, onConfirm })
		},
		confirmRelease() {
			this.confirm(
				this.$t('Update ReCasaOS on {count} boxes?', { count: this.releases.length }),
				this.$t('Each box goes offline for a few minutes and comes back with its new version.'),
				this.$t('Update'),
				async () => {
					const rows = this.releases
					const done = await this.act(this.actions.box.update, rows)
					rows.filter(r => done.get(r.key)?.state === 'done').forEach((r) => {
						this.updating[r.id] = r.current
					})
				},
			)
		},
		confirmPackages() {
			this.confirm(
				this.$t('Update the system packages on {count} boxes?', { count: this.selected.length }),
				this.$t('Docker is left out, as on a box.'),
				this.$t('Update packages'),
				async () => {
					const rows = this.selected
					// the core runs its checks before it answers: a start the relay gave up on (504) may be running,
					// and the status route says whether it is
					const late = new Set()
					const call = row => this.actions.box.packages(row).catch((e) => {
						if (e?.response?.status === 504) {
							late.add(row.key)
						}
						throw e
					})
					const done = await this.act(call, rows)
					rows.filter(r => done.get(r.key)?.state === 'done' || late.has(r.key)).forEach((r) => {
						this.packages[r.id] = { state: 'running' }
						if (late.has(r.key)) {
							this.results[r.key] = { state: 'running', message: '' }
						}
						followPackages(r.id, (status) => {
							this.packages[r.id] = status
						}, () => !this.gone).then((last) => {
							if (last.state === 'idle') {
								delete this.packages[r.id]
							}
							if (late.has(r.key)) {
								this.results[r.key] = last.state === 'succeeded'
									? { state: 'done', message: '' }
									: { state: last.state === 'offline' ? 'offline' : 'failed', message: last.error || '504' }
							}
						})
					})
				},
			)
		},
		confirmApps() {
			this.confirm(
				this.$t('Update the apps on {count} boxes?', { count: this.withApps.length }),
				'',
				this.$t('Update apps'),
				async () => {
					const rows = this.withApps
					const done = await this.act(row => this.actions.box.apps(row, row.appIds), rows)
					rows.filter(r => done.get(r.key)?.state === 'done').forEach((r) => {
						followAppUpdates(r.id, (run) => {
							this.appRuns[r.id] = run
						}, () => !this.gone)
					})
				},
			)
		},
	},
}
</script>
