<template>
	<div class="backup-exclusions">
		<p class="settings-intro mb-4">
			{{ $t('Folders no backup of an app copies, whichever app mounts them: a share on a NAS, a media library kept somewhere else.') }}
		</p>

		<b-message v-if="error" class="mb-4" size="is-small" type="is-danger">{{ error }}</b-message>

		<b-field :label="$t('Folders left out, one per line')" label-position="on-border">
			<!-- nothing can be typed until the list has loaded: saving over a list that
				failed to load would empty it, and the next backup would copy it all -->
			<b-input v-model="text" :aria-label="$t('Folders left out, one per line')" :disabled="!loaded" placeholder="/mnt/nas" size="is-small" type="textarea"></b-input>
		</b-field>
		<p class="_has-text-gray is-size-7">
			{{ $t('Write the full path as the app mounts it. Everything inside is left out too, and a restore does not write to it. Backups already taken keep what they copied.') }}
		</p>

		<div class="is-flex is-justify-content-flex-end mt-4">
			<b-button :disabled="!loaded" :loading="busy" rounded size="is-small" type="is-primary" @click="save">
				{{ $t('Save') }}
			</b-button>
		</div>
	</div>
</template>

<script>
export default {
	name: 'backup-exclusions',
	data() {
		return { text: '', loaded: false, busy: false, error: '' }
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			try {
				this.show(await this.$api.backup.getExclusions())
				this.loaded = true
			} catch (error) {
				this.error = this.$t('The folders left out could not be loaded: {error}', { error: this.messageOf(error) })
			}
		},

		async save() {
			this.busy = true
			this.error = ''
			try {
				const paths = this.text.split('\n').map(line => line.trim()).filter(Boolean)
				// the box answers the list as it keeps it: cleaned, once each, sorted
				this.show(await this.$api.backup.saveExclusions(paths))
				this.$buefy.toast.open({ message: this.$t('Saved'), type: 'is-success' })
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = false
			}
		},

		show(res) {
			const data = res.data.data
			this.text = ((data && data.paths) || []).join('\n')
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>

<style lang="scss" scoped>
// a modal gives every field the height of one line; the tag makes this rule the stronger one
.backup-exclusions :deep(textarea.textarea) {
	height: 8rem;
	font-family: monospace;
}
</style>
