<template>
	<div>
		<div ref="row" :class="{ active }" class="is-flex list-item new-list-item" @click.prevent="$emit('open')">
			<div class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center none-click">
				<b-icon icon="share" pack="casa"></b-icon>
			</div>
			<div><span>{{ $t('Shared') }}</span></div>
		</div>

		<!-- drawn in the body, beside the row: the sidebar clips anything wider than itself. It leaves with the
			component, so closing the Files window takes it away. -->
		<Teleport to="body">
			<div v-if="tipVisible && tipStyle" :style="tipStyle" class="share-tip" role="status">
				{{ $t('Start sharing your files on the local network.') }}
				<div class="is-clickable ml-1 is-flex is-align-items-center" @click.stop="hideTip">
					<b-icon icon="close-xs" pack="casa"></b-icon>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<script>
import events from '@/events/events'

const sharedInitData = 'shared_init_data'

export default {
	props: {
		active: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			tipVisible: false,
			// where the tip goes, null while the row is not on screen
			tipStyle: null,
			placeTimer: null,
		}
	},
	mounted() {
		this.checkInit()
	},
	beforeUnmount() {
		clearInterval(this.placeTimer)
	},

	methods: {
		async checkInit() {
			try {
				const res = await this.$api.users.getCustomStorage(sharedInitData)
				const resData = res.data.data
				if (resData) {
					if (!resData.isInit) {
						this.showTip()
					}
				} else {
					this.showTip()
				}
			} catch (error) {
				console.log(error)
			}
		},
		selectShare() {
			this.$EventBus.$emit(events.SELECT_SHARE)
			// this.$tours['myTour'].skip()
		},
		showTip() {
			setTimeout(() => {
				this.tipVisible = true
				this.place()
				// the window can move or resize (full screen) under the tip
				this.placeTimer = setInterval(this.place, 250)
			}, 500)
		},
		place() {
			const rect = this.$refs.row?.getBoundingClientRect()
			if (!rect || rect.width === 0) {
				this.tipStyle = null
				return
			}
			const left = rect.right + 8
			this.tipStyle = {
				left: `${left}px`,
				top: `${rect.top + (rect.height / 2)}px`,
				maxWidth: `${Math.max(window.innerWidth - left - 8, 120)}px`,
			}
		},
		hideTip() {
			this.tipVisible = false
			clearInterval(this.placeTimer)
			this.$api.users.setCustomStorage(sharedInitData, {
				isInit: true,
			})
		},
	},

}
</script>

<style lang="scss" scoped>
.none-click {
	pointer-events: none;
}
</style>

<style lang="scss">
.share-tip {
	position: fixed;
	z-index: 1000;
	display: flex;
	transform: translateY(-50%);
	background: #505459;
	color: #ffffff;
	padding: 0.35rem 0.4rem 0.35rem 0.75rem;
	box-shadow: 0px 1px 2px 1px rgba(0, 1, 0, 0.2);
	border-radius: 6px;
	animation: share-tip-in 1s;

	// the arrow, pointing at the row
	&::before {
		content: '';
		position: absolute;
		top: 50%;
		left: -6px;
		margin-top: -6px;
		border: 6px solid transparent;
		border-left: 0;
		border-right-color: #505459;
	}
}

@keyframes share-tip-in {
	from {
		opacity: 0;
	}
}
</style>
