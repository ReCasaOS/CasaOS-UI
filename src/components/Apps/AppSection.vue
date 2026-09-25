<template>
	<div class="home-section has-text-left">
		<!-- Title Bar Start -->
		<div class="is-flex is-align-items-center mb-4">
			<app-section-title-tip id="appTitle1"
				class="is-flex-grow-1 has-text-sub-04"
				label="Drag icons to sort."
				title="Apps">
			</app-section-title-tip>

			<b-dropdown animation="fade1" aria-role="menu" class="file-dropdown" position="is-bottom-left">
				<template #trigger>
					<b-icon class="polymorphic is-clickable has-text-grey-100"
						icon="plus-outline"
						pack="casa"
						size="is-24"></b-icon>
				</template>
				<b-dropdown-item aria-role="menuitem" @click="showInstall(0, 'custom')">
					{{ $t('Custom Install APP') }}
				</b-dropdown-item>
				<b-dropdown-item aria-role="menuitem" @click="showGitApp">
					{{ $t('From a git repository…') }}
				</b-dropdown-item>
				<b-dropdown-item aria-role="menuitem" @click="showExternalLinkPanel">
					{{ $t('Add external link/APP') }}
				</b-dropdown-item>
				<b-dropdown-item :disabled="isCheckingImages" aria-role="menuitem" @click="checkImageUpdates">
					{{ $t('Check for image updates') }}
				</b-dropdown-item>
				<b-dropdown-item aria-role="menuitem" @click="showUpdateAll">
					{{ $t('Update every app…') }}
				</b-dropdown-item>
			</b-dropdown>
		</div>
		<!-- Title Bar End -->

		<!-- App List Start -->
		<!-- vuedraggable 4 renders the list itself through the item slot and
			throws without one; the skeletons are not list items, so they get
			their own grid while loading. -->
		<draggable v-if="!isLoading"
			v-bind="dragOptions"
			v-model="appList"
			:draggable="draggable"
			class="app-list contextmenu-canvas"
			item-key="name"
			tag="div"
			@end="onSortEnd"
			@start="drag = true">
			<!-- App Icon Card Start -->
			<template #item="{ element: item }">
				<div :id="`app-${item.name}`" class="handle">
					<app-card :item="item"
						@configApp="showConfigPanel"
						@importApp="showContainerPanel"
						@updateState="getList"></app-card>
				</div>
			</template>
			<!-- App Icon Card End -->
		</draggable>
		<div v-else class="app-list contextmenu-canvas">
			<div v-for="index in skCount" :id="`app-${index}`" :key="`app-${index}`" class="handle">
				<app-card-skeleton :index="index"></app-card-skeleton>
			</div>
		</div>
		<!-- App List End -->

		<!-- Three groups, because one heading covered three populations and was a
			wrong instruction for two of them: a container Portainer started is
			managed, and one somebody ran by hand is not an app to rebuild. -->
		<template v-for="group in legacyGroups" :key="group.id">
			<template v-if="group.items.length > 0">
				<div class="title-bar is-flex is-align-items-center mt-2rem mb-5">
					<app-section-title-tip :id="`appTitle-${group.id}`"
						:label="$t(group.label)"
						:title="$t(group.title)"
						class="is-flex-grow-1 has-text-sub-04">
					</app-section-title-tip>
				</div>

				<div class="app-list contextmenu-canvas">
					<div v-for="item in group.items" :id="`app-${item.name}`" :key="`app-${item.name}`" class="handle">
						<app-card :is-casa="false"
							:item="item"
							@configApp="showConfigPanel"
							@importApp="showContainerPanel"
							@updateState="getList"></app-card>
					</div>
				</div>
			</template>
		</template>
	</div>
</template>

<script>
import draggable from 'vuedraggable'
import xor from 'lodash/xor'
import concat from 'lodash/concat'
import last from 'lodash/last'
import isEqual from 'lodash/isEqual'
import { groupLegacyApps } from './legacyApps'
import AppCard from './AppCard.vue'
import AppCardSkeleton from './AppCardSkeleton.vue'
import AppPanel from './AppPanel.vue'
import AppSectionTitleTip from './AppSectionTitleTip.vue'
import ExternalLinkPanel from '@/components/Apps/ExternalLinkPanel'
import GitAppModal from '@/components/Apps/GitAppModal.vue'
import { withoutContainer } from '@/components/Apps/gitApps'
import UpdateAllModal from '@/components/Apps/UpdateAllModal.vue'
import { imageUpdateSummary } from '@/components/Apps/imageUpdateSummary'
import events from '@/events/events'
import business_ShowNewAppTag from '@/mixins/app/Business_ShowNewAppTag'
import business_LinkApp from '@/mixins/app/Business_LinkApp'
import { ice_i18n } from '@/mixins/base/common-i18n'

// Syncthing in the app store: the old store numbered its apps, the v2 one names
// them, and asking it for 74 is a 404
const SYNCTHING_STORE_ID = 'syncthing'

// meta_data :: build-in app
const builtInApplications = [
	{
		id: '1',
		name: 'App Store',
		title: {
			en_us: 'App Store',
		},
		icon: require(`@/assets/img/app/appstore.svg`),
		status: 'running',
		app_type: 'system',
	},
	{
		id: '2',
		name: 'Files',
		title: {
			en_us: 'Files',
		},
		icon: require(`@/assets/img/app/files.svg`),
		status: 'running',
		app_type: 'system',
	},
]

const orderConfig = 'app_order'

export default {
	components: {
		AppCard,
		Draggable: draggable,
		AppSectionTitleTip,
		AppCardSkeleton,
	},
	mixins: [business_ShowNewAppTag, business_LinkApp],
	provide() {
		return {
			openAppStore: this.showInstall,
		}
	},
	data() {
		return {
			user_id: localStorage.getItem('user_id'),
			appList: [],
			oldAppList: [],
			appConfig: {},
			drag: false,
			isLoading: false,
			isShowing: false,
			importHelpText: 'Click icon to import.',
			appHelpText: 'Drag icons to sort.',
			draggable: '.handle',
			retryCount: 0,
			appListErrorMessage: '',
			skCount: 0,
			ListRefreshTimer: null,
			isCheckingImages: false,
		}
	},
	computed: {
		dragOptions() {
			return {
				animation: 300,
				group: 'description',
				disabled: false,
				ghostClass: 'ghost',
			}
		},
		showDragTip() {
			return this.draggable === '.handle'
		},
		exsitingAppsShow() {
			return this.$store.state.existingAppsSwitch
		},
		// The backend already tells these apart -- app_type, compose_project and
		// is_uncontrolled are all on the grid item. This only reads them.
		legacyGroups() {
			const groups = groupLegacyApps(this.oldAppList)
			return [
				{ id: 'rebuild', items: groups.rebuild, label: 'To be rebuilt.', title: 'Legacy app (To be rebuilt).' },
				{ id: 'elsewhere', items: groups.managedElsewhere, label: 'Running, but managed outside CasaOS.', title: 'Managed elsewhere.' },
				{ id: 'loose', items: groups.loose, label: 'Containers nothing here manages.', title: 'Unmanaged containers.' },
			]
		},
	},
	created() {
		this.getList()
		this.draggable = this.isMobile() ? '' : '.handle'
		this.$EventBus.$on(events.OPEN_APP_STORE_AND_GOTO_SYNCTHING, () => {
			this.showInstall(SYNCTHING_STORE_ID)
		})

		this.$EventBus.$on(events.RELOAD_APP_LIST, () => {
			this.getList()
		})

		this.ListRefreshTimer = setInterval(() => {
			this.getList()
		}, 5000)
	},
	beforeUnmount() {
		this.$EventBus.$off(events.OPEN_APP_STORE_AND_GOTO_SYNCTHING)
		window.removeEventListener('resize', this.getSkCount)

		clearInterval(this.ListRefreshTimer)
	},
	mounted() {
		window.addEventListener('resize', this.getSkCount)
		this.getSkCount()
	},
	methods: {
		/**
		 * @description: Ask every app's registry whether its image has moved, then
		 * reload the grid so the badges reflect the answer. One network round trip
		 * per distinct image, which is why this is a button and not something the
		 * grid does on its own.
		 */
		// Every app at once: the menu item is the first click, the list in the
		// dialog the second, and the run is the box's own once confirmed.
		showUpdateAll() {
			this.$buefy.modal.open({
				component: UpdateAllModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		// An app built from its own repository. Only the dialog's buttons close it:
		// its Cancel deletes an app registered and never deployed, which escape or a
		// click outside would leave behind, holding its name.
		showGitApp() {
			this.$buefy.modal.open({
				component: GitAppModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: [],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		async checkImageUpdates() {
			if (this.isCheckingImages) {
				return
			}
			this.isCheckingImages = true

			try {
				// The shared instance gives up after a minute; this fans out one round
				// trip per distinct image, so a host with a long app list would be cut
				// off mid-check and the work thrown away with it.
				const result = await this.$openAPI.appManagement.app
					.checkImageUpdates({ timeout: 5 * 60 * 1000 })
					.then(res => res.data.data)

				await this.getList()

				for (const toast of imageUpdateSummary(result)) {
					this.$buefy.toast.open({
						message: this.$t(toast.message, toast.params),
						type: toast.type,
						// a toast that names apps and reasons needs longer than an acknowledgement
						...(toast.duration ? { duration: toast.duration } : {}),
					})
				}
			} catch (error) {
				console.error(error)
				this.$buefy.toast.open({
					message: this.$t('Could not check for image updates.'),
					type: 'is-danger',
				})
			} finally {
				this.isCheckingImages = false
			}
		},

		isMobile() {
			const userAgent = navigator.userAgent
			const mobileRegex
				= /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
			const isMobile = mobileRegex.exec(userAgent)
			return isMobile !== null
		},

		getSkCount() {
			const windowWidth = window.innerWidth
			if (windowWidth < 1024) {
				this.skCount = 4
			} else if (windowWidth < 1216) {
				this.skCount = 6
			} else if (windowWidth < 1408) {
				this.skCount = 8
			} else {
				this.skCount = 10
			}
		},

		/**
		 * @description: Fetch the list of installed apps
		 * @return {*} void
		 */
		async getList() {
			try {
				const orgAppList = await this.$openAPI.appGrid.getAppGrid().then(res => res.data.data || [])
				const orgOldAppList = []
				const orgNewAppList = []
				orgAppList.forEach((item) => {
					item.hostname = item.hostname || this.$baseIp
					// Container app does not have icon.
					item.icon = item.icon || require(`@/assets/img/app/default.svg`)
					if (item.app_type === 'v1app' || item.app_type === 'container') {
						orgOldAppList.push(item)
					} else {
						orgNewAppList.push(item)
					}
				})
				this.oldAppList = orgOldAppList

				const listLinkApp = await this.getLinkAppList()
				listLinkApp.forEach((item) => {
					// linkApp does not have title.
					item.title = {
						en_us: item.name,
					}
				})
				// all app list
				const casaAppList = concat(builtInApplications, orgNewAppList, listLinkApp)
				// get app sort info.
				const lateSortList = await this.$api.users
					.getCustomStorage(orderConfig)
					.then(res => res.data.data.data || [])

				// filter anything not in casaAppList.
				const propList = casaAppList.map(obj => obj.name)
				const existingList = lateSortList.filter(item => propList.includes(item))
				const futureList = propList.filter(item => !lateSortList.includes(item))
				const newSortList = existingList.concat(futureList)

				// then sort.
				const sortedAppList = casaAppList.sort((obj1, obj2) => {
					return newSortList.indexOf(obj1.name) - newSortList.indexOf(obj2.name)
				})

				const sortedList = sortedAppList.map(obj => obj.name)
				this.appList = sortedAppList
				if (!isEqual(lateSortList, sortedList)) {
					this.saveSortData()
				}

				this.isLoading = false
				this.retryCount = 0
				this.appListErrorMessage = ''
			} catch (error) {
				console.error(error)
				this.isLoading = true
				if (this.retryCount < 5) {
					setTimeout(() => {
						this.retryCount++
						this.getList()
					}, 2000)
				} else {
					this.appListErrorMessage = 'Failed to get app list.'
					this.$buefy.toast.open({
						message: this.$t(`Failed to load apps, please refresh later.`),
						type: 'is-danger',
					})
				}
			}
		},

		/**
		 * @description:
		 * @param {Array} oriList
		 * @param {Array} newList
		 * @return {*}
		 */
		getNewSortList(oriList, newList) {
			const xorList = xor(oriList, newList)
			// xorList.reverse()
			return concat(oriList, xorList)
		},

		/**
		 * @description: Save Sort Table
		 * @param {*}
		 * @return {*}
		 */
		saveSortData() {
			const newList = this.appList.map((item) => {
				// compose milestone :: name is unique, global index.
				return item.name
			})
			const data = {
				data: newList,
			}
			this.$api.users.setCustomStorage(orderConfig, data)
		},
		/**
		 * @description: Handle on Sort End
		 * @param {*}
		 * @return {*}
		 */
		onSortEnd() {
			this.drag = false
			this.saveSortData()
		},

		/**
		 * @description: Show Install Panel Programmatic
		 * @return {*} void
		 */
		async showInstall(storeId = 0, mode = '') {
			if (mode === 'custom') {
				this.$messageBus('apps_custominstall')
			}
			this.isShowing = true

			const networks = await this.$api.container.getNetworks()
			const memory = this.$store.state.hardwareInfo.mem
			const configData = {
				networks: networks.data.data,
				memory,
			}
			this.isShowing = false
			this.$buefy.modal.open({
				component: AppPanel,
				hasModalCard: true,
				customClass: 'app-panel',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					updateState: () => {
						this.getList()
					},
				},
				props: {
					id: '0',
					state: 'install',
					configData,
					storeId,
					settingData: mode !== 'custom' ? undefined : {},
				},
			})
		},

		/**
		 * @description: Show Settings Panel Programmatic
		 * @param {object} {id:String,status:String }
		 * @param {boolean} isCasa
		 * @return {*}
		 */
		async showConfigPanel(item, isCasa) {
			const name = item.name
			this.$messageBus('appsexsiting_open', name)
			try {
				if (item?.app_type === 'LinkApp') {
					await this.showExternalLinkPanel(item)
					return
				}
				const networks = await this.$api.container.getNetworks()
				const memory = this.$store.state.hardwareInfo.mem
				const configData = {
					networks: networks.data.data,
					memory,
				}
				// A git app no deployment has given a container has no compose app to
				// read: its panel is its Repository tab alone.
				const repositoryOnly = withoutContainer(item)
				const ret = repositoryOnly
					? { data: '' }
					: await this.$openAPI.appManagement.compose.myComposeApp(name, {
						headers: {
							'content-type': 'application/yaml',
							'accept': 'application/yaml',
						},
					})
				this.$buefy.modal.open({
					component: AppPanel,
					hasModalCard: true,
					customClass: 'app-panel',
					trapFocus: true,
					canCancel: [''],
					scroll: 'keep',
					animation: 'zoom-in',
					events: {
						updateState: () => {
							this.getList()
						},
					},
					props: {
						id: name,
						state: 'update',
						isCasa,
						// 区分 terminal
						runningStatus: item.status,
						configData,
						// settingData: ret.data,
						settingComposeData: ret.data,
						repositoryOnly,
					},
				})
			} catch (e) {
				console.error(e)
			}
		},

		async showContainerPanel(item) {
			this.$messageBus('appsexsiting_open', item.name)
			const id = item.name
			const networks = await this.$api.container.getNetworks()
			const memory = this.$store.state.hardwareInfo.mem
			const configData = {
				networks: networks.data.data,
				memory,
			}
			const ret = await this.$api.container.getInfo(id)
			this.$buefy.modal.open({
				component: AppPanel,
				hasModalCard: true,
				customClass: 'app-panel',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					updateState: () => {
						this.getList()
					},
				},
				props: {
					id,
					state: 'update',
					isCasa: false,
					runningStatus: item.status,
					configData,
					settingData: ret.data.data,
				},
			})
		},

		async showExternalLinkPanel(item = {}) {
			this.$buefy.modal.open({
				component: ExternalLinkPanel,
				hasModalCard: true,
				customClass: '',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					updateState: () => {
						this.$messageBus('apps_external')
						this.getList().then(() => {
							this.scrollToNewApp()
						})
					},
				},
				props: {
					linkName: item.name,
					linkHost: item.hostname,
					linkIcon: item.icon,
				},
			})
		},

		scrollToNewApp() {
			// business :: scroll to last position
			const name = last(this.newAppIds)
			const showEl = document.getElementById(`app-${name}`)
			showEl?.scrollIntoView({ behavior: 'smooth', block: 'end' })
		},

		messageBusToast(message, type) {
			const duration = 5000
			this.$buefy.toast.open({
				message,
				duration,
				type,
			})
		},
	},
	sockets: {
		'app:install-end': function () {
			this.getList().then(() => {
				this.scrollToNewApp()
			})
		},
		'app:install-error': function () {
			this.getList().then(() => {
				this.scrollToNewApp()
			})
		},
		'app:uninstall-end': function () {
			this.getList()
		},
		'app:apply-changes-error': function (res) {
			// toast info
			this.messageBusToast(res.Properties.message, 'is-danger')
		},
		'app:apply-changes-end': function (res) {
			const languages = JSON.parse(res.Properties['app:title'])
			const title = ice_i18n(languages)
			// toast info
			this.messageBusToast(`${title} is OK`, 'is-success')

			// business :: Tagging of new app / scrollIntoView
			this.addIdToSessionStorage(res.Properties['app:name'])

			this.getList().then(() => {
				this.scrollToNewApp()
			})
		},
		/**
		 * @description: Update App Version
		 * @param {object} data
		 * @return {void}
		 */
		'app:update-end': function (data) {
			// A recreate belongs to the card that started it: it knows which container
			// was asked for, and it already refreshes the grid and reports the outcome.
			// The section only has app:name, which for an imported container is the
			// image -- so this toast named `ubi9/nginx-120` next to the card's own.
			if (data.Properties['recreate:container:id'])
				return

			// app:updated is set only when the update replaced what the app runs, by
			// either update path. It is what a compose update has instead of
			// docker:image:updated, which it never carries -- and which says what a
			// pull found rather than what ended up installed, so a pull that landed
			// on a recreate that then failed used to reload the grid and call it done.
			if (data.Properties['app:updated'] === 'true') {
				// business :: Tagging of new app / scrollIntoView
				this.addIdToSessionStorage(data.Properties['app:name'])

				this.$buefy.toast.open({
					message: this.$t(`{name} has been updated to the latest version!`, {
						// the publisher sends app:name; there has never been a `name`
						name: data.Properties['app:name'],
					}),
					type: 'is-success',
				})
				this.getList().then(() => {
					this.scrollToNewApp()
				})
			}
		},
		// No app:update-error here: the section has no app to match one against, and the
		// card of the app that failed reports it.
	},
}
</script>

<style lang="scss" scoped>
.app-list {
	position: relative;
	display: grid;
	gap: 1rem;

	@include touch {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@include desktop {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	@include fullhd {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
}
</style>
