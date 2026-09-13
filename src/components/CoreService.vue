<template>
	<Swiper v-bind="swiperOptions" @swiper="setSwiper" @slide-change-transition-start="$messageBus('youshouldknow_slide')">
		<SwiperSlide v-for="(noticeCard, key) in noticesData" :key="key" :class="{ _singleWidth: showFullCard }">
			<NoticeBlock :notice-data="noticeCard" :notice-type="key" @delete-notice="refreshNotice" />
		</SwiperSlide>
		<SwiperSlide v-if="recommendShow">
			<SyncBlock />
		</SwiperSlide>
		<SwiperSlide v-if="recommendShow">
			<SmartBlock />
		</SwiperSlide>
		<template #container-end>
			<div v-show="recommendShow || noticeLength !== 0" class="swiper-pagination"></div>
			<img :src="require('@/assets/img/widgets/swiper-left.svg')" alt="prev"
				class="swiper-button-prev">
			<img :src="require('@/assets/img/widgets/swiper-right.svg')" alt="next"
				class="swiper-button-next">
		</template>
	</Swiper>
</template>

<script>
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Pagination } from 'swiper/modules'
import sortBy from 'lodash/sortBy'
import { failuresToAnnounce, rememberBackupFailures, seenBackupFailures } from '@/components/settings/backupFailures'
import noticeBlock from '@/components/noticBlock/noticeBlock'
import { mixin } from '@/mixins/mixin'
import SyncBlock from '@/components/syncthing/SyncBlock.vue'
import SmartBlock from '@/components/smartHome/SmartBlock.vue'
import events from '@/events/events'
import Business_ShowNewAppTag from '@/mixins/app/Business_ShowNewAppTag'
import DiskLearnMore from '@/components/Storage/DiskLearnMore.vue'
import { ice_i18n } from '@/mixins/base/common-i18n'

export default {
	name: 'CoreService',
	components: { SmartBlock, SyncBlock, NoticeBlock: noticeBlock, Swiper, SwiperSlide },
	mixins: [mixin, Business_ShowNewAppTag],
	inject: ['homeShowFiles'],
	data() {
		return {
			notice: 'local-storage',
			isLoading: false,
			swiperOptions: {
				modules: [Navigation, Pagination],
				watchOverflow: true,
				breakpoints: {
					450: {
						slidesPerView: 1,
					},
					960: {
						slidesPerView: 2,
					},
				},
				spaceBetween: 16,
				pagination: {
					el: '.swiper-pagination',
					bulletClass: 'swiper-pagination-bullet',
					clickable: true,
				},
				navigation: {
					nextEl: '.swiper-button-next',
					prevEl: '.swiper-button-prev',
					disabledClass: 'swiper-button-disabled',
				},
				observer: true,
			},
			noticesData: {},
			dockerProgress: {},
			totalPercentage: 0,
		}
	},
	computed: {
		recommendShow() {
			return this.$store.state.recommendSwitch
		},
		noticeLength() {
			return Object.keys(this.noticesData).length
		},
		// full width to show with single notice card
		showFullCard() {
			return this.noticeLength === 1 && !this.recommendShow
		},
	},
	watch: {
		noticeLength: {
			handler(val, oldValue) {
				if (val === oldValue) {
					return
				}
				if (val === 0) {
					this.$messageBus('youshouldknow_show', 'false')
				} else if (oldValue === 0) {
					this.$messageBus('youshouldknow_show', 'true')
				}
				// skip new notice card
				this.$nextTick(() => {
					this.swiper.slideTo(val - 1, 1000, true)
				})
			},
		},
	},
	created() {
		this.getMessageFromLetter()
		this.initUIEventBus()
	},
	mounted() {
		this.WSHub = this.initMessageBus()
		this.announceBackupFailures()
	},
	beforeUnmount() {
		for (const key in this.WSHub) {
			this.WSHub[key].close()
		}
		this.destroyUIEventBus()
	},
	methods: {
		// Kept off data(): a Swiper instance behind a reactive proxy is not one
		// Swiper recognises as its own.
		setSwiper(swiper) {
			this.swiper = swiper
		},

		// A scheduled backup that failed in the night was in the run log and
		// nowhere else. Said once per failure, here, where the dashboard opens.
		async announceBackupFailures() {
			let runs = []
			try {
				const res = await this.$api.backup.getRuns()
				runs = res.data.data || []
			} catch {
				return
			}

			const seen = seenBackupFailures()
			for (const run of failuresToAnnounce(runs, seen)) {
				this.$buefy.notification.open({
					type: 'is-danger',
					position: 'is-top',
					indefinite: true,
					queue: false,
					message: this.$t('Scheduled backup of {app} to {destination} failed: {error}', {
						app: run.app,
						destination: run.destination,
						error: run.error,
					}),
				})
				seen.push(run.stamp)
			}
			rememberBackupFailures(seen)
		},
		_isValidDiskEvent(evt) {
			let p = {}
			if (typeof evt?.properties === 'string') {
				try {
					p = JSON.parse(evt.properties)
				} catch {
					p = {}
				}
			} else if (typeof evt?.properties === 'object' && evt.properties !== null) {
				p = evt.properties
			}

			const asNum = (v) => {
				const n = typeof v === 'number' ? v : Number.parseFloat(v)
				return Number.isFinite(n) ? n : Number.NaN
			}

			const size = asNum(p.size)
			if (!size || !Number.isFinite(size) || size <= 0)
				return false

			const path = p['local-storage:path'] || p.path || ''
			const mnt = p.mount_point || ''
			if (typeof path === 'string' && path.startsWith('/dev/loop') && !mnt)
				return false

			return true
		},
		formatDiskUsage(properties) {
			const size = Number(properties.size)
			const available = Number(properties.avail)
			const mountPoint = properties.mount_point
			const isMounted = Array.isArray(mountPoint)
				? mountPoint.length > 0
				: typeof mountPoint === 'string' && mountPoint.trim().length > 0

			if (Number.isFinite(size) && size > 0 && isMounted
				&& Number.isFinite(available) && available >= 0 && available <= size) {
				const reportedUsed = Number(properties.used)
				const used = Number.isFinite(reportedUsed) && reportedUsed >= 0 && reportedUsed <= size
					? reportedUsed
					: size - available
				return `${this.renderSize(used)} / ${this.renderSize(size)}`
			}

			return `— / ${this.renderSize(size)}`
		},
		createWS(domain) {
			// reference:
			const socket = new WebSocket(`${this.$wsProtocol}//${this.$baseURL}/v2/message_bus/event/${domain}`)
			socket.onopen = () => {
				console.log('socket open')
			}
			socket.onclose = () => {
				console.log('close socket')
			}
			socket.onerror = (e) => {
				console.log('socket failure', e)
			}
			socket.onmessage = (event) => {
				const eventJson = JSON.parse(event.data)
				this.patchTransform(eventJson)
			}
			return socket
		},
		initUIEventBus() {
			this.$EventBus.$on('casaUI:openInFiles', (path) => {
				this.homeShowFiles(path)
			})

			this.$EventBus.$on('casaUI:openDiskLearnMore', () => {
				this.$buefy.modal.open({
					component: DiskLearnMore,
					hasModalCard: true,
					customClass: 'storage-modal',
					trapFocus: true,
					canCancel: [],
					scroll: 'keep',
					animation: 'zoom-in',
				})
			})

			// this.$EventBus.$on('casaUI:openStorageManager', () => {
			//  this.showStorageSettingsModal();
			// });
		},
		destroyUIEventBus() {
			this.$EventBus.$off('casaUI:openInFiles')
			this.$EventBus.$off('casaUI:openDiskLearnMore')
			// this.$EventBus.$off('casaUI:openStorageManager');
		},
		triggerUIEventBus(event) {
			const eventJson = JSON.parse(event)
			this.$emit(eventJson.name, eventJson.propertyTypeList)
		},
		initMessageBus() {
			// config files
			const WSHub = Object.create(null)
			// subscriptionMessageSourse.forEach((item) => {
			// 	WSHub[item] = this.createWS(item)
			// })
			return WSHub
		},
		getMessageFromLetter() {
			this.$api.users.getLetter().then((res) => {
				const sortedData = sortBy(res.data, ['timestamp'])
				sortedData.forEach((item) => {
					const json = {
						...item,
						properties: JSON.parse(item.properties),
					}
					if (json.properties.tran !== 'usb') {
						this.patchTransform(json)
					}
				})
			})
		},
		refreshNotice(data, type) {
			// this.noticesData[type] = data
			delete this.noticesData[type]
		},
		patchTransform(eventJson) {
			// only show which is disk from local-storage
			const notShow = eventJson.name.split(':')[1] !== 'disk'
			if (notShow) {
				// delete letter which is partition!
				this.$api.users.delLetter(eventJson.uuid)
				return
			}
			// Business : whether formatting is required
			let eventType
			if (eventJson.properties['children:num'] > 0) {
				eventType = eventJson.properties.tran
			} else {
				eventType = ''
			}

			const operateType = eventJson.name.split(':')[2]
			if (eventJson.name === 'local-storage:disk:added' && !this._isValidDiskEvent(eventJson)) {
				// delete letter which is invalid disk event!
				this.$api.users.delLetter(eventJson.uuid)
				return
			}
			const entityUUID = eventJson.properties.serial || eventJson.properties['local-storage:uuid']
			switch (eventType) {
				case 'usb':
					this.transformUSB(eventJson, operateType, entityUUID)
					break
				case 'newDisk':
					this.transformNewDisk(eventJson, operateType, entityUUID)
					break
				default:
					this.transformLocalStorage(eventJson, operateType, entityUUID)
					break
			}
		},
		transformUSB(eventJson) {
			const eventType = eventJson.properties.tran
			const operateType = eventJson.name.split(':')[2]
			const entityUUID = eventJson.properties.serial || eventJson.properties['local-storage:uuid']
			if (!this.noticesData[eventType]) {
				this.noticesData[eventType] = {
					prelude: {
						title: 'Found a new drive',
						icon: '',
					},
					content: {},
					contentType: 'list',
					operate: {
						type: 'casaUI:eventBus',
						title: 'Open in Files',
						event: 'casaUI:openInFiles',
						path: '/Storage',
						icon: 'mdi-arrow-right',
					},
				}
			}
			if (operateType === 'added') {
				const percent = this.formatDiskUsage(eventJson.properties)
				this.noticesData[eventType].content[entityUUID] = {
					title: eventJson.properties.model || 'Found a new drive',
					icon: '/storage/USB.png',
					color: 'is-primary',
					path: eventJson.properties['local-storage:path'],
					uuid: entityUUID,
					value: percent,
					messageUUID: eventJson.uuid,
				}
				this.noticesData[eventType].operate.path = eventJson.properties.mount_point
			} else if (operateType === 'removed') {
				// Delete according to the uuid with this.noticesData[eventType]['content'] from BackEnd-DB
				if (this.noticesData[eventType] && this.noticesData[eventType].content[entityUUID]) {
					this.$api.users.delLetter(this.noticesData[eventType].content[entityUUID].messageUUID)
					delete this.noticesData[eventType].content[entityUUID]
				}
				this.$api.users.delLetter(eventJson.uuid)
				if (Object.keys(this.noticesData[eventType].content).length === 0) {
					delete this.noticesData[eventType]
				}
			}
		},
		transformLocalStorage(eventJson /* operateType */) {
			// let eventType = eventJson.properties['tran']
			const operateType = eventJson.name.split(':')[2]
			const driveType = eventJson.name.split(':')[1]
			const entityUUID = eventJson.properties.serial || eventJson.properties['local-storage:uuid']
			if (!this.noticesData[driveType]) {
				this.noticesData[driveType] = {
					prelude: {
						title: 'Found a new drive',
						icon: '',
					},
					content: {},
					contentType: 'list',
					operate: {
						type: 'casaUI:eventBus',
						title: 'Storage Manager',
						event: 'casaUI:openStorageManager',
						path: '/Storage',
						icon: 'mdi-arrow-right',
					},
				}
			}
			if (operateType === 'added') {
				const percent = this.formatDiskUsage(eventJson.properties)
				// let percent = eventType.toUpperCase();
				this.noticesData[driveType].content[entityUUID] = {
					title: eventJson.properties.model || 'Found a new drive',
					icon: '/storage/storage.png',
					color: 'is-primary',
					path: eventJson.properties['local-storage:path'],
					uuid: entityUUID,
					value: percent,
					messageUUID: eventJson.uuid,
				}
				this.noticesData[driveType].operate.path = eventJson.properties.mount_point
			} else if (operateType === 'removed') {
				// Delete according to the uuid with this.noticesData[driveType]['content'] from BackEnd-DB
				if (this.noticesData[driveType] && this.noticesData[driveType].content[entityUUID]) {
					this.$api.users.delLetter(this.noticesData[driveType].content[entityUUID].messageUUID)
					delete this.noticesData[driveType].content[entityUUID]
				}
				this.$api.users.delLetter(eventJson.uuid)
				if (Object.keys(this.noticesData[driveType].content).length === 0) {
					delete this.noticesData[driveType]
				}
			}
		},
		transformNewDisk(eventJson, operateType) {
			const eventType = eventJson.properties.tran
			const entityUUID = eventJson.properties.serial || eventJson.properties['local-storage:uuid']
			if (!this.noticesData[eventType]) {
				this.noticesData[eventType] = {
					prelude: {
						title: 'Need to add a new disk',
						icon: '',
					},
					content: {},
					contentType: 'list',
					operate: {
						type: 'casaUI:eventBus',
						title: 'Learn more',
						event: 'casaUI:openDiskLearnMore',
						path: '/Storage',
						icon: 'mdi-arrow-right',
					},
				}
			}
			if (operateType === 'added') {
				const percent = this.formatDiskUsage(eventJson.properties)
				this.noticesData[eventType].content[entityUUID] = {
					title: eventJson.properties.model || 'Found a new drive',
					icon: '/storage/disk.png',
					color: 'is-primary',
					path: eventJson.properties['local-storage:path'],
					uuid: entityUUID,
					value: percent,
					messageUUID: eventJson.uuid,
				}
				this.noticesData[eventType].operate.path = eventJson.properties.mount_point
			} else if (operateType === 'removed') {
				// Delete according to the uuid with this.noticesData[eventType]['content'] from BackEnd-DB
				if (this.noticesData[eventType] && this.noticesData[eventType].content[entityUUID]) {
					this.$api.users.delLetter(this.noticesData[eventType].content[entityUUID].messageUUID)
					delete this.noticesData[eventType].content[entityUUID]
				}

				this.$api.users.delLetter(eventJson.uuid)
				if (Object.keys(this.noticesData[eventType].content).length === 0) {
					delete this.noticesData[eventType]
				}
			}
		},
		addNotice(Json, rootName) {
			this.noticesData[rootName] = {
				prelude: {
					title: Json.title,
					icon: Json.icon,
				},
				content: Json.content,
				contentType: Json.contentType,
				operate: Json.operate,
			}
		},
		removeNotice(rootName) {
			delete this.noticesData[rootName]
		},

		// The title is JSON and it is optional: it comes from the app's store entry,
		// and an app whose compose file has no `x-casaos` has none. Parsing it
		// unguarded threw inside the socket handler, which is a card that never
		// appears rather than a card with a poor name.
		appTitle(res) {
			const raw = res.Properties['app:title']
			if (raw) {
				try {
					return ice_i18n(JSON.parse(raw))
				} catch {
					// fall through to the name
				}
			}

			return res.Properties['app:name']
		},

		backupCardName(res) {
			return `${res.Properties['backup:kind'] || 'backup'}:${res.Properties['app:name']}`
		},

		backupCardTitle(res) {
			return res.Properties['backup:kind'] === 'restore'
				? this.$t('Restoring {title}', { title: this.appTitle(res) })
				: this.$t('Backing up {title}', { title: this.appTitle(res) })
		},

		transformAppInstallationProgress(res) {
			if (res.finished) {
				if (this.noticesData[res.name]) {
					this.removeNotice(res.name)
				}
				this.$EventBus.$emit(events.RELOAD_APP_LIST)
				if (res.isNewTag) {
					this.addIdToSessionStorage(res.name)
				}
				return
			}

			if (this.noticesData[res.name]) {
				if (res.message !== '') {
					try {
						const progress = Number(res.message) < 0 ? 0 : Number(res.message)
						let currentInstallAppText = ''
						if (String(res.name).startsWith('backup:') || String(res.name).startsWith('restore:')) {
							currentInstallAppText = this.$t('{percent}% done', { percent: progress })
						} else if (progress?.toString() === '0') {
							currentInstallAppText = this.$t('Starting installation')
						} else if (progress?.toString() === '100') {
							currentInstallAppText = this.$t('Installation completed')
						} else {
							// shown as written rather than through $t at the other end,
							// so it has to arrive translated
							currentInstallAppText = this.$t('Installing {progress}%', { progress })
						}
						this.noticesData[res.name].content = {
							text: currentInstallAppText,
							value: progress,
						}
					} catch (e) {
						console.log(e)
					}
				}
				return
			}

			const data = {
				title: this.$t('Installing {title}', { title: res.title }),
				icon: res.icon,
				content: {
					text: res?.message,
					value: 0,
				},
				contentType: 'progress',
				operate: false,
			}
			this.addNotice(data, res.name)
		},

	},
	sockets: {
		'app:apply-changes-begin': function (res) {
			const title = this.appTitle(res)
			this.transformAppInstallationProgress({
				finished: false,
				name: res.Properties['app:name'],
				title,
				id: res.Properties['app:name'],
				success: true,
				message: 'Starting pulling image info',
				icon: res.Properties['app:icon'],
			})
		},
		'app:apply-changes-end': function (res) {
			this.$buefy.toast.open({
				message: `The setting of ${res.Properties['app:name']} is complete`,
				duration: 5000,
				type: 'is-success',
			})
			this.transformAppInstallationProgress({
				finished: true,
				// First name. Second app:name.The name from CheckThenUpdate.The app:name from install.
				name: res.Properties['app:name'],
				message: res.Properties.message,
				icon: res.Properties['app:icon'],
			})
		},
		'app:apply-changes-error': function (res) {
			this.$buefy.toast.open({
				message: res.Properties.message,
				duration: 5000,
				type: 'is-danger',
			})
			this.transformAppInstallationProgress({
				// Display error messages
				finished: false,
				// First name. Second app:name.The name from CheckThenUpdate.The app:name from install.
				name: `${res.Properties['app:name']}error`,
				success: false,
				title: `${res.Properties['app:name']}Error Info`,
				message: res.Properties.message,
				icon: res.Properties['app:icon'],
			})
		},
		'app:install-begin': function (res) {
			const title = this.appTitle(res)
			this.transformAppInstallationProgress({
				finished: false,
				name: res.Properties['app:name'],
				title,
				id: res.Properties['app:name'],
				success: true,
				type: 'install-begin',
				message: 'Starting installation',
				icon: res.Properties['app:icon'],
			})
		},
		'app:install-end': function (res) {
			this.transformAppInstallationProgress({
				finished: true,
				// First name. Second app:name.The name from CheckThenUpdate.The app:name from install.
				name: res.Properties['app:name'],
				id: res.Properties['app:name'],
				icon: res.Properties['app:icon'],
				isNewTag: true,
			})
		},
		'app:install-error': function (res) {
			this.transformAppInstallationProgress({
				// Display error messages
				finished: false,
				// First name. Second app:name.The name from CheckThenUpdate.The app:name from install.
				name: `${res.Properties['app:name']}error`,
				success: false,
				title: `${res.Properties['app:name']} Error Info`,
				message: res.Properties.message,
				icon: res.Properties['app:icon'],
				isNewTag: true,
			})
		},

		// These two read `name` and `cid`, which no event has ever carried: the
		// properties are `app:name`, `app:title` and `app:icon`, as everywhere else.
		// So an update opened a second card with no name under the key `undefined`,
		// and removed that one at the end, while the real card -- opened by
		// app:install-progress under the app's name -- stayed on screen at whatever
		// percentage it had reached, for ever.
		'app:update-begin': function (res) {
			this.transformAppInstallationProgress({
				finished: false,
				name: res.Properties['app:name'],
				title: this.appTitle(res),
				id: res.Properties['app:name'],
				icon: res.Properties['app:icon'] || '',
				message: this.$t('Starting update'),
			})
		},
		'app:update-end': function (res) {
			this.transformAppInstallationProgress({
				finished: true,
				name: res.Properties['app:name'],
				id: res.Properties['app:name'],
				icon: res.Properties['app:icon'] || '',
				// `app:updated` is set only when the app really was replaced.
				// `docker:image:updated`, which this read before, says a newer image was
				// pulled -- which is also true of a pull that then failed to start.
				isNewTag: res.Properties['app:updated'] === 'true',
			})
		},
		// Without this an update that failed left its card on screen at the percentage
		// it died on, saying nothing, until the page was reloaded.
		'app:update-error': function (res) {
			this.$buefy.toast.open({
				message: res.Properties.message,
				duration: 5000,
				type: 'is-danger',
			})
			this.transformAppInstallationProgress({
				finished: true,
				name: res.Properties['app:name'],
			})
			this.transformAppInstallationProgress({
				finished: false,
				name: `${res.Properties['app:name']}error`,
				success: false,
				title: `${this.appTitle(res)} Error Info`,
				message: res.Properties.message,
				icon: res.Properties['app:icon'],
			})
		},
		// A backup or a restore, on the card an install uses. Keyed on the kind and
		// the app rather than the app alone, so a backup running while the same app
		// updates does not fight it for one card.
		'backup:begin': function (res) {
			this.transformAppInstallationProgress({
				finished: false,
				name: this.backupCardName(res),
				title: this.backupCardTitle(res),
				id: this.backupCardName(res),
				icon: res.Properties['app:icon'] || '',
				message: this.$t('Starting'),
			})
		},
		'backup:progress': function (res) {
			this.transformAppInstallationProgress({
				finished: false,
				name: this.backupCardName(res),
				title: this.backupCardTitle(res),
				id: this.backupCardName(res),
				icon: res.Properties['app:icon'] || '',
				message: res.Properties['app:progress'],
			})
		},
		'backup:end': function (res) {
			this.transformAppInstallationProgress({ finished: true, name: this.backupCardName(res) })
			this.$buefy.toast.open({
				message: res.Properties['backup:kind'] === 'restore'
					? this.$t('{title} restored from {destination}.', { title: this.appTitle(res), destination: res.Properties['backup:destination'] })
					: this.$t('{title} backed up to {destination}.', { title: this.appTitle(res), destination: res.Properties['backup:destination'] }),
				type: 'is-success',
				duration: 5000,
			})
		},
		'backup:error': function (res) {
			this.transformAppInstallationProgress({ finished: true, name: this.backupCardName(res) })
			this.$buefy.toast.open({
				message: res.Properties['backup:kind'] === 'restore'
					? this.$t('Restoring {title} failed: {reason}', { title: this.appTitle(res), reason: res.Properties.message })
					: this.$t('Backing up {title} failed: {reason}', { title: this.appTitle(res), reason: res.Properties.message }),
				type: 'is-danger',
				duration: 8000,
			})
		},
		'app:install-progress': function (res) {
			const title = this.appTitle(res)
			this.transformAppInstallationProgress({
				finished: false,
				name: res.Properties['app:name'],
				title,
				id: res.Properties['app:name'],
				success: true,
				type: 'pull',
				message: res.Properties['app:progress'],
				icon: res.Properties['app:icon'],
			})
		},
	},
}
</script>

<style lang="scss" scoped>
// full width to show with single notice
._singleWidth {
	width: 100% !important;
}

.swiper {

	&:hover>.swiper-button-next:not(.swiper-button-disabled),
	&:hover>.swiper-button-prev:not(.swiper-button-disabled) {
		opacity: 1;
	}

	&>.swiper-button-disabled {
		opacity: 0;
	}
}

.swiper-button-prev,
.swiper-button-next {
	width: 2rem;
	height: 2rem;
	margin: 0 0.5rem;
	top: calc(50% - 2rem);
	z-index: 1;
	opacity: 0;
}

.swiper-pagination {
	position: relative;

	::v-deep span {
		margin-left: 0.5rem;
		margin-right: 0.5rem;
		width: 2rem;
		height: 0.25rem;
		background: rgba(255, 255, 255, 0.4);
		border-radius: 0.125rem;
		display: inline-block;
		position: relative;

		&:after {
			display: block;
			width: 2rem;
			height: 2rem;
			position: absolute;
			content: '';
			background: rgba(255, 255, 255, 0);
			border-radius: 0.125rem;
			top: -0.875rem;
			left: 0;
		}
	}

	::v-deep .swiper-pagination-bullet-active {
		background: #FFFFFF;
	}
}
</style>
