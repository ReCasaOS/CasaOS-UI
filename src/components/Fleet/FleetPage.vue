<template>
	<div class="modal-card fleet-page">
		<header class="modal-card-head">
			<div class="is-flex is-align-items-center is-flex-grow-1">
				<h3 ref="title" class="title is-header mb-0 mr-2" tabindex="-1">{{ $t('Fleet') }}</h3>
			</div>
			<button :aria-label="$t('Close')" class="close-button ml-2" type="button" @click="$emit('close')">
				<b-icon icon="close-outline" pack="casa" />
			</button>
		</header>

		<section class="modal-card-body">
			<!-- one tab at a time is mounted: a hidden tab asks nothing of the boxes -->
			<b-tabs v-model="tab" :animated="false">
				<b-tab-item :label="$t('Overview')" value="overview">
					<overview-tab v-if="tab === 'overview'" />
				</b-tab-item>
				<b-tab-item :label="$t('Containers')" value="containers">
					<containers-tab v-if="tab === 'containers'" />
				</b-tab-item>
				<b-tab-item :label="$t('Virtual Machines')" value="vms">
					<vms-tab v-if="tab === 'vms' && tabs.vms" />
				</b-tab-item>
				<b-tab-item :label="$t('Updates')" value="updates">
					<updates-tab v-if="tab === 'updates' && tabs.updates" />
				</b-tab-item>
			</b-tabs>
		</section>
	</div>
</template>

<script>
import OverviewTab from './OverviewTab.vue'
import ContainersTab from './ContainersTab.vue'

// the two tabs of the next step register here
const TABS = {}

export default {
	name: 'FleetPage',
	components: { OverviewTab, ContainersTab, ...TABS },
	emits: ['close'],
	data() {
		return {
			tab: 'overview',
			tabs: { vms: 'VmsTab' in TABS, updates: 'UpdatesTab' in TABS },
		}
	},
	mounted() {
		this.$refs.title.focus()
	},
}
</script>

<style lang="scss" scoped>
.fleet-page {
	position: relative;

	.modal-card-body {
		position: relative;
		min-height: 16rem;
	}

	:deep(.b-table .table) {
		background: transparent;
	}
}
</style>

<style lang="scss">
// The modal the page opens in: wider than Statistics, the overview has nine columns.
.fleet-modal {
	.animation-content {
		width: 80rem;
		max-width: calc(100vw - 2rem) !important;
	}

	.modal-card.fleet-page {
		width: 100%;
		max-height: calc(100vh - 5rem);

		.modal-card-body {
			overflow-y: auto;
		}
	}
}
</style>
