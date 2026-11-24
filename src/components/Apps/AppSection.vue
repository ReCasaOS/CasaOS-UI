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
			<div :class="{ 'is-compact': compact, 'is-tiles': compact }" class="app-list contextmenu-canvas mb-5">
				<div v-for="item in systemApps" :id="`app-${item.name}`" :key="item.name" :class="item.vmTile ? 'vm-tile-item' : 'handle'">
					<vm-tile v-if="item.vmTile" :compact="compact" :vm="item.vm"></vm-tile>
					<app-card v-else :compact="compact" :item="item" :subtitle="systemSubtitle(item)"
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
				class="app-list is-compact is-tiles contextmenu-canvas mb-5"
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

			<!-- beta dashboard: the order shown (CasaOS#183); only the custom one is dragged. A chip like the
				filters', opening the dashboard's own menu, as the + beside it -->
			<b-dropdown v-if="compact" v-model="sort" animation="fade1" aria-role="list" class="file-dropdown app-sort mr-3" data-app-sort position="is-bottom-left">
				<template #trigger>
					<button :aria-label="$t('Sort by')" :class="{ 'is-sorted': sort !== 'custom' }" class="filter-chip sort-chip" data-app-sort-trigger type="button">
						<b-icon custom-size="mdi-14px" icon="sort" />
						{{ $t(sortLabels[sort]) }}
					</button>
				</template>
				<b-dropdown-item v-for="id in sorts" :key="id" :data-app-sort-option="id" :value="id" aria-role="listitem">
					<span class="sort-option">
						{{ $t(sortLabels[id]) }}
						<b-icon v-if="sort === id" custom-size="mdi-16px" icon="check" />
					</span>
				</b-dropdown-item>
			</b-dropdown>

			<b-dropdown v-if="$store.getters.canWrite" animation="fade1" aria-role="menu" class="file-dropdown" position="is-bottom-left">
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
				<div :id="`app-${item.name}`" :class="[item.vmTile ? 'vm-tile-item' : 'handle', { 'is-dashboard-hidden': isHiddenApp(item) }]">
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

		<!-- the apps left out of the dashboard (an app's Settings > Visibility): the admin's way back to them -->
		<p v-if="$store.getters.isAdmin && hiddenApps.length > 0" class="hidden-apps is-size-7 has-text-sub-04 mt-3">
			{{ $t('Hidden apps: {n}', { n: hiddenApps.length }) }} ·
			<button class="hidden-apps-toggle" type="button" @click="showHidden = !showHidden">
				{{ $t(showHidden ? 'Hide' : 'Show') }}
			</button>
		</p>

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
import escape from 'lodash/escape'
import { SORTS, SORT_LABELS, saveSort, savedSort, sortApps } from './appSort'
import { groupLegacyApps } from './legacyApps'
import { isHiddenApp, shownApps, withHiddenApps } from './dashboardHidden'
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
import { refresh as refreshBackupStatus } from '@/service/backupStatus'
import { memoryByApp } from '@/components/Apps/appMemory'
import { FLEET_APP_NAME, fleetApplication, forgetFleet, hasFleet } from '@/components/Fleet/entry'
import { LOGS_APP_NAME, hasLogs, logsApplication } from '@/components/Logs/entry'
import { SECURITY_APP_NAME, forgetSecurity, hasSecurity, securityApplication } from '@/components/Security/entry'
import { AI_ACCESS_APP_NAME, aiAccessApplication, forgetAIAccess, hasAIAccess } from '@/components/AIAccess/entry'
import { followRescan, refresh as refreshVulnScan, vulnScan } from '@/service/vulnScan'
import { VM_APP_NAME, forgetVirtualMachines, hasVirtualMachines, listVirtualMachines, vmApplication, withTimeout } from '@/components/VirtualMachines/entry'
import UpdateAllModal from '@/components/Apps/UpdateAllModal.vue'
import { imageUpdateSummary } from '@/components/Apps/imageUpdateSummary'
import events from '@/events/events'
import business_ShowNewAppTag from '@/mixins/app/Business_ShowNewAppTag'
import business_LinkApp from '@/mixins/app/Business_LinkApp'
import { ice_i18n } from '@/mixins/base/common-i18n'
import { openPage } from '@/router/pageTabs'

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
// how long a Security card whose module did not answer waits before it is asked again
const SECURITY_RETRY_MS = 60000
// the same wait for the AI access card
const AI_ACCESS_RETRY_MS = 60000

// how often an account that cannot write reads the lists again, in place of the bus's events
const USER_REFRESH_MS = 10000
const OWNER_REFRESH_MS = 5000

// a tile per VM right after the Virtual Machines card, in whichever list has that card
function withVmTiles(apps, vms) {
	const at = apps.findIndex(app => app.name === VM_APP_NAME)
	if (at < 0 || !vms.length) {
		return apps
	}
	const tiles = vms.map(vm => ({ name: `vm-tile:${vm.id}`, vmTile: true, vm }))
	return [...apps.slice(0, at + 1), ...tiles, ...apps.slice(at + 1)]
}

// the compact grid's filters; a link app has no state to be running or stopped in
const FILTERS = {
	all: () => true,
	running: app => app.status === 'running',
	stopped: app => app.status !== 'running' && app.app_type !== 'LinkApp',
	updates: app => Boolean(app.update_available),
}

const orderConfig = 'app_order'
// a read that has not answered after this long no longer holds the next one back
const LIST_READ_STUCK_MS = 30000
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
			showHidden: false,
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
			// the cards whose probe has not answered yet: a save keeps their place
			cardsProbing: [],
			skCount: 0,
			ListRefreshTimer: null,
			isCheckingImages: false,
			// the VMs of the tiles, by title
			vms: [],
			// compact grid: 'all' | 'running' | 'stopped' | 'updates'
			filter: 'all',
			// compact grid: one of SORTS, the browser's choice
			sort: savedSort(),
			sorts: SORTS,
			sortLabels: SORT_LABELS,
			favorites: [],
			// compact grid: the bytes each app's containers use, by app name
			memory: {},
		}
	},
	computed: {
		canWrite() {
			return this.$store.getters.canWrite
		},
		dragOptions() {
			return {
				animation: 300,
				group: 'description',
				// a filtered grid lacks apps: dragging in it would save an order without them;
				// a sorted one is not the order dragged
				disabled: this.filter !== 'all' || this.sortedView,
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
		// way: appList, and so the saved order, keeps them first. The tiles follow
		// their card into that row (systemApps).
		gridList: {
			get() {
				const all = this.systemFirst ? this.appList.filter(app => !isSystemApp(app)) : this.appList
				let apps = shownApps(all, this.showHidden)
				if (this.sortedView) {
					apps = sortApps(apps, this.sort, { title: app => ice_i18n(app.title) || app.name, memory: this.memory })
				}
				if (this.filter !== 'all') {
					return apps.filter(FILTERS[this.filter])
				}
				return withVmTiles(apps, this.vms)
			},
			set(list) {
				if (this.filter !== 'all' || this.sortedView) {
					return
				}
				const system = this.systemFirst ? this.appList.filter(isSystemApp) : []
				this.appList = withHiddenApps(concat(system, list.filter(item => !item.vmTile)), this.appList, this.showHidden)
			},
		},
		// a sort other than the custom order, on the compact grid only (the classic grid has no menu)
		sortedView() {
			return this.compact && this.sort !== 'custom'
		},
		// the System row as drawn: the Virtual Machines card is there, so its tiles are too
		systemApps() {
			return this.systemFirst ? withVmTiles(this.appList.filter(isSystemApp), this.vms) : []
		},
		// a pinned app that is gone (uninstalled) is skipped, and forgotten at the next pin
		favoriteApps() {
			return shownApps(this.favorites.map(name => this.appList.find(app => app.name === name && !isSystemApp(app))).filter(Boolean), this.showHidden)
		},
		favoriteDragOptions() {
			return { ...this.dragOptions, group: 'favorites', disabled: false }
		},
		// the apps the admin left out of the dashboard; only the admin is offered to see them
		hiddenApps() {
			return this.appList.filter(isHiddenApp)
		},
		filterOptions() {
			const apps = shownApps(this.appList.filter(app => !isSystemApp(app)), this.showHidden)
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
		sort(value) {
			saveSort(value)
		},
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

		this.$EventBus.$on(events.RELOAD_APP_LIST, this.reloadList)

		this.$EventBus.$on(events.MODULES_CHANGED, this.syncVmCard)
		this.$EventBus.$on(events.MODULES_CHANGED, this.syncSecurityCard)
		this.$EventBus.$on(events.MODULES_CHANGED, this.syncAIAccessCard)
		this.$EventBus.$on(events.FLEET_CHANGED, this.syncFleetCard)

		this.startListTimer()

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
		this.$EventBus.$off(events.RELOAD_APP_LIST, this.reloadList)
		this.$EventBus.$off(events.MODULES_CHANGED, this.syncVmCard)
		this.$EventBus.$off(events.MODULES_CHANGED, this.syncSecurityCard)
		this.$EventBus.$off(events.MODULES_CHANGED, this.syncAIAccessCard)
		this.$EventBus.$off(events.FLEET_CHANGED, this.syncFleetCard)
		window.removeEventListener('resize', this.getSkCount)

		clearInterval(this.ListRefreshTimer)
		this.unmounting = true
		clearTimeout(this.securityRetry)
		clearTimeout(this.aiAccessRetry)

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
		isHiddenApp,
		// a method, not an arrow, so the grid that goes takes its listener with it (Home and DashboardBeta key it by the access)
		reloadList() {
			this.getList()
		},
		// The owner's lists follow the bus and are read every 5 s as well. An account that cannot write has no bus: it reads them
		// every 10 s, while the page is shown, and at once when it is shown again.
		startListTimer() {
			clearInterval(this.ListRefreshTimer)
			const owner = this.canWrite
			this.ListRefreshTimer = setInterval(() => {
				// a read still on its way is not asked again
				if ((!owner && document.hidden) || Date.now() - this.listReading < LIST_READ_STUCK_MS) {
					return
				}
				this.getList()
				// the tiles' backup badges: the service reads at most once a minute, whoever asks
				if (this.$store.getters.canReadModule('backups')) {
					refreshBackupStatus()
				}
			}, owner ? OWNER_REFRESH_MS : USER_REFRESH_MS)
		},

		// the built-in cards of the rights of the account: the store and the files are not a user's
		builtInsOf(apps) {
			return apps.filter(app => (app.name === 'App Store' ? this.canWrite : app.name === 'Files' ? this.$store.getters.canReadModule('files') : true))
		},

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
				case SECURITY_APP_NAME: {
					const flagged = Object.values(vulnScan.apps).filter(item => item.actionable).length
					return flagged > 0 ? this.$t('Apps to update: {count}', { count: flagged }) : this.$t('Vulnerability scan')
				}
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
						message: escape(this.$t(toast.message, toast.params)),
						type: toast.type,
						// a toast that names apps and reasons needs longer than an acknowledgement
						duration: toast.duration || undefined, // undefined is Buefy's own length
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
			this.listReading = Date.now()
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
				// a card of a module the account may no longer read (the role changed) is dropped here
				const hasVmCard = this.$store.getters.canReadModule('vm') && this.appList.some(app => app.name === VM_APP_NAME)
				const vmApps = hasVmCard ? [vmApplication()] : []
				// the Fleet card the same way, where the core says this box is a master. Its page reads every box through the relay,
				// which is the owner's: the "fleet" module of an account shows the boxes on the dashboard, not this card
				const hasFleetCard = this.canWrite && this.appList.some(app => app.name === FLEET_APP_NAME)
				const fleetApps = hasFleetCard ? [fleetApplication()] : []
				// the Logs card the same way, where AppManagement keeps logs
				const hasLogsCard = this.appList.some(app => app.name === LOGS_APP_NAME)
				const logsApps = hasLogsCard ? [logsApplication()] : []
				// the Security card the same way, where the vulnerability scan module answers; its routes are the administrator's
				const hasSecurityCard = this.canWrite && this.appList.some(app => app.name === SECURITY_APP_NAME)
				const securityApps = hasSecurityCard ? [securityApplication()] : []
				// the AI access card the same way, where the MCP module answers; its routes are the administrator's
				const hasAIAccessCard = this.canWrite && this.appList.some(app => app.name === AI_ACCESS_APP_NAME)
				const aiAccessApps = hasAIAccessCard ? [aiAccessApplication()] : []
				// all app list
				const casaAppList = concat(this.builtInsOf(builtInApplications), vmApps, fleetApps, logsApps, securityApps, aiAccessApps, orgNewAppList, listLinkApp)
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
				if (!gridFailed && (hasVmCard || !lateSortList.includes(VM_APP_NAME)) && (hasFleetCard || !lateSortList.includes(FLEET_APP_NAME)) && (hasLogsCard || !lateSortList.includes(LOGS_APP_NAME)) && (hasSecurityCard || !lateSortList.includes(SECURITY_APP_NAME)) && (hasAIAccessCard || !lateSortList.includes(AI_ACCESS_APP_NAME))) {
					this.saveSortIfChanged(lateSortList)
				}
				// the cards of the modules the account may read: the others are neither probed nor shown
				if (!hasVmCard && this.$store.getters.canReadModule('vm')) {
					this.addVmCardWhenThere(lateSortList)
				}
				if (!hasFleetCard && this.canWrite) {
					this.addFleetCardWhenThere(lateSortList)
				}
				if (!hasLogsCard) {
					this.addLogsCardWhenThere(lateSortList)
				}
				if (!hasSecurityCard && this.canWrite) {
					this.addSecurityCardWhenThere(lateSortList)
				}
				if (!hasAIAccessCard && this.canWrite) {
					this.addAIAccessCardWhenThere(lateSortList)
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
			} finally {
				this.listReading = 0
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

		// Runs a card's probe; until it answers, a save keeps the card's saved place.
		probeCard(name, probe) {
			this.cardsProbing.push(name)
			return probe().finally(() => {
				this.cardsProbing.splice(this.cardsProbing.indexOf(name), 1)
			})
		},

		// Adds the Fleet card at its saved place once the core says master.
		addFleetCardWhenThere(savedOrder) {
			return this.probeCard(FLEET_APP_NAME, hasFleet).then((available) => {
				if (available && !this.appList.some(app => app.name === FLEET_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, fleetApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (!available && savedOrder.includes(FLEET_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// Adds the Logs card at its saved place once AppManagement says it keeps logs.
		addLogsCardWhenThere(savedOrder) {
			return this.probeCard(LOGS_APP_NAME, hasLogs).then((available) => {
				if (available && !this.appList.some(app => app.name === LOGS_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, logsApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (!available && savedOrder.includes(LOGS_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// Adds the Security card at its saved place once the vulnerability scan module answers. A
		// module that did not answer (a scan holding it up) is asked again a minute later: the
		// card used to stay away until the page was reloaded, and its saved place is kept meanwhile.
		addSecurityCardWhenThere(savedOrder) {
			clearTimeout(this.securityRetry)
			return this.probeCard(SECURITY_APP_NAME, hasSecurity).then((available) => {
				if (available && !this.appList.some(app => app.name === SECURITY_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, securityApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (available === null && !this.unmounting) {
					this.securityRetry = setTimeout(() => this.addSecurityCardWhenThere(savedOrder), SECURITY_RETRY_MS)
				} else if (!available && savedOrder.includes(SECURITY_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// A module was installed or removed: the Security card comes or goes without a reload, and
		// the apps' cards read the scans again (the module scans right after its install).
		syncSecurityCard() {
			if (!this.canWrite) {
				return Promise.resolve()
			}
			forgetSecurity()
			return hasSecurity().then((available) => {
				const has = this.appList.some(app => app.name === SECURITY_APP_NAME)
				if (available && !has) {
					this.appList = this.sortApps(concat(this.appList, securityApplication()), [])
				} else if (available === false && has) {
					// a module that did not answer for now keeps its card
					this.appList = this.appList.filter(app => app.name !== SECURITY_APP_NAME)
				}
				return refreshVulnScan({ force: true })
			})
		},

		// Adds the AI access card at its saved place once the MCP module answers. A module that did
		// not answer is asked again a minute later, its saved place kept meanwhile (as the Security card).
		addAIAccessCardWhenThere(savedOrder) {
			clearTimeout(this.aiAccessRetry)
			return this.probeCard(AI_ACCESS_APP_NAME, hasAIAccess).then((available) => {
				if (available && !this.appList.some(app => app.name === AI_ACCESS_APP_NAME)) {
					this.appList = this.sortApps(concat(this.appList, aiAccessApplication()), savedOrder)
					this.saveSortIfChanged(savedOrder)
				} else if (available === null && !this.unmounting) {
					this.aiAccessRetry = setTimeout(() => this.addAIAccessCardWhenThere(savedOrder), AI_ACCESS_RETRY_MS)
				} else if (!available && savedOrder.includes(AI_ACCESS_APP_NAME)) {
					this.saveSortIfChanged(savedOrder)
				}
			})
		},

		// A module was installed or removed: the AI access card comes or goes without a reload.
		syncAIAccessCard() {
			if (!this.canWrite) {
				return Promise.resolve()
			}
			forgetAIAccess()
			return hasAIAccess().then((available) => {
				const has = this.appList.some(app => app.name === AI_ACCESS_APP_NAME)
				if (available && !has) {
					this.appList = this.sortApps(concat(this.appList, aiAccessApplication()), [])
				} else if (available === false && has) {
					// a module that did not answer for now keeps its card
					this.appList = this.appList.filter(app => app.name !== AI_ACCESS_APP_NAME)
				}
			})
		},

		// a save while apps are missing keeps their saved place (saveSortData)
		addVmCardWhenThere(savedOrder) {
			return this.probeCard(VM_APP_NAME, hasVirtualMachines).then((available) => {
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
			if (!this.canWrite) {
				this.getList()
			}
			return this.pollVms()
		},

		/**
		 * @description: Save Sort Table
		 * @param {*}
		 * @return {*}
		 */
		saveSortData() {
			// the cards listed before the role is known are a plain account's: the saved order is kept
			if (this.$store?.state?.user?.role === '') {
				return
			}
			const shown = this.appList.map((item) => {
				// compose milestone :: name is unique, global index.
				return item.name
			})
			// Every app saved and not shown keeps its saved place, behind the app saved before it.
			// A list can lack apps for a while: the grid failing, a card whose probe has not
			// answered, a grid read right after an update before every app is back. Dropping
			// them there lost their place for good, and they came back at the end (CasaOS#183).
			// shortcut: an uninstalled app's name stays in the order (a few bytes; it goes back
			// to its place if installed again); prune it if the list ever grows in the hundreds.
			const newList = keepUnshown(shown, this.savedOrder || [])
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
				openPage('appstore', { store: storeId })
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
				canCancel: [''], // Escape is the panel's own: it asks before a draft is thrown away
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
						// the newer versions the box found for its pinned images
						newerTags: item.newer_tags || [],
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
				message: escape(message),
				duration,
				type,
			})
		},
	},
	sockets: {
		// the scan module scans the images an app just started to run: see vulnScan.followRescan
		'app:install-end': function () {
			followRescan()
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
			followRescan()
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
			followRescan()

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
				followRescan()
				// business :: Tagging of new app / scrollIntoView
				this.addIdToSessionStorage(data.Properties['app:name'])

				this.$buefy.toast.open({
					message: escape(this.$t(`{name} has been updated to the latest version!`, {
						// the publisher sends app:name; there has never been a `name`
						name: data.Properties['app:name'],
					})),
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
// an app left out of the dashboard, drawn because the admin asked to see them
.is-dashboard-hidden {
	opacity: 0.5;
}

.hidden-apps-toggle {
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	text-decoration: underline;
	cursor: pointer;
}

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

	// the system and favorite apps of the beta dashboard on a phone: tiles of three, icon over name, as the proposal draws them
	&.is-tiles {
		@include touch {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.625rem;

			:deep(.app-card.is-compact) {
				.img-c {
					flex-direction: column !important;
					justify-content: center !important;
					padding: 0.75rem 0.375rem !important;
					text-align: center;
					gap: 0.5rem;
				}

				.app-text {
					width: 100%;
					text-align: center;

					// the title and its backup badge, centred like the rest of the tile
					.title-row {
						justify-content: center;
					}
				}

				.app-state {
					font-size: 0.625rem;
				}

				.action-btn {
					top: 0.25rem;
					right: 0.125rem;
					transform: none;
				}
			}
		}
	}
}

// the cards' "update" chip sits at z-index 30; the + menu must open above it
.file-dropdown ::v-deep .dropdown-menu {
	z-index: 40;
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

// the sort chip: the filters' outline, its icon and label on one line; outlined brighter once
// the order is not the custom one, so a sorted grid says it is
.sort-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	white-space: nowrap;

	&.is-sorted {
		border-color: rgba(255, 255, 255, 0.7);
	}
}

.sort-option {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
</style>
