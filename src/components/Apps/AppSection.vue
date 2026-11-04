<template>
	<div class="home-section has-text-left">
		<!-- System row (beta dashboard): the built-ins first, out of the draggable grid -->
		<template v-if="systemFirst && systemApps.length > 0">
			<div class="is-flex is-align-items-center mb-4">
				<app-section-title-tip id="appTitleSystem"
					class="is-flex-grow-1 has-text-sub-04"
					label="Built into CasaOS."
					title="System">
				</app-section-title-tip>
			</div>
			<div :class="{ 'is-compact': compact }" class="app-list contextmenu-canvas mb-5">
				<div v-for="item in systemApps" :id="`app-${item.name}`" :key="item.name" class="handle">
					<app-card :compact="compact" :item="item" :subtitle="systemSubtitle(item)"
						@configApp="showConfigPanel"
						@importApp="showContainerPanel"
						@updateState="getList"></app-card>
				</div>
			</div>
		</template>

		<!-- Favorites (beta dashboard): the apps pinned from a card's menu, above the whole list -->
		<template v-if="compact && favoriteApps.length > 0">
			<div class="is-flex is-align-items-center mb-4">
				<app-section-title-tip id="appTitleFavorites"
					class="is-flex-grow-1 has-text-sub-04"
					label="Pinned apps."
					title="Favorites">
				</app-section-title-tip>
			</div>
			<!-- dragged among themselves only: the group keeps a favorite out of the main grid -->
			<draggable :draggable="draggable"
				:model-value="favoriteApps"
				v-bind="favoriteDragOptions"
				class="app-list is-compact contextmenu-canvas mb-5"
				item-key="name"
				tag="div"
				@update:model-value="reorderFavorites">
				<template #item="{ element: item }">
					<div :id="`favorite-${item.name}`" class="handle">
						<app-card :favorite="true"
							:item="item"
							:memory="memory[item.name] || 0"
							compact
							@configApp="showConfigPanel"
							@importApp="showContainerPanel"
							@toggleFavorite="toggleFavorite"
							@updateState="getList"></app-card>
					</div>
				</template>
			</draggable>
		</template>

		<!-- Title Bar Start -->
		<div class="is-flex is-align-items-center mb-4">
			<app-section-title-tip id="appTitle1"
				class="is-flex-grow-1 has-text-sub-04"
				label="Drag icons to sort."
				title="Apps">
			</app-section-title-tip>

			<!-- beta dashboard: which apps to show; the order can only be changed on the whole list -->
			<div v-if="compact" class="filters mr-3" role="group">
				<button v-for="option in filterOptions"
					:key="option.id"
					:class="{ 'is-active': filter === option.id }"
					class="filter-chip"
					type="button"
					@click="filter = option.id">
					{{ option.label }} <span class="filter-count">{{ option.count }}</span>
				</button>
			</div>

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
			v-model="gridList"
			:draggable="draggable"
			:move="checkMove"
			:class="{ 'is-compact': compact }"
			class="app-list contextmenu-canvas"
			item-key="name"
			tag="div"
			@end="onSortEnd"
			@start="drag = true">
			<!-- App Icon Card Start -->
			<!-- a VM tile is no handle: it is neither dragged nor dropped on -->
			<template #item="{ element: item }">
				<div :id="`app-${item.name}`" :class="item.vmTile ? 'vm-tile-item' : 'handle'">
					<vm-tile v-if="item.vmTile" :vm="item.vm"></vm-tile>
					<app-card v-else :compact="compact" :favorite="isFavorite(item)" :item="item" :memory="memory[item.name] || 0"
						@toggleFavorite="toggleFavorite"
						@configApp="showConfigPanel"
						@importApp="showContainerPanel"
						@updateState="getList"></app-card>
				</div>
			</template>
			<!-- App Icon Card End -->
		</draggable>
		<div v-else :class="{ 'is-compact': compact }" class="app-list contextmenu-canvas">
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

				<div :class="{ 'is-compact': compact }" class="app-list contextmenu-canvas">
					<div v-for="item in group.items" :id="`app-${item.name}`" :key="`app-${item.name}`" class="handle">
						<app-card :compact="compact" :is-casa="false"
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
import { defineAsyncComponent } from 'vue'
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
import { APP_STORE_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'
import { STATS_APP_NAME } from '@/components/Stats/entry'
import { createPoller } from '@/components/Stats/poller'
import { memoryByApp } from '@/components/Apps/appMemory'
import { FLEET_APP_NAME, fleetApplication, forgetFleet, hasFleet } from '@/components/Fleet/entry'
import { VM_APP_NAME, forgetVirtualMachines, hasVirtualMachines, listVirtualMachines, vmApplication, withTimeout } from '@/components/VirtualMachines/entry'
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
	{
		id: '3',
		name: STATS_APP_NAME,
		title: {
			en_us: 'Statistics',
		},
		icon: require(`@/assets/img/app/stats.svg`),
		status: 'running',
		app_type: 'system',
	},
]

const isSystemApp = app => app.app_type === 'system'

// the compact grid's filters; a link app has no state to be running or stopped in
const FILTERS = {
	all: () => true,
	running: app => app.status === 'running',
	stopped: app => app.status !== 'running' && app.app_type !== 'LinkApp',
	updates: app => Boolean(app.update_available),
}

const orderConfig = 'app_order'
// the names pinned in the compact grid, in the order they were pinned
const favoritesConfig = 'app_favorites'

// how often the VM tiles read the VMs again, while the tab is shown
const VM_POLL_MS = 5000

// how often the compact cards read the memory of the apps; the daemon is read twice for it
const MEMORY_POLL_MS = 30000
// how long a read of the VMs may take before it counts as failed
const VM_LIST_MS = 15000
// failed reads in a row after which the tiles go
const VM_POLL_FAILURES = 3

// shown (the new order) + the saved names not shown, each behind the name saved
// before it (first where none is shown)
function keepUnshown(shown, saved) {
	const order = [...shown]
	saved.forEach((name, i) => {
		if (order.includes(name)) {
			return
		}
		const before = saved.slice(0, i).reverse().find(previous => order.includes(previous))
		order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, name)
	})
	return order
}

export default {
	components: {
		AppCard,
		Draggable: draggable,
		AppSectionTitleTip,
		AppCardSkeleton,
		// loaded with the first VM: a box without the module never downloads it
		VmTile: defineAsyncComponent(() => import('@/components/VirtualMachines/VmTile.vue')),
	},
	mixins: [business_ShowNewAppTag, business_LinkApp],
	provide() {
		return {
			openAppStore: this.showInstall,
		}
	},
	props: {
		// beta dashboard: Files and the App Store in their own row above the grid
		systemFirst: {
			type: Boolean,
			default: false,
		},
		// beta dashboard: one row per app (icon, name, state) and a filter by state
		compact: {
			type: Boolean,
			default: false,
		},
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
			// the list shown lacks the grid's apps (the grid failed when it was read)
			gridMissing: false,
			// the order last read or saved: what saving keeps for apps not shown
			savedOrder: [],
			skCount: 0,
			ListRefreshTimer: null,
			isCheckingImages: false,
			// the VMs of the tiles, by title
			vms: [],
			// compact grid: 'all' | 'running' | 'stopped' | 'updates'
			filter: 'all',
			favorites: [],
			// compact grid: the bytes each app's containers use, by app name
			memory: {},
		}
	},
	computed: {
		dragOptions() {
			return {
				animation: 300,
				group: 'description',
				// a filtered grid lacks apps: dragging in it would save an order without them
				disabled: this.filter !== 'all',
				ghostClass: 'ghost',
				// on a touch screen a swipe scrolls the grid: only a long press starts a drag; a mouse drags at once
				delay: 300,
				delayOnTouchOnly: true,
				touchStartThreshold: 8,
				// a VM tile starts no drag; its click still goes through
				filter: '.vm-tile-item',
				preventOnFilter: false,
			}
		},
		// The grid as drawn: the apps, and a tile per VM right after the Virtual
		// Machines card. The tiles are not apps: what is dragged comes back here
		// without them, so the saved order never has them, and they go back after
		// their card.
		// With the System row (beta dashboard) the built-ins leave the grid the same
		// way: appList, and so the saved order, keeps them first.
		gridList: {
			get() {
				const apps = this.systemFirst ? this.appList.filter(app => !isSystemApp(app)) : this.appList
				if (this.filter !== 'all') {
					return apps.filter(FILTERS[this.filter])
				}
				const at = apps.findIndex(app => app.name === VM_APP_NAME)
				if (at < 0 || !this.vms.length) {
					return apps
				}
				const tiles = this.vms.map(vm => ({ name: `vm-tile:${vm.id}`, vmTile: true, vm }))
				return [...apps.slice(0, at + 1), ...tiles, ...apps.slice(at + 1)]
			},
			set(list) {
				if (this.filter !== 'all') {
					return
				}
				const system = this.systemFirst ? this.appList.filter(isSystemApp) : []
				this.appList = concat(system, list.filter(item => !item.vmTile))
			},
		},
		systemApps() {
			return this.systemFirst ? this.appList.filter(isSystemApp) : []
		},
		// a pinned app that is gone (uninstalled) is skipped, and forgotten at the next pin
		favoriteApps() {
			return this.favorites.map(name => this.appList.find(app => app.name === name && !isSystemApp(app))).filter(Boolean)
		},
		favoriteDragOptions() {
			return { ...this.dragOptions, group: 'favorites', disabled: false }
		},
		filterOptions() {
			const apps = this.appList.filter(app => !isSystemApp(app))
			const labels = { all: 'All', running: 'Running', stopped: 'Stopped', updates: 'Updates' }
			return Object.keys(FILTERS).map(id => ({
				id,
				label: this.$t(labels[id]),
				count: apps.filter(FILTERS[id]).length,
			}))
		},
		hasVmCard() {
			return this.appList.some(app => app.name === VM_APP_NAME)
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
	watch: {
		// the tiles come with the card, not at the next read
		hasVmCard() {
			this.pollVms()
		},
	},
	created() {
		if (this.compact) {
			this.loadFavorites()
		}
		this.getList()
		this.draggable = this.isMobile() ? '' : '.handle'
		this.$EventBus.$on(events.OPEN_APP_STORE_AND_GOTO_SYNCTHING, () => {
			this.showInstall(SYNCTHING_STORE_ID)
		})

		this.$EventBus.$on(events.RELOAD_APP_LIST, () => {
			this.getList()
		})

		this.$EventBus.$on(events.MODULES_CHANGED, this.syncVmCard)
		this.$EventBus.$on(events.FLEET_CHANGED, this.syncFleetCard)

		this.ListRefreshTimer = setInterval(() => {
			this.getList()
		}, 5000)

		// the VM tiles' polling: plain fields, not data, as nothing is drawn from them
		this.vmPollStopped = false
		this.vmPolling = false
		this.vmPollTimer = null
		this.vmFailures = 0
		document.addEventListener('visibilitychange', this.onVisibility)
		this.pollVms()

		if (this.compact) {
			// silent on failure: a card without its memory is a card all the same
			this.memoryPoller = createPoller({
				intervalMs: MEMORY_POLL_MS,
				// the service client brings the router and the store with it: loaded when the poll runs
				run: () => import('@/service/stats').then(({ statsApi }) => statsApi.list('app_management')).then((raw) => {
					this.memory = memoryByApp(raw)
				}),
			})
			this.memoryPoller.start()
		}
	},
	beforeUnmount() {
		this.$EventBus.$off(events.OPEN_APP_STORE_AND_GOTO_SYNCTHING)
		this.$EventBus.$off(events.MODULES_CHANGED, this.syncVmCard)
		this.$EventBus.$off(events.FLEET_CHANGED, this.syncFleetCard)
		window.removeEventListener('resize', this.getSkCount)

		clearInterval(this.ListRefreshTimer)

		this.vmPollStopped = true
		clearTimeout(this.vmPollTimer)
		this.memoryPoller?.stop()
		document.removeEventListener('visibilitychange', this.onVisibility)
	},
	mounted() {
		window.addEventListener('resize', this.getSkCount)
		this.getSkCount()
	},
	methods: {
		// silent on failure: no favorites is a fine state, and the grid shows all the same
		loadFavorites() {
			this.$api.users.getCustomStorage(favoritesConfig)
				.then((res) => {
					this.favorites = res.data.data.data || []
				})
				.catch(() => {})
		},

		// the new order of the pinned apps, as the drag leaves it
		reorderFavorites(apps) {
			this.favorites = apps.map(app => app.name)
			this.$api.users.setCustomStorage(favoritesConfig, { data: this.favorites })
		},

		isFavorite(app) {
			return this.favorites.includes(app.name)
		},

		toggleFavorite(app) {
			const names = this.isFavorite(app) ? this.favorites.filter(name => name !== app.name) : [...this.favorites, app.name]
			// the names of apps no longer there go with the change
			const known = new Set(this.appList.map(item => item.name))
			this.favorites = names.filter(name => known.has(name))
			this.$api.users.setCustomStorage(favoritesConfig, { data: this.favorites })
		},

		// the second line of a system card (beta dashboard): what is worth knowing at a glance
		systemSubtitle(app) {
			const updates = this.appList.filter(item => item.update_available).length
			switch (app.name) {
				case 'App Store':
					return updates > 0 ? this.$t('Updates: {count}', { count: updates }) : this.$t('App catalogue')
				case 'Files':
					return this.$t('Your files')
				case STATS_APP_NAME:
					return this.$t('CPU, memory, disks')
				case VM_APP_NAME:
					return this.vms.length > 0 ? this.$t('VMs: {count}', { count: this.vms.length }) : this.$t('Virtual Machines')
				default:
					return ''
			}
		},

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
				// a failing grid (Docker not up yet: fresh box, no data disk) must not
				// hide the built-in and link apps: show those, read the grid again
				let gridFailed = false
				const orgAppList = await this.$openAPI.appGrid.getAppGrid()
					.then(res => res.data.data || [])
					.catch((error) => {
						console.error(error)
						gridFailed = true
						return []
					})
				// read every 5 s: a passing failure keeps the apps already shown
				if (gridFailed && this.appList.length > 0) {
					this.isLoading = false
					this.retryList()
					return
				}
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
				// the virtual machines join Files where the module answers. The grid
				// does not wait for the probe: the card is added when it answers, and a
				// list read again keeps the card it already shows.
				const hasVmCard = this.appList.some(app => app.name === VM_APP_NAME)
				const vmApps = hasVmCard ? [vmApplication()] : []
				// the Fleet card the same way, where the core says this box is a master
				const hasFleetCard = this.appList.some(app => app.name === FLEET_APP_NAME)
				const fleetApps = hasFleetCard ? [fleetApplication()] : []
				// all app list
				const casaAppList = concat(builtInApplications, vmApps, fleetApps, orgNewAppList, listLinkApp)
				// get app sort info.
				const lateSortList = await this.$api.users
					.getCustomStorage(orderConfig)
					.then(res => res.data.data.data || [])

				this.savedOrder = lateSortList
				this.appList = this.sortApps(casaAppList, lateSortList)
				this.gridMissing = gridFailed
				// a saved order that has the card is saved again only once the probe
				// has answered, or the card would lose its place; without the grid's
				// apps, saving would drop them from the order
				if (!gridFailed && (hasVmCard || !lateSortList.includes(VM_APP_NAME)) && (hasFleetCard || !lateSortList.includes(FLEET_APP_NAME))) {
					this.saveSortIfChanged(lateSortList)
				}
				if (!hasVmCard) {
					this.addVmCardWhenThere(lateSortList)
				}
				if (!hasFleetCard) {
					this.addFleetCardWhenThere(lateSortList)
				}

				this.isLoading = false
				if (gridFailed) {
					this.retryList()
				} else {
					this.retryCount = 0
					this.appListErrorMessage = ''
				}
			} catch (error) {
				console.error(error)
				this.isLoading = true
				this.retryList()
			}
		},

		retryList() {
			if (this.retryCount < 5) {
				setTimeout(() => {
					this.retryCount++
					this.getList()
				}, 2000)
			} else if (!this.appListErrorMessage) {
				// once per failure: the list is still read every 5 s
				this.appListErrorMessage = 'Failed to get app list.'
				this.$buefy.toast.open({
					message: this.$t(`Failed to load apps, please refresh later.`),
					type: 'is-danger',
				})
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

		// The apps in the saved order, those it does not have yet at the end.
		sortApps(apps, savedOrder) {
			const names = apps.map(app => app.name)
			const order = savedOrder.filter(name => names.includes(name))
				.concat(names.filter(name => !savedOrder.includes(name)))
			return apps.sort((app1, app2) => order.indexOf(app1.name) - order.indexOf(app2.name))
		},

		saveSortIfChanged(savedOrder) {
			if (!isEqual(savedOrder, this.appList.map(app => app.name))) {
				this.saveSortData()
			}
		},

		// Adds the Virtual Machines card at its saved place once the probe says the
		// module is there.
		// A module was installed or removed: ask the gateway again, then add the
		// card or take it away, without the page being reloaded.
		syncVmCard() {
			forgetVirtualMachines()
			return hasVirtualMachines().then((available) => {
				const has = this.appList.some(app => app.name === VM_APP_NAME)
				if (available && !has) {
					this.appList = this.sortApps(concat(this.appList, vmApplication()), [])
				} else if (!available && has) {
					this.appList = this.appList.filter(app => app.name !== VM_APP_NAME)
				}
			})
		},

		// This box became, or stopped being, a master: ask the core again, then add
		// the Fleet card or take it away, without the page being reloaded.
		syncFleetCard() {
			forgetFleet()
			return hasFleet().then((available) => {
				const has = this.appList.some(app => app.name === FLEET_APP_NAME)
				if (available && !has) {
					this.appList = this.sortApps(concat(this.appList, fleetApplication()), [])
				} else if (!available && has) {
					this.appList = this.appList.filter(app => app.name !== FLEET_APP_NAME)
				}
			})
		},

		// Adds the Fleet card at its saved place once the core says master.
		addFleetCardWhenThere(savedOrder) {
			return hasFleet().then((available) => {
				if (available && !this.appList.some(app => app.name === FLEET_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, fleetApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (!available && savedOrder.includes(FLEET_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// a save while the grid's apps are missing keeps them (saveSortData, gridMissing)
		addVmCardWhenThere(savedOrder) {
			return hasVirtualMachines().then((available) => {
				if (available && !this.appList.some(app => app.name === VM_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, vmApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (!available && savedOrder.includes(VM_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// The VMs of the tiles, read again every few seconds while the tab is shown,
		// one read at a time. Only where the Virtual Machines card is, which is where
		// the module answers. A list that cannot be read shows no tile, and says
		// nothing: the card is still there for whoever wants to know why.
		// A read that fails keeps the tiles shown for VM_POLL_FAILURES - 1 more
		// polls: a hiccup of the gateway does not blink them away. A module that is
		// not there (404, or the card gone) takes them away at once. A read that
		// hangs is given up on after VM_LIST_MS and counts as failed.
		async pollVms() {
			clearTimeout(this.vmPollTimer)
			if (this.vmPollStopped || this.vmPolling || document.hidden) {
				return
			}
			if (!this.appList.some(app => app.name === VM_APP_NAME)) {
				this.vms = []
				this.vmFailures = 0
			} else {
				this.vmPolling = true
				try {
					const vms = await withTimeout(listVirtualMachines(), VM_LIST_MS)
					this.vmFailures = 0
					if (!isEqual(vms, this.vms)) {
						this.vms = vms
					}
				} catch (e) {
					this.vmFailures = (this.vmFailures || 0) + 1
					if (e?.response?.status === 404 || this.vmFailures >= VM_POLL_FAILURES) {
						this.vms = []
					}
				} finally {
					this.vmPolling = false
				}
			}
			if (!this.vmPollStopped && !document.hidden) {
				this.vmPollTimer = setTimeout(() => this.pollVms(), VM_POLL_MS)
			}
		},

		// An app is dropped among the apps only: not on a tile, nor between the
		// Virtual Machines card and its tiles, where the tiles would be drawn back
		// over it and it would jump. vuedraggable hands the item under the pointer.
		checkMove(evt) {
			const over = evt.relatedContext?.element
			if (over?.vmTile) {
				return false
			}
			return !(over?.name === VM_APP_NAME && evt.willInsertAfter && this.vms.length > 0)
		},

		onVisibility() {
			this.memoryPoller?.visibilityChanged()
			if (document.hidden) {
				clearTimeout(this.vmPollTimer)
				return
			}
			return this.pollVms()
		},

		/**
		 * @description: Save Sort Table
		 * @param {*}
		 * @return {*}
		 */
		saveSortData() {
			let newList = this.appList.map((item) => {
				// compose milestone :: name is unique, global index.
				return item.name
			})
			// the grid's apps are not shown (a drag while the grid fails): they keep
			// their saved place, behind the app saved before them
			if (this.gridMissing) {
				newList = keepUnshown(newList, this.savedOrder || [])
			}
			this.savedOrder = newList
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
			} else if (builtinOpensInNewTab(APP_STORE_LAUNCH_ID, this.$store.state)) {
				// the store follows the App launching setting; a custom install is a
				// form, and stays here
				const query = storeId ? `?store=${storeId}` : ''
				window.open(`${window.location.pathname}#/appstore${query}`, '_blank')
				return
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

	// beta dashboard: as many rows' worth of columns as fit
	&.is-compact {
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.75rem;
	}
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}

.filter-chip {
	border: 1px solid rgba(255, 255, 255, 0.25);
	border-radius: 999px;
	background: transparent;
	color: inherit;
	cursor: pointer;
	font: inherit;
	font-size: 0.75rem;
	line-height: 1.25rem;
	padding: 0.125rem 0.625rem;

	&.is-active {
		background: rgba(255, 255, 255, 0.9);
		border-color: transparent;
		color: #1a1f24;
	}

	.filter-count {
		opacity: 0.7;
	}
}
</style>
