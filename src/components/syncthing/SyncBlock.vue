<template>
	<div class="common-card">

		<div class="blur-background"></div>
		<div class="wuji-content _box is-flex is-flex-direction-column">
			<!-- Init State Start -->
			<h6 class="title is-4 mb-0 has-text-white is-flex-shrink-0">{{ $t(`Sync your data`) }}</h6>
			<div class="is-flex is-align-items-center is-flex-grow-1 _notice-content-text">
				<div class="info ">
					<div class="des two-line is-size-14px">
						{{ $t(`Use Syncthing to sync your files between multiple devices.`) }}
					</div>
				</div>
				<b-image :src="require('@/assets/img/syncthing/sync.svg')" class="is-80x80"></b-image>
			</div>
			<div class="buttons is-flex is-flex-shrink-0 is-flex-direction-row-reverse">
				<b-button class="mb-0" rounded size="is-small" type="is-primary" @click="openSyncPanel">{{
					$t(actionText)
				}}
				</b-button>
			</div>
			<!-- Init State End -->

		</div>
	</div>
</template>

<script>
import { findSyncthing } from './syncthingApp'
import events from '@/events/events'

export default {
	name: 'sync-block',
	data() {
		return {
			isLoading: false,
			isStarting: false,
			syncBaseURL: '',
			isSyncInstalled: false,
			isSyncRunning: false,
			syncPort: '',
			syncId: '',
		}
	},
	created() {
		this.checkSyncStatus()

		this.$EventBus.$on(events.UPDATE_SYNC_STATUS, () => {
			this.checkSyncStatus()
		})
	},
	beforeUnmount() {
		this.$EventBus.$off(events.UPDATE_SYNC_STATUS)
	},
	computed: {
		actionText() {
			return !this.isSyncInstalled ? 'Install' : 'Open'
		},
	},

	methods: {
		async checkSyncStatus() {
			let app = null
			try {
				const res = await this.$openAPI.appGrid.getAppGrid()
				app = findSyncthing(res.data.data)
			} catch {
				// not knowing is not being installed: the button offers Install
			}

			this.isSyncInstalled = Boolean(app)
			this.isSyncRunning = Boolean(app && app.running)
			this.syncId = app ? app.name : ''
			this.syncPort = app ? app.port : ''
			this.syncBaseURL = app ? `http://${this.$baseIp}:${app.port}` : ''
		},
		async openSyncPanel() {
			await this.checkSyncStatus()
			if (!this.isSyncInstalled) {
				this.$EventBus.$emit(events.OPEN_APP_STORE_AND_GOTO_SYNCTHING)
			} else {
				if (this.isSyncRunning) {
					window.open(this.syncBaseURL, '_blank')
				} else {
					this.$buefy.dialog.confirm({
						title: ' ',
						message: this.$t('Syncthing is not running, start it?'),
						hasIcon: true,
						closeOnConfirm: false,
						confirmText: this.$t('Start'),
						cancelText: this.$t('Cancel'),
						onConfirm: (value, { close }) => {
							this.$buefy.toast.open({
								message: this.$t(`Starting Syncthing...`),
								type: 'is-white',
							})
							this.$openAPI.appManagement.compose.setComposeAppStatus(this.syncId, 'start').then(() => {
								this.isStarting = false
								this.$EventBus.$emit(events.RELOAD_APP_LIST)
								setTimeout(() => {
									close()
									window.open(this.syncBaseURL, '_blank')
								}, 2000)
							}).catch(() => {
								this.isStarting = false
								this.$buefy.toast.open({
									message: this.$t(`Failed to start, please try again.`),
									type: 'is-danger',
								})
							})
						},
					})
				}
			}
		},

	},
	sockets: {
		'app:install-end': function () {
			this.checkSyncStatus()
		},
		'app:install-error': function () {
			this.checkSyncStatus()
		},
	},
}
</script>

<style lang="scss" scoped>
._box {
	height: 10rem;
	padding: 1rem 1.25rem;
	padding-top: 1.125rem;
	margin-bottom: 1rem;

	._notice-content-text {
		margin-right: 2rem;
		margin-left: 2rem;
	}
}

.des {
	line-height: 1.5em;
}
</style>
