<template>
	<!-- the window on a tab of its own, where it is now: the address can be
		bookmarked. Not shown on that tab itself. -->
	<button v-if="!onItsTab" :aria-label="$t('Open in a new tab')" :title="$t('Open in a new tab')"
		class="close-button ml-2" type="button" @click="openPage(page, params)">
		<b-icon icon="open-in-new" />
	</button>
</template>

<script>
import { openPage } from '@/router/pageTabs'

export default {
	name: 'NewTabButton',
	props: {
		// the page's address, as in #/files
		page: { type: String, required: true },
		// where in it: folder, VM, item…
		params: { type: Object, default: () => ({}) },
	},
	computed: {
		onItsTab() {
			return this.$route?.path === `/${this.page}`
		},
	},
	methods: {
		openPage,
	},
}
</script>

<style scoped>
/* a button for the keyboard, drawn as the window's other header controls */
button.close-button {
	padding: 0;
	border: 0;
	color: inherit;
	background-color: transparent;
}

button.close-button:hover {
	background-color: var(--casa-hover-tint);
}

button.close-button:active {
	background-color: var(--casa-active);
}
</style>
