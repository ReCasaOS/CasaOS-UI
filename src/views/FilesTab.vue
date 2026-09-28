<template>
	<!-- Files on a tab of its own: the panel sizes itself on this route -->
	<div class="files-tab">
		<FilePanel ref="panel" @close="close" />
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
		window.addEventListener('beforeunload', this.holdUploads)
	},
	beforeUnmount() {
		window.removeEventListener('beforeunload', this.holdUploads)
		document.title = this.previousTitle
	},
	methods: {
		// A tab the dashboard opened can close itself; one opened by hand
		// cannot, and goes to the dashboard instead. A tab the user kept open
		// at the upload prompt stays where it is.
		close() {
			this.uploadsHeld = false
			window.close()
			if (!window.closed && !this.uploadsHeld) {
				this.$router.push('/')
			}
		},

		// The modal stayed mounted once closed, and an upload carried on behind
		// it; closing the tab unloads the page and stops the upload half way.
		// The browser asks first, for the close icon (window.close() goes
		// through this prompt) and for Ctrl+W alike.
		holdUploads(event) {
			if (!this.$refs.panel?.uploaderInstance?.isUploading?.()) {
				return
			}
			this.uploadsHeld = true
			event.preventDefault()
			// what browsers before Chrome 119 wait for instead
			event.returnValue = true
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
