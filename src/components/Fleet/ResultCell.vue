<template>
	<!-- a row's last result: nothing until an action touched it -->
	<span v-if="result" :class="`is-${result.state}`" class="fleet-result">{{ text }}</span>
</template>

<script>
export default {
	name: 'ResultCell',
	props: {
		result: { type: Object, default: null },
	},
	computed: {
		text() {
			const { state, message } = this.result
			switch (state) {
				case 'done':
					// a done row with a message: the box did part of it and refused the rest
					return message ? this.$t('Done, but refused: {message}', { message }) : this.$t('Done')
				case 'refused':
					return this.$t('Refused: {reason}', { reason: message })
				case 'offline':
					return this.$t('Box offline')
				case 'running':
					return this.$t('In progress…')
				default:
					return this.$t('Failed: {error}', { error: message })
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.fleet-result {
	white-space: nowrap;

	&.is-done {
		color: var(--success, #3dd26b);
	}

	&.is-refused,
	&.is-failed {
		color: var(--danger, #f14668);
	}

	&.is-offline,
	&.is-running {
		opacity: 0.7;
	}
}
</style>
