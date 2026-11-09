<template>
	<div v-show="showCombination" class="combination settings-card p-0 mb-4 mt-2">
		<div class="_head">
			<span class="_tile"><b-icon icon="folder-multiple-outline" /></span>
			<div class="_text">
				<p class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1">
					<span class="_name">CasaOS HD</span>
					<b-tag rounded>{{ $t('Merged') }}</b-tag>
					<span class="_has-text-gray is-size-7">{{ $t('Storage Sources', { count: storageData.length }) }}</span>
				</p>
				<p class="is-size-7 _has-text-gray">mergerfs · {{ mountPoint }}</p>
			</div>
			<b-button :type="type" rounded size="is-small" @click="showStorageSettingsModal">{{ $t('Merge Storages') }}</b-button>
			<cToolTip is-block modal="is-success"></cToolTip>
		</div>

		<div class="_body">
			<b-progress :type="getProgressType(usePercent)" :value="usePercent" class="mb-0" size="is-small" />
			<p class="is-size-7">
				<b>{{ renderSize(availableSize) }}</b> <span class="_has-text-gray">{{ $t('free of {total}', { total: renderSize(totalSize) }) }}</span>
				<span v-if="usePercent >= 80"> · {{ $t('Free up storage') }}</span>
			</p>
		</div>

		<!-- the storages the merge is made of, one row each -->
		<div class="_sources">
			<div class="_row _hd is-size-7" aria-hidden="true">
				<span>{{ $t('Source') }}</span>
				<span class="_disk">{{ $t('Drive') }}</span>
				<span class="_usage">{{ $t('Usage') }}</span>
				<span class="_num">{{ $t('Free') }}</span>
				<span class="_num">{{ $t('Total') }}</span>
			</div>
			<div v-for="item in storageData" :key="item.uuid || item.path" class="_row">
				<span class="_ellipsis has-text-weight-medium">
					{{ item.name || item.path }}
					<b-tag v-if="item.raid" class="ml-1" rounded size="is-small">{{ raidLevel(item.raid.level) }}</b-tag>
				</span>
				<span class="_disk _ellipsis is-size-7 _has-text-gray">{{ item.diskModel || item.diskPath || '' }}</span>
				<b-progress :value="item.usePercent || 0" class="_usage mb-0" size="is-small" type="is-info" />
				<span class="_num is-size-7">{{ renderSize(item.availSize) }}</span>
				<span class="_num is-size-7 _has-text-gray">{{ renderSize(item.size) }}</span>
			</div>
		</div>
	</div>
</template>

<script>
import { raidLevel } from './raid'
import { mixin } from '@/mixins/mixin'
import MergeStorages from '@/components/Storage/MergeStorages.vue'
import cToolTip from '@/components/basicComponents/tooltip/tooltip.vue'

export default {
	name: 'storage-combination',
	components: {
		CToolTip: cToolTip,
	},
	mixins: [mixin],
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
		raidLevel,

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
.combination {
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

	._sources {
		padding: 0.5rem 0.25rem 0.25rem;
		border-top: 1px solid var(--casa-divider-soft);
	}

	._row {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(5rem, 1fr) 5.5rem 5.5rem;
		gap: 0.75rem;
		align-items: center;
		min-height: 2.25rem;
		padding: 0 0.75rem;

		& + ._row:not(._hd) {
			border-top: 1px solid var(--casa-divider-soft);
		}
	}

	._hd {
		min-height: 1.75rem;
		color: var(--casa-text-hint);
		font-weight: 600;
	}

	._num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	._ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	._usage {
		margin: 0;
	}

	@media (max-width: 768px) {
		._row {
			grid-template-columns: minmax(0, 1fr) 5.5rem 5.5rem;
		}

		._disk,
		._usage {
			display: none;
		}
	}
}
</style>
