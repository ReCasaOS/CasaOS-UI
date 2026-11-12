<template>
	<div :class="{ '_max-width-320': currentStep === 1 || currentStep === 3 || currentStep === 4 }" class="modal-card">
		<!--    head -->
		<header :class="{ 'pri-head': currentStep <= 2 }" class="modal-card-head ">
			<b-icon v-if="currentStep === 1" class="mr-2 has-text-red" custom-class="_has-text-red-default"
				icon="danger"
				pack="casa" size="is-20"></b-icon>
			<div class="is-flex-grow-1">
				<h3 class=" title is-3">{{ $t(title) }}
					<cToolTip v-if="currentStep === 0" modal="is-success"></cToolTip>
				</h3>
			</div>
			<button class="delete" type="button" @click="cancel"></button>
		</header>
		<!-- remind -->

		<section v-if="currentStep === 0"
			class="notification is-overlay mr-5 ml-5 mb-0 pr-0 pl-0 pt-5 pb-3 non-backgroud">
			<div v-if="currentStep === 0" class="_is-normal _has-text-gray-600 mb-4">
				{{ isPool ? $t('Selected external storage will be merged into CasaOS HD.') : $t('Selected storage will be merged in {folder}.', { folder: mountPoint }) }}
				<div v-if="isPool" class="mt-1">{{ $t('System AppData remains available at /DATA/AppData.') }}</div>
			</div>

			<div v-if="systemStorage" class="is-flex mb-1 radius system-storage-row">
				<div class="ml-2 mr-1 is-flex is-align-items-center _has-text-gray-600">
					<b-icon icon="storage-other" pack="casa" size="is-20"></b-icon>
				</div>
				<div class="is-flex is-flex-grow-1 is-flex-direction-column is-justify-content-center">
					<span class="is-uppercase one-line _is-text-emphasis-03 _has-text-gray-800">
						{{ $t('System Storage') }}
					</span>
					<span class="one-line small-font _has-text-gray-600">
						{{ $t('Excluded from merged storage') }} · {{ systemStorage.displayPath }}
					</span>
				</div>
				<div class="is-flex is-flex-shrink-0 is-flex-direction-column is-justify-content-center mr-2">
					<span class="is-uppercase _is-text-full-03 _has-text-gray-600">{{
						renderSize(systemStorage.size - systemStorage.availSize)
					}}/{{ renderSize(systemStorage.size) }}</span>
				</div>
				<b-checkbox v-model="systemStorageSelected" disabled class="mr-2"></b-checkbox>
			</div>

			<div v-for="(item, index) in storageData" :key="item.path + index" class="is-flex mb-1 radius _height-40">
				<div class="ml-2 mr-1 is-flex is-align-items-center _has-text-gray-600">
					<b-icon icon="storage-other" pack="casa" size="is-20"></b-icon>
				</div>
				<div class="is-flex is-flex-grow-1 is-flex-direction-column is-justify-content-center ">
					<span class="is-uppercase one-line _is-text-emphasis-03 _has-text-gray-800">{{
						item.name || item.path || $t('undefined')
					}}</span>
				</div>
				<div class="is-flex is-flex-shrink-0 is-flex-direction-column is-justify-content-center mr-2">
					<span class="is-uppercase _is-text-full-03 _has-text-gray-600">{{
						renderSize(item.size
							- item.availSize)
					}}/{{ renderSize(item.size) }}</span>
				</div>
				<b-checkbox v-model="checkBoxGroup" :disabled="item.persistedIn !== 'casaos' || item.isSystem"
					:native-value="item.uuid" class="mr-2"></b-checkbox>
			</div>

			<div v-for="(item, index) in storageMissData" :key="item.path + index"
				class="is-flex mb-1 radius _height-40">
				<div class="ml-2 mr-1 is-flex is-align-items-center _has-text-gray-600">
					<b-icon icon="storage-other" pack="casa" size="is-20"></b-icon>
				</div>
				<div class="is-flex is-flex-grow-1 is-flex-direction-column is-justify-content-center ">
					<span class="is-uppercase one-line  _is-text-emphasis-03 _has-text-gray-800">{{
						item.name || item.path || $t('undefined')
					}}</span>
				</div>
				<div class="is-flex is-flex-shrink-0 is-flex-direction-column is-justify-content-center mr-2">
					<span class="is-flex is-align-items-center has-text-danger small-font">
						<b-icon class="warn" custom-size="casa-16px" icon="danger" pack="casa"></b-icon>
						{{ $t('Missing') }}
					</span>
				</div>
				<b-checkbox v-model="checkBoxMissGroup" :native-value="item.path" class="mr-2"></b-checkbox>
			</div>
		</section>

		<div v-if="currentStep === 0 && externalStorageCount < 1"
			class="_has-background-yellow-default _has-text-white _is-normal is-flex is-align-items-center font ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon class="is-16x16" custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ $t('At least one extra hard drive is needed for this feature.') }}
		</div>
		<div v-if="currentStep === 0 && storageMissData.length > 0"
			class="_has-background-yellow-default _has-text-white _is-normal is-flex is-align-items-center font ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon class="is-16x16" custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ $t('Missing storage will be excluded while disconnected and rejoined when available.') }}
		</div>
		<div v-if="currentStep === 0 && isRemovingMerge"
			class="_has-background-yellow-default _has-text-white _is-normal is-flex is-align-items-center font ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon class="is-16x16" custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ isPool ? $t('Removing merged storage hides external files from /DATA but does not delete them. System AppData will be restored.') : $t('Removing the merged storage empties {folder}. The files stay on their drives.', { folder: mountPoint }) }}
		</div>
		<div v-if="currentStep === 0 && checkBoxGroup.length > 0"
			class="_has-background-yellow-default _has-text-white _is-normal is-flex is-align-items-center font ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon class="is-16x16" custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ $t('If the chosen storage is not empty, format better first.') }}
		</div>
		<div v-if="currentStep === 0 && isSplit"
			class="_has-background-red-default _has-text-white _is-normal is-flex is-align-items-center ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ $t('Please back up your data in storage, otherwise the data may be lost.') }}
		</div>
		<div v-if="currentStep === 0 && isPool"
			class="_has-background-red-default _has-text-white _is-normal is-flex is-align-items-center ml-5 mr-5 mb-4 pt-2 pb-2 _radius-line">
			<div class="is-flex left ml-3 mr-2 is-align-items-center">
				<b-icon custom-size="casa-19px" icon="danger" pack="casa"></b-icon>
			</div>
			{{ $t('Existing data outside AppData may be hidden while merged storage is active. Back up important files before continuing.') }}
		</div>

		<section v-if="currentStep > 0"
			class="notification is-overlay mr-5 ml-5 mb-0 pr-0 pl-0 pt-5 pb-4 non-backgroud">
			<div v-if="currentStep === 1" class="is-flex is-align-items-center _is-normal">
				{{ isRemovingMerge ? $t('The merged view will be removed. External disk data will not be deleted.')
					: $t('Existing data outside AppData may be hidden while merged storage is active. AppData remains on system storage.') }}
			</div>
			<template v-if="currentStep === 2">
				<div class="font">
					{{ $t('Enter "I AM SURE" to proceed with the operation.') }}
				</div>
				<b-input ref="inputPassword" v-model="password" class="mt-4" password-reveal
					@keyup.enter="verifyOperate(password)"></b-input>
			</template>
			<div v-if="currentStep === 3" class="is-flex is-align-items-center font">
				<div class="message-danger left mr-2 is-flex is-align-items-center">
					<b-icon class="is-38x38" custom-size="is-size-2" icon="danger" pack="casa"></b-icon>
				</div>
				{{ `${$t('APPs is running')} , ${$t('restart APPs to continue.')}` }}
			</div>
			<div v-if="currentStep === 4" class="is-flex is-align-items-center font">
				<div class="message-danger left mr-2 is-flex is-align-items-center">
					<b-icon class="is-38x38" custom-size="is-size-2" icon="danger" pack="casa"></b-icon>
				</div>
				{{ runName + $t(' is running, restart ') + runName + $t(' to continue.') }}
			</div>
		</section>

		<footer :class="{ 't-line': currentStep <= 2 }" class="modal-card-foot is-flex is-align-items-center ">
			<div class="is-flex-grow-1"></div>
			<div v-if="currentStep === 0 && mergeStorageList.length > 0" class="mr-4">
				<b-button :label="$t('Remove Merged Storage')" :loading="isConnecting"
					class="_has-background-red-default _radius-line _has-text-white" expaned
					@click="removeMergedStorage" />
			</div>
			<div class="mr-4">
				<b-button v-show="currentStep > 2 || currentStep === 1" :label="$t('Cancel')"
					class="_has-background-gray-100 _radius-line" expaned @click="currentStep = 0" />
			</div>
			<div>
				<b-button v-show="currentStep === 0" :label="$t(affirm)" :loading="isConnecting" expaned rounded
					type="is-primary" @click="test" />
				<b-button v-show="currentStep === 1" :label="$t(affirm)" :loading="isConnecting"
					class="_has-background-red-default _radius-line _has-text-white" expaned
					@click="currentStep = 2" />
				<b-button v-show="currentStep === 2" :label="$t(affirm)" :loading="isConnecting" expaned rounded
					type="is-primary" @click="verifyOperate(password)" />
				<b-button v-show="currentStep === 3" :label="$t(affirm)" :loading="isConnecting" expaned rounded
					type="is-primary" @click="restart" />
				<b-button v-show="currentStep === 4" :label="$t(affirm)" :loading="isConnecting" expaned rounded
					type="is-primary" @click="restart" />
			</div>
		</footer>
	</div>
</template>

<script>
import filter from 'lodash/filter'
import escape from 'lodash/escape'
import { mixin } from '@/mixins/mixin'
import events from '@/events/events'
import cToolTip from '@/components/basicComponents/tooltip/tooltip.vue'
import { ice_i18n } from '@/mixins/base/common-i18n'

export default {
	name: 'MergeStorages',
	mixins: [mixin],
	props: {
		mergeStorageList: {
			type: Array,
			required: true,
			default: () => [],
		},
		// where the merged storage appears: /DATA is the apps' own folder, any other is left to itself
		mountPoint: {
			type: String,
			default: '/DATA',
		},
	},
	components: {
		CToolTip: cToolTip,
	},
	mounted() {
		this.checkBoxGroup.push(...this.mergeStorageList)
		this.getDiskList()
	},
	watch: {
		// 0 default :mainstorage settings
		// 1 test whether the storage is empty :: 1 is empty
		// 2 Data Protected :: input password  :: 2 is not empty
		// 3 APPs Restart
		// 4 APP Restart
		currentStep(val) {
			switch (val) {
				case 0:
					this.title = 'Merge Storages'
					this.affirm = 'Submit'
					break
				case 2:
					this.title = 'Data Protected'
					this.affirm = 'Submit'
					this.$nextTick(() => {
						this.$refs.inputPassword.focus()
					})
					break
				case 3:
					this.title = 'APPs Restart'
					this.affirm = 'Restart'
					break
				case 4:
					this.title = 'APP Restart'
					this.affirm = 'Restart'
					break
				default:
					break
			}
		},
	},
	computed: {
		isPool() {
			return this.mountPoint === '/DATA'
		},
		extended() {
			return this.checkBoxGroup.join(':')
		},
		externalStorageCount() {
			return this.storageData.filter(item => !item.isSystem && item.persistedIn === 'casaos').length
		},
		isRemovingMerge() {
			const hasExternalSelection = this.checkBoxGroup.some((uuid) => {
				const storage = this.storageData.find(item => item.uuid === uuid)
				return storage ? !storage.isSystem : this.checkBoxMissGroup.includes(uuid)
			}) || this.checkBoxMissGroup.length > 0
			return this.mergeStorageList.length > 0 && !hasExternalSelection
		},
		isSplit() {
			return !this.mergeStorageList.every(item => this.checkBoxGroup.includes(item) || this.checkBoxMissGroup.includes(item))
		},
	},
	data() {
		return {
			systemStorage: null,
			systemStorageSelected: false,
			storageData: [],
			storageMissData: [],
			diskData: {},
			unDiskData: {},
			checkBoxGroup: [],
			checkBoxMissGroup: [],
			isConnecting: false,
			currentStep: 0,
			title: 'Merge Storages',
			affirm: 'Submit',
			password: '',
			runName: '',
			notEmpty: false,
		}
	},
	methods: {
		/**
		 * @description: Get disk list
		 * src/components/Storage/StorageManagerPanel.vue:234
		 */
		async getDiskList() {
			// get storage list
			// TODO: the part is repetition
			//  with APPs Installation Location requirement document
			// const storageRes = await this.$api.storage.list({system: "show"})
			let sourceBasePath = '/var/lib/casaos/files'
			try {
				const mergeInfo = await this.$api.local_storage.getMergerfsInfo().then((res) => {
					const data = res.data.data
					return Array.isArray(data) ? data[0] : data
				})
				if (mergeInfo && mergeInfo.source_base_path) {
					sourceBasePath = mergeInfo.source_base_path
				}
			} catch (e) {
				console.log(e)
			}

			const storageRes = await this.$api.storage.list({ system: 'show' })
			const allStorage = []
			const storageMissArray = []
			let testMergeMiss = [...this.mergeStorageList]
			storageRes.data.data.forEach((item) => {
				item.children.forEach((part) => {
					part.disk = item.path
					part.diskName = item.disk_name
					allStorage.push(part)
					testMergeMiss = testMergeMiss.filter(v => v !== part.uuid)
				})
			})

			const systemStorage = allStorage
				.filter((storage) => {
					const mountPoint = storage.mount_point
					return storage.diskName === 'System' || (mountPoint && (mountPoint === '/'
						|| sourceBasePath === mountPoint
						|| sourceBasePath.startsWith(`${mountPoint.replace(/\/$/, '')}/`)))
				})
				.sort((a, b) => {
					if (a.diskName === 'System' && b.diskName !== 'System')
						return -1
					if (a.diskName !== 'System' && b.diskName === 'System')
						return 1
					return (b.mount_point || '').length - (a.mount_point || '').length
				})[0]
			const storageArray = allStorage.filter(storage => storage.diskName !== 'System' && storage !== systemStorage)
			this.systemStorage = systemStorage
				? {
						uuid: systemStorage.uuid,
						size: systemStorage.size,
						availSize: systemStorage.avail,
						displayPath: '/var/lib/casaos/files',
					}
				: null
			this.checkBoxMissGroup = []
			this.checkBoxMissGroup.push(...testMergeMiss)
			testMergeMiss.forEach((item) => {
				storageMissArray.push({
					uuid: '',
					mount_point: '',
					size: '',
					avail: '',
					type: '',
					path: item,
					drive_name: '',
					label: '',
					persisted_in: '',
					disk: '',
					diskName: '',
				})
			})

			this.storageData = storageArray.map((storage) => {
				return {
					uuid: storage.uuid,
					name: storage.label,
					isSystem: storage.diskName === 'System',
					fsType: storage.type,
					size: storage.size,
					availSize: storage.avail,
					usePercent: 100 - Math.floor(storage.avail * 100 / storage.size),
					diskName: storage.drive_name,
					path: storage.path,
					mount_point: storage.mount_point,
					disk: storage.disk,
					persistedIn: storage.persisted_in,
				}
			})

			this.storageMissData = storageMissArray.map((storage) => {
				return {
					uuid: storage.uuid,
					name: storage.label,
					isSystem: storage.diskName === 'System',
					fsType: storage.type,
					size: storage.size,
					availSize: storage.avail,
					usePercent: 100 - Math.floor(storage.avail * 100 / storage.size),
					diskName: storage.drive_name,
					path: storage.path,
					mount_point: storage.mount_point,
					disk: storage.disk,
					persistedIn: storage.persisted_in,
				}
			})
		},

		/**
		 * @description: update merge info
		 * sync function
		 */
		async updateMerge(dockerInfo) {
			const sourceVolumeUuids = [...new Set([
				...this.checkBoxGroup,
				...this.checkBoxMissGroup,
			])].filter(uuid => uuid && (!this.systemStorage || uuid !== this.systemStorage.uuid))

			try {
				await this.$api.local_storage.updateMergerfsInfo({
					fstype: 'fuse.mergerfs',
					mount_point: this.mountPoint,
					source_base_path: '',
					source_volume_uuids: sourceVolumeUuids,
				})

				await Promise.all(dockerInfo.map(async (item) => {
					if (item.app_type === 'v2app') {
						await this.$openAPI.appCompose.setComposeAppStatus(item.name, 'start')
					} else {
						await this.$api.container.updateState(item.name, 'start')
					}
				}))

				this.$buefy.toast.open({
					message: 'Merge Storages Success',
					type: 'is-success',
					position: 'is-top',
					duration: 5000,
					queue: true,
					indefinite: false,
				})
				this.$EventBus.$emit(events.RELOAD_APP_LIST)
				this.$EventBus.$emit(events.RELOAD_MOUNT_LIST)
				this.$emit('merge-success')
				this.$emit('close')
			} catch (e) {
				this.$buefy.toast.open({
					message: escape(e.response?.data?.data || e.response?.data?.message || e.message),
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
				})
				console.error(e)
			} finally {
				this.isConnecting = false
			}
		},

		cancel() {
			this.$emit('close')
		},
		removeMergedStorage() {
			this.checkBoxGroup = []
			this.checkBoxMissGroup = []
			this.test()
		},
		async test() {
			if (!this.isRemovingMerge && this.mergeStorageList.length === 0
				&& this.checkBoxGroup.length === 0 && this.checkBoxMissGroup.length === 0) {
				this.$buefy.toast.open({
					message: this.$t('Select at least one external storage source.'),
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
				})
				return
			}
			this.isConnecting = true
			// submit
			this.$messageBus('storagemanager_mergestorage')
			const folderSize = this.isPool ? this.$api.folder.getFolderSize('/DATA') : Promise.resolve({ data: { data: false } })
			this.notEmpty = await folderSize.then((res) => {
				return res.data.data
			}).catch((e) => {
				this.$buefy.toast.open({
					message: escape(e.response?.data?.data || e.response?.data?.message || e.message),
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
				})
				console.error(e)
				return false
			}).then(() => {
				this.isConnecting = false
			})
			// business :: If storage is empty, no reminder
			if (this.notEmpty) {
				this.title = this.isRemovingMerge ? 'Remove Merged Storage' : 'Reset Warning'
				this.affirm = this.isRemovingMerge ? 'Remove' : 'Reset'
				this.currentStep = 1
			} else {
				this.submit()
			}
		},
		//
		async submit(e, nextStep = false) {
			// operation : split the mergerfs
			const notSplit = this.mergeStorageList.every(item => this.checkBoxGroup.includes(item) || this.checkBoxMissGroup.includes(item))
			if (this.isRemovingMerge || notSplit || nextStep) {
				if (!this.isPool) {
					this.restart()
					return
				}
				// get docker info
				let dockerInfo = await this.$openAPI.appGrid.getAppGrid().then(res => res.data.data || [])
				dockerInfo = filter(dockerInfo, { status: 'running' })
				if (this.notEmpty) {
					this.restart()
					return
				} else if (dockerInfo.length === 1) {
					this.currentStep = 4
					this.runName = ice_i18n(dockerInfo[0].title)
					return
				} else if (dockerInfo.length > 1) {
					this.currentStep = 3
					this.runName = dockerInfo.map(item => ice_i18n(item.title)).join(',')
					return
				} else {
					this.restart()
					return
				}
			}
			this.currentStep = 2
		},

		async restart() {
			this.isConnecting = true
			try {
				if (!this.isPool) {
					await this.updateMerge([])
					return
				}
				// 将所有应用重启。
				// 1、 获取应用信息，主要是运行中的应用. 2、关闭应用 3、合并磁盘 4、启动应用
				let dockerInfo = await this.$openAPI.appGrid.getAppGrid().then(res => res.data.data || [])
				dockerInfo = filter(dockerInfo, { status: 'running' })
				const container = this.$api.container
				const compose = this.$openAPI.appCompose
				await Promise.all(dockerInfo.map(async (item) => {
					if (item.app_type === 'v2app') {
						await compose.setComposeAppStatus(item.name, 'stop')
					} else {
						await container.updateState(item.name, 'stop')
					}
				}))

				const initStatus = await this.$api.local_storage.getInitMergerfsStatus()
				if (initStatus.data.data !== 'initialized') {
					if (this.isRemovingMerge) {
						this.$buefy.toast.open({
							message: this.$t('No merged storage is currently configured.'),
							type: 'is-danger',
							position: 'is-top',
							duration: 5000,
						})
						return
					}
					await this.$api.local_storage.initMergerfs({ mount_point: '/DATA' })
				}
				await this.updateMerge(dockerInfo)
			} catch (e) {
				this.isConnecting = false
				this.$buefy.toast.open({
					message: escape(e.response?.data?.data || e.response?.data?.message || e.message),
					position: 'is-top',
					type: 'is-danger',
					duration: 5000,
				})
				console.error(e)
			}
		},

		verifyOperate(content) {
			if (content === 'I AM SURE') {
				this.submit(null, true)
				return
			}
			this.$buefy.toast.open({
				duration: 5000,
				message: this.$t('Incorrect input.'),
				type: 'is-danger',
			})
		},

	}
	,
}
</script>

<style lang="scss" scoped>
.system-storage-row {
	min-height: 3rem;
}

.non-backgroud {
	background: none;
}

.pri-head {
	line-height: 1.875rem;
	border-bottom: var(--casa-border-subtle) 1px solid !important;
}

.pri-margin {
	margin: 2rem;
}

.pri-mrl-2rem {
	margin-left: 2rem;
	margin-right: 2rem;

	.pri-mtr-3px {
		margin-top: 0.1875rem;
		margin-bottom: 0.1875rem;
		min-height: 2.75rem;
		border-radius: 0.25rem;
	}

	div:hover {
		background: hsla(215, 89%, 93%, 1);
	}
}

._is-normal {
	/* Text 400Regular/Text03 */

	font-family: $family-sans-serif;
	font-style: normal;
	font-weight: 400;
	font-size: 14px;
	line-height: 20px;
	/* identical to box height, or 143% */

	font-feature-settings: 'pnum' on, 'lnum' on;
}

._is-text-emphasis-03 {
	/* Text 500Medium/Text03 */

	font-family: $family-sans-serif;
	font-style: normal;
	font-weight: 500;
	font-size: 14px;
	line-height: 20px;
	/* identical to box height, or 143% */

	font-feature-settings: 'pnum' on, 'lnum' on;
}

._is-text-full-03 {
	/* Text 400Regular/Text03 */

	font-family: $family-sans-serif;
	font-style: normal;
	font-weight: 400;
	font-size: 14px;
	line-height: 20px;
	/* identical to box height, or 143% */

	text-align: right;
	font-feature-settings: 'pnum' on, 'lnum' on;
}

._has-text-gray-800 {
	/* Gary/800 */

	color: var(--casa-text);
}

._has-text-gray-600 {
	/* Gary/600 */
	color: var(--casa-text-muted);
}

._has-text-red-default {
	/* Red/Default */
	color: hsla(18, 98%, 55%, 1);
}

._has-text-white {
	/* White/White */
	color: hsla(0, 0%, 100%, 1);
}

._has-background-red-default {
	/* Red/Default */
	background: hsla(18, 98%, 55%, 1);
}

._has-background-yellow-default {
	/* Red/Default */
	background: hsla(44, 98%, 46%, 1)
}

._has-background-gray-100 {
	/* Gray/100 */
	background: var(--casa-hover);
}

._height-40 {
	height: 2.5rem;
}

//._is-20x20 {
//	width: 1.25rem;
//	height: 1.25rem;
//}

.small-font {
	font-family: $family-sans-serif;
	font-size: 12px;
	font-weight: 400;
	line-height: 18px;
	letter-spacing: 0;
}

.radius {
	box-sizing: border-box;
	border: 1px solid var(--casa-border-subtle);
	border-radius: 0.375rem;
}

._radius-line {
	border-radius: 0.375rem;
	border: 0 solid rgba(0, 0, 0, 0);
}

.pri-text-color {
	color: hsla(0, 0%, 0%, 0.4);
}

.message-danger {
	color: hsla(348, 86%, 61%, 1);
}

.message-alert {
	height: 2rem;
	margin-top: 0;
	margin-bottom: 1rem;
	margin-left: 2rem;
	margin-right: 2rem;
	border-radius: 0.25rem;
	color: hsla(40, 100%, 43%, 1);
	font-size: 0.875rem;
	font-style: normal;
	background: hsla(40, 100%, 95%, 1);
}

.pri-message-danger {
	height: 2rem;
	margin-top: 0;
	margin-bottom: 1rem;
	margin-left: 2rem;
	margin-right: 2rem;
	border-radius: 0.25rem;
	color: hsla(348, 86%, 61%, 1);
	font-size: 0.875rem;
	font-style: normal;
	background: hsla(348, 100%, 95%, 1);
}

.t-line {
	border-top: var(--casa-border-subtle) 1px solid !important;
}

.warn {
	color: hsla(348, 86%, 61%, 1);
}

.is-38x38 {
	width: 2.375rem;
	height: 2.375rem;
}

._max-width-320 {
	max-width: 20rem;
}
</style>

<style lang="scss">
.pri-mtr-3px .control-label {
	display: none;
}
</style>
