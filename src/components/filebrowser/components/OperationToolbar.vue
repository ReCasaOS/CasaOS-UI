<template>
	<transition name="up-fade">
		<div class="toolbar-container" v-if="isActive">
			<div class="operation-toolbar is-flex">
				<b-tooltip :label="$t('Download')" :type="type">
					<div class="toolbar-item" @click.stop="download">
						<span class="has-text-white block">
							<b-icon icon="downloads-outline" :size="size" pack="casa"></b-icon>
						</span>
					</div>
				</b-tooltip>
				<b-tooltip :label="$t('Copy')" :type="type">
					<div class="toolbar-item" @click.stop="copy">
						<span class="has-text-white block">
							<b-icon icon="copy-outline" :size="size" pack="casa"></b-icon>
						</span>
					</div>
				</b-tooltip>
				<b-tooltip v-if="canChange" :label="$t('Cut')" :type="type">
					<div class="toolbar-item" @click.stop="move">
						<span class="has-text-white block">
							<b-icon icon="sending-files-outline" :size="size" pack="casa"></b-icon>
						</span>
					</div>
				</b-tooltip>
				<b-tooltip v-if="canChange" :label="$t('Delete')" :type="type">
					<div class="toolbar-item" @click.stop="remove">
						<span class="has-text-white block">
							<b-icon icon="trash-outline" :size="size" pack="casa"></b-icon>
						</span>
					</div>
				</b-tooltip>
				<b-tooltip :label="$t('Cancel')" :type="type">
					<div class="toolbar-item" @click.stop="close">
						<span class="has-text-white block">
							<b-icon icon="close-outline" :size="size" pack="casa"></b-icon>
						</span>
					</div>
				</b-tooltip>
			</div>
		</div>
	</transition>
</template>

<script>
export default {
	name: 'operation-toolbar',
	props: {
		// what is shown may be changed (an account in a folder it may only read may not)
		canChange: {
			type: Boolean,
			default: true,
		},
		modelValue: Boolean,
	},
	data() {
		return {
			isActive: this.modelValue || false,
			type: 'is-dark',
			size: 'is-small',
		}
	},
	watch: {
		modelValue(value) {
			this.isActive = value
		},
	},
	methods: {
		download() {
			this.$emit('download')
		},
		copy() {
			this.$emit('copy')
		},
		move() {
			this.$emit('move')
		},
		remove() {
			this.$emit('remove')
		},
		close() {
			this.isActive = false
			this.$emit('close')
			this.$emit('update:modelValue', this.isActive)
		},
	},
}
</script>

<style>
</style>
