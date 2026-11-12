<template>
	<!-- the level is told by a shape, a colour, and a word: never by the colour alone -->
	<span :aria-label="label" :class="`is-${level}`" :title="label" class="backup-mark" role="img"><span aria-hidden="true">{{ SHAPES[level] }}</span></span>
</template>

<script>
const SHAPES = { ok: '✓', danger: '✕', warning: '▲', none: '○' }

export default {
	name: 'BackupMark',
	props: {
		level: { type: String, default: 'none' },
		label: { type: String, required: true },
	},
	data() {
		return { SHAPES }
	},
}
</script>

<style lang="scss" scoped>
.backup-mark {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 1.375rem;
	height: 1.375rem;
	border: 2px solid currentcolor;
	border-radius: 50%;
	font-size: 0.75rem;
	font-weight: 700;
	line-height: 1;

	&.is-ok {
		color: #3dd26b;
	}

	&.is-danger {
		color: #f14668;
	}

	&.is-warning {
		color: #ffb44c;
	}

	&.is-none {
		color: #9aa0a6;
	}
}
</style>
