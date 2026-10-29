<template>
	<div class="modal-card">

		<template v-if="!isCreating">

			<header class="modal-card-head">
				<div class="is-flex-grow-1">
					<h3 class="title is-header">{{ title }}</h3>
				</div>
				<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
			</header>

			<!-- Modal-Card Body Start -->
			<section class="modal-card-body" style="overflow-y:hidden">
				<!-- Storage and Disk List Start -->
				<div v-if="!creatIsShow" class="is-flex-grow-1 is-flex-shrink-1 is-relative">
					<div v-if="activeTab == 0" class="create-container">
						<b-tooltip :active="unDiskData.length == 0"
							:label="$t('Please insert a Drive to Create Storage')" append-to-body
							content-class="create-storage-tip" position="is-bottom" type="is-dark">
							<div>
								<b-button :disabled="unDiskData.length == 0" :type="state_createstorage_operability"
									class="o" rounded size="is-small" @click="showCreate">{{ $t('Create Storage') }}
								</b-button>
							</div>
						</b-tooltip>

					</div>
					<b-tabs v-model="activeTab" :animated="false">
						<b-tab-item :label="$t('Storage')" class="scrollbars-light-auto tab-item">
							<!-- an array with no storage mounted on it (stopped, or never formatted) is still shown -->
							<div v-for="array in unmountedArrays" :key="array.path" class="mb-4 pb-3 pt-3 pl-3 pr-3 background-item">
								<raid-status :array="array" @changed="getDiskList"></raid-status>
							</div>
							<template v-if="storageData.length">
								<storage-item v-for="(item, index) in storageData" :key="`storage${index}`" :item="item"
									@getDiskList="getDiskList"></storage-item>
							</template>
							<div v-else-if="!unmountedArrays.length" class="has-text-centered has-text-grey-light mt-6">
								{{ $t('No standalone storage is available.') }}
							</div>
						</b-tab-item>
						<b-tab-item :label="$t('Merged Storage')" class="scrollbars-light-auto tab-item">
							<storage-combination v-if="mergeConbinationsStorageData.length"
								:storage-data="mergeConbinationsStorageData"
								:type="state_mainstorage_operability"
								@merge-success="showMergedStorage"
								@reload="getDiskList"></storage-combination>
							<div v-else class="has-text-centered has-text-grey-light mt-6">
								<p>{{ $t('No merged storage has been configured.') }}</p>
								<div class="is-flex is-justify-content-center mt-4">
									<b-button :type="state_mainstorage_operability" rounded
										@click="showStorageSettingsModal">{{ $t('Merge Storages') }}
									</b-button>
									<cToolTip is-block></cToolTip>
								</div>
							</div>
						</b-tab-item>
						<b-tab-item :label="$t('Drive')" class="scrollbars-light-auto tab-item">
							<drive-item v-for="(item, index) in diskData" :key="`disk${index}`" :item="item"></drive-item>
						</b-tab-item>
						<!-- the storage layer (GET /v2/storage), where the storage service has it -->
						<b-tab-item v-if="poolView" :label="$t('Pool')" class="scrollbars-light-auto tab-item">
							<storage-pool :view="poolView" @changed="refreshPool"></storage-pool>
						</b-tab-item>
					</b-tabs>

				</div>
				<!-- Storage and Disk List End -->

				<!-- Create Storage Start -->
				<div v-if="creatIsShow" class="is-flex-grow-1 is-relative">
					<VeeForm ref="ob1" as="span">
						<VeeField v-slot="{ errors, meta }" :model-value="createStorageName" name="StorageName" rules="required">
							<b-field :label="$t('Storage Name')" :message="errors"
								:type="{ 'is-danger': errors[0], 'is-success': meta.valid }">
								<b-input v-model="createStorageName" ref="inputs"
									@keyup="createStorageName = createStorageName.replace(/[^\w]/g, '')"
									@paste="createStorageName = createStorageName.replace(/[^\w]/g, '')"></b-input>
							</b-field>
						</VeeField>

						<b-field :label="$t('Choose Drive')">
							<b-select v-model="activeDisk" expanded @update:model-value="onDiskChoose">
								<option v-for="(option, index) in unDiskData" :key="option.path" :value="index">
									{{ option.name }} ({{ option.model }} - {{ renderSize(option.size) }})
								</option>
							</b-select>
						</b-field>

					</VeeForm>

					<article v-if="createStorageType == 'format'" class="message is-danger mt-5">
						<section class="message-body">
							<div class="media">
								<div class="media-left">
									<span class="icon is-large is-danger"><i
										class="mdi mdi-alert-circle mdi-48px"></i></span>
								</div>
								<div class="media-content">
									<h3 class="is-size-5">{{ $t('Warning') }}</h3>
									<p class="is-size-14px">
										{{ $t("The selected drive will be emptied.") }}<br>
										{{
											$t(`Please make sure again that there is no important data on the selected drive
										that needs to be
										backed up.`)
										}}
									</p>
								</div>
							</div>
						</section>
					</article>

					<article v-else class="message is-danger mt-5">
						<section class="message-body">
							<div class="media">
								<div class="media-left">
									<span class="icon is-large is-danger"><i
										class="mdi mdi-alert-circle mdi-48px"></i></span>
								</div>
								<div class="media-content">
									<h3 class="is-size-5">{{ $t('Attention') }}</h3>
									<p class="is-size-14px">
										{{ $t("The drive you select can be used directly as storage.") }}<br>
										{{
											$t(`You can also choose to create it after formatting. If formatted, the
										selected drive will be
										emptied.`)
										}}<br>
										{{
											$t(`Please make sure again that there is no important data on the selected drive
										that needs to be
										backed up.`)
										}}
									</p>
								</div>
							</div>
						</section>
					</article>

				</div>
				<!-- Create Storage End -->
				<b-loading v-model="isLoading" :can-cancel="false" :is-full-page="false"></b-loading>
			</section>
		</template>
		<section v-if="isCreating" class="modal-card-body ">
			<div class="installing-warpper mt-6 mb-6">
				<div class="is-flex is-align-items-center is-justify-content-center mb-5">
					<lottie-animation :animation-data="require('@/assets/ani/creating.json')" :auto-play="true" :loop="true"
						class="creating-animation"></lottie-animation>
				</div>
				<h3 class="title is-4 has-text-centered has-text-weight-light">{{ $t('Creation in progress') }}...</h3>
			</div>
		</section>

		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer v-if="!isCreating && activeTab == 0 && creatIsShow" class="modal-card-foot is-flex-shrink-0 is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Cancel')" rounded @click="showDefault" />
				<b-button :label="$t('Format and Create')" :loading="isValiding"
					:type="createStorageType == 'format' ? 'is-primary' : ''" rounded @click="createStorge(true)" />
				<b-button v-if="createStorageType == 'mountable'" :label="$t('Create')" :loading="isValiding" rounded
					type="is-primary" @click="createStorge(false)" />
			</div>
		</footer>
		<!-- Modal-Card Footer End -->

	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import LottieAnimation from 'lottie-web-vue'
import delay from 'lodash/delay'
import max from 'lodash/max'
import orderBy from 'lodash/orderBy'
import { Field as VeeField, Form as VeeForm } from 'vee-validate'
import DriveItem from './DriveItem.vue'
import StorageItem from './StorageItem.vue'
import StorageCombination from './StorageCombination.vue'
import RaidStatus from './RaidStatus.vue'
import StoragePool from './StoragePool.vue'
import { poolWorking } from './pools'
import { mixin } from '@/mixins/mixin'
import smoothReflow from '@/mixins/smoothReflow'
import cToolTip from '@/components/basicComponents/tooltip/tooltip.vue'
import events from '@/events/events'

export default {
	name: 'storage-manager-panel',
	components: {
		LottieAnimation,
		VeeField,
		VeeForm,
		DriveItem,
		StorageItem,
		StorageCombination,
		RaidStatus,
		StoragePool,
		CToolTip: cToolTip,
	},
	mixins: [smoothReflow, mixin],
	data() {
		return {
			isLoading: true,
			creatIsShow: false,
			isCreating: false,
			isValiding: false,
			activeTab: 0,
			activeDisk: '',
			createStorageName: '',
			createStoragePath: '',
			createStorageSeiral: '',
			createStorageType: '',
			diskData: [],
			unDiskData: [],
			storageData: [],
			raidArrays: [],
			// GET /v2/storage's data; null: the storage service has no storage layer
			poolView: null,
			poolTimer: null,
			poolWorked: false,
			mergeConbinationsStorageData: [],
			hasMergeState: false,
		}
	},

	computed: {
		unmountedArrays() {
			return this.raidArrays.filter(array => !this.storageData.some(storage => storage.raid === array))
		},
		title() {
			return this.creatIsShow ? this.$t('Create Storage') : this.$t('Storage Manager')
		},
		state_createstorage_operability() {
			if (this.unDiskData.length == 0) {
				return 'is-link is-light'
			}
			return 'is-link'
		},
		state_mainstorage_operability() {
			if (this.unDiskData.length == 0) {
				return 'is-link'
			}
			return ''
		},
	},

	watch: {
		activeTab: {
			handler(val, oldVal) {
				if (val === oldVal) {
					return
				}
				switch (val) {
					case 0:
						this.$messageBus('storagemanager_storage')
						break
					case 2:
						this.$messageBus('storagemanager_drive')
						break
				}
			},
		},
		creatIsShow(val) {
			if (val) {
				this.$nextTick(() => {
					this.$refs.inputs.getElement().select()
				})
			}
		},
	},
	mounted() {
		// Smooth
		this.$smoothReflow({
			el: '.modal-card',
			property: ['height', 'width'],
			transition: 'height .25s ease, width .75s ease-out',
		})

		// Get disk list
		const _this = this
		delay(() => {
			_this.getDiskList()
		}, 150)

		this.$EventBus.$on(events.REFRESH_DISKLIST, () => {
			this.getDiskList()
		})
	},

	beforeUnmount() {
		this.$EventBus.$off(events.REFRESH_DISKLIST)
		clearTimeout(this.poolTimer)
	},

	methods: {
		// the storage layer's view; looked at again every few seconds while the pool works (a rebuild,
		// a conversion, a check); a service without it answers 404 and the tab stays hidden
		async refreshPool() {
			clearTimeout(this.poolTimer)
			const first = this.poolView === null
			try {
				this.poolView = (await this.$api.pools.overview()).data.data
			} catch {
				this.poolView = null
				return
			}
			if (first) {
				// the Pool tab, after Storage, Merged Storage and Drive: once rendered, or b-tabs ignores the index
				await this.$nextTick()
				this.activeTab = 3
			}
			const working = poolWorking(this.poolView)
			if (working) {
				this.poolTimer = setTimeout(() => this.refreshPool(), 3000)
			} else if (this.poolWorked) {
				this.getDiskList() // done: the storages and drives changed too
			}
			this.poolWorked = working
		},

		async showMergedStorage() {
			await this.getDiskList()
			this.activeTab = 1
		},

		/**
		 * @description: Get disk list
		 * @param {}
		 * @return {void}
		 */
		async getDiskList(showDefault = false) {
			// get disk list
			try {
				const diskRes = await this.$api.disks.getDiskList()
				this.diskData = diskRes.data.data.disks
				this.unDiskData = diskRes.data.data.avail
			} catch (error) {
				console.log(error.response.message)
			}

			// get storage list
			// TODO: the part is repetition
			//  with APPs Installation Location requirement document
			// 获取merge信息
			let mergeInfo = null
			let mergeStorageList
			try {
				mergeInfo = await this.$api.local_storage.getMergerfsInfo().then((res) => {
					const data = res.data.data
					return Array.isArray(data) ? data[0] : data
				})
				mergeStorageList = mergeInfo && Array.isArray(mergeInfo.source_volume_uuids)
					? mergeInfo.source_volume_uuids
					: []
			} catch (e) {
				mergeStorageList = []
				console.log(e)
			}

			await this.refreshPool()

			// silent on failure: an older LocalStorage has no such route, and the storages show anyway
			const raidByPath = {}
			try {
				this.raidArrays = (await this.$api.disks.raid()).data.data || []
				this.raidArrays.forEach((array) => {
					raidByPath[array.path] = array
				})
			} catch {
				this.raidArrays = []
			}

			try {
				// get storage list info
				const storageRes = await this.$api.storage.list({ system: 'show' }).then(v => v.data.data)
				const storageArray = []
				storageRes.forEach((item) => {
					item.children.forEach((part) => {
						part.disk = item.path
						part.diskName = item.disk_name
						part.diskModel = item.disk_model
						storageArray.push(part)
					})
				})

				const mergeStorageSet = new Set(mergeStorageList)
				const mergeConbinations = []
				const missingMergeSources = new Set(mergeStorageList)
				storageArray.forEach((part) => {
					if (!mergeStorageSet.has(part.uuid)) {
						return
					}
					missingMergeSources.delete(part.uuid)
					// The system volume is never a mergerfs source. Older configurations
					// may still contain its UUID, so filter it from the UI as well.
					if (part.diskName !== 'System') {
						mergeConbinations.push(part)
					}
				})
				missingMergeSources.forEach((uuid) => {
					mergeConbinations.push({
						uuid: '',
						mount_point: '',
						size: '',
						avail: '',
						type: '',
						path: uuid,
						drive_name: '',
						label: '',
						persisted_in: '',
						disk: '',
						diskName: '',
						diskModel: '',
					})
				})
				// sort
				const storageArraySort = orderBy(storageArray, ['diskName', 'label'], ['desc', 'asc'])
				const mergeConbinationsSort = orderBy(mergeConbinations, ['diskName', 'label'], ['desc', 'asc'])

				const remapStorage = (storage) => {
					const size = Number(storage.size)
					const used = Number(storage.used)
					const usePercent = size > 0 && Number.isFinite(used)
						? Math.min(100, Math.floor(used * 100 / size))
						: 0
					return {
						uuid: storage.uuid,
						name: storage.label,
						isSystem: storage.diskName == 'System',
						fsType: storage.type,
						size: storage.size,
						availSize: storage.avail,
						usedSize: storage.used,
						usePercent,
						diskName: storage.drive_name,
						path: storage.path,
						mount_point: storage.mount_point,
						diskPath: storage.disk,
						diskModel: storage.diskModel,
						disk: storage.disk,
						persistedIn: storage.persisted_in,
						raid: raidByPath[storage.disk],
						isMergeSource: storage.diskName !== 'System' && mergeConbinations.some(item => item.uuid === storage.uuid),
					}
				}
				this.storageData = storageArraySort.map(remapStorage)
				this.mergeConbinationsStorageData = mergeConbinationsSort.map(remapStorage)

				const diskNumArray = this.storageData.map((storage) => {
					if (storage.name.includes('Storage')) {
						const diskNum = storage.name.replace('Storage', '')
						return (/^\d+$/.test(diskNum)) ? Number(diskNum) : 0
					} else {
						return 0
					}
				})
				const nextMaxNum = max(diskNumArray) + 1
				if (this.unDiskData.length > 0) {
					this.createStoragePath = this.unDiskData[0].path
					this.createStorageSeiral = this.unDiskData[0].serial
					this.createStorageType = this.getDiskType(this.unDiskData[0])
					this.createStorageName = `Storage${nextMaxNum}`
					this.activeDisk = 0
				}
				if (showDefault) {
					this.showDefault()
					this.isCreating = false
					this.createStorageName = ''
				}
			} catch (error) {
				console.log(error)
			}

			if (this.isLoading && this.mergeConbinationsStorageData.length) {
				this.activeTab = 1
			}
			this.isLoading = false
		},

		disksSort(array) {
			array.sort((a, b) => {
				if (a.diskName == 'System') {
					return -1
				} else if (b.diskName == 'System') {
					return 1
				} else if (a.label > b.label) {
					return 1
				} else if (a.label < b.label) {
					return -1
				} else {
					return 0
				}
			})
		},

		/**
		 * @description: Disk choose handle
		 * @param {int} evt index of select
		 * @return {void}
		 */
		onDiskChoose(index) {
			this.createStoragePath = this.unDiskData[index].path
			this.createStorageSeiral = this.unDiskData[index].serial
			this.createStorageType = this.getDiskType(this.unDiskData[index])
		},
		showDefault() {
			this.creatIsShow = false
		},
		showCreate() {
			this.$messageBus('storagemanager_createstorage')
			this.creatIsShow = true
			const diskNumArray = this.storageData.map((disk) => {
				if (disk.name.includes('Storage')) {
					const diskNum = disk.name.replace('Storage', '')
					return (/^\d+$/.test(diskNum)) ? Number(diskNum) : 0
				} else {
					return 0
				}
			})
			const nextMaxNum = max(diskNumArray) + 1
			this.createStorageName = `Storage${nextMaxNum}`
		},

		// show storage settings modal
		async showStorageSettingsModal() {
			this.$messageBus('storagemanager_mergestorage')
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
				component: defineAsyncComponent(() => import('@/components/Storage/MergeStorages.vue')),
				hasModalCard: true,
				trapFocus: true,
				ariaModal: true,
				canCancel: ['escape'],
				onCancel: () => {
					this.$EventBus.$emit(events.REFRESH_DISKLIST)
				},
				events: {
					'merge-success': () => {
						this.showMergedStorage()
					},
					'close': () => {
						this.$EventBus.$emit(events.REFRESH_DISKLIST)
					},
				},
				props: {
					mergeStorageList,
				},
			})
		},

		/**
		 * @description: Validate form async
		 * @param {object} ref ref of component
		 * @return {boolean}
		 */
		async checkStep(ref) {
			// vee-validate 3 resolves to a Boolean, v4 to { valid, ... } — and an
			// object is always truthy, so read `.valid` whenever it is there.
			const result = await ref.validate()
			return result?.valid ?? result
		},
		/**
		 * @description: Create a new storage
		 * @param {}
		 * @return {void}
		 */
		createStorge(needFormat) {
			this.isValiding = true
			this.checkStep(this.$refs.ob1).then((val) => {
				this.isValiding = false
				if (val) {
					this.submitCreate(needFormat)
				}
			}).catch((err) => {
				this.isValiding = false
				this.$buefy.toast.open({
					duration: 3000,
					message: err.response.data.message,
					type: 'is-danger',
				})
				console.error(err)
			})
		},
		submitCreate(format) {
			this.isCreating = true
			const data = {
				path: this.createStoragePath,
				name: this.createStorageName,
				format,
			}
			this.$api.storage.create(data).then((res) => {
				if (res.status === 200) {
					switch (res.data.success) {
						case 200:
							this.$buefy.toast.open({
								duration: 3000,
								message: this.$t('All Storage successed to be created.'),
								type: 'is-success',
							})
							break
						case 500:
							this.$buefy.toast.open({
								duration: 3000,
								message: this.$t('Some Storage failed to be created.'),
								type: 'is-danger',
							})
							break
					}
					this.getDiskList(true)
				} else {
					this.$buefy.toast.open({
						duration: 3000,
						message: this.$t('All Storage failed to be created.'),
						type: 'is-danger',
					})
				}
			}).catch((err) => {
				this.$buefy.toast.open({
					duration: 3000,
					message: err.response.data.message,
					type: 'is-danger',
				})
				console.error(err)
			}).finally(() => {
				this.isCreating = false
			})
		},

		getDiskType(item) {
			return item.need_format ? 'format' : 'mountable'
		},
	},
}
</script>

<style lang="scss" scoped>
.modal-card .b-tabs {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	max-height: 100%;

	::v-deep .tab-content {
		overflow-y: overlay;
		max-height: 100%;
	}
}

.create-container {
	height: 2.25rem;
	position: absolute;
	right: 0;
	display: flex;
	align-items: center;
}

.storage-modal {
	.modal-card-body {
		.tab-item {
			max-height: calc(100vh - 15rem);
			overflow-y: overlay;
		}
	}

	.close-container {
		position: absolute;
		right: 1.25rem;
		top: 1rem;
	}

	.tab-content {
		padding: 0;
	}

	.status {
		min-width: 7.75rem;
	}
}
</style>

<style lang="scss">
// Same bubble the popper drew: #505459 is a shade lighter than Buefy's `is-dark`,
// and the shadow is dropped globally by common/_others.scss.
.b-tooltip.is-dark .tooltip-content.create-storage-tip {
	background: #505459;
	box-shadow: 0px 1px 2px 1px rgba(0, 1, 0, 0.2);
	border-radius: 6px;

	&::before {
		border-bottom-color: #505459 !important;
	}
}
</style>
