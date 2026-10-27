<template>
	<div class="mb-4 pb-3 background-item is-flex is-flex-direction-column">
		<div class="is-flex mt-3 mr-3 mb-3 ml-3">
			<div class="header-icon">
				<b-image :src="require('@/assets/img/storage/storage.png')" class="is-64x64"></b-image>
			</div>
			<div class="ml-3 is-flex-grow-1 is-flex is-align-items-center">
				<div>
					<h4 class="mb-0 has-text-left one-line has-text-emphasis-02 is-flex is-align-items-center">
						{{ item.name }}
						<b-tag v-if="item.isSystem" class="ml-2 has-text-full-04">OS
						</b-tag>
						<b-tag v-if="item.isMergeSource && !item.isSystem" class="ml-2 has-text-full-04">{{ $t('Merged') }}
						</b-tag>
					</h4>

					<p class="has-text-left has-text-full-04 has-text-grey-light mt-1">{{ item.raid ? raidLevel(item.raid.level) : $t('Single Drive Storage') }},
						<span class="is-uppercase">{{ item.fsType }}</span>
						<b-tooltip :label="$t('CasaOS reserves 1% of file space when creating storage in EXT4 format.')"
							append-to-body>
							<b-icon class="mr-2 " icon="question-outline" pack="casa" size="is-small"></b-icon>
						</b-tooltip>
						<span v-if="item.diskPath || item.diskModel" class="ml-2">
							· {{ $t('Drive') }}:
							<span v-if="item.diskModel">{{ item.diskModel }}</span>
							<span v-if="item.diskModel && item.diskPath"> ({{ item.diskPath }})</span>
							<span v-else>{{ item.diskPath }}</span>
						</span>
					</p>
					<p class="has-text-left has-text-full-04 mt-1">{{
						$t("Available Total", {
							name: item.diskName,
							avl: renderSize(item.availSize),
							total: renderSize(item.size),
						})
					}}</p>
					<raid-status v-if="item.raid" :array="item.raid" class="mt-2"></raid-status>
				</div>

			</div>
			<div v-if="!item.isSystem && !item.isMergeSource" class="is-flex is-align-items-center b-group">
				<b-button :disabled="isRemoving || isRenaming" :loading="isFormating" :type="isFormating ? 'is-primary' : ''"
					rounded size="is-small" @click="formatStorage(item.path, item.mount_point)">
					{{ $t('Format') }}
				</b-button>
				<b-button :disabled="isFormating || isRemoving" :loading="isRenaming" :type="isRenaming ? 'is-primary' : ''" class="ml-2"
					rounded size="is-small" @click="renameStorage(item.path, item.name)">
					{{ $t('Rename') }}
				</b-button>
				<b-button :disabled="isFormating || isRenaming" :loading="isRemoving" :type="isRemoving ? 'is-primary' : ''" class="ml-2"
					rounded size="is-small" @click="removeStorage(item.disk)"> {{ $t('Remove') }}
				</b-button>
			</div>
			<p v-else-if="item.isSystem && item.usePercent >= 80" class="has-text-right is-flex is-flex-direction-column-reverse">
				<span>{{ $t("Free up storage") }}</span>
			</p>
		</div>
		<b-progress :type="getProgressType(item.usePercent)" :value="item.usePercent || 0"
			class="ml-3 mr-3" size="is-small"></b-progress>
	</div>
</template>

<script>
import delay from 'lodash/delay'
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
								message: res.data.message,
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
							message: e.response?.data?.message || e.message,
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
								message: res.data.message,
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
							message: e.response.data.message,
							type: 'is-danger',
						})
						console.error(e)
					})
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
								message: res.data.message,
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
							message: e.response.data.message,
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
.tag {
	background-color: var(--casa-surface-soft);
	border: 1px solid hsla(208, 100%, 45%, 1);
	color: hsla(208, 100%, 45%, 1);
	padding: 2px 6px;
	height: 1.25rem;
}

.background-item {
	background-color: var(--casa-surface-soft);
	border-radius: 0.5rem;
}
</style>
