<template>
	<div class="backup-running">
		<div v-for="backup in running.backups" :key="backup.id" class="live-backup mb-4">
			<div class="is-flex is-align-items-center">
				<div class="is-flex-grow-1">
					<b>{{ titleOf(backup.app) }} → {{ backup.destination }}</b>
					<span class="has-text-grey is-size-7 ml-2">
						{{ originText(backup.origin) }} · {{ $t('started {when}', { when: whenOf(new Date(backup.started_at)) }) }}
					</span>
				</div>
				<b-button class="live-stop" size="is-small" type="is-danger" outlined rounded @click="stop(backup)">
					{{ $t('Stop') }}
				</b-button>
			</div>

			<progress v-if="figures(backup).percent !== null" class="progress is-small is-primary mt-2 mb-1" :value="figures(backup).percent" max="100"></progress>
			<progress v-else class="progress is-small is-primary mt-2 mb-1" max="100"></progress>

			<p class="is-size-7">
				<b>{{ figures(backup).percent !== null ? `${figures(backup).percent} %` : $t('Taking stock') }}</b>
				<span v-for="part in parts(backup)" :key="part"> · {{ part }}</span>
			</p>
			<p class="is-size-7 has-text-grey">
				{{ $t('folder {n} of {total}', { n: backup.operation, total: backup.operations }) }} · {{ backup.source }}
			</p>
			<p v-if="backup.stats && backup.stats.current" class="is-size-7 has-text-grey live-current">{{ backup.stats.current }}</p>
		</div>

		<template v-for="pass in livePasses" :key="pass.started_at">
			<div v-if="waiting(pass).length" class="pass-next mb-3">
				<h4 class="has-text-weight-semibold is-size-7 mb-1">{{ $t('Next in this pass') }}</h4>
				<p v-for="item in waiting(pass)" :key="`${item.app}@${item.destination}`" class="is-size-7 is-flex">
					<span class="is-flex-grow-1">{{ titleOf(item.app) }}</span>
					<span class="has-text-grey">{{ item.state === 'held' ? $t('held by a system upgrade') : $t('Waiting') }}</span>
				</p>
			</div>
			<div v-if="finished(pass).length" class="pass-done mb-3">
				<h4 class="has-text-weight-semibold is-size-7 mb-1">{{ $t('Done in this pass') }}</h4>
				<p v-for="item in finished(pass)" :key="`${item.app}@${item.destination}`" class="is-size-7 is-flex">
					<span class="is-flex-grow-1">{{ titleOf(item.app) }}</span>
					<span class="has-text-grey" :title="item.error || ''">{{ itemResult(item) }}</span>
				</p>
			</div>
		</template>

		<p v-if="!running.backups.length && !livePasses.length" class="has-text-grey">{{ $t('Nothing is running any more.') }}</p>
	</div>
</template>

<script>
import { durationText, whenOf } from './backupScheduleGroups.js'
import { liveFigures, liveTitle } from '@/components/backup/liveBackup.js'
import { renderSize } from '@/mixins/file_utils'
import { ice_i18n } from '@/mixins/base/common-i18n'

const ORIGINS = { scheduled: 'scheduled', forced: 'run now', on_demand: 'on demand' }

export default {
	name: 'backup-running',
	props: {
		// GET /backup/running, read by the dialog that holds this tab
		running: { type: Object, required: true },
	},
	emits: ['refresh'],
	data() {
		return { titles: {} }
	},
	computed: {
		// a pass that ended says nothing of what comes next
		livePasses() {
			return (this.running.passes || []).filter(pass => !pass.finished_at)
		},
	},
	async mounted() {
		// best effort: without the titles the apps go by their names
		try {
			const grid = await this.$openAPI.appGrid.getAppGrid()
			for (const item of grid.data.data || []) {
				this.titles[item.name] = (item.title && ice_i18n(item.title)) || item.name
			}
		} catch {
			// names, then
		}
	},
	methods: {
		titleOf(app) {
			return liveTitle(app, name => this.titles[name] || name, this.$t)
		},
		figures(backup) {
			return liveFigures(backup)
		},
		parts(backup) {
			const f = liveFigures(backup)
			const parts = [f.totalBytes ? this.$t('{done} of {total}', { done: renderSize(f.bytes), total: renderSize(f.totalBytes) }) : renderSize(f.bytes)]
			parts.push(f.totalFiles ? this.$t('{count} files of {total}', { count: f.files, total: f.totalFiles }) : this.$t('{count} files', { count: f.files }))
			if (f.speed) {
				parts.push(`${renderSize(f.speed)}/s`)
			}
			if (f.eta !== null) {
				parts.push(this.$t('about {duration} left', { duration: durationText(f.eta * 1000) }))
			}

			return parts
		},
		originText(origin) {
			return this.$t(ORIGINS[origin] || 'on demand')
		},
		whenOf(date) {
			return whenOf(date, this.$t)
		},
		waiting(pass) {
			return pass.items.filter(item => item.state === 'waiting' || item.state === 'held')
		},
		finished(pass) {
			return pass.items.filter(item => ['done', 'failed', 'stopped'].includes(item.state))
		},
		itemResult(item) {
			if (item.state === 'stopped') {
				return this.$t('stopped')
			}
			if (item.state === 'failed') {
				return this.$t('Failed')
			}
			const parts = ['✓']
			if (item.started_at && item.finished_at) {
				parts.push(durationText(new Date(item.finished_at) - new Date(item.started_at)))
			}
			if (item.bytes) {
				parts.push(renderSize(item.bytes))
			}

			return parts.join(' · ').replace('✓ · ', '✓ ')
		},
		stop(backup) {
			const title = this.titleOf(backup.app)
			this.$buefy.dialog.confirm({
				message: this.$t('Stop the backup of {title}? What is already copied stays at the destination, incomplete.', { title }),
				confirmText: this.$t('Stop'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: async () => {
					try {
						await this.$api.backup.stopRunning(backup.id)
						this.$buefy.toast.open({ message: this.$t('Stop requested'), type: 'is-success' })
					} catch (error) {
						const reason = (error.response && error.response.data && error.response.data.message) || error.message
						this.$buefy.toast.open({ message: reason, type: 'is-danger' })
					}
					this.$emit('refresh')
				},
			})
		},
	},
}
</script>
