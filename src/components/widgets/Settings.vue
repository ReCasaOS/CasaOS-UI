<template>
	<div class="widget has-text-white clock is-relative ">
		<div class="blur-background"></div>

		<div ref="wsettings" class="wsettings">
			<b-dropdown :mobile-modal="false" :position="position" animation="fade1" aria-role="list">
				<template #trigger>
					<div class="widget-content" @click="$messageBus('widget_widgetsetting')">
						<!-- Header Start -->
						<div class="widget-header is-flex is-clickable	">
							<div class="widget-title is-flex-grow-1">
								{{ $t('Widgets Settings') }}
							</div>
							<div class="widget-icon-button is-flex-shrink-0">
								<b-icon icon="right-outline" pack="casa" size="is-20"></b-icon>
							</div>
						</div>
						<!-- Header End -->
					</div>
				</template>
				<b-dropdown-item :focusable="false" aria-role="menu-item" class="has-text-white has-text-left" custom>
					<h2 class="title is-5 has-text-white">{{ $t('Widgets Settings') }}</h2>
					<draggable v-model="settingsData" :animation="200" ghost-class="ghost" handle=".drag-handle"
						item-key="name" tag="div" @end="handleInput">
						<template #item="{ element: item, index }">
							<div class="is-flex is-align-items-center item">
								<span :aria-label="$t('Move {name} up or down with the arrow keys', { name: $t(getTitle(item.name)) })"
									:title="$t('Drag to reorder')" class="drag-handle mr-2" role="button" tabindex="0"
									@keydown.down.prevent="move(index, 1)" @keydown.up.prevent="move(index, -1)">
									<span class="dot"></span><span class="dot"></span>
									<span class="dot"></span><span class="dot"></span>
									<span class="dot"></span><span class="dot"></span>
								</span>
								<div class="is-flex is-align-items-center is-flex-grow-1">
									<b-icon :icon="getIcon(item.name)" class="mr-2" pack="casa"></b-icon>
									<b>{{ $t(getTitle(item.name)) }}</b>
								</div>
								<b-field>
									<b-switch v-model="item.show" class="is-flex-direction-row-reverse mr-0" size="is-small"
										type="is-dark" @update:model-value="handleInput"></b-switch>
								</b-field>
							</div>
						</template>
					</draggable>
					<div class="is-flex is-align-items-center item">
						<div class="is-flex is-align-items-center is-flex-grow-1">
							<b-icon icon="show-search-outline" pack="casa" class="mr-2"></b-icon>
							<b>{{ $t('Show Search Bar') }}</b>
						</div>
						<b-field>
							<b-switch :model-value="searchBarShown" class="is-flex-direction-row-reverse mr-0" size="is-small"
								type="is-dark" @update:model-value="handleSearchBarInput"></b-switch>
						</b-field>
					</div>
				</b-dropdown-item>
			</b-dropdown>
		</div>

	</div>
</template>

<script>
import find from 'lodash/find'
import draggable from 'vuedraggable'
import { moveWidget } from './widgetOrder'

const widgetsComponents = require.context(
	'@/widgets',
	false,
	/.vue$/,
)

export default {
	name: 'settings',
	components: {
		Draggable: draggable,
	},
	props: {
		modelValue: Array,
	},
	data() {
		return {
			apps: [],
			settingsData: [],
			position: 'is-top-left',
		}
	},
	computed: {
		searchBarShown() {
			return this.$store.state.searchEngineSwitch
		},
	},

	watch: {
		settingsData: {
			handler() {
				let offsetTop = 0
				if (this.$refs.wsettings) {
					offsetTop = this.$refs.wsettings.getBoundingClientRect().top
				} else {
					offsetTop = 251
				}
				this.position = offsetTop > 250 ? 'is-top-left' : 'is-bottom-left'
			},
			deep: true,
		},

	},
	created() {
		this.settingsData = JSON.parse(JSON.stringify(this.modelValue))
		widgetsComponents.keys().forEach((fileName) => {
			const componentConfig = widgetsComponents(fileName)
			this.apps.push({ app: componentConfig })
		})
	},
	mounted() {
		window.addEventListener('resize', this.onRezise)
	},
	unmounted() {
		window.removeEventListener('resize', this.onRezise)
	},
	methods: {
		getIcon(value) {
			const obj = find(this.apps, (o) => {
				return o.app.default.name === value
			})
			return obj.app.default.icon
		},
		getTitle(value) {
			const obj = find(this.apps, (o) => {
				return o.app.default.name === value
			})
			return obj.app.default.title
		},
		// The arrow keys on a handle do what dragging it does, for whoever does not
		// use a mouse. Focus follows the widget that moved.
		move(index, offset) {
			const moved = moveWidget(this.settingsData, index, offset)
			if (moved === this.settingsData)
				return
			this.settingsData = moved
			this.handleInput()
			this.$nextTick(() => {
				this.$el.querySelectorAll('.drag-handle')[index + offset]?.focus()
			})
		},
		handleInput() {
			this.$emit('update:modelValue', this.settingsData)
			this.$emit('change', this.settingsData)
		},
		handleSearchBarInput(value) {
			this.$emit('searchBarChange', value)
		},
		onRezise() {
		},
	},
}
</script>

<style lang="scss">
.wsettings {
	width: 100%;

	.item {
		margin: 1.25rem 0;
	}

	.drag-handle {
		display: inline-grid;
		flex: none;
		grid-template-columns: repeat(2, 3px);
		gap: 2px;
		padding: 2px;
		cursor: grab;
		opacity: 0.5;

		&:hover,
		&:focus-visible {
			opacity: 1;
		}

		&:focus-visible {
			outline: 2px solid #fff;
			outline-offset: 2px;
			border-radius: 2px;
		}

		&:active {
			cursor: grabbing;
		}

		.dot {
			width: 3px;
			height: 3px;
			border-radius: 50%;
			background: #fff;
		}
	}

	.ghost {
		opacity: 0.4;
	}

	.circle-btn {
		background: rgba(123, 123, 123, 0.16);
		backdrop-filter: blur(24px);
		color: #fff;
		font-size: 1rem;
		height: 2.25rem;
		width: 2.25rem;
		padding-left: 0 !important;
		padding-right: 0 !important;

		&:hover,
		&:active {
			outline: none;
			color: #fff;
			opacity: 0.8;
		}

		&:focus {
			color: #fff;
			border-color: #fff;
		}

		&:focus:not(:active) {
			box-shadow: none;
		}
	}

	.dropdown {
		display: block !important;

		.dropdown-content {
			background: rgba(0, 0, 0, 0.8);
			backdrop-filter: blur(1rem);
			width: 16rem;
			border-radius: 0.5rem;

			.dropdown-item {
				padding: 1rem 1.5rem 0 1.5rem;
			}

			.switch input[type="checkbox"]+.check {
				background: transparent;
				border: #fff 1px solid;

				// The knob. Buefy paints it var(--bulma-background), which Bulma's
				// dark theme turns near-black; this dropdown is glass and keeps the
				// light value. Pinning --bulma-background-l here would not do: the
				// composed --bulma-background is resolved on :root and inherited.
				&::before {
					background: hsl(0, 0%, 96%);
				}
			}
		}
	}
}
</style>
