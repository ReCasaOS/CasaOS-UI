<template>
	<section class="modal-card-body git-repo-tab">
		<b-message v-if="error" size="is-small" type="is-danger">{{ error }}</b-message>

		<b-message v-if="gitApp.origin === 'adoptable'" size="is-small" type="is-info">
			{{ followable
				? $t('This app runs from a git work tree. Nothing changes until you act here: the first action makes CasaOS follow its repository.')
				: $t('This folder is not on a branch with a remote, so CasaOS cannot follow its repository yet.') }}
		</b-message>
		<b-message v-if="gitApp.blocked" size="is-small" type="is-danger">
			{{ $t('A rollback failed, so automatic rebuilds are stopped. Deploy or revert by hand to resume them.') }}
		</b-message>
		<b-message v-else-if="gitApp.auto_paused" size="is-small" type="is-warning">
			{{ $t('Automatic rebuild is paused since a revert. Turn it on again, or deploy by hand, to resume it.') }}
		</b-message>

		<table class="table is-narrow is-fullwidth is-size-7">
			<tbody>
				<tr>
					<th>{{ $t('Remote') }}</th>
					<td class="git-repo-tab__mono">{{ gitApp.remote || '-' }}</td>
				</tr>
				<tr>
					<th>{{ $t('Branch') }}</th>
					<td>{{ gitApp.branch || '-' }}</td>
				</tr>
				<tr>
					<th>{{ $t('Deployed') }}</th>
					<td>
						<template v-if="gitApp.deployed">
							<span class="git-repo-tab__mono">{{ short(gitApp.deployed.commit) }}</span>
							{{ gitApp.deployed.subject }} · {{ when(gitApp.deployed.at) }}
						</template>
						<span v-else class="has-text-full-03">{{ $t('Not deployed yet.') }}</span>
					</td>
				</tr>
				<tr v-if="gitApp.head">
					<th>{{ $t('In the folder') }}</th>
					<td>
						<span class="git-repo-tab__mono">{{ short(gitApp.head.commit) }}</span>
						{{ gitApp.head.subject }}
						<p v-if="!gitApp.head.tracked_files_clean" class="has-text-danger">
							{{ $t('Tracked files were modified in the folder. Every deployment is refused until they are restored.') }}
						</p>
					</td>
				</tr>
				<tr>
					<th>{{ $t('Last check') }}</th>
					<td>
						<span v-if="gitApp.check">{{ when(gitApp.check.at) }} · </span>{{ $t(checkLine.message, checkLine.params) }}
					</td>
				</tr>
				<tr v-if="stateTag">
					<th>{{ $t('State') }}</th>
					<td><b-tag :type="stateTag.type">{{ $t(stateTag.label) }}</b-tag></td>
				</tr>
			</tbody>
		</table>

		<p class="has-text-weight-bold is-size-7 mb-2">{{ $t('Access') }}</p>
		<div class="is-flex is-align-items-center is-flex-wrap-wrap">
			<b-select v-model="access" :disabled="!canAct" class="mr-2 mb-2" size="is-small">
				<option value="none">{{ $t('Public repository, nothing needed') }}</option>
				<option value="key">{{ $t('Deploy key') }}</option>
				<option value="token">{{ $t('Access token') }}</option>
			</b-select>
			<!-- write-only: a saved token never comes back -->
			<b-input v-if="access === 'token'" v-model="token" :disabled="!canAct"
				:placeholder="gitApp.token_set ? $t('A token is saved. Type one to replace it.') : $t('Token')"
				autocomplete="off" class="mr-2 mb-2" password-reveal size="is-small" type="password"></b-input>
			<b-button :disabled="!canAct" :loading="busy === 'access'" class="mr-2 mb-2" rounded size="is-small" @click="saveAccess">
				{{ $t('Save') }}
			</b-button>
			<b-button :disabled="!canAct" :loading="busy === 'test'" class="mb-2" rounded size="is-small" @click="check('test')">
				{{ $t('Test access') }}
			</b-button>
		</div>
		<div v-if="gitApp.access === 'key' && gitApp.public_key" class="is-flex is-align-items-flex-start mb-2">
			<pre class="git-repo-tab__text is-flex-grow-1 mr-2">{{ gitApp.public_key }}</pre>
			<b-button :label="$t('Copy')" rounded size="is-small" @click="copyKey"></b-button>
		</div>

		<p class="has-text-weight-bold is-size-7 mt-3 mb-2">{{ $t('Automatic rebuild') }}</p>
		<b-switch :disabled="!canAct" :model-value="autoDeploy" size="is-small" @update:model-value="setAutoDeploy">
			{{ $t('Deploy a new commit as soon as a check finds it') }}
		</b-switch>
		<p class="is-size-7 has-text-danger mt-1">{{ $t('It runs whatever is pushed to the branch.') }}</p>

		<div class="is-flex mt-4">
			<b-button :disabled="!canAct" :loading="busy === 'check'" class="mr-2" rounded size="is-small" @click="check('check')">
				{{ $t('Check now') }}
			</b-button>
			<b-button :disabled="!canAct" :loading="busy === 'deploy'" rounded size="is-small" type="is-primary" @click="deploy">
				{{ $t('Fetch and rebuild') }}
			</b-button>
		</div>

		<p class="has-text-weight-bold is-size-7 mt-4 mb-2">{{ $t('Last build') }}</p>
		<pre ref="log" class="git-repo-tab__text git-repo-tab__log">{{ log || $t('No build yet.') }}</pre>

		<p class="has-text-weight-bold is-size-7 mt-4 mb-2">{{ $t('Last deployments') }}</p>
		<p v-if="!history.length" class="is-size-7 has-text-full-03">{{ $t('No deployment yet.') }}</p>
		<table v-else class="table is-narrow is-fullwidth is-size-7">
			<tbody>
				<tr v-for="entry in history" :key="`${entry.commit}-${entry.at}`" class="git-repo-tab__deployment">
					<td>
						<span class="git-repo-tab__mono">{{ short(entry.commit) }}</span> {{ entry.subject }}
						<p class="has-text-full-03">{{ when(entry.at) }}</p>
					</td>
					<td>
						<b-tag :type="outcomeTag(entry.outcome).type">{{ $t(outcomeTag(entry.outcome).label) }}</b-tag>
						<p v-if="entry.reason" class="has-text-full-03">{{ entry.reason }}</p>
					</td>
					<td class="has-text-right">
						<b-button v-if="canRevert(gitApp, entry)" :disabled="!canAct" :loading="busy === entry.commit" rounded
							size="is-small" @click="confirmRevert(entry)">
							{{ $t('Revert to this version') }}
						</b-button>
					</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>

<script>
import copy from 'clipboard-copy'
import { appendLog, canFollow, canRevert, checkEnded, checkSummary, gitBadge, outcomeTag, shortCommit } from './gitApps'

const appOf = res => res.data.data

// A build or a deployment of this app moved on: read the app again.
function reloadMine(res) {
	if (this.isMine(res))
		this.reload()
}

// The Repository tab: a git app, or a compose app whose folder is a git work
// tree. The panel owns the app; every answer carries the whole of it, and goes
// back up as `change`.
export default {
	name: 'GitRepoTab',
	props: {
		appId: { type: String, required: true },
		gitApp: { type: Object, required: true },
	},
	emits: ['change'],
	data() {
		return {
			access: this.gitApp.access,
			token: '',
			autoDeploy: this.gitApp.auto_deploy,
			// '' or what runs: access, auto, test, check, deploy, or the commit of a revert
			busy: '',
			error: '',
			// null until a build is followed live, then the log as its events bring it
			liveLog: null,
			// set as the panel closes, so a check it waits for stops being read
			closed: false,
		}
	},
	computed: {
		followable() {
			return canFollow(this.gitApp)
		},
		// nothing is sent while something runs: the server would answer 409
		canAct() {
			return !this.busy && !this.gitApp.operation && this.followable
		},
		checkLine() {
			return checkSummary(this.gitApp)
		},
		stateTag() {
			return gitBadge({ state: this.gitApp.state })
		},
		history() {
			return this.gitApp.history || []
		},
		log() {
			return this.liveLog === null ? (this.gitApp.build_log || '') : this.liveLog
		},
	},
	watch: {
		'gitApp.access': function (value) {
			this.access = value
		},
		'gitApp.auto_deploy': function (value) {
			this.autoDeploy = value
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
		canRevert,
		outcomeTag,
		short: shortCommit,

		when(at) {
			return new Date(at).toLocaleString()
		},

		messageOf(error) {
			const data = error && error.response && error.response.data
			return (data && data.message) || (error && error.message) || String(error)
		},

		// One action at a time; `request` resolves to the app the server answered.
		// True when the server took the action.
		async run(kind, request) {
			this.busy = kind
			this.error = ''
			try {
				this.$emit('change', await request())
				return true
			} catch (error) {
				this.error = this.messageOf(error)
				return false
			} finally {
				this.busy = ''
			}
		},

		// "Check now" and "Test access" run the same check; `kind` spins the right
		// button. The check answers as it starts, and the button spins until it ends.
		check(kind) {
			return this.run(kind, async () => {
				const started = appOf(await this.$api.gitApps.check(this.appId))
				this.$emit('change', started)
				return checkEnded(started, () => this.$api.gitApps.get(this.appId).then(appOf), { stop: () => this.closed })
			})
		},

		deploy() {
			return this.run('deploy', () => this.$api.gitApps.deploy(this.appId).then(appOf))
		},

		async saveAccess() {
			// an empty token field keeps the token that is saved
			const body = this.access === 'token' && this.token ? { access: this.access, token: this.token } : { access: this.access }
			if (await this.run('access', () => this.$api.gitApps.update(this.appId, body).then(appOf)))
				this.token = ''
		},

		async setAutoDeploy(value) {
			this.autoDeploy = value
			if (!await this.run('auto', () => this.$api.gitApps.update(this.appId, { auto_deploy: value }).then(appOf)))
				this.autoDeploy = this.gitApp.auto_deploy
		},

		confirmRevert(entry) {
			this.$buefy.dialog.confirm({
				title: this.$t('Revert to this version'),
				message: this.$t('The app goes back to {commit}, and automatic rebuild is paused until you turn it on again or deploy by hand.', { commit: shortCommit(entry.commit) }),
				confirmText: this.$t('Revert to this version'),
				cancelText: this.$t('Cancel'),
				type: 'is-warning',
				onConfirm: () => this.run(entry.commit, () => this.$api.gitApps.deploy(this.appId, { commit: entry.commit }).then(appOf)),
			})
		},

		copyKey() {
			copy(this.gitApp.public_key)
			this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
		},

		async reload() {
			try {
				this.$emit('change', appOf(await this.$api.gitApps.get(this.appId)))
			} catch (error) {
				this.error = this.messageOf(error)
			}
		},

		isMine(res) {
			return res.Properties['app:name'] === this.appId
		},
	},
	sockets: {
		'app:git-build-begin': function (res) {
			if (!this.isMine(res))
				return
			this.liveLog = ''
			this.reload()
		},
		'app:git-build-progress': function (res) {
			if (this.isMine(res))
				this.liveLog = appendLog(this.log, res.Properties.message)
		},
		'app:git-build-end': reloadMine,
		'app:git-build-error': reloadMine,
		'app:git-deploy-end': reloadMine,
		'app:git-deploy-error': reloadMine,
	},
}
</script>

<style lang="scss" scoped>
.git-repo-tab__mono {
	font-family: monospace;
	word-break: break-all;
}

.git-repo-tab__text {
	white-space: pre-wrap;
	word-break: break-all;
	font-size: 0.75rem;
}

.git-repo-tab__log {
	max-height: 16rem;
	overflow-y: auto;
}
</style>
