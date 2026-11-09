<template>
	<!-- the kind is told by a shape, a colour and the title: never by the colour alone -->
	<span :aria-label="title" :class="`is-${kind}`" :title="title" class="backup-badge" role="img"><span aria-hidden="true">{{ SHAPES[kind] }}</span></span>
</template>

<script>
const SHAPES = { ok: '✓', failed: '✕', attention: '○' }

export default {
	name: 'BackupBadge',
	props: {
		kind: { type: String, required: true, validator: kind => kind in SHAPES },
		title: { type: String, required: true },
	},
	data() {
		return { SHAPES }
	},
}
</script>

<style lang="scss" scoped>
.backup-badge {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	border: 2px solid currentcolor;
	border-radius: 50%;
	font-size: 0.6rem;
	font-weight: 700;
	line-height: 1;

	&.is-ok {
		color: #3dd26b;
	}

	&.is-failed {
		color: #f14668;
	}

	&.is-attention {
		color: #9aa0a6;
	}
}
</style>
