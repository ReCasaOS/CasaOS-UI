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
					<vms-tab v-if="tab === 'vms'" />
				</b-tab-item>
				<b-tab-item :label="$t('Updates')" value="updates">
					<updates-tab v-if="tab === 'updates'" />
				</b-tab-item>
			</b-tabs>
		</section>
	</div>
</template>

<script>
import OverviewTab from './OverviewTab.vue'
import ContainersTab from './ContainersTab.vue'
import VmsTab from './VmsTab.vue'
import UpdatesTab from './UpdatesTab.vue'

export default {
	name: 'FleetPage',
	components: { OverviewTab, ContainersTab, VmsTab, UpdatesTab },
	emits: ['close'],
	data() {
		return {
			tab: 'overview',
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

	// what every tab shares: its button bar, and the line it shows when the fleet cannot be read
	:deep(.fleet-toolbar) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;

		.fleet-toolbar-gap {
			flex-grow: 1;
		}
	}

	// the filter chips, the status dot and the row buttons of every tab
	:deep(.fleet-chip) {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 2.25rem;
		padding: 0 0.875rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 1.125rem;
		background: rgba(255, 255, 255, 0.06);
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

	:deep(.fleet-chip-count) {
		font-size: 0.75rem;
		opacity: 0.85;
	}

	:deep(.fleet-dot) {
		display: inline-block;
		flex: none;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: #f14668;

		&.is-online {
			background: #3dd26b;
		}
	}

	:deep(.fleet-icon-button) {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;

		&:hover {
			background: rgba(255, 255, 255, 0.12);
		}

		&:focus-visible {
			outline: 2px solid #fff;
			outline-offset: 2px;
		}
	}

	// the Containers and Virtual Machines tabs
	:deep(.fleet-filters) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;

		.fleet-toolbar-gap {
			flex-grow: 1;
		}

		.fleet-search {
			width: 12rem;
		}
	}

	:deep(.fleet-selectbar) {
		padding: 0.5rem 0.875rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.06);
	}

	:deep(.fleet-list) {
		position: relative;
		min-height: 6rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.04);
		overflow: hidden;
	}

	:deep(.fleet-group-head) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
		min-height: 3.25rem;
		padding: 0.25rem 1rem 0.25rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);

		h4 {
			margin: 0;
			font-size: 1rem;
			font-weight: 600;
		}
	}

	:deep(.fleet-group + .fleet-group) {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	:deep(.fleet-group-note) {
		padding: 0.75rem 1.25rem;
		font-size: 0.8125rem;
	}

	:deep(.fleet-row) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 0.75rem;
		align-items: center;
		min-height: 4rem;
		padding: 0.25rem 1rem 0.25rem 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);

		&.is-checked {
			background: rgba(59, 130, 246, 0.1);
		}

		&.is-readonly .fleet-row-title {
			opacity: 0.7;
		}
	}

	:deep(.fleet-letter) {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		color: #fff;
		font-weight: 700;
	}

	:deep(.fleet-row-title) {
		flex: 1 1 10rem;
		min-width: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	:deep(.fleet-row-tags) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		flex: 0 0 12rem;
	}

	:deep(.fleet-row-result) {
		flex: 0 1 11rem;
		min-width: 0;
		font-size: 0.8125rem;
	}

	:deep(.fleet-row-actions) {
		display: flex;
		gap: 0.375rem;
		margin-left: auto;
	}

	:deep(.fleet-vm-grid) {
		position: relative;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: 1rem;
		min-height: 6rem;
	}

	:deep(.fleet-vm-empty) {
		grid-column: 1 / -1;
	}

	:deep(.fleet-vm) {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		min-width: 0;
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.06);

		&.is-checked {
			border-color: rgba(59, 130, 246, 0.7);
			background: rgba(59, 130, 246, 0.1);
		}
	}

	:deep(.fleet-vm-head) {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	:deep(.fleet-vm-title) {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;

		h4 {
			margin: 0;
			font-size: 1.125rem;
			font-weight: 600;
			line-height: 1.2;
			overflow-wrap: anywhere;
		}
	}

	:deep(.fleet-vm-sub) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: center;
		font-size: 0.8125rem;
	}

	:deep(.fleet-vm-facts) {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.625rem;
		margin: 0;
		padding: 0.625rem 0.75rem;
		border-radius: 0.625rem;
		background: rgba(255, 255, 255, 0.05);

		dt {
			font-size: 0.75rem;
		}

		dd {
			margin: 0;
			font-weight: 600;
			overflow-wrap: anywhere;
		}
	}

	:deep(.fleet-vm-foot) {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 2.75rem;
		margin-top: auto;

		.fleet-row-result {
			flex: 1;
		}
	}

	:deep(.fleet-vm-notes) {
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}

	:deep(.fleet-error) {
		display: flex;
		align-items: center;
		padding: 1rem;
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
