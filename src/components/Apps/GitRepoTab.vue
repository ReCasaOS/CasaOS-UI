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
			<b-button :aria-label="$t('Copy the public key')" :label="$t('Copy')" rounded size="is-small" @click="copyText(gitApp.public_key)"></b-button>
		</div>

		<p class="has-text-weight-bold is-size-7 mt-3 mb-2">{{ $t('Automatic rebuild') }}</p>
		<b-switch :disabled="!canAct" :model-value="autoDeploy" size="is-small" @update:model-value="setAutoDeploy">
			{{ $t('Deploy a new commit as soon as a check finds it') }}
		</b-switch>
		<p class="is-size-7 has-text-danger mt-1">{{ $t('It runs whatever is pushed to the branch.') }}</p>

		<!-- an AppManagement older than webhooks sends no `webhook`: nothing to show -->
		<template v-if="webhook">
			<p class="has-text-weight-bold is-size-7 mt-3 mb-2">{{ $t('Webhook') }}</p>
			<b-switch :disabled="!canAct" :model-value="webhookOn" size="is-small" @update:model-value="setWebhook">
				{{ $t('Check on every push') }}
			</b-switch>
			<p v-if="!webhook.enabled" class="is-size-7 has-text-full-03 mt-1">
				{{ $t('Off: new commits wait for the five-minute check. A restored app comes back with its webhook off; turning it on makes a new secret to give the forge.') }}
			</p>
			<div v-else class="is-size-7 mt-2">
				<p class="has-text-weight-bold mb-1">{{ $t('URL') }}</p>
				<div class="is-flex is-align-items-center mb-1">
					<span class="git-repo-tab__mono is-flex-grow-1 mr-2">{{ webhookUrl }}</span>
					<b-button :aria-label="$t('Copy the URL')" :label="$t('Copy')" rounded size="is-small" @click="copyText(webhookUrl)"></b-button>
				</div>
				<p class="is-size-7 has-text-full-03 mb-2">{{ $t('If your forge reaches the box by another address (a domain, a tunnel), use that one instead.') }}</p>

				<p class="has-text-weight-bold mb-1">{{ $t('Secret') }}</p>
				<div class="is-flex is-align-items-center is-flex-wrap-wrap mb-2">
					<!-- hidden until asked: the screen may be shared -->
					<span v-if="showSecret" class="git-repo-tab__mono is-flex-grow-1 mr-2 mb-1">{{ webhook.secret }}</span>
					<span v-else :aria-label="$t('Hidden')" class="git-repo-tab__mono is-flex-grow-1 mr-2 mb-1" role="img">••••••••••••••••</span>
					<b-button :label="showSecret ? $t('Hide') : $t('Show')" class="mr-2 mb-1" rounded size="is-small" @click="showSecret = !showSecret"></b-button>
					<b-button :aria-label="$t('Copy the secret')" :label="$t('Copy')" class="mr-2 mb-1" rounded size="is-small" @click="copyText(webhook.secret)"></b-button>
					<b-button :disabled="!canAct" :label="$t('Regenerate')" :loading="busy === 'secret'" class="mb-1" rounded size="is-small" @click="confirmRegenerate"></b-button>
				</div>

				<p class="has-text-weight-bold mb-1">{{ $t('How to set it up') }}</p>
				<b-tabs v-model="howTo" :animated="false" size="is-small">
					<b-tab-item v-for="guide in howTos" :key="guide.forge" :label="guide.forge" :value="guide.forge">
						<ol class="git-repo-tab__steps">
							<li v-for="step in guide.steps" :key="step">{{ $t(step) }}</li>
						</ol>
					</b-tab-item>
				</b-tabs>

				<p class="has-text-weight-bold mb-1">{{ $t('Last delivery') }}</p>
				<p v-if="webhook.last_delivery">{{ deliveryLine }}</p>
				<p v-else class="is-size-7 has-text-full-03">
					{{ $t('No delivery yet.') }} {{ $t('The forge must be able to reach the box. GitHub sends a ping as the webhook is saved: that is enough to check.') }}
				</p>
			</div>
		</template>

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
import { appendLog, canFollow, canRevert, checkEnded, checkSummary, gitBadge, outcomeTag, shortCommit, timeAgo } from './gitApps'

const appOf = res => res.data.data

// The forge of a webhook delivery, as the server names it, as it is written.
const FORGES = { github: 'GitHub', gitea: 'Gitea', forgejo: 'Forgejo', gogs: 'Gogs', gitlab: 'GitLab' }

// Where each forge takes a webhook, and what to fill in. The field names are the
// forges' own English labels.
const HOW_TO = [
	{
		forge: 'GitHub',
		steps: [
			'In the repository: Settings › Webhooks › Add webhook.',
			'Payload URL: the URL above.',
			'Content type: application/json.',
			'Secret: the secret above.',
			'Which events: “Just the push event”.',
		],
	},
	{
		forge: 'Gitea/Forgejo',
		steps: [
			'In the repository: Settings › Webhooks › Add webhook › Gitea (or Forgejo).',
			'Target URL: the URL above.',
			'HTTP method: POST. POST content type: application/json.',
			'Secret: the secret above.',
			'Trigger on: Push events.',
		],
	},
	{
		forge: 'GitLab',
		steps: [
			'In the project: Settings › Webhooks › Add new webhook.',
			'URL: the URL above.',
			'Secret token: the secret above.',
			'Trigger: Push events.',
		],
	},
]

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
			webhookOn: Boolean(this.gitApp.webhook && this.gitApp.webhook.enabled),
			showSecret: false,
			howTo: HOW_TO[0].forge,
			howTos: HOW_TO,
			// '' or what runs: access, auto, webhook, secret, test, check, deploy, or the commit of a revert
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
		webhook() {
			return this.gitApp.webhook || null
		},
		// the forge reaches the box where the owner does, unless told otherwise
		webhookUrl() {
			return window.location.origin + this.webhook.path
		},
		// ponytail: worded when the app is read, not redrawn while the tab stays open; add a minute timer if owners watch it
		deliveryLine() {
			const delivery = this.webhook.last_delivery
			// the time in the language of the message: a language without it falls
			// back to English, and a free-text locale never reaches Intl
			const locale = this.$te('Received {when}') ? this.$i18n.locale : 'en_us'
			return [
				this.$t('Received {when}', { when: timeAgo(delivery.at, locale) }),
				FORGES[delivery.forge] || this.$t('Unknown forge'),
				delivery.event,
				this.$t(delivery.result),
			].filter(Boolean).join(' · ')
		},
	},
	watch: {
		'gitApp.access': function (value) {
			this.access = value
		},
		'gitApp.auto_deploy': function (value) {
			this.autoDeploy = value
		},
		'gitApp.webhook.enabled': function (value) {
			this.webhookOn = Boolean(value)
			this.showSecret = false
		},
		log() {
			this.$nextTick(() => {
				if (this.$refs.log)
					this.$refs.log.scrollTop = this.$refs.log.scrollHeight
			})
		},
	},
	// Back from the forge's settings, where saving the webhook sends a ping: the last
	// delivery shows it without closing the panel.
	mounted() {
		window.addEventListener('focus', this.onFocus)
	},
	beforeUnmount() {
		this.closed = true
		window.removeEventListener('focus', this.onFocus)
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

		// A browser may refuse the clipboard (a box served over plain http): say so.
		copyText(text) {
			Promise.resolve(copy(text)).then(
				() => this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' }),
				() => this.$buefy.toast.open({ message: this.$t('The text could not be copied.'), type: 'is-danger' }),
			)
		},

		onFocus() {
			if (this.webhook && this.webhook.enabled && !this.busy)
				this.reload()
		},

		// On at once; off only once confirmed, since the secret goes with it.
		setWebhook(value) {
			this.webhookOn = value
			if (value)
				return this.saveWebhook({ webhook_enabled: true })
			this.$buefy.dialog.confirm({
				title: this.$t('Turn the webhook off'),
				message: this.$t('The secret is forgotten. Turning the webhook on again makes a new one, to give the forge again.'),
				confirmText: this.$t('Turn off'),
				cancelText: this.$t('Cancel'),
				type: 'is-warning',
				onConfirm: () => this.saveWebhook({ webhook_enabled: false }),
				onCancel: () => {
					this.webhookOn = true
				},
			})
		},

		// The switch goes back to what the server has when it refuses.
		async saveWebhook(body) {
			if (!await this.run('webhook', () => this.$api.gitApps.update(this.appId, body).then(appOf)))
				this.webhookOn = Boolean(this.webhook.enabled)
		},

		confirmRegenerate() {
			this.$buefy.dialog.confirm({
				title: this.$t('Regenerate the secret'),
				message: this.$t('The forge is refused from this moment until it is given the new secret.'),
				confirmText: this.$t('Regenerate'),
				cancelText: this.$t('Cancel'),
				type: 'is-warning',
				onConfirm: () => this.run('secret', () => this.$api.gitApps.update(this.appId, { regenerate_webhook_secret: true }).then(appOf)),
			})
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

.git-repo-tab__steps {
	list-style: decimal;
	padding-left: 1.5rem;
}
</style>
