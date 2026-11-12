<template>
	<!-- the kind is told by a shape, a colour and the title: never by the colour alone -->
	<span :aria-label="title" :class="`is-${kind}`" :title="title" class="backup-badge" role="img">
		<svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" viewBox="0 0 16 16">
			<path v-if="kind === 'ok'" d="M4.2 8.4l2.4 2.4 5.2-5.6" />
			<path v-else-if="kind === 'failed'" d="M5 5l6 6M11 5l-6 6" />
			<!-- a clock: late, never run, unknown or paused all mean "not backed up when it should be" -->
			<path v-else d="M8 4.2V8l2.6 1.6" />
		</svg>
	</span>
</template>

<script>
const KINDS = ['ok', 'failed', 'attention']

export default {
	name: 'BackupBadge',
	props: {
		kind: { type: String, required: true, validator: kind => KINDS.includes(kind) },
		title: { type: String, required: true },
	},
}
</script>

<style lang="scss" scoped>
.backup-badge {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 1.25rem;
	height: 1.25rem;
	border-radius: 50%;
	color: #fff;

	// a filled disc with a white mark: readable on the light cards and on the beta dashboard's dark ones
	svg {
		width: 0.8rem;
		height: 0.8rem;
	}

	&.is-ok {
		background: #2fb85e;
	}

	&.is-failed {
		background: #e5384f;
	}

	&.is-attention {
		background: #7d858d;
	}
}
</style>
