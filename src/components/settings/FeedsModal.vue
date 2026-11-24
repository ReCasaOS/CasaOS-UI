<template>
	<div class="modal-card feeds-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Footer news') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('Headlines of the RSS or Atom feeds you choose, one at a time at the bottom of the dashboard. The box reads the feeds every 30 minutes.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<template v-if="loaded">
				<div class="settings-card">
					<b-field class="mb-3">
						<b-switch v-model="enabled" :disabled="saving" data-feeds-switch>
							{{ $t('Show headlines in the footer') }}
						</b-switch>
					</b-field>
					<b-field :label="$t('Feeds, one address per line (at most 10)')">
						<b-input v-model="text" :disabled="saving" data-feeds-text placeholder="https://github.com/ReCasaOS/CasaOS-Install/releases.atom"
							rows="5" type="textarea" />
					</b-field>
				</div>
			</template>
			<b-loading :is-full-page="false" :model-value="!loaded && !error" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<b-button :disabled="!loaded || saving" :label="$t('Save')" :loading="saving" data-feeds-save rounded type="is-primary" @click="save" />
		</footer>
	</div>
</template>

<script>
export default {
	name: 'FeedsModal',
	emits: ['close'],
	data() {
		return { loaded: false, enabled: false, text: '', saving: false, error: '' }
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			try {
				const { enabled, feeds } = (await this.$api.sys.getFeeds()).data.data
				this.enabled = enabled
				this.text = (feeds || []).join('\n')
				this.loaded = true
			} catch (error) {
				this.error = this.$t('The feeds could not be loaded: {error}', { error: this.messageOf(error) })
			}
		},
		async save() {
			this.saving = true
			this.error = ''
			const feeds = this.text.split('\n').map(line => line.trim()).filter(Boolean)
			try {
				await this.$api.sys.setFeeds({ enabled: this.enabled, feeds })
				this.$emit('close')
			} catch (error) {
				this.error = this.$t('The feeds could not be saved: {error}', { error: this.messageOf(error) })
			} finally {
				this.saving = false
			}
		},
		messageOf(error) {
			return error?.response?.data?.message || error?.message || ''
		},
	},
}
</script>

<style lang="scss" scoped>
// the dashboard's inputs are one line high: room for a few addresses
.feeds-modal :deep(textarea) {
	min-height: 8rem;
}
</style>
