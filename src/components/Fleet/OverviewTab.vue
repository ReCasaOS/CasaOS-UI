<template>
	<div class="fleet-overview">
		<div v-if="error" class="fleet-error" role="status">
			<span>{{ $t('The fleet could not be read.') }}</span>
			<button class="button is-small is-rounded ml-2" type="button" @click="retry">{{ $t('Retry') }}</button>
		</div>

		<template v-else>
			<div class="fleet-toolbar">
				<span class="fleet-toolbar-gap"></span>
				<!-- the master enrols itself once; it is then a box like any other -->
				<b-button v-if="!loading && !rows.some(r => r.self)" rounded size="is-small" @click="addBox(true)">{{ $t('Add this box') }}</b-button>
				<b-button rounded size="is-small" type="is-primary" @click="addBox(false)">{{ $t('Add a box') }}</b-button>
			</div>

			<b-table :data="sorted" :loading="loading" :mobile-cards="false" class="is-size-7" custom-row-key="key">
				<b-table-column v-slot="{ row }" :label="$t('Box')" field="name">
					<span :class="row.online ? 'is-online' : 'is-offline'" aria-hidden="true" class="fleet-dot"></span>
					<span class="is-sr-only">{{ row.online ? $t('Online') : $t('Offline') }}</span>
					<span class="has-text-weight-medium">{{ row.name }}</span>
					<div v-if="!row.online" class="has-text-full-03">{{ $t('Offline since {time}', { time: when(row.lastSeen) }) }}</div>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Version')" field="version">
					<template v-if="row.version">
						<span>{{ row.version.current }}</span>
						<b-tag v-if="row.version.available && row.version.latest" class="ml-1" size="is-small" type="is-info">
							{{ $t('Update available: {version}', { version: row.version.latest }) }}
						</b-tag>
					</template>
					<span v-else class="has-text-full-03">{{ blank(row, 'version') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('System')" field="os">
					<template v-if="row.os">
						<span>{{ row.os.label }}</span>
						<b-tag v-if="supportOf(row.os)" :type="supportOf(row.os)[1]" class="ml-1" size="is-small">{{ $t(supportOf(row.os)[0]) }}</b-tag>
					</template>
					<span v-else class="has-text-full-03">{{ blank(row, 'os') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Applications')" field="apps">
					<template v-if="row.apps">
						<span>{{ row.apps.running }}/{{ row.apps.total }}</span>
						<b-tag v-if="row.apps.down" class="ml-1" size="is-small" type="is-danger">{{ $t('{n} down', { n: row.apps.down }) }}</b-tag>
					</template>
					<span v-else class="has-text-full-03">{{ blank(row, 'grid') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Virtual Machines')" field="vms">
					<span v-if="row.vms">{{ row.vms.running }}/{{ row.vms.total }}</span>
					<span v-else class="has-text-full-03">{{ blank(row, 'vms') }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('CPU')" field="cpu" numeric>
					<span :class="{ 'has-text-full-03': row.cpu === null }">{{ row.cpu === null ? blank(row, 'utilization') : pct(row.cpu) }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Memory')" field="mem" numeric>
					<span :class="{ 'has-text-full-03': row.mem === null }">{{ row.mem === null ? blank(row, 'utilization') : pct(row.mem) }}</span>
				</b-table-column>
				<b-table-column v-slot="{ row }" :label="$t('Disk')" field="disk" numeric>
					<span :class="{ 'has-text-full-03': row.disk === null }">{{ row.disk === null ? blank(row, 'utilization') : pct(row.disk) }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" label="">
					<b-dropdown :mobile-modal="false" append-to-body aria-role="list" position="is-bottom-left">
						<template #trigger>
							<button :aria-label="$t('Actions')" class="button is-small is-text" type="button">
								<b-icon icon="dots-vertical-outline" pack="casa" />
							</button>
						</template>
						<b-dropdown-item v-if="row.url" aria-role="listitem" has-link>
							<a :href="row.url" rel="noopener" target="_blank">{{ $t('Open') }}</a>
						</b-dropdown-item>
						<b-dropdown-item aria-role="listitem" @click="rename(row)">{{ $t('Rename') }}</b-dropdown-item>
						<b-dropdown-item aria-role="listitem" @click="newCode(row)">{{ $t('New code') }}</b-dropdown-item>
						<b-dropdown-item aria-role="listitem" class="has-text-danger" @click="confirmRemove(row)">{{ $t('Remove') }}</b-dropdown-item>
					</b-dropdown>
				</b-table-column>

				<template #empty>
					<p v-if="!loading" class="has-text-centered py-4 has-text-full-03">{{ $t('No box in the fleet yet') }}</p>
				</template>
			</b-table>
		</template>
	</div>
</template>

<script>
import tabMixin from './tabMixin'
import AddBoxDialog from './AddBoxDialog.vue'
import { overviewRow } from './fleetData'
import { SUPPORT_WORDS } from './fleetWords'
import { fleetApi } from '@/service/fleet'

export default {
	name: 'OverviewTab',
	mixins: [tabMixin],
	data() {
		return {
			sources: ['version', 'os', 'utilization', 'grid', 'vms'],
			intervalMs: 30000,
		}
	},
	computed: {
		sorted() {
			return [...this.rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
		},
	},
	methods: {
		build(box, answers) {
			return overviewRow(box, answers)
		},
		supportOf(os) {
			return SUPPORT_WORDS[os.support] || null
		},
		pct(value) {
			return `${Math.round(value)} %`
		},
		when(iso) {
			const date = new Date(iso)
			return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
		},
		failed(e) {
			this.$buefy.toast.open({ message: e?.response?.data?.message || e?.message || this.$t('Failed: {error}', { error: '' }), type: 'is-danger', queue: false })
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
		newCode(row) {
			this.$buefy.modal.open({
				component: AddBoxDialog,
				hasModalCard: true,
				trapFocus: true,
				canCancel: [],
				props: { rotate: { id: row.id, name: row.name } },
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
.fleet-dot {
	display: inline-block;
	width: 0.6rem;
	height: 0.6rem;
	margin-right: 0.4rem;
	border-radius: 50%;
	background: #f14668;

	&.is-online {
		background: #3dd26b;
	}
}
</style>
