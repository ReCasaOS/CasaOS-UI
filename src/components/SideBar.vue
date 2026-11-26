<template>
	<div v-if="!isLoading" ref="sidebar" :class="{ open: sidebarOpen }" class="side-bar contextmenu-canvas">
		<div class="widgets-content contextmenu-canvas">
			<!-- keyed by name: hiding a widget above a card must not hand its place (and its instance) to another module -->
			<div v-for="(item, index) in activeApps" :key="`widgets_${item.name || item.app.name}`">
				<ModuleCard v-if="item.card" :module="item.card" :class="{ 'last-block': index === activeApps.length - 1 }"
					@loaded="handleCardLoaded" @gone="cardGone" />
				<component :is="item.app" v-else :class="{ 'last-block': index === activeApps.length - 1 }" />
			</div>
		</div>
		<Settings :model-value="listedSettings"
			:module-info="moduleInfo"
			:class="{ 'mt-4': activeApps.length > 0 }"
			@change="handleChange"
			@searchBarChange="handleSearchBarChange" />
	</div>
</template>

<script>
import lowerFirst from 'lodash/lowerFirst'
import camelCase from 'lodash/camelCase'
import find from 'lodash/find'
import isEqual from 'lodash/isEqual'
import Settings from '@/components/widgets/Settings.vue'
import ModuleCard from '@/components/moduleCards/ModuleCard.vue'
import { cardsMixin } from '@/components/moduleCards/cardsMixin'
import { CARD_ICON_FALLBACK, isTileOnly } from '@/components/moduleCards/moduleCards'
import { combineWidgetSettings, withAbsent } from '@/components/widgets/widgetOrder'

const widgetsComponents = require.context(
	'@/widgets',
	false,
	/.vue$/,
)

const widgetsConfig = 'widgets_config'

export default {
	name: 'SideBar',
	mixins: [cardsMixin],
	components: {
		ModuleCard,
		Settings,
	},
	data() {
		return {
			isLoading: true,
			comps: [],
			apps: [],
			widgetsSettings: [],
			// the icon each card named once read
			cardIcons: {},
		}
	},
	computed: {
		activeApps() {
			const showWidgets = this.widgetsSettings.filter((item) => {
				return item.show
			})
			const newArray = showWidgets.map((item) => {
				return find(this.apps, (o) => {
					return o.app.name === item.name
				}) ?? find(this.moduleApps, o => o.name === item.name)
			})
			// a saved card whose module is not in the list now is kept in the settings, and not shown
			return newArray.filter(Boolean)
		},
		// a card that is only a button is the module's tile in the app grid: no widget, no row in the settings
		moduleApps() {
			return this.moduleCards.filter(card => !isTileOnly(this.cardViews[card.name])).map(card => ({ name: `module:${card.name}`, card }))
		},
		moduleInfo() {
			return Object.fromEntries(this.moduleApps.map(({ name, card }) => [name, { title: card.title, icon: this.cardIcons[card.name] || CARD_ICON_FALLBACK }]))
		},
		// what Settings lists: the widgets and the cards that exist now
		listedSettings() {
			return this.widgetsSettings.filter(item => this.apps.some(o => o.app.name === item.name) || this.moduleApps.some(o => o.name === item.name))
		},
		sidebarOpen() {
			return this.$store.state.sidebarOpen
		},
		showWidgets() {
			return this.widgetsSettings.filter((item) => {
				return item.show
			})
		},
	},
	created() {
		widgetsComponents.keys().forEach((fileName) => {
			const componentName = lowerFirst(
				camelCase(
					fileName
						.split('/')
						.pop()
						.replace(/\.\w+$/, ''),
				),
			)
			const component = widgetsComponents(fileName).default
			// a widget of a module the account may not read is neither shown nor offered in the settings
			if (component.module && !this.$store.getters.canReadModule(component.module)) {
				return
			}
			this.comps.push(componentName)
			this.apps.push({ app: component })
		})
	},
	mounted() {
		this.getConfig()

		window.addEventListener('resize', this.handleResize)
	},
	beforeUnmount() {
		window.removeEventListener('resize', this.handleResize)
	},

	methods: {
		/**
		 * @description: Get Widgets Configs
		 * @return {*} void
		 */
		getConfig() {
			this.$api.users.getCustomStorage(widgetsConfig).then((res) => {
				// read now: the list of the cards may have come while the settings were on their way
				const initData = this.getInitData()
				if (res.status === 200) {
					if (res.data === '') {
						this.saveData(initData)
						this.widgetsSettings = initData
						this.isLoading = false
						this.handleResize()
					} else {
						this.diffAndCombineData(initData, res.data.data)
					}
				}
			})
		},
		diffAndCombineData(initData, remoteData) {
			const newData = combineWidgetSettings(initData, remoteData)
			this.widgetsSettings = newData
			if (!isEqual(newData, remoteData)) {
				this.saveData(newData)
			}
			this.isLoading = false
			this.handleResize()
		},
		/**
		 * @description: Get Local widgets datas
		 * @return {Array} array of widgets
		 */
		getInitData() {
			return [
				...this.apps.map((item) => {
					return {
						name: item.app.name,
						show: item.app.initShow,
					}
				}),
				...this.moduleApps.map(item => ({ name: item.name, show: true })),
			]
		},

		// a list has been read: the new cards are given a place
		cardsRead() {
			if (this.isLoading)
				return
			const combined = combineWidgetSettings(this.getInitData(), this.widgetsSettings)
			if (!isEqual(combined, this.widgetsSettings)) {
				this.widgetsSettings = combined
				this.saveData(combined)
			}
		},

		handleCardLoaded({ name, icon }) {
			if (this.cardIcons[name] !== icon)
				this.cardIcons = { ...this.cardIcons, [name]: icon }
		},

		/**
		 * @description: Save Widgets Configs
		 * @return {*} void
		 */
		saveData(data) {
			// while the role is not known the widgets listed are the ones of a plain account: the owner's saved choice is kept
			if (this.$store?.state?.user?.role === '') {
				return
			}
			this.$api.users.setCustomStorage(widgetsConfig, data).then((res) => {
				if (res.data.success === 200) {
					this.widgetsSettings = res.data.data
				}
			})
		},

		handleChange(data) {
			this.widgetsSettings = withAbsent(data, this.widgetsSettings, data.map(item => item.name))
			this.saveData(this.widgetsSettings)
		},

		handleSearchBarChange(value) {
			this.$emit('searchBarChange', value)
		},

		handleResize() {
			const ww = window.innerWidth
			if (this.isLoading)
				return false
			const parentWidth = document.querySelector('.slider-content').offsetWidth
			this.$nextTick(() => {
				const padding = ww <= 480 ? 0 : -16
				if (this.$refs.sidebar)
					this.$refs.sidebar.style.width = `${parentWidth + padding}px`
			})
		},

	},
}
</script>

<style lang="scss">
.side-bar {
    z-index: 10;
    height: auto;
    max-height: none;
    overflow: visible !important;
    position: relative;

    @include until(480px) {
        z-index: 20;
        left: 0rem;
        width: auto;
        margin: 0 0 0 1rem !important;
        // its own width and the 2rem it starts from: -100vw left a strip of it on screen
        transform: translateX(calc(-100% - 2rem));
        visibility: hidden;
        transition: transform 0.3s ease-in-out, visibility 0s 0.3s;

        &.open {
            transform: translateX(0);
            visibility: visible;
            transition: transform 0.3s ease-in-out;
        }
    }
}

.widgets-content {
    position: relative;
}
</style>
