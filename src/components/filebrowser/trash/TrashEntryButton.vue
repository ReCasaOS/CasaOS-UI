<template>
	<div>
		<div :class="{ active }" class="is-flex list-item new-list-item" @click.prevent="$emit('open')">
			<div class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center none-click">
				<b-icon icon="trash-outline" pack="casa"></b-icon>
			</div>
			<div class="is-flex-grow-1"><span>{{ $t('Trash') }}</span></div>
			<!-- the room the trash takes (CasaOS#184), read when Files opens, after a reload and when the trash is left -->
			<span v-if="size > 0" class="is-size-7 has-text-grey-light ml-2 none-click" data-trash-size>{{ renderSize(size) }}</span>
		</div>
	</div>
</template>

<script>
import events from '@/events/events'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'trash-entry-button',
	props: {
		active: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['open'],
	data() {
		return { size: 0 }
	},
	watch: {
		active(now, before) {
			if (before && !now) {
				this.read()
			}
		},
	},
	mounted() {
		this.read()
		this.$EventBus?.$on(events.RELOAD_FILE_LIST, this.read)
	},
	beforeUnmount() {
		this.$EventBus?.$off(events.RELOAD_FILE_LIST, this.read)
	},
	methods: {
		renderSize,
		read() {
			return this.$api.file.trash().then((res) => {
				this.size = res.data.data?.size || 0
			}).catch(() => {
				// no answer: no size, the entry still opens the trash
				this.size = 0
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
