<template>
	<img v-if="src" class="country-flag" :src="src" alt="" aria-hidden="true" width="16" height="12">
</template>

<script>
// The flags of flag-icons (MIT), one SVG per country, each fetched only when shown. require.context is webpack's:
// under Vitest there is no such thing, and the flag is simply not drawn (the country name beside it carries the meaning).
// (A bare `require.context` in a condition is rewritten by webpack into something else: call it, and catch Vitest's ReferenceError.)
let flags = null
try {
	flags = require.context('flag-icons/flags/4x3', false, /^\.\/[a-z]{2}\.svg$/, 'lazy')
} catch {
	flags = null
}

export default {
	name: 'CountryFlag',
	props: {
		cc: { type: String, default: '' },
	},
	data() {
		return { src: '' }
	},
	watch: {
		cc: {
			immediate: true,
			async handler(cc) {
				this.src = ''
				const key = `./${String(cc || '').toLowerCase()}.svg`
				if (!flags || !/^[a-z]{2}$/i.test(cc || '') || !flags.keys().includes(key)) {
					return
				}
				const mod = await flags(key)
				if (this.cc === cc) {
					this.src = mod?.default || mod
				}
			},
		},
	},
}
</script>

<style scoped>
.country-flag {
	display: inline-block;
	vertical-align: -1px;
	margin-right: 0.25rem;
	border-radius: 1px;
}
</style>
