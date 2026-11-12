<template>
	<div class="storage settings-card p-0 mb-4">
		<div class="_head">
			<span :class="{ 'is-warn': item.usePercent >= 80 }" class="_tile"><b-icon :icon="item.isSystem ? 'home-outline' : 'harddisk'" /></span>
			<div class="_text">
				<p class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1">
					<span class="_name">{{ item.name }}</span>
					<b-tag v-if="item.isSystem" rounded>OS</b-tag>
					<b-tag v-if="item.isMergeSource && !item.isSystem" rounded>{{ $t('Merged') }}</b-tag>
					<b-tag v-if="item.snapraid && !(item.snapraid === 'data' && item.isMergeSource)" rounded>{{ item.snapraid === 'parity' ? $t('SnapRAID parity') : $t('SnapRAID') }}</b-tag>
					<b-tag v-if="item.usePercent >= 80" :type="getProgressType(item.usePercent)" rounded>{{ $t('{percent} % full', { percent: Math.round(item.usePercent) }) }}</b-tag>
				</p>
				<p class="is-size-7 _has-text-gray">
					{{ item.raid ? raidLevel(item.raid.level) : $t('Single Drive Storage') }} · <span class="is-uppercase">{{ item.fsType }}</span>
					<b-tooltip :label="$t('CasaOS reserves 1% of file space when creating storage in EXT4 format.')" append-to-body>
						<b-icon class="_hint" icon="question-outline" pack="casa" size="is-small" />
					</b-tooltip>
					<template v-if="item.diskModel || item.diskPath">
						· {{ item.diskModel || item.diskPath }}<template v-if="item.diskModel && item.diskPath"> ({{ item.diskPath }})</template>
					</template>
					<template v-if="item.mount_point"> · {{ item.mount_point }}</template>
				</p>
			</div>

			<div v-if="!item.isSystem && !item.isMergeSource && !item.snapraid" class="is-flex is-flex-wrap-wrap is-gap-1">
				<b-button :disabled="isRemoving || isRenaming" :loading="isFormating" :type="isFormating ? 'is-primary' : ''"
					rounded size="is-small" @click="formatStorage(item.path, item.mount_point)">
					{{ $t('Format') }}
				</b-button>
				<b-button :disabled="isFormating || isRemoving" :loading="isRenaming" :type="isRenaming ? 'is-primary' : ''"
					rounded size="is-small" @click="renameStorage(item.path, item.name)">
					{{ $t('Rename') }}
				</b-button>
				<b-button :disabled="isFormating || isRenaming" :loading="isRemoving" :type="isRemoving ? 'is-primary' : ''"
					rounded size="is-small" @click="item.raid ? deleteRaid(item.raid.name) : removeStorage(item.disk)">
					{{ $t('Remove') }}
				</b-button>
			</div>
			<p v-else-if="item.snapraid && !item.isMergeSource" class="_has-text-gray is-size-7 _note">
				{{ $t('Remove the SnapRAID protection first to format or remove it.') }}
			</p>
			<p v-else-if="item.isSystem && item.usePercent >= 80" class="is-size-7">{{ $t('Free up storage') }}</p>
		</div>

		<div class="_body">
			<b-progress :type="getProgressType(item.usePercent)" :value="item.usePercent || 0" class="mb-0" size="is-small" />
			<p class="is-size-7">
				<b>{{ renderSize(item.availSize) }}</b> <span class="_has-text-gray">{{ $t('free of {total}', { total: renderSize(item.size) }) }}</span>
			</p>
			<raid-status v-if="item.raid" :array="item.raid" :fs-size="Number(item.size) || 0" @changed="$emit('getDiskList')" />
		</div>
	</div>
</template>

<script>
import delay from 'lodash/delay'
import escape from 'lodash/escape'
import RaidStatus from './RaidStatus.vue'
import { raidLevel } from './raid'
import { mixin } from '@/mixins/mixin'

export default {
	name: 'storage-item',
	components: { RaidStatus },
	mixins: [mixin],
	props: {
		item: {
			type: Object,
			default: null,
		},
	},
	data() {
		return {
			isFormating: false,
			isRemoving: false,
			isRenaming: false,
		}
	},
	methods: {
		raidLevel,
		renameStorage(path, currentName) {
			this.isRenaming = true

			this.$buefy.dialog.prompt({
				title: this.$t('Rename'),
				message: this.$t('Storage Name'),
				inputAttrs: {
					type: 'text',
					value: currentName,
					required: true,
					maxlength: 16,
					pattern: '[A-Za-z0-9_]+',
					autocomplete: 'off',
				},
				trapFocus: true,
				confirmText: this.$t('OK'),
				cancelText: this.$t('Cancel'),
				onCancel: () => {
					this.isRenaming = false
				},
				onConfirm: (value) => {
					this.$api.storage.rename({
						path,
						name: value,
					}).then((res) => {
						if (res.data.success != 200) {
							this.isRenaming = false
							this.$buefy.toast.open({
								duration: 3000,
								message: escape(res.data.message),
								type: 'is-danger',
							})
							return
						}

						delay(() => {
							this.isRenaming = false
							this.$emit('getDiskList')
						}, 500)
					}).catch((e) => {
						this.isRenaming = false
						this.$buefy.toast.open({
							duration: 3000,
							message: escape(e.response?.data?.message || e.message),
							type: 'is-danger',
						})
						console.error(e)
					})
				},
			})
		},

		removeStorage(path) {
			this.isRemoving = true

			this.$buefy.dialog.prompt({
				title: this.$t('Remove'),
				message: this.$t('Enter the password to continue:'),
				inputAttrs: {
					type: 'password',
				},
				trapFocus: true,
				confirmText: this.$t('OK'),
				cancelText: this.$t('Cancel'),
				onCancel: () => {
					this.isRemoving = false
				},
				onConfirm: (value) => {
					const data = {
						path,
						password: value,
					}

					this.$api.disks.umount(data).then((res) => {
						if (res.data.success != 200) {
							this.isRemoving = false
							this.$buefy.toast.open({
								duration: 3000,
								message: escape(res.data.message),
								type: 'is-danger',
							})
							console.error(res)
						} else {
							this.isRemoving = false
							const _this = this
							delay(() => {
								_this.isRemoving = false
								_this.$emit('getDiskList')
							}, 1000)
						}
					}).catch((e) => {
						this.isRemoving = false
						this.$buefy.toast.open({
							duration: 3000,
							message: escape(e.response.data.message),
							type: 'is-danger',
						})
						console.error(e)
					})
				},
			})
		},

		// an array is not a disk to unmount: deleting it stops it and leaves its disks blank, which the person confirms by typing its name
		deleteRaid(name) {
			this.isRemoving = true
			this.$buefy.dialog.prompt({
				title: escape(this.$t('Delete {name}?', { name })),
				message: escape(this.$t('Everything on {name} is erased and its disks are left blank. This cannot be undone. Type {name} to delete it.', { name })),
				inputAttrs: {
					type: 'text',
					placeholder: name,
					required: true,
					pattern: `^${name}$`,
					autocomplete: 'off',
				},
				type: 'is-danger',
				hasIcon: true,
				trapFocus: true,
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onCancel: () => {
					this.isRemoving = false
				},
				onConfirm: async (value) => {
					try {
						await this.$api.disks.deleteRaid(name, value)
						this.$buefy.toast.open({ message: escape(this.$t('{name} is deleted. Its disks are blank.', { name })), type: 'is-success' })
						this.$emit('getDiskList')
					} catch (e) {
						this.$buefy.toast.open({ duration: 5000, message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
					} finally {
						this.isRemoving = false
					}
				},
			})
		},

		formatStorage(path, mount_point) {
			this.isFormating = true

			this.$buefy.dialog.prompt({
				title: this.$t('Format'),
				message: this.$t('Enter the password to continue:'),
				inputAttrs: {
					type: 'password',
				},
				trapFocus: true,
				confirmText: this.$t('OK'),
				cancelText: this.$t('Cancel'),
				onCancel: () => {
					this.isFormating = false
				},
				onConfirm: (value) => {
					const data = {
						path,
						volume: mount_point,
						password: value,
					}

					this.$api.storage.format(data).then((res) => {
						if (res.data.success != 200) {
							this.isFormating = false
							this.$buefy.toast.open({
								duration: 3000,
								message: escape(res.data.message),
								type: 'is-danger',
							})
							console.error(res)
						} else {
							const _this = this
							delay(() => {
								_this.isFormating = false
								_this.$emit('getDiskList')
							}, 1000)
						}
					}).catch((e) => {
						this.isFormating = false
						this.$buefy.toast.open({
							duration: 3000,
							message: escape(e.response.data.message),
							type: 'is-danger',
						})
						console.error(e)
					})
				},
			})
		},

	},
}
</script>

<style lang="scss" scoped>
.storage {
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

	._tile.is-warn {
		background: rgba($warning, 0.18);
		color: $warning;
	}

	._hint {
		vertical-align: middle;
	}

	// the reason there is no button, where the buttons would be
	._note {
		flex: 0 1 16rem;
		text-align: right;
	}
}
</style>
