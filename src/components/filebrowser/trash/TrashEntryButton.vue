<template>
	<div>
		<div :class="{ active }" class="is-flex list-item new-list-item" @click.prevent="$emit('open')">
			<div class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center none-click">
				<b-icon icon="trash-outline" pack="casa"></b-icon>
			</div>
			<div><span>{{ $t('Trash') }}</span></div>
		</div>
	</div>
</template>

<script>
export default {
	name: 'trash-entry-button',
	props: {
		active: {
			type: Boolean,
			default: false,
		},
	},
}
</script>

<style lang="scss" scoped>
.none-click {
	pointer-events: none;
}
</style>
