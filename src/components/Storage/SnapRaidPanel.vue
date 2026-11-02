<template>
	<div v-if="state" class="snapraid mb-4 pb-3 pt-3 pl-3 pr-3 background-item has-text-full-04">
		<p class="is-flex is-align-items-center is-flex-wrap-wrap">
			<b-tag v-if="state.configured" :type="tag.type" class="mr-2">{{ tag.text }}</b-tag>
			<span class="has-text-weight-medium">{{ $t('Disk failure protection (SnapRAID)') }}</span>
		</p>

		<!-- not set up -->
		<template v-if="!state.configured">
			<p class="has-text-grey-light mt-1">
				{{ $t('One or two parity disks can rebuild a merged disk that dies, while every disk stays an ordinary disk. Files written after the last daily sync are not protected until the next one.') }}
			</p>
			<div v-if="candidates.length" class="mt-2 is-flex is-flex-wrap-wrap">
				<b-checkbox v-for="candidate in candidates" :key="candidate.mount_point" v-model="parity" class="mr-3"
					:disabled="parity.length >= 2 && !parity.includes(candidate.mount_point)" :native-value="candidate.mount_point">
					{{ candidate.name }} ({{ size(candidate.size) }})
				</b-checkbox>
			</div>
			<p v-else class="mt-2 has-text-grey-light">
				{{ $t('A storage of its own is needed for the parity: plug a drive and create a storage on it.') }}
			</p>
			<p v-if="candidates.length" class="mt-1 has-text-grey-light">
				{{ $t('The parity takes as much room as the fullest merged disk. Pick one disk, or two to survive the loss of two.') }}
			</p>
			<b-button v-if="candidates.length" :disabled="!parity.length" :loading="isWorking" class="mt-2" rounded size="is-small" type="is-link" @click="setUp">
				{{ $t('Protect the merged storage') }}
			</b-button>
		</template>

		<!-- set up -->
		<template v-else>
			<p v-if="missing" class="mt-1 has-text-danger">{{ $t('Not mounted where they were set up: {disks}. Nothing is synced until they are back.', { disks: missing }) }}</p>
			<p v-if="syncedAt" class="mt-1">{{ $t('Last sync: {when}', { when: syncedAt }) }}</p>
			<p v-if="scrubbedAt" class="mt-1">{{ $t('Last check of the disks: {when}', { when: scrubbedAt }) }}</p>
			<p v-if="changes" class="mt-1">{{ changes }}</p>

			<b-message v-if="failure" :type="failure.blocked ? 'is-warning' : 'is-danger'" class="mt-2 failure" size="is-small">
				{{ failure.message }}
				<b-button v-if="failure.blocked" class="mt-2" rounded size="is-small" @click="run('sync', { force: true })">{{ $t('Sync anyway') }}</b-button>
			</b-message>

			<b-progress v-if="state.job" :value="state.job.percent" class="mt-2" size="is-small" type="is-info" />

			<p class="mt-2 is-flex is-flex-wrap-wrap is-align-items-center">
				<template v-if="state.job">
					<b-button class="mr-2" rounded size="is-small" @click="stop">{{ $t('Stop') }}</b-button>
				</template>
				<template v-else>
					<b-button class="mr-2 mt-1" rounded size="is-small" type="is-link" @click="run('sync')">{{ $t('Sync now') }}</b-button>
					<b-button class="mr-2 mt-1" rounded size="is-small" @click="run('diff')">{{ $t('Look for changes') }}</b-button>
					<b-button class="mr-2 mt-1" rounded size="is-small" @click="run('scrub', { full: true })">{{ $t('Check the disks') }}</b-button>
					<b-button class="mr-2 mt-1" rounded size="is-small" @click="askRepair">{{ $t('Repair…') }}</b-button>
					<b-button class="mt-1" rounded size="is-small" type="is-danger is-light" @click="confirmRemove">{{ $t('Remove protection') }}</b-button>
				</template>
			</p>
		</template>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { snapraidTag, snapraidWhen } from './snapraid'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'snap-raid-panel',
	props: {
		// the standalone storages that could hold a parity: { name, size, mount_point }
		candidates: {
			type: Array,
			default: () => [],
		},
		// the mount point of the merged storage
		pool: {
			type: String,
			default: '/DATA',
		},
	},
	data() {
		return { state: null, parity: [], isWorking: false, timer: null }
	},
	computed: {
		tag() {
			return snapraidTag(this.state, this.$t)
		},
		last() {
			return this.state.last || {}
		},
		missing() {
			return (this.state.missing || []).join(', ')
		},
		syncedAt() {
			return snapraidWhen(this.last.sync && this.last.sync.at)
		},
		scrubbedAt() {
			return snapraidWhen(this.last.scrub && this.last.scrub.at)
		},
		// what the last look for changes counted
		changes() {
			const diff = this.last.diff && this.last.diff.ok && this.last.diff.diff
			return diff ? this.$t('Since the last sync: {added} added, {removed} removed, {updated} changed.', { added: diff.added, removed: diff.removed, updated: diff.updated }) : ''
		},
		// the last sync or check that did not go well, and why
		failure() {
			const failed = [this.last.sync, this.last.scrub, this.last.fix].find(result => result && !result.ok && result.message)
			return failed || null
		},
	},
	mounted() {
		this.refresh()
	},
	beforeUnmount() {
		clearTimeout(this.timer)
	},
	methods: {
		size(bytes) {
			return renderSize(bytes)
		},

		fail(e) {
			this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger', duration: 6000 })
		},

		// read again, and keep reading every few seconds while something is at work
		async refresh() {
			clearTimeout(this.timer)
			try {
				const res = await this.$api.disks.snapraid()
				this.state = res.data.data
			} catch {
				// an older box has no SnapRAID: the panel stays out of the way
				this.state = null
				return
			}
			if (this.state.job) {
				this.timer = setTimeout(() => this.refresh(), 3000)
			}
		},

		async setUp() {
			this.isWorking = true
			try {
				await this.$api.disks.setSnapraid(this.pool, this.parity)
				this.parity = []
				await this.refresh()
			} catch (e) {
				this.fail(e)
			} finally {
				this.isWorking = false
			}
		},

		async run(action, options = {}) {
			try {
				await this.$api.disks.runSnapraid(action, options)
				await this.refresh()
			} catch (e) {
				this.fail(e)
			}
		},

		async stop() {
			try {
				await this.$api.disks.stopSnapraid()
			} catch (e) {
				this.fail(e)
			}
			await this.refresh()
		},

		// fix puts files back as they were at the last sync: the disk's name has to be typed
		askRepair() {
			const names = this.state.config.data.map(disk => `${disk.name} (${disk.path})`).join(', ')
			this.$buefy.dialog.prompt({
				title: escape(this.$t('Repair a disk')),
				message: escape(this.$t('Files lost from a disk come back from the parity, as they were at the last sync: what changed since is undone. For a disk you replaced, mount the new one where the old one was. The files come back owned by root and readable by root only: SnapRAID does not keep the owner or the permissions, so set them again if an app has to read them. Type the name of the disk to repair, or "all". Disks: {names}', { names })),
				inputAttrs: { placeholder: 'd1' },
				confirmText: this.$t('Repair'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: (value) => {
					const name = String(value || '').trim()
					return this.run('fix', name === 'all' ? { confirm: 'all' } : { disk: name, confirm: name })
				},
			})
		},

		confirmRemove() {
			this.$buefy.dialog.confirm({
				title: escape(this.$t('Remove the protection?')),
				message: escape(this.$t('The disks and their files are not touched. The parity files stay on the parity disks, where they take room until you delete them.')),
				confirmText: this.$t('Remove protection'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: async () => {
					try {
						await this.$api.disks.removeSnapraid()
						await this.refresh()
					} catch (e) {
						this.fail(e)
					}
				},
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.failure {
	white-space: pre-wrap;
}
</style>
