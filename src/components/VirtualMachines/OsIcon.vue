<template>
	<!-- what a VM runs, as a tile in the theme's colours with the system's own
		mark in its colour -->
	<span :class="`os-icon os-icon-${size}`" :title="$t(info.label)">
		<b-icon :icon="info.icon" :style="info.color ? { color: info.color } : {}" custom-size="mdi-24px" />
	</span>
</template>

<script>
import { osInfo } from './vms'

export default {
	name: 'OsIcon',
	props: {
		os: { type: String, default: '' },
		// sm in the list, lg in the detail's head
		size: { type: String, default: 'sm' },
	},
	computed: {
		info() {
			return osInfo(this.os)
		},
	},
}
</script>

<style lang="scss" scoped>
.os-icon {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	border-radius: 0.5rem;
	color: var(--casa-text-strong);
	background: var(--casa-surface-sunken);
	border: 1px solid var(--casa-border);

	&.os-icon-sm {
		width: 2.25rem;
		height: 2.25rem;
	}

	&.os-icon-lg {
		width: 3rem;
		height: 3rem;

		:deep(.mdi::before) {
			font-size: 30px;
		}
	}
}
</style>
