<template>
	<div v-if="!isLoading" class="out-container">
		<!-- NavBar Start -->
		<TopBar v-animate-css="topBarAni" :init-bar-data="barData" @showSideBar="showSideBar" />
		<!-- NavBar End -->

		<!-- Content Start -->
		<div class="contents  pt-55 contextmenu-canvas" @contextmenu.prevent="openHomeContaxtMenu">
			<div class="container">
				<!-- the beta dashboard is opt-in (Settings); the classic one stays the default -->
				<!-- keyed by the rights: what a part decided at its creation (its widgets, cards, timers) is decided again when they change -->
				<DashboardBeta v-if="barData.dashboard_beta && readsAModule && !hardwareInfoLoading" :key="access" @leave="setDashboardBeta(false)" />
				<div v-else class="columns is-variable is-2">
					<div class="column is-one-quarter slider-content">
						<!-- SideBar Start -->
						<SideBar v-if="!hardwareInfoLoading" :key="access" @searchBarChange="handleSearchBarChange" />
						<!-- SideBar End -->
					</div>
					<div :class="{ open: sidebarOpen }" class="column is-three-quarters main-content">
						<!-- MainContent Start -->
						<div class=" contextmenu-canvas">
							<!-- SearchBar Start -->
							<section>
								<transition name="fade">
									<SearchBar v-if="searchbarShow" />
								</transition>
							</section>
							<!-- SearchBar End -->

							<!-- core-service Start -->
							<section>
								<transition name="fade">
									<CoreService v-if="canWrite" />
								</transition>
							</section>
							<!-- core-service End -->

							<!-- Apps Start -->
							<section>
								<AppSection :key="access" />
							</section>
							<!-- Apps End -->

							<!-- Shortcuts Start -->
							<!-- <section>
								<shortcuts></shortcuts>
							</section> -->
							<!-- Shortcuts End -->
						</div>
						<!-- MainContent End -->
					</div>
				</div>
			</div>
		</div>
		<!-- Content End -->

		<!-- File Panel Start -->
		<b-modal v-if="canReadModule('files')" v-model="isFileActive" :can-cancel="[]" :destroy-on-hide="false" animation="zoom-in" aria-modal
			custom-class="file-panel" has-modal-card @after-enter="afterFileEnter">
			<template #default="props">
				<FilePanel ref="filePanel" @close="props.close" />
			</template>
		</b-modal>
		<!-- File Panel End -->
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { nanoid } from 'nanoid'
import SearchBar from '@/components/SearchBar.vue'
import SideBar from '@/components/SideBar.vue'
import TopBar from '@/components/TopBar.vue'
import CoreService from '@/components/CoreService.vue'
import AppSection from '@/components/Apps/AppSection.vue'
import DashboardBeta from '@/components/DashboardBeta.vue'
import FilePanel from '@/components/filebrowser/FilePanel.vue'
import UpdateCompleteModal from '@/components/settings/UpdateCompleteModal.vue'
import { mixin } from '@/mixins/mixin'
import { FILES_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'
import events from '@/events/events'
import { openPage } from '@/router/pageTabs'
import { createPoller } from '@/components/Stats/poller'
import { accessOf, readsAModule } from '@/store/confirmRole'

// a session without the message bus (an account of role user with the system right) reads the box's load this often
const UTILIZATION_POLL_MS = 10000

const wallpaperConfig = 'wallpaper'

export default {
	name: 'HomePage',
	components: {
		SideBar,
		SearchBar,
		AppSection,
		DashboardBeta,
		TopBar,
		CoreService,
		FilePanel,
	},
	mixins: [mixin],
	provide() {
		return {
			homeShowFiles: this.showFiles,
		}
	},
	data() {
		return {
			isLoading: true,
			hardwareInfoLoading: true,
			user_id: localStorage.getItem('user_id') ? localStorage.getItem('user_id') : 1,
			isFileActive: false,
			barData: {},
			topBarAni: {
				classes: 'fadeInDown',
				duration: 800,
			},
		}
	},

	computed: {
		canWrite() {
			return this.$store.getters.canWrite
		},
		// the role and the modules it reads, as one value: the server confirms them after the first render
		access() {
			return accessOf(this.$store.getters)
		},
		readsAModule() {
			return readsAModule(this.$store.getters)
		},
		sidebarOpen() {
			return this.$store.state.sidebarOpen
		},
		searchbarShow() {
			return this.$store.state.searchEngineSwitch
		},
	},
	watch: {
		// the role and the rights confirmed after the first render: what the dashboard waits for is asked then
		access() {
			// the side bar waits again for the box's load when the widgets read it
			this.hardwareInfoLoading = this.canReadModule('system')
			this.followUtilization()
		},
	},
	created() {
		this.followUtilization()
		this.getWallpaperConfig()
		this.getConfig()

		this.$store.commit('SET_ACCESS_ID', nanoid())
	},
	mounted() {
		window.addEventListener('resize', this.onResize)
		this.onResize()
		if (localStorage.getItem('is_update') === 'true') {
			this.showUpdateCompleteModal()
			localStorage.removeItem('is_update')
		}
		if (sessionStorage.getItem('fromWelcome')) {
			this.$messageBus('global_newvisit')
			// one-off consumption
			sessionStorage.removeItem('fromWelcome')
		}
		this.$messageBus('global_visit')

		this.$EventBus.$on('casaUI:openStorageManager', () => {
			this.showStorageManagerPanelModal()
		})
		document.addEventListener('visibilitychange', this.onVisibility)
	},
	beforeUnmount() {
		this.utilizationPoller?.stop()
		document.removeEventListener('visibilitychange', this.onVisibility)
		window.removeEventListener('resize', this.onResize)
		this.$EventBus.$off('casaUI:openStorageManager')
	},
	methods: {
		canReadModule(name) {
			return this.$store.getters.canReadModule(name)
		},

		/**
		 * @description: Get CasaOS Configs
		 * @param {*}
		 * @return {*}
		 */
		async getConfig() {
			let systemConfig = await this.$api.users.getCustomStorage('system')
			if (systemConfig.data.success != 200 || systemConfig.data.data == '') {
				const barData = {
					lang: this.getLangFromBrowser(),
					search_engine: 'https://duckduckgo.com/?q=',
					search_switch: true,
					recommend_switch: true,
					shortcuts_switch: true,
					widgets_switch: true,
					existing_apps_switch: true,
					dashboard_beta: false,
				}
				// save
				const saveRes = await this.$api.users.setCustomStorage('system', barData)
				if (saveRes.data.success === 200) {
					systemConfig = saveRes
					this.barData = saveRes.data.data
				}
			}

			this.$store.commit('SET_SEARCH_ENGINE_SWITCH', systemConfig.data.data.search_switch)
			this.$store.commit('SET_RECOMMEND_SWITCH', systemConfig.data.data.recommend_switch)
			this.barData = systemConfig.data.data
			this.isLoading = false
		},

		/**
		 * @description: Show SideBar
		 * @param {*}
		 * @return {*} void
		 */
		showSideBar() {
			console.log('showSidebar')
		},

		/**
		 * @description: Update the search bar visibility from widget settings
		 * @param {boolean} value
		 * @return {*} void
		 */
		async handleSearchBarChange(value) {
			const searchSwitch = Boolean(value)
			this.$store.commit('SET_SEARCH_ENGINE_SWITCH', searchSwitch)
			this.barData = {
				...this.barData,
				search_switch: searchSwitch,
			}

			const saveRes = await this.$api.users.setCustomStorage('system', this.barData)
			if (saveRes.data.success === 200) {
				this.barData = saveRes.data.data
			}
		},

		/**
		 * @description: Switch between the classic and the beta dashboard (saved with the other system settings)
		 * @param {boolean} value
		 * @return {*} void
		 */
		async setDashboardBeta(value) {
			this.barData = {
				...this.barData,
				dashboard_beta: Boolean(value),
			}

			const saveRes = await this.$api.users.setCustomStorage('system', this.barData)
			if (saveRes.data.success === 200) {
				this.barData = saveRes.data.data
			}
		},

		/**
		 * @description: Show Files
		 * @param {*}
		 * @return {*} void
		 */
		showFiles(path) {
			// the App launching setting covers Files as it covers the apps
			if (builtinOpensInNewTab(FILES_LAUNCH_ID, this.$store.state)) {
				openPage('files', { path })
				return
			}

			this.isFileActive = true
			this.$nextTick(() => {
				this.$refs.filePanel.init(path)
			})
		},

		afterFileEnter() {
			this.$EventBus.$emit(events.AFTER_FILES_ENTER)
		},

		/**
		 * @description: Window Resize Handler
		 * @param {*}
		 * @return {*} void
		 */
		onResize() {
			if (window.innerWidth > 480 && this.sidebarOpen) {
				this.$store.commit('SET_SIDEBAR_CLOSE')
			}
		},

		/**
		 * @description: Get Hardware info and save to store
		 * @param {*}
		 * @return {*} void
		 */

		// The owner's widgets follow the message bus after the first read. A user's session has no bus: with the system
		// right it reads the load again every 10 s while the page is shown, into the store the widgets follow.
		followUtilization() {
			this.utilizationPoller?.stop()
			this.utilizationPoller = null
			if (this.canWrite || !this.canReadModule('system')) {
				return this.getHardwareInfo()
			}
			this.utilizationPoller = createPoller({ run: () => this.getHardwareInfo(), intervalMs: UTILIZATION_POLL_MS })
			this.utilizationPoller.start()
		},
		onVisibility() {
			this.utilizationPoller?.visibilityChanged()
		},

		getHardwareInfo() {
			// the box's load, memory and disks are the "system" module's: the side bar and the dashboard do not wait for them without it
			if (!this.canReadModule('system')) {
				this.hardwareInfoLoading = false
				return
			}
			return this.$api.sys.getUtilization().then((res) => {
				if (res.data.success === 200) {
					this.hardwareInfoLoading = false
					this.$store.commit('SET_HARDWARE_INFO', res.data.data)
				}
			})
		},

		openHomeContaxtMenu(e) {
			// console.log(e.target);
			this.$EventBus.$emit(events.SHOW_HOME_CONTEXT_MENU, e)
		},

		getWallpaperConfig() {
			this.$api.users.getCustomStorage(wallpaperConfig).then((res) => {
				if (res.data.success === 200 && res.data.data != '') {
					this.$store.commit('SET_WALLPAPER', {
						path: res.data.data.path,
						from: res.data.data.from,
					})
				}
			})
		},

		async showUpdateCompleteModal() {
			if (!this.canWrite) {
				return
			}
			await this.$api.users.getLinkAppDetail()
			const versionRes = await this.$api.sys.getVersion()
			if (versionRes.data.success == 200) {
				this.$buefy.modal.open({
					component: UpdateCompleteModal,
					hasModalCard: true,
					customClass: 'network-storage-modal',
					trapFocus: true,
					canCancel: ['escape'],
					scroll: 'keep',
					animation: 'zoom-in',
					props: {
						changeLog: versionRes.data.data.version.change_log,
					},
				})
			}
		},

		// show storage settings modal
		async showStorageManagerPanelModal() {
			this.$messageBus('widget_storagemanager')
			this.$buefy.modal.open({
				component: defineAsyncComponent(() => import('@/components/Storage/StorageManagerPanel.vue')),
				hasModalCard: true,
				customClass: 'storage-modal',
				trapFocus: true,
				canCancel: [],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

	},

}
</script>

<style lang="scss" scoped>
.out-container {
    position: relative;
    height: 100%;
}

.contents {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    height: calc(100% - 7rem);
}

.main-content {
    z-index: 10;

    @include until-widescreen {
        width: calc(100% - 18rem);
    }
}

.dark-bg {
    position: fixed;
    transition: all 0.3s ease;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: var(--casa-under-wallpaper);
    z-index: 19;
    opacity: 0;
    visibility: hidden;

    &.open {
        opacity: 1;
        visibility: visible;
    }
}

.slider-content {
    min-width: 18rem;
    position: relative;
    // height: calc(100vh - 6rem);
}

@media screen and (max-width: 480px) {
    .slider-content {
        position: absolute;
        width: 100%;
    }

    .contents {
        height: calc(100dvh - 44px) !important;
        padding-bottom: 1rem;
    }

    .container {
        padding-bottom: 1rem;
    }

    .columns {
        height: 100%;
    }

    .column {
        padding: 0;
        width: 100%;
        right: 0;
    }

    .main-content {
        margin-left: 0;
        transition: all 0.3s;

        &.open {
            transform: scale(0.9);
            opacity: 0;
        }
    }
}

@media screen and (max-width: $tablet) {
    .columns {
        display: flex;
    }
}
</style>
