<template>
	<!-- Files on a tab of its own: the panel sizes itself on this route -->
	<div class="files-tab">
		<FilePanel @close="close" />
	</div>
</template>

<script>
import FilePanel from '@/components/filebrowser/FilePanel.vue'
import events from '@/events/events'

export default {
	name: 'FilesTab',
	components: {
		FilePanel,
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Files')} · ${this.previousTitle}`
		// what the modal's after-enter says: the list views measure themselves
		this.$nextTick(() => this.$EventBus.$emit(events.AFTER_FILES_ENTER))
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
.files-tab {
	position: relative;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
}
</style>
