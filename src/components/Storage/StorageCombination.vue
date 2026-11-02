<template>
	<div v-show="showCombination" class="mb-4 mt-2 pb-3 combination-box is-flex is-flex-direction-column">
		<div class="is-flex mt-3 mr-3 mb-3 ml-3">
			<div class="header-icon">
				<b-image :src="require('@/assets/img/storage/storage.png')" class="is-64x64"></b-image>
			</div>
			<div class="ml-3 is-flex-grow-1 is-flex is-align-items-center">
				<div>
					<h4 class="mb-0 has-text-left one-line has-text-emphasis-02 is-flex is-align-items-center">
						CasaOS HD
						<b-tag class="ml-2 has-text-full-04">{{ $t('Merged') }}</b-tag>
					</h4>
					<p class="has-text-left has-text-full-04 has-text-grey-light mt-1">
						{{ $t('Storage Sources', { count: storageData.length }) }},
						<span class="is-uppercase">MERGERFS</span>
					</p>
					<p class="has-text-left has-text-full-04 mt-1">{{
						$t("Available Total", {
							name: mountPoint,
							avl: renderSize(availableSize),
							total: renderSize(totalSize),
						})
					}}</p>
				</div>
			</div>
			<div class="is-flex is-flex-direction-column is-align-items-flex-end is-justify-content-space-between">
				<div class="is-flex is-flex-direction-row-reverse">
					<b-button :type="type" class="width" rounded size="is-small"
						@click="showStorageSettingsModal">{{ $t('Merge Storages') }}
					</b-button>
					<cToolTip is-block modal="is-success"></cToolTip>
				</div>
				<p v-if="usePercent >= 80" class="has-text-right">
					<span>{{ $t("Free up storage") }}</span>
				</p>
			</div>
		</div>
		<b-progress :type="getProgressType(usePercent)" :value="usePercent" class="ml-3 mr-3"
			size="is-small"></b-progress>
	</div>
</template>

<script>
import { mixin } from '@/mixins/mixin'
import MergeStorages from '@/components/Storage/MergeStorages.vue'
import cToolTip from '@/components/basicComponents/tooltip/tooltip.vue'

export default {
	name: 'storage-combination',
	mixins: [mixin],
	components: {
		CToolTip: cToolTip,
	},
	props: {
		storageData: {
			type: Array,
			default: null,
		},
		type: {
			type: String,
			default: 'is-link',
		},
		// the folder the merged storage appears in
		mountPoint: {
			type: String,
			default: '/DATA',
		},
	},
	computed: {
		showCombination() {
			return this.storageData.length > 0
		},

		availableSize() {
			let availableSize = 0
			this.storageData.forEach((item) => {
				availableSize += Number(item.availSize)
			})
			return availableSize
		},

		totalSize() {
			let totalSize = 0
			this.storageData.forEach((item) => {
				totalSize += Number(item.size)
			})
			return totalSize
		},

		usePercent() {
			if (!this.totalSize) {
				return 0
			}
			return (this.totalSize - this.availableSize) / this.totalSize * 100
		},
	},
	methods: {
		// show storage settings modal
		async showStorageSettingsModal() {
			// src/components/Storage/StorageManagerPanel.vue:406
			// TODO: the part is repetition
			//  with APPs Installation Location requirement document
			// 获取merge信息
			let mergeStorageList
			try {
				mergeStorageList = await this.$api.local_storage.getMergerfsInfo().then((res) => {
					const data = res.data.data
					const mergeInfo = Array.isArray(data) ? data[0] : data
					return mergeInfo && Array.isArray(mergeInfo.source_volume_uuids)
						? mergeInfo.source_volume_uuids
						: []
				})
			} catch (e) {
				mergeStorageList = []
				console.log(e)
			}

			this.$buefy.modal.open({
				component: MergeStorages,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				onCancel: () => {
				},
				events: {
					'merge-success': () => {
						this.$emit('merge-success')
					},
					'close': () => {
						this.$emit('reload')
					},
				},
				props: {
					mergeStorageList,
					mountPoint: this.mountPoint,
				},
			})
		},

	},
}
</script>

<style lang="scss" scoped>
.combination-box {
	background-color: var(--casa-surface-soft);
	border-radius: 0.5rem;

	.tag {
		background-color: var(--casa-surface-soft);
		border: 1px solid hsla(208, 100%, 45%, 1);
		color: hsla(208, 100%, 45%, 1);
		padding: 2px 6px;
		height: 1.25rem;
	}
}
</style>
