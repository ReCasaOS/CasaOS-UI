<template>
	<div class="fleet-overview">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<section :aria-label="$t('Boxes')" class="fleet-summary">
				<div class="fleet-stat">
					<div class="fleet-stat-label">{{ $t('Boxes') }}</div>
					<div class="fleet-stat-value">{{ summary.online }} / {{ summary.boxes }}</div>
					<div class="fleet-stat-note">
						<span class="has-text-full-03">{{ $t('Online') }}</span>
						<b-tag v-if="summary.offline" size="is-small" type="is-danger">{{ $t('{n} offline', { n: summary.offline }) }}</b-tag>
					</div>
				</div>
				<div class="fleet-stat">
					<div class="fleet-stat-label">{{ $t('Applications') }}</div>
					<div class="fleet-stat-value">{{ summary.appsRunning }} / {{ summary.appsTotal }}</div>
					<div class="fleet-stat-note">
						<span class="has-text-full-03">{{ $t('Running') }}</span>
						<b-tag v-if="summary.appsDown" size="is-small" type="is-danger">{{ $t('{n} down', { n: summary.appsDown }) }}</b-tag>
					</div>
				</div>
				<div class="fleet-stat">
					<div class="fleet-stat-label">{{ $t('Virtual Machines') }}</div>
					<div class="fleet-stat-value">{{ summary.vmsRunning }} / {{ summary.vmsTotal }}</div>
					<div class="fleet-stat-note">
						<span class="has-text-full-03">{{ $t('Running') }}</span>
					</div>
				</div>
				<div class="fleet-stat">
					<div class="fleet-stat-label">{{ $t('Updates') }}</div>
					<div class="fleet-stat-value">{{ summary.toUpdate }}</div>
					<div class="fleet-stat-note">
						<span class="has-text-full-03">{{ $t('Boxes to update') }}</span>
						<b-tag v-if="summary.appUpdates === 1" size="is-small" type="is-info">{{ $t('{n} app to update', { n: 1 }) }}</b-tag>
						<b-tag v-else-if="summary.appUpdates > 1" size="is-small" type="is-info">{{ $t('{n} apps to update', { n: summary.appUpdates }) }}</b-tag>
					</div>
				</div>
			</section>

			<div class="fleet-toolbar">
				<button v-for="chip in chips" :key="chip.key" :aria-pressed="filter === chip.key" :class="{ 'is-selected': filter === chip.key }" class="fleet-chip" type="button" @click="filter = chip.key">
					{{ chip.label }}
					<span class="fleet-chip-count">{{ counts[chip.key] }}</span>
				</button>
				<span class="fleet-toolbar-gap"></span>
				<label class="has-text-full-03 is-size-7" for="fleet-sort">{{ $t('Sort by') }}</label>
				<div class="select is-small">
					<select id="fleet-sort" v-model="sort">
						<option value="name">{{ $t('Name') }}</option>
						<option value="state">{{ $t('State') }}</option>
					</select>
				</div>
				<!-- the master enrols itself once; it is then a box like any other -->
				<b-button v-if="!loading && !rows.some(r => r.self)" rounded size="is-small" @click="addBox(true)">{{ $t('Add this box') }}</b-button>
				<b-button rounded size="is-small" type="is-primary" @click="addBox(false)">{{ $t('Add a box') }}</b-button>
			</div>

			<div class="fleet-boxes">
				<b-loading :active="loading && !rows.length" :is-full-page="false" />

				<article v-for="row in shown" :key="row.key" :aria-label="row.name" :class="{ 'is-offline': !row.online, 'is-recode': row.needsRecode }" class="fleet-card">
					<header class="fleet-card-head">
						<div class="fleet-card-title">
							<div class="fleet-card-name">
								<h4>{{ row.name }}</h4>
								<b-tag v-if="row.self" size="is-small">{{ $t('This box') }}</b-tag>
								<b-tag v-if="row.needsRecode" size="is-small" type="is-warning">{{ $t('New code needed') }}</b-tag>
							</div>
							<div class="fleet-card-status">
								<span :class="row.online ? 'is-online' : 'is-offline'" aria-hidden="true" class="fleet-dot"></span>
								<span v-if="!row.online">{{ offlineText(row) }}</span>
								<span v-else-if="row.pending" class="has-text-full-03">{{ $t('Loading…') }}</span>
								<span v-else>{{ $t('Online') }}</span>
							</div>
						</div>

						<b-dropdown :mobile-modal="false" append-to-body aria-role="list" position="is-bottom-left">
							<template #trigger>
								<button :aria-label="$t('Actions')" :class="row.needsRecode ? 'is-warning' : 'is-text'" class="button fleet-card-menu" type="button">
									<b-icon icon="dots-vertical-outline" pack="casa" />
								</button>
							</template>
							<b-dropdown-item aria-role="listitem" @click="rename(row)">{{ $t('Rename') }}</b-dropdown-item>
							<b-dropdown-item :class="{ 'has-text-warning': row.needsRecode }" aria-role="listitem" @click="newCode(row)">{{ $t('New code') }}</b-dropdown-item>
							<b-dropdown-item aria-role="listitem" class="has-text-danger" @click="confirmRemove(row)">{{ $t('Remove') }}</b-dropdown-item>
						</b-dropdown>
					</header>

					<p v-if="!row.online" class="fleet-card-note">{{ $t('The box is not answering the master: its figures come back as soon as it does.') }}</p>

					<template v-else-if="!row.pending">
						<dl class="fleet-card-facts">
							<dt class="has-text-full-03">{{ $t('Version') }}</dt>
							<dd>
								<template v-if="row.version">
									<span class="has-text-weight-semibold">{{ row.version.current }}</span>
									<b-tag v-if="row.version.available && row.version.latest" size="is-small" type="is-info">{{ $t('Update available: {version}', { version: row.version.latest }) }}</b-tag>
									<b-tag v-else size="is-small" type="is-success">{{ $t('Up to date') }}</b-tag>
								</template>
								<span v-else class="has-text-full-03">{{ blank(row, 'version') }}</span>
							</dd>
							<dt class="has-text-full-03">{{ $t('System') }}</dt>
							<dd>
								<template v-if="row.os">
									<span>{{ row.os.label }}</span>
									<b-tag v-if="supportOf(row.os)" :type="supportOf(row.os)[1]" size="is-small">{{ $t(supportOf(row.os)[0]) }}</b-tag>
								</template>
								<span v-else class="has-text-full-03">{{ blank(row, 'os') }}</span>
							</dd>
						</dl>

						<div class="fleet-card-counts">
							<div class="fleet-count">
								<span class="fleet-count-label has-text-full-03">{{ $t('Applications') }}</span>
								<span class="fleet-count-value">
									<template v-if="row.apps">
										{{ row.apps.running }}/{{ row.apps.total }}
										<b-tag v-if="row.apps.down" size="is-small" type="is-danger">{{ $t('{n} down', { n: row.apps.down }) }}</b-tag>
									</template>
									<span v-else class="has-text-full-03">{{ blank(row, 'grid') }}</span>
								</span>
							</div>
							<div class="fleet-count">
								<span class="fleet-count-label has-text-full-03">{{ $t('Virtual Machines') }}</span>
								<span class="fleet-count-value">
									<template v-if="row.vms">
										{{ row.vms.running }}/{{ row.vms.total }}
										<b-tag v-if="row.vms.running < row.vms.total" size="is-small" type="is-warning">{{ $t('{n} stopped', { n: row.vms.total - row.vms.running }) }}</b-tag>
									</template>
									<span v-else class="has-text-full-03">{{ blank(row, 'vms') }}</span>
								</span>
							</div>
						</div>

						<div class="fleet-meters">
							<div v-for="meter in meters" :key="meter.field" class="fleet-meter">
								<span class="has-text-full-03">{{ $t(meter.label) }}</span>
								<div v-if="row[meter.field] !== null" aria-hidden="true" class="fleet-meter-track">
									<div :class="levelOf(row[meter.field])" :style="{ width: `${Math.min(100, Math.round(row[meter.field]))}%` }"></div>
								</div>
								<span v-else class="fleet-meter-track" aria-hidden="true"></span>
								<span :class="{ 'has-text-full-03': row[meter.field] === null }" class="fleet-meter-value">{{ row[meter.field] === null ? blank(row, 'utilization') : pct(row[meter.field]) }}</span>
							</div>
						</div>
					</template>

					<footer v-if="(row.online && row.url) || row.needsRecode" class="fleet-card-foot">
						<a v-if="row.online && row.url" :href="row.url" class="button fleet-card-button" rel="noopener" target="_blank">{{ $t('Open') }}</a>
						<button v-if="row.needsRecode" class="button is-warning fleet-card-button" type="button" @click="newCode(row)">{{ $t('New code') }}</button>
					</footer>
				</article>

				<p v-if="!loading && !rows.length" class="fleet-boxes-empty has-text-centered py-4 has-text-full-03">{{ $t('No box in the fleet yet') }}</p>
				<p v-else-if="rows.length && !shown.length" class="fleet-boxes-empty has-text-centered py-4 has-text-full-03">{{ $t('No box matches this filter') }}</p>
			</div>
		</template>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import tabMixin from './tabMixin'
import AddBoxDialog from './AddBoxDialog.vue'
import { BOX_FILTERS, filterBoxes, fleetSummary, overviewRow, sortBoxes } from './fleetData'
import { SUPPORT_WORDS } from './fleetWords'
import { fleetApi } from '@/service/fleet'

export default {
	name: 'OverviewTab',
	mixins: [tabMixin],
	data() {
		return {
			sources: ['version', 'os', 'utilization', 'grid', 'vms'],
			intervalMs: 30000,
			filter: 'all',
			sort: 'name',
			meters: [
				{ field: 'cpu', label: 'CPU' },
				{ field: 'mem', label: 'Memory' },
				{ field: 'disk', label: 'Disk' },
			],
		}
	},
	computed: {
		summary() {
			return fleetSummary(this.rows)
		},
		chips() {
			return [
				{ key: 'all', label: this.$t('All') },
				{ key: 'online', label: this.$t('Online') },
				{ key: 'offline', label: this.$t('Offline') },
				{ key: 'update', label: this.$t('To update') },
			]
		},
		counts() {
			return Object.fromEntries(Object.keys(BOX_FILTERS).map(key => [key, filterBoxes(this.rows, key).length]))
		},
		shown() {
			return sortBoxes(filterBoxes(this.rows, this.filter), this.sort)
		},
	},
	methods: {
		build(box, answers) {
			return overviewRow(box, answers)
		},
		pendingRow(box) {
			return { ...overviewRow(box, {}), pending: true }
		},
		supportOf(os) {
			return SUPPORT_WORDS[os.support] || null
		},
		pct(value) {
			return `${Math.round(value)} %`
		},
		// a full disk or a busy processor is amber from 85 %
		levelOf(value) {
			return value >= 85 ? 'is-warning' : ''
		},
		// a box enrolled and never connected has no last_seen: new Date(null) would be 1970
		offlineText(row) {
			const date = row.lastSeen ? new Date(row.lastSeen) : null
			return date && date.getFullYear() >= 2000 ? this.$t('Offline since {time}', { time: date.toLocaleString() }) : this.$t('Never connected')
		},
		// the toast writes its message as HTML: what the core says is escaped
		failed(e) {
			this.$buefy.toast.open({ message: escape(e?.response?.data?.message || e?.message || String(e)), type: 'is-danger', queue: false })
		},
		// The code is shown once: the dialog closes from its own button only, not from Escape or a click outside.
		addBox(self) {
			this.$buefy.modal.open({
				component: AddBoxDialog,
				hasModalCard: true,
				trapFocus: true,
				canCancel: [],
				props: { self },
				events: { added: () => this.poller.now() },
			})
		},
		// A new code replaces the box's key at once and cuts its tunnel: asked first, as Remove is.
		newCode(row) {
			this.$buefy.dialog.confirm({
				title: this.$t('New code for {name}?', { name: row.name }),
				message: this.$t('Its current code stops working: the box must be enrolled again with the new one.'),
				type: 'is-warning',
				hasIcon: true,
				confirmText: this.$t('New code'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.$buefy.modal.open({
					component: AddBoxDialog,
					hasModalCard: true,
					trapFocus: true,
					canCancel: [],
					props: { rotate: { id: row.id, name: row.name } },
				}),
			})
		},
		rename(row) {
			this.$buefy.dialog.prompt({
				message: this.$t('New name'),
				inputAttrs: { value: row.name, maxlength: 64, required: true },
				confirmText: this.$t('Rename'),
				cancelText: this.$t('Cancel'),
				trapFocus: true,
				onConfirm: value => fleetApi.renameBox(row.id, { name: value.trim() }).then(() => this.poller.now(), this.failed),
			})
		},
		confirmRemove(row) {
			this.$buefy.dialog.confirm({
				title: this.$t('Remove {name} from the fleet?', { name: row.name }),
				message: this.$t('Its tunnel is cut and its code no longer works.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Remove'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => fleetApi.removeBox(row.id).then(() => this.poller.now(), this.failed),
			})
		},
	},
}
</script>

<style lang="scss" scoped>
$line: rgba(255, 255, 255, 0.14);
$panel: rgba(255, 255, 255, 0.06);

.fleet-summary {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
	gap: 0.75rem;
	margin-bottom: 1rem;
}

.fleet-stat {
	min-width: 0;
	padding: 0.75rem 1rem;
	border: 1px solid $line;
	border-radius: 0.875rem;
	background: $panel;
}

.fleet-stat-label {
	font-size: 0.75rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	opacity: 0.8;
}

.fleet-stat-value {
	margin: 0.375rem 0;
	font-size: 1.625rem;
	font-weight: 600;
	line-height: 1;
}

.fleet-stat-note {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 0.5rem;
	align-items: center;
	min-height: 1.5rem;
	font-size: 0.75rem;
}

.fleet-chip {
	display: inline-flex;
	gap: 0.5rem;
	align-items: center;
	min-height: 2.25rem;
	padding: 0 0.875rem;
	border: 1px solid $line;
	border-radius: 1.125rem;
	background: $panel;
	color: inherit;
	font: inherit;
	font-weight: 600;
	cursor: pointer;

	&.is-selected {
		border-color: #3b82f6;
		background: #3b82f6;
		color: #fff;
	}

	&:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
}

.fleet-chip-count {
	font-size: 0.75rem;
	opacity: 0.85;
}

.fleet-boxes {
	position: relative;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
	gap: 1rem;
	min-height: 6rem;
}

.fleet-boxes-empty {
	grid-column: 1 / -1;
}

.fleet-card {
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	min-width: 0;
	padding: 1.125rem;
	border: 1px solid $line;
	border-radius: 0.875rem;
	background: $panel;

	&.is-recode {
		border-color: rgba(251, 191, 36, 0.55);
	}
}

.fleet-card-head {
	display: flex;
	gap: 0.5rem;
	align-items: flex-start;
}

.fleet-card-title {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.375rem;
	min-width: 0;
}

.fleet-card-name {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 0.5rem;
	align-items: center;

	h4 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
}

.fleet-card-status {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 0.5rem;
	align-items: center;
	font-size: 0.8125rem;
}

.fleet-card-menu {
	width: 2.75rem;
	height: 2.75rem;
	margin: -0.375rem -0.5rem 0 0;
	padding: 0;
	border-radius: 0.75rem;
}

.fleet-card-note {
	padding: 0.875rem;
	border: 1px solid rgba(248, 113, 113, 0.3);
	border-radius: 0.625rem;
	background: rgba(248, 113, 113, 0.1);
	font-size: 0.8125rem;
	line-height: 1.5;
}

.fleet-card-facts {
	display: grid;
	grid-template-columns: max-content minmax(0, 1fr);
	gap: 0.5rem 0.75rem;
	align-items: center;
	margin: 0;
	font-size: 0.875rem;

	dt {
		font-size: 0.8125rem;
	}

	dd {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: center;
		min-width: 0;
		margin: 0;
	}
}

.fleet-card-counts {
	display: flex;
	gap: 0.625rem;
}

.fleet-count {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.625rem 0.75rem;
	border-radius: 0.625rem;
	background: rgba(255, 255, 255, 0.05);
}

.fleet-count-label {
	font-size: 0.75rem;
}

.fleet-count-value {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 0.5rem;
	align-items: center;
	font-size: 1.125rem;
	font-weight: 600;
}

.fleet-meters {
	display: flex;
	flex-direction: column;
	gap: 0.625rem;
}

.fleet-meter {
	display: grid;
	grid-template-columns: 4.75rem minmax(0, 1fr) 2.75rem;
	gap: 0.625rem;
	align-items: center;
	font-size: 0.8125rem;
}

.fleet-meter-track {
	height: 6px;
	border-radius: 3px;
	background: rgba(255, 255, 255, 0.1);
	overflow: hidden;

	div {
		height: 100%;
		background: #3b82f6;

		&.is-warning {
			background: #fbbf24;
		}
	}
}

.fleet-meter-value {
	font-weight: 600;
	text-align: right;
}

.fleet-card-foot {
	display: flex;
	gap: 0.5rem;
	margin-top: auto;
}

.fleet-card-button {
	flex: 1;
	min-height: 2.75rem;
	border-radius: 0.75rem;
	font-weight: 600;
}

.fleet-dot {
	display: inline-block;
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 50%;
	background: #f14668;

	&.is-online {
		background: #3dd26b;
	}
}
</style>
