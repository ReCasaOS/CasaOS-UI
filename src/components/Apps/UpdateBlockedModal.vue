<template>
	<div class="modal-card update-blocked">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Update of {name} blocked', { name: title }) }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">{{ error }}</b-message>

			<p class="is-size-7 mb-3">{{ sentence }}</p>

			<!-- everything below comes from the box's scan: text only, never markup -->
			<div v-for="(vuln, index) in shown" :key="index" class="vuln-line is-size-7 mb-2">
				<p>
					<a v-if="safeUrl(vuln.url)" :href="safeUrl(vuln.url)" rel="noopener noreferrer" target="_blank">{{ vuln.id }}</a>
					<span v-else>{{ vuln.id }}</span>
					<span v-if="vuln.package"> · {{ vuln.package }}</span>
					<span v-if="vuln.fixed"> · {{ $t('fixed in {version}', { version: vuln.fixed }) }}</span>
				</p>
				<p v-if="vuln.title" class="_has-text-gray">{{ vuln.title }}</p>
			</div>
			<p v-if="hidden" class="is-size-7 _has-text-gray mb-2">{{ $t('and {count} more', { count: hidden }) }}</p>

			<p class="is-size-7 _has-text-gray mt-3">{{ $t('The app stays on the version it had. Nothing was changed.') }}</p>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :disabled="busy" rounded @click="$emit('close')">{{ $t('Keep the installed version') }}</b-button>
			<b-button v-if="canOverride" :disabled="busy" :loading="busy" rounded type="is-danger" @click="updateAnyway">
				{{ $t('Update anyway') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import { moreCritical, safeUrl } from './updateBlocked'

// at most this many vulnerabilities are listed; the rest are counted
const SHOWN = 20

// The box pulled the new version, found it carries more critical vulnerabilities
// than the installed one, and put the installed one back. This says so, and lets
// the owner update anyway, without the scan.
export default {
	name: 'update-blocked-modal',
	props: {
		name: { type: String, required: true },
		title: { type: String, required: true },
		images: { type: Array, default: () => [] },
		canOverride: { type: Boolean, default: false },
	},
	emits: ['close'],
	data() {
		return { busy: false, error: '' }
	},
	computed: {
		sentence() {
			const count = moreCritical(this.images)
			if (count === 1)
				return this.$t('The new version has one more critical vulnerability than the installed one.')
			if (count > 1)
				return this.$t('The new version has {count} more critical vulnerabilities than the installed one.', { count })
			return this.$t('The new version has more critical vulnerabilities than the installed one.')
		},
		added() {
			return this.images.flatMap(image => image.added)
		},
		shown() {
			return this.added.slice(0, SHOWN)
		},
		hidden() {
			return Math.max(this.added.length - SHOWN, 0)
		},
	},
	methods: {
		safeUrl,

		async updateAnyway() {
			this.busy = true
			this.error = ''
			try {
				await this.$openAPI.appManagement.compose.updateComposeApp(this.name, undefined, { params: { skip_scan: true } })
				this.$emit('close')
			} catch (error) {
				this.error = error?.response?.data?.message || error?.message || this.$t('Unable to update at the moment!')
			} finally {
				this.busy = false
			}
		},
	},
}
</script>
