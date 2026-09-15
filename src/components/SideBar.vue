<template>
	<div v-if="!isLoading" ref="sidebar" :class="{ open: sidebarOpen }" class="side-bar contextmenu-canvas">
		<div class="widgets-content contextmenu-canvas">
			<div v-for="(item, index) in activeApps" :key="`widgets_${index}`">
				<component :is="item.app" :class="{ 'last-block': index === activeApps.length - 1 }" />
			</div>
		</div>
		<Settings v-model="widgetsSettings"
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
import { combineWidgetSettings } from '@/components/widgets/widgetOrder'

const widgetsComponents = require.context(
	'@/widgets',
	false,
	/.vue$/,
)

const widgetsConfig = 'widgets_config'

export default {
	name: 'SideBar',
	components: {
		Settings,
	},
	data() {
		return {
			isLoading: true,
			comps: [],
			apps: [],
			widgetsSettings: [],
		}
	},
	computed: {
		activeApps() {
			const showWidgets = this.widgetsSettings.filter((item) => {
				return item.show
			})
			const newArray = showWidgets.map((item) => {
				const obj = find(this.apps, (o) => {
					return o.app.name === item.name
				})
				return obj
			})
			return newArray
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
			this.comps.push(componentName)
			this.apps.push({ app: require(`@/widgets/${fileName.replace('./', '')}`).default })
		})
	},
	mounted() {
		this.getConfig()

		window.addEventListener('resize', this.handleResize)
	},

	methods: {
		/**
		 * @description: Get Widgets Configs
		 * @return {*} void
		 */
		getConfig() {
			const initData = this.getInitData()
			this.$api.users.getCustomStorage(widgetsConfig).then((res) => {
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
			return this.apps.map((item) => {
				return {
					name: item.app.name,
					show: item.app.initShow,
				}
			})
		},

		/**
		 * @description: Save Widgets Configs
		 * @return {*} void
		 */
		saveData(data) {
			this.$api.users.setCustomStorage(widgetsConfig, data).then((res) => {
				if (res.data.success === 200) {
					this.widgetsSettings = res.data.data
				}
			})
		},

		handleChange(data) {
			this.widgetsSettings = data
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
        transform: translateX(-100vw);
        transition: all 0.3s ease-in-out;

        &.open {
            transform: translateX(0);
        }
    }
}

.widgets-content {
    position: relative;
}
</style>
