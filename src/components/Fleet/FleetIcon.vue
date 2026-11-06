<template>
	<svg aria-hidden="true" fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" viewBox="0 0 24 24" width="18">
		<path v-if="name === 'play'" d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
		<rect v-else-if="name === 'stop'" fill="currentColor" height="12" rx="2" stroke="none" width="12" x="6" y="6" />
		<path v-else-if="name === 'restart'" d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
		<path v-else-if="name === 'update'" d="M12 19V6M6 12l6-6 6 6" />
		<path v-else-if="name === 'power'" d="M12 3v9M6.3 7.5a8 8 0 1 0 11.4 0" />
	</svg>
</template>

<script>
// The few glyphs of the row and card buttons: a play, a stop, a restart, an update, a power button.
export default {
	name: 'FleetIcon',
	props: {
		name: { type: String, required: true },
	},
}
</script>
