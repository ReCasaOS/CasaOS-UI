<template>
	<!-- the App Store on a tab of its own, the whole window -->
	<div class="app-store-tab app-panel">
		<AppPanel v-if="configData" id="0" :config-data="configData" :store-id="storeId" state="install"
			@close="close" />
	</div>
</template>

<script>
import AppPanel from '@/components/Apps/AppPanel.vue'

export default {
	name: 'AppStoreTab',
	components: {
		AppPanel,
	},
	data() {
		return {
			// what the grid hands the panel: the Docker networks and the memory
			configData: null,
		}
	},
	computed: {
		// a store app to show at once, as the Syncthing widget asks for
		storeId() {
			return this.$route.query.store || 0
		},
	},
	async mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('App Store')} · ${this.previousTitle}`

		const [networks, utilization] = await Promise.all([
			this.$api.container.getNetworks(),
			this.$api.sys.getUtilization(),
		])
		this.$store.commit('SET_HARDWARE_INFO', utilization.data.data)
		this.configData = {
			networks: networks.data.data,
			memory: utilization.data.data.mem,
		}
	},
	beforeUnmount() {
		document.title = this.previousTitle
	},
	methods: {
		// A tab the dashboard opened can close itself; one opened by hand
		// cannot, and goes to the dashboard instead. The panel closes itself
		// after an install too: the dashboard shows the app coming up.
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
.app-store-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	// the store's modal card, as wide and as tall as the window
	:deep(.modal-card) {
		width: 100% !important;
		height: 100%;
		max-height: 100%;
		margin: 0;
		border-radius: 0;

		._pl {
			margin-left: 0;
		}
	}
}
</style>
