<template>
	<section class="modal-card-body env-editor">
		<!-- read-only, the panel above says why and there is nothing to explain -->
		<template v-if="!readonly">
			<p class="has-text-full-03 is-size-7 mb-2">
				{{ $t('Edit the .env file of this app. Applying an empty file deletes it.') }}
			</p>

			<b-message class="mb-3" size="is-small" type="is-info">
				<ul>
					<li>{{ $t('One KEY=VALUE per line; a line starting with # is a comment.') }}</li>
					<li>{{ $t('Quote values as in a Docker Compose .env file.') }}</li>
					<li>{{ $t('Reference a key from the Compose file as {ref}.', { ref: '${KEY}' }) }}</li>
					<li>{{ $t('Keys set by CasaOS (TZ, PUID, PGID) cannot be overridden here.') }}</li>
				</ul>
			</b-message>
		</template>

		<Codemirror :options="cmOptions"
			:value="draft"
			class="env-editor__area"
			@input="onInput" />

		<b-message v-if="localError" class="mt-3 mb-0" size="is-small" type="is-danger">
			{{ localError }}
		</b-message>

		<b-message v-else-if="serverError" class="mt-3 mb-0" size="is-small" type="is-danger">
			{{ serverError }}
		</b-message>

		<div v-if="isDirty && !localError && !serverError" class="mt-3 has-text-full-03 is-size-7">
			{{ $t('Unsaved changes.') }}
			<a href="#" @click.prevent="reset">{{ $t('Discard') }}</a>
		</div>
	</section>
</template>

<script>
import Codemirror from '@/components/basicComponents/CodeMirror.vue'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import 'codemirror/mode/shell/shell.js'
import 'codemirror/addon/selection/active-line.js'

// What a line must start with to be worth sending: the server's dotenv parser
// is authoritative for everything after the `=`.
// What compose-go's dotenv parser takes as a key line: `KEY=`, `KEY:`, or a
// bare `KEY` inheriting the environment; names may carry `.`, `-`, `[`, `]`.
const ASSIGNMENT = /^(?:export\s+)?[\w.[\]-]+\s*(?:[=:]|$)/

export default {
	name: 'EnvEditor',
	components: { Codemirror },
	props: {
		appId: { type: String, required: true },
		value: { type: String, default: '' },
		// A git app whose repository tracks .env: an edit would modify a tracked file.
		readonly: { type: Boolean, default: false },
	},
	emits: ['applied', 'state'],
	data() {
		return {
			draft: this.value,
			isApplying: false,
			serverError: '',
			cmOptions: {
				mode: 'text/x-sh',
				theme: 'monokai',
				lineNumbers: true,
				lineWrapping: true,
				styleActiveLine: true,
				readOnly: this.readonly,
			},
		}
	},
	computed: {
		// 1-based number of the first line that is neither blank, a comment nor an
		// assignment; 0 when there is none. An empty draft is valid: it deletes the file.
		badLine() {
			return 1 + this.draft.split('\n').findIndex((line) => {
				const text = line.trim()
				return text && !text.startsWith('#') && !ASSIGNMENT.test(text)
			})
		},

		localError() {
			return this.badLine ? this.$t('Line {n}: expected KEY=VALUE, a # comment or a blank line.', { n: this.badLine }) : ''
		},

		isDirty() {
			return this.draft !== this.value
		},

		canApply() {
			return !this.readonly && !this.localError && this.isDirty && !this.isApplying
		},
	},
	watch: {
		value(next) {
			// The panel reloaded the file: drop the draft rather than silently keeping
			// edits made against a version that no longer exists.
			this.draft = next
			this.serverError = ''
		},
		canApply: 'emitState',
		isApplying: 'emitState',
		isDirty: 'emitState',
	},
	mounted() {
		this.emitState()
	},
	methods: {
		emitState() {
			this.$emit('state', {
				canApply: this.canApply,
				isApplying: this.isApplying,
				isDirty: this.isDirty,
			})
		},

		onInput(text) {
			this.draft = text
			this.serverError = ''
		},

		/**
		 * Validate server-side with dry_run, then apply for real. The dry run is what
		 * surfaces dotenv syntax errors and keys CasaOS reserves.
		 */
		async apply() {
			if (!this.canApply)
				return

			this.isApplying = true
			this.serverError = ''

			try {
				await this.$api.container.applyComposeEnv(this.appId, this.draft, true)
				await this.$api.container.applyComposeEnv(this.appId, this.draft, false)
				this.$buefy.toast.open({
					message: this.$t('Changes are being applied.'),
					type: 'is-success',
				})
				this.$emit('applied', this.draft)
			} catch (error) {
				this.serverError = this.readServerError(error)
			} finally {
				this.isApplying = false
			}
		},

		readServerError(error) {
			const data = error && error.response && error.response.data
			if (data && data.message)
				return data.message

			if (typeof data === 'string' && data)
				return data

			return (error && error.message) || this.$t('The server rejected this .env file.')
		},

		reset() {
			this.draft = this.value
			this.serverError = ''
		},
	},
}
</script>

<style lang="scss" scoped>
.env-editor {
  &__area {
    ::v-deep .CodeMirror {
      height: 22rem;
      border-radius: 0.5rem;
      font-size: 0.8125rem;
    }
  }
}
</style>
