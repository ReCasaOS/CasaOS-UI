<template>
	<div class="modal-card">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('What is sent') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="is-size-7 mb-3">
				{{ $t('When statistics are on, these properties go to PostHog (EU) once a day and after each install or update.') }}
				<a href="https://github.com/ReCasaOS/CasaOS-Install#anonymous-statistics" rel="noopener noreferrer" target="_blank">{{ $t('Learn more') }}</a>
			</p>

			<b-message v-if="loadError" size="is-small" type="is-warning">
				{{ loadError }}
			</b-message>
			<pre v-else-if="properties">{{ json }}</pre>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
export default {
	name: 'TelemetryPreviewModal',
	emits: ['close'],
	data() {
		return {
			properties: null,
			loadError: '',
		}
	},
	computed: {
		json() {
			return JSON.stringify(this.properties, null, 2)
		},
	},
	// Asked for when it opens: the core builds the preview with the function its
	// sender uses, so this is what would go out now.
	async mounted() {
		try {
			const res = await this.$api.sys.getTelemetry()
			this.properties = res.data.data.preview.properties
		} catch {
			this.loadError = this.$t('The preview could not be loaded.')
		}
	},
}
</script>
