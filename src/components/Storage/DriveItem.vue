<!--
 * @Author: JerryK
 * @Date: 2022-01-20 13:21:23
 * @LastEditors: zhanghengxin ezreal.ice@icloud.com
 * @LastEditTime: 2022-09-29 22:17:58
 * @Description:
 * @FilePath: /CasaOS-UI/src/components/Storage/DriveItem.vue
-->
<template>
	<div class="drive">
		<span :class="`is-${health}`" class="_tile"><b-icon :icon="/usb/i.test(item.disk_type || '') ? 'usb-flash-drive-outline' : 'harddisk'" /></span>
		<div class="_text">
			<p class="_name">{{ item.model || item.name }}</p>
			<p class="is-size-7 _has-text-gray">{{ [item.name, item.disk_type, renderSize(item.size)].filter(Boolean).join(' · ') }}</p>
		</div>
		<!-- what it carries: where its partitions are mounted, or that it is free -->
		<p class="_carries is-size-7">
			<template v-if="mounts.length">{{ mounts.join(', ') }}</template>
			<span v-else class="_has-text-gray">{{ $t('Free drive') }}</span>
		</p>
		<p class="_health is-size-7">
			<span :class="`is-${health}`" class="_dot"></span>
			<b v-if="health === 'passed'" class="has-text-success">{{ $t('Healthy') }}</b>
			<b v-else-if="health === 'failed'" class="has-text-danger">{{ $t('Damage') }}</b>
			<b v-else class="_has-text-gray has-text-weight-normal">{{ $t('N/A') }}</b>
		</p>
		<p class="_temp is-size-7">
			<template v-if="item.temperature > 0">{{ item.temperature }}°C <span class="_has-text-gray">/ {{ toFahrenheit(item.temperature) }}°F</span></template>
			<span v-else class="_has-text-gray">—</span>
		</p>
	</div>
</template>

<script>
import { mixin } from '@/mixins/mixin'

export default {
	name: 'drive-item',
	mixins: [mixin],
	props: {
		item: {
			type: Object,
			default: null,
		},
	},
	computed: {
		health() {
			return this.smartHealth(this.item)
		},
		// the mount points of its partitions, the ones that are mounted
		mounts() {
			return (this.item.children || []).map(part => part.mount_point).filter(point => point && point !== '-')
		},
	},
}
</script>

<style lang="scss" scoped>
// one row of the drives table; the head of the table is in the storage manager, with the same columns
.drive {
	display: grid;
	grid-template-columns: 2.5rem minmax(0, 1.6fr) minmax(0, 1.2fr) 8rem 7rem;
	gap: 0.875rem;
	align-items: center;
	padding: 0.75rem 1rem;

	& + .drive {
		border-top: 1px solid var(--casa-divider-soft);
	}

	._tile {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: var(--casa-hover-tint);
		color: var(--casa-text-hint);

		&.is-passed {
			background: rgba($primary, 0.12);
			color: $primary;
		}

		&.is-failed {
			background: rgba($danger, 0.16);
			color: $danger;
		}
	}

	._text {
		min-width: 0;
	}

	._name {
		overflow: hidden;
		font-weight: 600;
		color: var(--casa-text-strong);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	._carries {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	._health {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	._dot {
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: rgba(128, 128, 128, 0.5);

		&.is-passed {
			background: $success;
		}

		&.is-failed {
			background: $danger;
		}
	}

	._temp {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	// a phone keeps the drive, its health and its temperature; what it carries goes under the name
	@media (max-width: 768px) {
		grid-template-columns: 2.5rem minmax(0, 1fr) auto;

		._carries {
			display: none;
		}

		._temp {
			grid-column: 3;
		}
	}
}
</style>
