<template>
	<!-- the virtual machines on a tab of their own, the whole window -->
	<div class="vm-tab">
		<VmPage :select-id="selectId" @close="close" />
	</div>
</template>

<script>
import VmPage from './VmPage.vue'

export default {
	name: 'VmTab',
	components: {
		VmPage,
	},
	computed: {
		// #/vms?vm=<id>: the tab opened from a VM tile of the app grid
		selectId() {
			const vm = this.$route?.query?.vm
			return typeof vm === 'string' ? vm : ''
		},
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Virtual Machines')} · ${this.previousTitle}`
	},
	beforeUnmount() {
		document.title = this.previousTitle
	},
	methods: {
		// A tab the dashboard opened can close itself; one opened by hand
		// cannot, and goes to the dashboard instead.
		close() {
			window.close()
			if (!window.closed) {
				this.$router.push('/')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	:deep(.modal-card.vm-page) {
		width: 100%;
		height: 100%;
		max-height: 100%;
		margin: 0;
		border-radius: 0;

		.modal-card-body {
			overflow-y: auto;
		}
	}
}
</style>
