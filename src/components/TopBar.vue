<template>
	<div class="navbar top-bar is-flex is-align-items-center _fixed-height">
		<div class="navbar-brand ml-4 _fixed-height">
			<!-- SideBar Button Start -->
			<div id="sidebar-btn" class="is-flex is-align-items-center navbar-item">
				<b-tooltip :active="!$store.state.isMobile"
					:label="sidebarIconLabel"
					position="is-right"
					type="is-dark">
					<div role="button" @click="showSideBar">
						<b-icon :icon="sidebarIcon" class="picon" pack="casa" size="is-20" />
					</div>
				</b-tooltip>
			</div>
			<!-- SideBar Button Start -->

			<!-- Account Dropmenu Start -->
			<b-dropdown animation="fade1"
				aria-role="list"
				class="navbar-item"
				:close-on-click="true"
				@active-change="getUserInfo">
				<template #trigger>
					<b-tooltip :active="!$store.state.isMobile"
						:label="$t('Account')"
						position="is-right"
						type="is-dark"
						@click="$messageBus('account_setting')">
						<p role="button">
							<b-icon class="picon" icon="account-outline" pack="casa" size="is-20" />
						</p>
					</b-tooltip>
				</template>

				<b-dropdown-item :focusable="false" aria-role="menu-item" class="p-0" custom>
					<AccountPanel />
				</b-dropdown-item>
			</b-dropdown>
			<!-- Account Dropmenu End -->

			<!-- Settings Dropmenu Start -->
			<b-dropdown ref="settingsDrop"
				animation="fade1"
				aria-role="list"
				class="navbar-item"
				@active-change="onOpen">
				<template #trigger>
					<b-tooltip :active="!$store.state.isMobile"
						:label="$t('Settings')"
						position="is-right"
						type="is-dark"
						@click="$messageBus('dashboardsetting')">
						<p role="button">
							<b-icon :class="{ 'update-icon-dot': updateInfo.need_update }"
								class="picon"
								icon="control-outline"
								pack="casa"
								size="is-20" />
						</p>
					</b-tooltip>
				</template>

				<b-dropdown-item :focusable="false" aria-role="menu-item" class="p-0" custom>
					<h2 class="_title mb-4 has-text-weight-bold">
						{{ $t("Settings") }}
					</h2>
					<!-- Search Engine Switch Start  -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="show-search-outline" pack="casa" size="is-20" />
							{{ $t("Show Search Bar") }}
						</div>
						<div>
							<b-field>
								<b-switch v-model="barData.search_switch"
									class="is-flex-direction-row-reverse mr-0 _small"
									type="is-dark"
									@update:model-value="saveData" />
							</b-field>
						</div>
					</div>
					<!-- Search Engine Switch End  -->

					<!-- Search Engine Start -->
					<div v-if="barData.search_switch"
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="search-outline" pack="casa" size="is-20" />
							{{ $t("Search Engine") }}
						</div>
						<div>
							<b-field>
								<b-select v-model="barData.search_engine"
									class="set-select"
									size="is-small"
									@update:model-value="saveData">
									<option v-for="item in searchEngines" :key="item.name" :value="item.url">
										{{ item.name }}
									</option>
								</b-select>
							</b-field>
						</div>
					</div>
					<!-- Search Engine End -->

					<!-- Language Start -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="language-outline" pack="casa" size="is-20" />
							{{ $t("Language") }}
						</div>
						<div>
							<b-field>
								<b-select v-model="barData.lang" class="set-select" size="is-small" @update:model-value="saveData">
									<option v-for="lang in languages" :key="lang.lang" :value="lang.lang">
										{{ lang.name }}
									</option>
								</b-select>
							</b-field>
						</div>
					</div>
					<!-- Language End -->

					<!-- Appearance Start -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" custom-size="mdi-20px" icon="theme-light-dark" />
							{{ $t("Appearance") }}
						</div>
						<div>
							<b-field>
								<b-select v-model="theme" class="set-select" size="is-small" @update:model-value="setThemePreference">
									<option v-for="item in themes" :key="item.value" :value="item.value">
										{{ $t(item.label) }}
									</option>
								</b-select>
							</b-field>
						</div>
					</div>
					<!-- Appearance End -->

					<!-- WebUI Port Start -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="port-outline" pack="casa" size="is-20" />
							{{ $t("WebUI Port") }}
						</div>
						<div>
							{{ port }}
						</div>
						<div class="ml-2">
							<b-button rounded size="is-small" type="is-dark" @click="showPortPanel">
								{{ $t("Change") }}
							</b-button>
						</div>
					</div>
					<!-- WebUI Port End -->

					<!-- Backup destinations Start -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="cloud-outline" pack="casa" size="is-20" />
							{{ $t("Backup destinations") }}
						</div>
						<div class="ml-2">
							<b-button rounded size="is-small" type="is-dark" @click="showBackupDestinations">
								{{ $t("Change") }}
							</b-button>
						</div>
					</div>
					<!-- Backup destinations End -->

					<!-- Background Start -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="wallpaper-outline" pack="casa" size="is-20" />
							{{ $t("Wallpaper") }}
						</div>
						<div class="ml-2">
							<b-button rounded size="is-small" type="is-dark" @click="showChangeWallpaperModal">
								{{ $t("Change") }}
							</b-button>
						</div>
					</div>
					<!-- Background End -->

					<!--  Show other Docker container app(s) Switch Start  -->
					<div v-if="$store.state.notImportList.length > 0"
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="docker-outline" pack="casa" size="is-20" />
							{{ $t("Show other Docker container app(s)") }}
						</div>
						<div>
							<b-field>
								<b-switch v-model="barData.existing_apps_switch"
									class="is-flex-direction-row-reverse mr-0 _small"
									type="is-dark"
									@update:model-value="saveData" />
							</b-field>
						</div>
					</div>
					<!--  Show other Docker container app(s) Switch End  -->

					<!--  Recommended modules Switch Start  -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2"
								icon="display-applications-outline"
								pack="casa"
								size="is-20" />
							{{ $t("Show Recommended Apps") }}
						</div>
						<div>
							<b-field>
								<b-switch v-model="barData.recommend_switch"
									class="is-flex-direction-row-reverse mr-0 _small"
									type="is-dark"
									@update:model-value="saveData" />
							</b-field>
						</div>
					</div>
					<!-- Recommended modules Switch End  -->

					<!-- Automount USB Drive Start  -->
					<div
						class="is-flex is-align-items-center mb-1 _is-large _box hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
							<b-icon class="mr-1 ml-2" icon="usb-outline" pack="casa" size="is-20" />
							{{ $t("Automount USB Drive") }}
							<b-tooltip v-if="isRaspberryPi"
								:label="
									$t(
										'Enabling this function may cause boot failures when the Raspberry Pi device is booted from USB',
									)
								"
								multilined
								type="is-dark">
								<b-icon class="ml-1" icon="question-outline" pack="casa" size="is-small" />
							</b-tooltip>
						</div>
						<div>
							<b-field>
								<b-switch v-model="autoUsbMount"
									class="is-flex-direction-row-reverse mr-0 _small"
									type="is-dark"
									@update:model-value="usbAutoMount" />
							</b-field>
						</div>
					</div>
					<!-- Automount USB Drive End  -->

					<!-- Anonymous statistics Start -->
					<div v-if="telemetryEnabled !== null" class="_is-large hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center">
							<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
								<b-icon class="mr-1 ml-2" custom-size="mdi-20px" icon="chart-box-outline" />
								{{ $t("Anonymous usage statistics") }}
							</div>
							<div>
								<b-field>
									<b-switch :model-value="telemetryEnabled"
										class="is-flex-direction-row-reverse mr-0 _small"
										type="is-dark"
										@update:model-value="setTelemetry" />
								</b-field>
							</div>
						</div>
						<div class="pl-55 ml-1 is-size-7">
							<a href="#" @click.prevent="showTelemetryPreview">{{ $t("See what is sent") }}</a>
						</div>
					</div>
					<!-- Anonymous statistics End -->

					<!-- Update Start -->
					<div class="_is-large hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center">
							<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
								<b-icon class="mr-1 ml-2" icon="update-outline" pack="casa" size="is-20" />
								<div :class="{ 'update-text-dot': updateInfo.need_update }">
									{{ $t("Update") }}
								</div>
							</div>
							<div class="_has-text-gray">
								v{{ updateInfo.current_version }}
							</div>
						</div>

						<div v-if="!updateInfo.need_update" class="is-flex is-align-items-center pl-55 ml-1 is-size-7">
							{{ $t(latestText) }}
							<b-icon class="ml-1" custom-size="mdi-18px" icon="check" type="is-success" />
						</div>
						<div v-else class="is-flex is-align-items-center is-justify-content-end update-container pl-5">
							<div class="is-flex-grow-1 is-size-7">
								{{ $t(updateText) }}
							</div>
							<b-button class="ml-2" rounded size="is-small" type="is-dark" @click="showUpdateModal">
								{{ $t("Update") }}
							</b-button>
						</div>
					</div>
					<!-- Update End -->

					<!-- System Package Update Start -->
					<div class="_is-large hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center">
							<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
								<b-icon class="mr-1 ml-2" icon="update-outline" pack="casa" size="is-20" />
								{{ $t("System packages") }}
							</div>
						</div>
						<div class="is-flex is-align-items-center is-justify-content-end update-container pl-5">
							<div class="is-flex-grow-1 is-size-7">
								{{ $t("Check for updates") }}
							</div>
							<b-button class="ml-2" rounded size="is-small" type="is-dark" @click.stop="showSystemPackageUpdateModal">
								{{ $t("Check") }}
							</b-button>
						</div>
					</div>
					<!-- System Package Update End -->

					<!-- App Launching Start -->
					<div class="_is-large hover-effect _is-radius pr-2 mr-4 ml-4">
						<div class="is-flex is-align-items-center">
							<div class="is-flex is-align-items-center is-flex-grow-1 _is-normal">
								<b-icon class="mr-1 ml-2" icon="display-applications-outline" pack="casa" size="is-20" />
								{{ $t("App launching") }}
							</div>
						</div>
						<div class="is-flex is-align-items-center is-justify-content-end update-container pl-5">
							<div class="is-flex-grow-1 is-size-7">
								{{ $t($store.state.appLaunchInIframe ? "Apps open inside CasaOS" : "Apps open in a new tab") }}
							</div>
							<b-button class="ml-2" rounded size="is-small" type="is-dark" @click.stop="showAppLaunchModal">
								{{ $t("Configure") }}
							</b-button>
						</div>
					</div>
					<!-- App Launching End -->

					<!-- Restart or Shutdown Start -->
					<div
						class="is-flex is-align-content-center is-justify-content-center _footer mt-4 pl-3 pr-3 pt-2 pb-2">
						<div class="mr-1 column is-half is-flex is-align-items-center is-justify-content-center hover-effect is-clickable _is-radius _is-normal"
							@click="power('Restart')">
							<b-icon class="mr-1" icon="restart-outline" pack="casa" />
							{{ $t(restart) }}
						</div>
						<div class="ml-1 column is-half is-flex is-align-items-center is-justify-content-center is-clickable hover-effect-attention _has-text-attention _is-radius"
							@click="power('Shutdown')">
							<b-icon class="mr-1"
								custom-class="_has-text-attention"
								icon="shutdown-outline"
								pack="casa" />
							{{ $t(shutdown) }}
						</div>
					</div>
					<!-- Restart or Shutdown End -->
				</b-dropdown-item>
			</b-dropdown>
			<!-- Settings Dropmenu End -->

			<!-- Terminal  Start -->
			<div class="is-flex is-align-items-center ml-3 _fixed-height" @click="showTerminalPanel">
				<b-tooltip :active="!$store.state.isMobile"
					:label="$t('Terminal & Logs')"
					position="is-right"
					style="height: 1.25rem"
					type="is-dark">
					<b-icon class="picon" icon="terminal-outline" pack="casa" size="is-20" />
				</b-tooltip>
			</div>
			<!-- Terminal  End -->
		</div>

		<div class="navbar-menu">
			<div class="navbar-end mr-3">
				<!-- <b-icon pack="far" icon="comment-alt"></b-icon> -->
			</div>
		</div>

		<b-modal v-model="showPower" :can-cancel="false" class="_modal" scroll="clip" width="20rem">
			<b-message @close="resetPower">
				<template #header>
					{{ $t(showPowerTitle) }}
					<img v-if="showPowerTitle === 'Now shutting down'"
						:src="require('@/assets/img/loading/waiting.svg')"
						alt="pending"
						class="ml-1 is-24x24">
				</template>
				<div :class="showPowerTitle === 'Now shutting down' ? 'mb-4' : ''"
					class="is-flex is-align-items-center is-justify-content-start _is-normal">
					{{ $t(showPowerMessage) }}
				</div>
			</b-message>
			<footer v-if="showPowerTitle !== 'Now shutting down'"
				class="is-flex is-flex-direction-row-reverse">
				<button
					class="ml-2 mr-5 mt-3 mb-3 pr-4 pl-4 _is-normal _has-background-blue is-flex is-align-items-center is-justify-content-center">
					{{ $t("Connecting") }}
					<img :src="require('@/assets/img/power/waiting-white.svg')" alt="loading" class="ml-1">
				</button>
			</footer>
		</b-modal>
	</div>
</template>

<script>
import AccountPanel from './account/AccountPanel.vue'
import TerminalPanel from './logsAndTerminal/TerminalPanel.vue'
import BackupDestinations from './settings/BackupDestinations.vue'
import PortPanel from './settings/PortPanel.vue'
import UpdateModal from './settings/UpdateModal.vue'
import SystemPackageUpdateModal from './settings/SystemPackageUpdateModal.vue'
import AppLaunchModal from './settings/AppLaunchModal.vue'
import TelemetryPreviewModal from './settings/TelemetryPreviewModal.vue'
import { mixin } from '@/mixins/mixin'
import { readThemePreference, setThemePreference } from '@/mixins/app/themePreference'
import messages from '@/assets/lang'

import events from '@/events/events'

const systemConfigName = 'system'

export default {
	name: 'TopBar',
	components: {
		AccountPanel,
	},
	mixins: [mixin],
	props: {
		initBarData: {
			type: Object,
		},
	},
	data() {
		return {
			timer: 0,
			// User
			userInfo: this.$store.state.user,
			// System
			barData: {
				lang: this.getInitLang(),
				search_engine: 'https://duckduckgo.com/?q=',
				search_switch: true,
				recommend_switch: true,
				shortcuts_switch: false, // Not used
				widgets_switch: false, // Not used
				existing_apps_switch: true,
			},
			updateInfo: {
				current_version: '0',
				need_update: false,
				version: Object,
			},
			isUpdating: false,
			latestText: 'Currently at the latest version',
			updateText: 'A new version is available!',

			port: '',
			autoUsbMount: false,
			// null until the core answers GET /v1/sys/telemetry: a core without the
			// route shows no switch that could not work
			telemetryEnabled: null,
			deviceModel: '',
			// Language Sets
			languages: Object.entries(messages).map(([key, value]) => ({
				lang: key,
				name: value.lang_name,
			})),
			// Appearance: kept in localStorage, never in barData - the login page
			// needs it before any user exists, and the server copy would overwrite it.
			theme: readThemePreference(),
			themes: [
				{ value: 'light', label: 'Light' },
				{ value: 'dark', label: 'Dark' },
				{ value: 'system', label: 'Follow the system' },
			],
			// Search Engine Sets
			searchEngines: [
				{ url: 'https://duckduckgo.com/?q=', name: 'DuckDuckGo' },
				{ url: 'https://www.google.com/search?q=', name: 'Google' },
				{ url: 'https://www.bing.com/search?q=', name: 'Bing' },
				{ url: 'https://www.startpage.com/do/search?cat=web&pl=chrome&query=', name: 'StartPage' },
				{ url: 'https://search.brave.com/search?source=web&q=', name: 'Brave' },
			],
			restart: 'Restart',
			shutdown: 'Shutdown',
			showPower: false,
			showPowerTitle: '',
			showPowerMessage: '',
		}
	},
	computed: {
		sidebarIcon() {
			return this.$store.state.sidebarOpen ? 'close-outline' : 'menu-outline'
		},
		sidebarIconLabel() {
			return this.$store.state.sidebarOpen ? 'Hide Sidebar' : 'Show SideBar'
		},
		isRaspberryPi() {
			return this.deviceModel.toLowerCase().includes('raspberry')
		},
	},
	watch: {
		'barData.lang': {
			handler(val, oldValue) {
				if (val === oldValue) {
					return
				}
				const lang = val.includes('_') ? val : 'en_us'
				this.$messageBus('dashboardsetting_language', lang)
				this.setLang(lang)
			},
			deep: true,
		},
		'barData.search_engine': {
			handler(val, oldValue) {
				if (val === oldValue) {
					return
				}
				this.$messageBus('dashboardsetting_searchengine', val.toString())
				this.$store.commit('SET_SEARCH_ENGINE', val)
			},
			deep: true,
		},
		'barData.search_switch': {
			handler(val, oldValue) {
				if (val === oldValue) {
					return
				}
				this.$messageBus('dashboardsetting_showsearchbar', val.toString())
				this.$store.commit('SET_SEARCH_ENGINE_SWITCH', val)
			},
			deep: true,
		},

		'barData.recommend_switch': {
			handler(val) {
				this.$store.commit('SET_RECOMMEND_SWITCH', val)
			},
			deep: true,
		},
		initBarData(val) {
			this.barData = val
		},
	},
	created() {
		this.barData = this.initBarData
		// this.getConfig();
		this.getPort()
	},
	mounted() {
		this.checkVersion()
		this.getUserInfo()
		this.getUsbStatus()
		this.getTelemetry()
		this.getHardwareInfo()
		// the notice's Turn off (CoreService) moves the switch too
		this.$EventBus.$on(events.TELEMETRY_CHANGED, this.onTelemetryChanged)
	},
	beforeUnmount() {
		this.$EventBus.$off(events.TELEMETRY_CHANGED, this.onTelemetryChanged)
	},

	methods: {
		/*************************************************
		 * PART 0  Common
		 **************************************************/
		/**
		 * @description: Save CasaOs Configs
		 * @param {*}
		 * @return {*}
		 */
		async saveData() {
			const saveRes = await this.$api.users.setCustomStorage(systemConfigName, this.barData)
			if (saveRes.data.success === 200) {
				this.barData = saveRes.data.data
			}
		},

		/**
		 * @description: Handle Dropmenu state
		 * @param {boolean} isOpen
		 * @return {*}
		 */
		onOpen(isOpen) {
			if (isOpen) {
				this.$store.commit('SET_SIDEBAR_CLOSE')
				this.checkVersion()
			} else {
				// Reset the text when the Settings layer closes
				// this.resetPower(true)
				this.restart = 'Restart'
				this.shutdown = 'Shutdown'
			}
		},

		/**
		 * @description: Show SideBar
		 * @param {*}
		 * @return {*}
		 */
		showSideBar() {
			this.$store.commit('TOOGLE_SIDEBAR_STATE')
		},

		/*************************************************
		 * PART 1-2  Dashboard Setting - Language
		 **************************************************/

		/**
		 * @description: Get Initnal Language
		 * @param {*}
		 * @return {string} lang
		 */
		getInitLang() {
			let lang = localStorage.getItem('lang') ? localStorage.getItem('lang') : this.getLangFromBrowser()
			lang = lang.includes('_') ? lang : 'en_us'
			return lang
		},

		/*************************************************
		 * PART 1-2b  Dashboard Setting - Appearance
		 **************************************************/
		setThemePreference(value) {
			setThemePreference(value)
		},

		/*************************************************
		 * PART 1-3  Dashboard Setting - Web UI Port
		 **************************************************/

		/**
		 * @description: Get CasaOs WebUI port
		 * @return {*}
		 */
		getPort() {
			this.$api.sys.getServerPort().then((res) => {
				if (res.data.success == 200) {
					this.port = res.data.data
				}
			})
		},

		showBackupDestinations() {
			this.$refs.settingsDrop.toggle()
			this.$buefy.modal.open({
				component: BackupDestinations,
				hasModalCard: true,
				customClass: 'backup-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		/**
		 * @description: Show Port panel
		 * @return {*}
		 */
		showPortPanel() {
			this.$refs.settingsDrop.toggle()
			this.$buefy.modal.open({
				component: PortPanel,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: {
					initPort: this.port,
				},
			})
		},
		showChangeWallpaperModal() {
			this.$EventBus.$emit(events.SHOW_CHANGE_WALLPAPER_MODAL)
			this.$refs.settingsDrop.toggle()
		},

		/*************************************************
		 * PART 1-4  Dashboard Setting - Auto USB Mount Switch
		 **************************************************/
		/**
		 * @description: Get Auto USB Mount State
		 * @return {*}
		 */
		getUsbStatus() {
			this.$api.sys.getUsbStatus().then((res) => {
				if (res.data.success == 200) {
					this.autoUsbMount = res.data.data === 'True'
				}
			})
		},

		/**
		 * @description: Enable or Disable USB Auto Mount
		 * @param {*}
		 * @return {*}
		 */
		usbAutoMount() {
			if (this.autoUsbMount) {
				this.$messageBus('dashboardsetting_automountusb', true.toString())
				this.$api.sys.toggleUsbAutoMount({ state: 'on' })
				// Show
				if (this.isRaspberryPi) {
					this.$buefy.snackbar.open({
						message: this.$t(
							'Enabling this function may cause boot failures when the Raspberry Pi device is booted from USB',
						),
						type: 'is-warning',
						position: 'is-top',
					})
				}
			} else {
				this.$messageBus('dashboardsetting_automountusb', false.toString())
				this.$api.sys.toggleUsbAutoMount({ state: 'off' })
			}
		},

		/*************************************************
		 * PART 1-4b  Dashboard Setting - Anonymous statistics
		 **************************************************/
		// Asked once, from mounted(). The row stays hidden until the core answers,
		// so the switch cannot be flipped while this is in flight.
		getTelemetry() {
			this.$api.sys.getTelemetry().then((res) => {
				this.telemetryEnabled = res.data.data.enabled
			}).catch(() => {})
		},

		// The core's `enabled` after the notice's PUT (CoreService).
		onTelemetryChanged(enabled) {
			this.telemetryEnabled = enabled
		},

		// Using the switch shows the owner knows, so it also marks the notice seen:
		// an owner who opts in here is not told about it at the next login.
		// The switch ends where the core says it is: a refused PUT puts it back.
		async setTelemetry(enabled) {
			this.telemetryEnabled = enabled
			try {
				const res = await this.$api.sys.setTelemetry({ enabled, notice_seen: true })
				this.telemetryEnabled = res.data.data.enabled
			} catch {
				this.telemetryEnabled = !enabled
				this.$buefy.toast.open({
					message: this.$t('The setting could not be saved.'),
					type: 'is-danger',
				})
			}
		},

		showTelemetryPreview() {
			this.$refs.settingsDrop.toggle()
			this.$buefy.modal.open({
				component: TelemetryPreviewModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape', 'outside'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},
		/**
		 * @description: Get Hardware Info etc. Board Info
		 * @param {*}
		 * @return {*}
		 */
		getHardwareInfo() {
			this.$api.sys.hardwareInfo().then((res) => {
				if (res.data.success == 200) {
					this.deviceModel = res.data.data.drive_model
					localStorage.setItem('arch', res.data.data.arch || '')
				}
			})
		},

		/*************************************************
		 * PART 1-5  Dashboard Setting - Update
		 **************************************************/

		/**
		 * @description: Get Version info
		 * @return {*} void
		 */
		checkVersion() {
			this.$api.sys.getVersion().then((res) => {
				if (res.data.success === 200) {
					this.updateInfo = res.data.data
					if (res.data.data.need_update) {
						this.$messageBus('dashboardsetting_versionavailable_show', true.toString())
					}
				}
			})
		},

		/**
		 * @description: Open Update Modal
		 * @return {*} void
		 */
		showUpdateModal() {
			this.$messageBus('dashboardsetting_versionupdate', true.toString())
			this.$buefy.modal.open({
				component: UpdateModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: {
					changeLog: this.updateInfo.version.change_log,
				},
			})
		},

		/**
		 * @description: Open the operating system package update modal
		 * @return {*} void
		 */
		showSystemPackageUpdateModal() {
			this.$messageBus('dashboardsetting_systempackages')
			this.$buefy.modal.open({
				component: SystemPackageUpdateModal,
				hasModalCard: true,
				customClass: 'network-storage-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		/**
		 * @description: Open the app launching settings modal
		 * @return {*} void
		 */
		showAppLaunchModal() {
			this.$buefy.modal.open({
				component: AppLaunchModal,
				hasModalCard: true,
				customClass: 'network-storage-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		/*************************************************
		 * PART 2  Userinfo
		 **************************************************/
		/**
		 * @description: Get user info
		 * @return {*} void
		 */
		async getUserInfo() {
			this.userInfo = this.$store.state.user
			this.$store.commit('SET_SIDEBAR_CLOSE')
			if (this.$store.state.user.id == 0) {
				try {
					const userRes = await this.$api.users.getUserInfo()
					this.userInfo = userRes.data.data
					this.$store.commit('SET_USER', this.userInfo)
				} catch (error) {
					console.error(error)
				}
			}
		},
		/*************************************************
		 * PART 3  Terminal
		 **************************************************/

		/**
		 * @description: Show Terminal panel
		 * @return {*} void
		 */
		showTerminalPanel() {
			this.$messageBus('terminallogs')
			this.$store.commit('SET_SIDEBAR_CLOSE')
			this.$buefy.modal.open({
				component: TerminalPanel,
				hasModalCard: true,
				customClass: 'terminal-modal',
				trapFocus: true,
				canCancel: [],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		power(key) {
			if (this[key.toLowerCase()] !== 'Are you sure?') {
				this[key.toLowerCase()] = 'Are you sure?'
				return
			}
			this.$refs.settingsDrop.toggle()
			this.showPower = true
			switch (key) {
				case 'Restart':
					this.$messageBus('dashboardsetting_reboot')
					this[key.toLowerCase()] = key
					this.showPowerTitle = 'Restarting now'
					this.showPowerMessage = 'Please wait for about 90 seconds.'
					break
				case 'Shutdown':
					this.$messageBus('dashboardsetting_shutdown')
					this[key.toLowerCase()] = key
					this.showPowerTitle = 'Now shutting down'
					this.showPowerMessage = 'Please wait for about 30 seconds before cutting off the power.'
					break
			}
			let timer
			const path = key === 'Shutdown' ? 'off' : 'restart'
			this.$api.sys.power(path).then((res) => {
				if (res.data.success !== 200) {
					throw new Error(res.data.message || 'Failed to perform power operation.')
				}

				this.showPowerMessage = res.data.data
				if (path === 'off') {
					return
				}
				timer = setInterval(() => {
					this.$api.users.getUserStatus().then((res) => {
						if (res.data.data.initialized) {
							clearInterval(timer)
							location.reload()
						}
					})
				}, 30000)
			}).catch((error) => {
				clearInterval(timer)
				this.resetPower()
				this.$buefy.toast.open({
					message: error?.response?.data?.message || error?.message || 'Failed to perform power operation.',
					type: 'is-danger',
				})
			})
		},
		resetPower() {
			this.showPower = false
			this.restart = 'Restart'
			this.shutdown = 'Shutdown'
		},
	},
}
</script>

<style lang="scss">
._is-large {
	// bulma 3rem;
	//height: 2.5rem;
	padding-bottom: 0.625rem;
	padding-top: 0.625rem;
}

._box {
	height: 2.5rem;
}

._footer {
	height: 3.5rem;
	border-top: 1px solid var(--casa-divider);
}

._title {
	font-family: $family-sans-serif;
	font-size: 1rem;
	font-weight: 500;
	line-height: 1.5rem;
	letter-spacing: 0em;
	text-align: left;
	padding: 1.25rem 1.25rem 0.5rem 1.5rem;
	border-bottom: 1px solid var(--casa-divider);
}

._is-normal {
	font-family: $family-sans-serif;
	font-size: 0.875rem;
	font-weight: 400;
	line-height: 1.25rem;
	letter-spacing: 0em;
	text-align: left;
}

._has-text-attention {
	color: hsla(18, 98%, 55%, 1);
}

._has-text-gray {
	color: var(--casa-text-muted);
}

._fixed-height {
	height: 2.75rem;
	min-height: 2.75rem;
}

.top-bar {
	position: relative;
	z-index: 20;
	height: 2.75rem;
	background: var(--casa-surface);

	.navbar-brand {
		margin-left: 1.25rem;

		.picon {
			cursor: pointer;
		}

		.navbar-item {
			height: 2.75rem;
			padding: 0.75rem 0.75rem 0.5rem;

			.icon {
				&:only-child {
					margin-left: 0;
					margin-right: 0;
				}
			}
		}

		.dropdown + .dropdown {
			margin-left: 0;
		}

		.dropdown-trigger,
		.tooltip-trigger {
			height: 1.5rem;
		}

		.dropdown-menu {
			margin-top: 0.5rem;
			min-width: 22.5rem;

			.dropdown-content {
				background: var(--casa-surface);
				border-radius: 10px;

				.dropdown-item {
					padding: 0.875rem 1.25rem;
					text-align: left;

					.item {
						height: 2rem;
					}
				}
			}
		}
	}

	.set-select {
		.select {
			&::after {
				border-color: var(--casa-text-strong) !important;
			}
		}

		select {
			background-color: transparent !important;
			border-color: var(--casa-text-strong) !important;

			// Chromium paints the native list on the select's own background, which
			// is transparent here: white, under dark's light text. Give the options
			// a surface of their own.
			option {
				background-color: var(--casa-surface);
				color: var(--casa-text);
			}
		}
	}

	.field {
		line-height: 1rem;
	}

	.switch {
		&.is-flex-direction-row-reverse {
			.control-label {
				padding-left: 0;
				padding-right: calc(0.75em - 1px);
			}
		}

		// TODO: remove this when the switch to be component.
		&._small input[type="checkbox"] {
			& + .check {
				width: 2.286em;
				height: 1.429em;
				padding: 0;

				&::before {
					width: 1.143em;
					height: 1.143em;
					margin-left: 2px;
					margin-right: 2px;
				}
			}

			&:checked + .check {
				&::before {
					transform: translate3d(80%, 0, 0);
				}
			}
		}
	}

	.update-container {
		.button.is-rounded {
			padding-left: calc(1em + 0.25em);
			padding-right: calc(1em + 0.25em);
			border-radius: 9999px !important;
		}
	}

	.button {
		&.is-small {
			height: 2em;
		}
	}

	.icon {
		color: var(--casa-text-secondary);
	}
}

.update-text-dot {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background-color: $danger;
		right: -0.5rem;
		top: 0rem;
	}
}

.update-icon-dot {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background-color: $danger;
		right: 0;
		top: 0;
	}
}

#sidebar-btn {
	display: none !important;
}

@media screen and (max-width: 480px) {
	#sidebar-btn {
		display: flex !important;
	}
}

// TODO
._is-normal {
	/* Text 400Regular/Text03 */
	font-family: $family-sans-serif;
	font-style: normal;
	font-weight: 400;
	font-size: 0.875rem;
	line-height: 1.25rem;
	/* or 143% */
	font-feature-settings: "pnum" on, "lnum" on;
}

._has-background-blue {
	background: hsla(208, 100%, 75%, 1);
}

._modal {
	.modal-content {
		border-radius: 0.625rem;

		.message {
			margin-bottom: 0rem;
			border-radius: 0rem;

			.message-header {
				background: var(--casa-surface);
				border-bottom: 1px solid var(--casa-border-faint);
				//margin-top: 1.25rem;
				//margin-left: 1.5rem;
				padding: 1.25rem 1.5rem 0.75rem 1.5rem;

				> div {
					display: flex;
					//align-items: center;
					justify-content: center;
					vertical-align: middle;

					color: var(--casa-text);

					font-family: $family-sans-serif;
					font-size: 1rem;
					font-weight: 500;
					line-height: 1.5rem;
					letter-spacing: 0em;
					text-align: left;
					font-feature-settings: "pnum" on, "lnum" on;

					.is-24x24 {
						width: 1.5rem;
						height: 1.5rem;
					}
				}

				> button {
					width: 1.5rem;
					height: 1.5rem;
					max-height: 1.5rem;
					max-width: 1.5rem;
					min-height: 1.5rem;
					min-width: 1.5rem;
					display: none;
				}
			}

			.message-body {
				background: var(--casa-surface);
				padding-top: 1rem;
				padding-bottom: 1rem;
			}
		}

		footer {
			background: var(--casa-surface);
			border: 1px solid var(--casa-border-faint);

			button {
				border-radius: 0.875rem;
				border: none;
				color: hsla(0, 0%, 100%, 1);
				height: 2rem;

				img {
					width: 1.25rem;
					height: 1.25rem;
				}
			}
		}
	}
}
</style>
