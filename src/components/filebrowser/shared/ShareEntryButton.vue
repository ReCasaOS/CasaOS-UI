<template>
	<div>
		<div ref="row" :class="{ active }" class="is-flex list-item new-list-item" @click.prevent="$emit('open')" @mouseenter="showTip" @mouseleave="hideTip">
			<div class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center none-click">
				<b-icon icon="share" pack="casa"></b-icon>
			</div>
			<div><span>{{ $t('Shared') }}</span></div>
		</div>

		<!-- shown while the pointer is on the row, drawn in the body beside it: the sidebar clips anything wider
			than itself. It leaves with the component, so closing the Files window takes it away. -->
		<Teleport to="body">
			<div v-if="tipStyle" :style="tipStyle" class="share-tip" role="tooltip">
				{{ $t('Start sharing your files on the local network.') }}
			</div>
		</Teleport>
	</div>
</template>

<script>
export default {
	props: {
		active: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			// where the tip goes, null while it is not shown
			tipStyle: null,
		}
	},

	methods: {
		showTip() {
			const rect = this.$refs.row?.getBoundingClientRect()
			if (!rect || rect.width === 0) {
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
			this.tipStyle = null
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
	padding: 0.35rem 0.75rem;
	box-shadow: 0px 1px 2px 1px rgba(0, 1, 0, 0.2);
	border-radius: 6px;
	pointer-events: none;

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
</style>
