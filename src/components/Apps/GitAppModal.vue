<template>
	<div class="modal-card git-app">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('An app from a git repository') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				<p>{{ error }}</p>
				<!-- a repository without a compose file: what to add, as the server wrote it -->
				<pre v-if="example" class="git-app__text mt-2">{{ example }}</pre>
			</b-message>

			<!-- 1. the repository, and how to reach it -->
			<template v-if="step === 'repository'">
				<b-field :label="$t('Repository URL')">
					<b-input v-model="url" :disabled="!!app" placeholder="https://github.com/owner/app.git"></b-input>
				</b-field>
				<b-field :label="$t('Branch')" :message="$t('Empty: the branch the repository names as its default.')">
					<b-input v-model="branch" :disabled="!!app"></b-input>
				</b-field>
				<b-field :label="$t('App name')">
					<b-input v-model="name" :disabled="!!app"></b-input>
				</b-field>
				<b-field :label="$t('Access')">
					<b-select v-model="access" :disabled="!!app" expanded>
						<option value="none">{{ $t('Public repository, nothing needed') }}</option>
						<option value="key">{{ $t('Deploy key') }}</option>
						<option value="token">{{ $t('Access token') }}</option>
					</b-select>
				</b-field>
				<b-field v-if="access === 'token'" :label="$t('Token')">
					<b-input v-model="token" :disabled="!!app" autocomplete="off" password-reveal type="password"></b-input>
				</b-field>

				<!-- The key is made as the app is registered, and nothing is cloned until
					the owner has added it to the repository. -->
				<template v-if="app && app.public_key">
					<p class="is-size-7 mb-2">{{ $t('Add this key to the repository as a read-only deploy key, then continue.') }}</p>
					<div class="is-flex is-align-items-flex-start">
						<pre class="git-app__text is-flex-grow-1 mr-2">{{ app.public_key }}</pre>
						<b-button :label="$t('Copy')" rounded size="is-small" @click="copyKey"></b-button>
					</div>
				</template>

				<!-- the check runs on the server, and Cancel waits for it: say what takes the time -->
				<p v-if="cloning" class="is-size-7 has-text-full-03 mt-2">{{ $t('Cloning the repository…') }}</p>
			</template>

			<!-- 2. what the repository will run, before anything runs -->
			<template v-else-if="step === 'review'">
				<p class="is-size-7 has-text-full-03 mb-3">{{ $t('Read from {files}.', { files: app.compose.files.join(', ') }) }}</p>
				<div v-for="service in app.compose.services" :key="service.name" class="mb-3 git-app__service">
					<p class="is-size-7">
						<span class="has-text-weight-bold">{{ service.name }}</span>
						<span class="has-text-full-03"> · {{ service.build ? $t('built from the repository') : service.image }}</span>
					</p>
					<p v-if="service.ports && service.ports.length" class="is-size-7 has-text-full-03">
						{{ $t('Published ports: {ports}', { ports: service.ports.join(', ') }) }}
					</p>
					<p v-if="service.volumes && service.volumes.length" class="is-size-7 has-text-full-03">
						{{ $t('Volumes: {volumes}', { volumes: service.volumes.join(', ') }) }}
					</p>
				</div>

				<b-message v-if="sensitive.length" size="is-small" type="is-warning">
					<p>{{ $t('These services reach beyond their own container. Deploy them only from a repository you trust.') }}</p>
					<p v-for="service in sensitive" :key="service.name">
						{{ service.name }}: {{ service.sensitive.map(option => $t(sensitiveLabel(option))).join(', ') }}
					</p>
				</b-message>

				<p class="has-text-weight-bold is-size-7 mt-4 mb-2">.env</p>
				<p v-if="app.env_tracked" class="is-size-7 has-text-full-03 mb-2">
					{{ $t('The repository tracks its .env file, so it cannot be edited here: an edit would modify a tracked file and block every later deployment.') }}
				</p>
				<Codemirror :options="envOptions" :value="env" class="git-app__env" @input="env = $event"></Codemirror>
			</template>

			<!-- 3. the deployment, and the build as it goes -->
			<template v-else>
				<p :class="statusClass" class="is-size-7 mb-2">{{ status }}</p>
				<pre ref="log" class="git-app__text git-app__log">{{ log }}</pre>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button v-if="step !== 'deploy'" :disabled="busy" class="mr-2" rounded @click="cancel">{{ $t('Cancel') }}</b-button>
			<b-button v-if="step === 'repository' && !app" :disabled="!canRegister" :loading="busy" rounded type="is-primary" @click="register">
				{{ $t('Next') }}
			</b-button>
			<b-button v-else-if="step === 'repository'" :loading="busy" rounded type="is-primary" @click="clone">
				{{ error ? $t('Retry') : $t('Continue') }}
			</b-button>
			<b-button v-else-if="step === 'review'" :loading="busy" rounded type="is-primary" @click="deploy">
				{{ $t('Deploy') }}
			</b-button>
			<template v-else>
				<!-- a first deployment that failed leaves an app on no card: it is retried
					or deleted here, or it holds its name for nothing -->
				<template v-if="outcome && outcome !== 'deployed'">
					<b-button :disabled="busy" class="mr-2" rounded type="is-danger" @click="cancel">{{ $t('Delete this app') }}</b-button>
					<b-button :loading="busy" class="mr-2" rounded @click="deploy">{{ $t('Deploy again') }}</b-button>
				</template>
				<b-button rounded type="is-primary" @click="$emit('close')">
					{{ outcome ? $t('Close') : $t('Continue in background') }}
				</b-button>
			</template>
		</footer>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import { appendLog, checkEnded, projectName, sensitiveLabel, sensitiveServices } from './gitApps'
import Codemirror from '@/components/basicComponents/CodeMirror.vue'
import events from '@/events/events'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import 'codemirror/mode/shell/shell.js'

// An app from a git repository, in three steps: register it (a deploy key is
// made there), clone it and review what it runs, then deploy it and follow the
// build. The dialog closes only through its own buttons, because Cancel deletes
// an app registered and never deployed.
export default {
	name: 'GitAppModal',
	components: { Codemirror },
	emits: ['close'],
	data() {
		return {
			step: 'repository',
			url: '',
			branch: '',
			name: '',
			access: 'none',
			token: '',
			// the GitApp as the server last answered, once registered
			app: null,
			env: '',
			log: '',
			built: false,
			// '' while it runs, then deployed, build_failed or failed
			outcome: '',
			reason: '',
			busy: false,
			cloning: false,
			error: '',
			example: '',
			// set as the dialog goes, so a check it waits for stops being read
			closed: false,
		}
	},
	computed: {
		canRegister() {
			return Boolean(this.url.trim() && this.name.trim() && (this.access !== 'token' || this.token))
		},
		sensitive() {
			return sensitiveServices(this.app && this.app.compose)
		},
		// read once, as the editor mounts on the review step
		envOptions() {
			return { mode: 'text/x-sh', theme: 'monokai', lineNumbers: true, lineWrapping: true, readOnly: Boolean(this.app && this.app.env_tracked) }
		},
		status() {
			if (this.outcome === 'deployed')
				return this.$t('Deployed')
			if (this.outcome === 'build_failed')
				return this.$t('The build failed: {reason}', { reason: this.reason })
			if (this.outcome === 'failed')
				return this.$t('The deployment failed: {reason}', { reason: this.reason })
			return this.built ? this.$t('Built. Starting the app…') : this.$t('Building…')
		},
		statusClass() {
			return { 'has-text-success': this.outcome === 'deployed', 'has-text-danger': Boolean(this.outcome) && this.outcome !== 'deployed' }
		},
	},
	watch: {
		// The name follows the URL until somebody types one.
		url(next, previous) {
			if (this.name === projectName(previous))
				this.name = projectName(next)
		},
		log() {
			this.$nextTick(() => {
				if (this.$refs.log)
					this.$refs.log.scrollTop = this.$refs.log.scrollHeight
			})
		},
	},
	beforeUnmount() {
		this.closed = true
	},
	methods: {
		sensitiveLabel,

		async register() {
			this.busy = true
			this.error = ''
			try {
				const res = await this.$api.gitApps.create({
					name: this.name.trim(),
					url: this.url.trim(),
					branch: this.branch.trim() || undefined,
					access: this.access,
					token: this.access === 'token' ? this.token : undefined,
				})
				this.app = res.data.data
			} catch (error) {
				this.fail(error)
				return
			} finally {
				this.busy = false
			}
			// with a key, the owner adds it to the repository before anything is cloned
			if (this.access !== 'key')
				await this.clone()
		},

		// The check answers as it starts; the clone has ended once no check runs.
		// A clone that failed -- no access, no compose file -- says why in
		// check.error, and a missing compose file comes with an example to add.
		async clone() {
			this.busy = true
			this.cloning = true
			this.error = ''
			this.example = ''
			try {
				const name = this.app.app
				const started = await this.$api.gitApps.check(name)
				const app = await checkEnded(started.data.data, () => this.$api.gitApps.get(name).then(res => res.data.data), { stop: () => this.closed })
				if (this.closed)
					return
				this.app = app
				if (!app.cloned || !app.compose) {
					this.error = (app.check && app.check.error) || this.$t('CasaOS could not clone the repository.')
					this.example = app.compose_example || ''
					return
				}
				this.env = app.env_template || ''
				this.step = 'review'
			} catch (error) {
				this.fail(error)
			} finally {
				this.busy = false
				this.cloning = false
			}
		},

		async deploy() {
			const before = { outcome: this.outcome, reason: this.reason }
			// Cleared before the request: the events of a build that fails at once can
			// arrive ahead of its answer.
			this.outcome = ''
			this.reason = ''
			this.built = false
			this.busy = true
			this.error = ''
			try {
				// a repository that tracks .env deploys its own
				await this.$api.gitApps.deploy(this.app.app, this.app.env_tracked ? {} : { env: this.env })
				this.step = 'deploy'
			} catch (error) {
				// nothing started, so what the last attempt said still stands
				this.outcome = before.outcome
				this.reason = before.reason
				this.fail(error)
			} finally {
				this.busy = false
			}
		},

		// Registered and never deployed, the app is deleted rather than left holding
		// its name and its clone.
		async cancel() {
			if (!this.app) {
				this.$emit('close')
				return
			}
			this.busy = true
			this.error = ''
			try {
				await this.$api.gitApps.remove(this.app.app)
				this.$emit('close')
			} catch (error) {
				this.fail(error)
			} finally {
				this.busy = false
			}
		},

		copyKey() {
			copy(this.app.public_key)
			this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
		},

		fail(error) {
			const data = error && error.response && error.response.data
			this.error = (data && data.message) || (error && error.message) || String(error)
		},

		finish(outcome, reason) {
			this.outcome = outcome
			this.reason = reason || ''
			// the app is on the grid once its containers exist, whatever became of them
			this.$EventBus.$emit(events.RELOAD_APP_LIST)
		},

		isMine(res) {
			return Boolean(this.app) && res.Properties['app:name'] === this.app.app
		},
	},
	sockets: {
		'app:git-build-begin': function (res) {
			if (this.isMine(res)) {
				this.log = ''
				this.built = false
			}
		},
		'app:git-build-progress': function (res) {
			if (this.isMine(res))
				this.log = appendLog(this.log, res.Properties.message)
		},
		'app:git-build-end': function (res) {
			if (this.isMine(res))
				this.built = true
		},
		'app:git-build-error': function (res) {
			if (this.isMine(res))
				this.finish('build_failed', res.Properties.message)
		},
		'app:git-deploy-error': function (res) {
			if (this.isMine(res))
				this.finish('failed', res.Properties.message)
		},
		'app:git-deploy-end': function (res) {
			if (this.isMine(res))
				this.finish('deployed', '')
		},
	},
}
</script>

<style lang="scss" scoped>
.modal-card {
	width: 40rem;
}

.git-app__text {
	white-space: pre-wrap;
	word-break: break-all;
	font-size: 0.75rem;
}

.git-app__log {
	height: 20rem;
	overflow-y: auto;
}

.git-app__env :deep(.CodeMirror) {
	height: 12rem;
	border-radius: 0.5rem;
	font-size: 0.8125rem;
}
</style>
