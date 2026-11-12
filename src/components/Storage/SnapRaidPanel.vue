<template>
	<div v-if="state" class="snapraid settings-card p-0 mb-4">
		<div class="_head">
			<span :class="state.configured ? tag.type : ''" class="_tile"><b-icon icon="shield-check-outline" /></span>
			<div class="_text">
				<p class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1">
					<span class="_name">{{ $t('Disk failure protection (SnapRAID)') }}</span>
					<b-tag v-if="state.configured" :type="tag.type" rounded>{{ tag.text }}</b-tag>
				</p>
				<p v-if="state.configured && parityDisks" class="is-size-7 _has-text-gray">{{ $t('Parity: {disks}', { disks: parityDisks }) }}</p>
			</div>
			<template v-if="state.configured">
				<b-button v-if="state.job" rounded size="is-small" @click="stop">{{ $t('Stop') }}</b-button>
				<b-button v-else rounded size="is-small" type="is-link" @click="run('sync')">{{ $t('Sync now') }}</b-button>
			</template>
		</div>

		<div class="_body">
			<!-- not set up -->
			<template v-if="!state.configured">
				<p class="_has-text-gray is-size-7">
					{{ $t('One or two parity disks can rebuild a merged disk that dies, while every disk stays an ordinary disk. Files written after the last daily sync are not protected until the next one.') }}
				</p>
				<div v-if="candidates.length" class="is-flex is-flex-wrap-wrap is-gap-2">
					<b-checkbox v-for="candidate in candidates" :key="candidate.mount_point" v-model="parity"
						:disabled="parity.length >= 2 && !parity.includes(candidate.mount_point)" :native-value="candidate.mount_point">
						{{ candidate.name }} ({{ size(candidate.size) }})
					</b-checkbox>
				</div>
				<p v-else class="_has-text-gray is-size-7">
					{{ $t('A storage of its own is needed for the parity: plug a drive and create a storage on it.') }}
				</p>
				<p v-if="candidates.length" class="_has-text-gray is-size-7">
					{{ $t('The parity takes as much room as the fullest merged disk. Pick one disk, or two to survive the loss of two.') }}
				</p>
				<b-button v-if="candidates.length" :disabled="!parity.length" :loading="isWorking" class="_setup" rounded size="is-small" type="is-link" @click="setUp">
					{{ $t('Protect the merged storage') }}
				</b-button>
			</template>

			<!-- set up -->
			<template v-else>
				<p v-if="missing" class="has-text-danger is-size-7">{{ $t('Not mounted where they were set up: {disks}. Nothing is synced until they are back.', { disks: missing }) }}</p>
				<div class="_facts is-size-7">
					<div>
						<span class="_has-text-gray">{{ $t('Last sync') }}</span>
						<span>{{ syncedAt || $t('Not synced yet') }}</span>
					</div>
					<div>
						<span class="_has-text-gray">{{ $t('Last check of the disks') }}</span>
						<span>{{ scrubbedAt || '—' }}</span>
					</div>
					<div v-if="changes">
						<span class="_has-text-gray">{{ $t('Changes') }}</span>
						<span>{{ changes }}</span>
					</div>
				</div>

				<b-message v-if="failure" :type="failure.blocked ? 'is-warning' : 'is-danger'" class="failure mb-0" size="is-small">
					{{ failure.message }}
					<b-button v-if="failure.blocked" class="mt-2" rounded size="is-small" @click="run('sync', { force: true })">{{ $t('Sync anyway') }}</b-button>
				</b-message>

				<b-progress v-if="state.job" :value="state.job.percent" class="mb-0" size="is-small" type="is-info" />

				<p v-if="!state.job" class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
					<b-button rounded size="is-small" @click="run('diff')">{{ $t('Look for changes') }}</b-button>
					<b-button rounded size="is-small" @click="run('scrub', { full: true })">{{ $t('Check the disks') }}</b-button>
					<b-button rounded size="is-small" @click="askRepair">{{ $t('Repair\u2026') }}</b-button>
					<b-button class="ml-auto" rounded size="is-small" type="is-danger is-light" @click="confirmRemove">{{ $t('Remove protection') }}</b-button>
				</p>
				<p class="_has-text-gray is-size-7">{{ $t('Files written after the last sync are not protected until the next one.') }}</p>
			</template>
		</div>
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
		// where the parity lives
		parityDisks() {
			return ((this.state.config && this.state.config.parity) || []).join(', ')
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
.snapraid {
	._head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
	}

	._tile {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: rgba($primary, 0.12);
		color: $primary;
	}

	._text {
		flex: 1 1 14rem;
		min-width: 0;
	}

	._name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--casa-text-strong);
	}

	._body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 1rem 0.875rem;
	}

	._tile.is-success {
		background: rgba($success, 0.16);
		color: $success;
	}

	._tile.is-warning {
		background: rgba($warning, 0.18);
		color: $warning;
	}

	._tile.is-danger {
		background: rgba($danger, 0.16);
		color: $danger;
	}

	._tile.is-info {
		background: rgba($info, 0.16);
		color: $info;
	}

	._setup {
		align-self: flex-start;
	}

	// when it last synced, last checked, what changed: three facts side by side
	._facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.75rem;

		> div {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}
	}

	.failure {
		white-space: pre-wrap;
	}
}
</style>
