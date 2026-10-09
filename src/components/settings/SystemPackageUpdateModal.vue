<template>
	<div class="modal-card system-package-update-modal">
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('System packages') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error.message }}
				<span v-if="error.detail" class="is-block is-size-7 mt-1">{{ error.detail }}</span>
			</b-message>

			<!-- a refused Docker update: the sentence comes from the code, the core's own words under it -->
			<b-message v-if="dockerRefusal" class="mb-3" size="is-small" type="is-warning">
				{{ dockerRefusalText(dockerRefusal.code, dockerRefusal.names) }}
				<span v-if="dockerRefusal.reason" class="is-block is-size-7 mt-1">{{ dockerRefusal.reason }}</span>
			</b-message>

			<!-- every value below is a text node: container names are third-party strings, never HTML -->
			<div v-if="dockerConfirming" class="docker-confirm">
				<h4 class="docker-title">{{ $t('Update Docker') }}</h4>
				<p class="mt-1">{{ $t('Docker') }} {{ dockerPlan.from }} → {{ dockerPlan.to }}</p>

				<b-message v-if="dockerPlan.major_jump" class="docker-major mt-3" size="is-small" type="is-danger">
					{{ $t('This is a new major version of Docker, from {from} to {to}. Apps that talk to Docker directly may need an update of their own, and not every setup has been tested with it.', { from: dockerPlan.from, to: dockerPlan.to }) }}
				</b-message>
				<b-message class="mt-3" size="is-small" type="is-warning">
					{{ $t('Updating Docker restarts it: every container stops until it is back. Apps set to restart start again by themselves, the others stay stopped. Do it when that suits you.') }}
				</b-message>

				<div class="docker-packages package-list mt-3">
					<table class="table is-fullwidth is-hoverable">
						<thead>
							<tr>
								<th>{{ $t('Name') }}</th>
								<th>{{ $t('Current version') }}</th>
								<th>{{ $t('New version') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="item in dockerPlan.packages" :key="item.name">
								<td>{{ item.name }}</td>
								<td>{{ item.current_version || '—' }}</td>
								<td>{{ item.candidate_version }}</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h5 class="docker-subtitle mt-4">{{ $t('Running containers') }}</h5>
				<div v-if="dockerContainers.loading" class="docker-containers-loading is-flex is-align-items-center _has-text-gray is-size-7">
					<b-icon class="mr-2" custom-class="mdi-spin" icon="loading" size="is-small" />
					<span>{{ $t('Listing the running containers...') }}</span>
				</div>
				<p v-else-if="dockerContainers.failed" class="is-size-7">
					{{ $t('The running containers could not be listed. You can still update.') }}
				</p>
				<p v-else-if="dockerContainers.list.length === 0" class="is-size-7">
					{{ $t('No container is running.') }}
				</p>
				<template v-else>
					<p v-if="dockerWontReturn.length" class="docker-wont-return-count is-size-7 has-text-warning-on-scheme">
						{{ dockerWontReturn.length === 1 ? $t('One running container will not start again by itself.') : $t('{n} running containers will not start again by themselves.', { n: dockerWontReturn.length }) }}
					</p>
					<p v-if="dockerExposed.length" class="docker-exposed mt-1 is-size-7 has-text-warning-on-scheme">
						{{ $t('Containers that publish port 53, 80 or 443, or use the host network: {names}. That may be this machine\'s DNS or web server, and it will be down while Docker restarts.', { names: dockerExposed.map(item => item.name).join(', ') }) }}
					</p>
					<div class="docker-containers package-list mt-2">
						<table class="table is-fullwidth is-hoverable">
							<thead>
								<tr>
									<th>{{ $t('Container') }}</th>
									<th>{{ $t('Restart Policy') }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="item in dockerContainerRows" :key="item.name" :class="{ 'docker-wont-return': !restartsByItself(item.restart_policy) }">
									<td>{{ item.name }}</td>
									<td>
										{{ item.restart_policy || 'no' }}
										<span v-if="!restartsByItself(item.restart_policy)" class="is-block">{{ $t('Stays stopped') }}</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</template>
			</div>

			<template v-else>
				<div v-if="dockerShowsJob" class="docker-job mb-4" role="status">
					<h4 class="docker-title">{{ $t('Docker update') }}</h4>

					<template v-if="dockerRunning">
						<p class="has-text-info-on-scheme">
							{{ $t(dockerFinalizing ? 'Finishing the Docker update...' : 'Updating Docker... apps are restarting') }}
						</p>
						<p v-if="dockerStatus.from && dockerStatus.to" class="is-size-7 _has-text-gray">{{ dockerStatus.from }} → {{ dockerStatus.to }}</p>
						<p v-if="dockerUnknown" class="docker-unknown mt-1 is-size-7 has-text-danger-on-scheme">{{ $t('Status unknown, reopen this window.') }}</p>
						<p v-else-if="dockerLost" class="docker-lost mt-1 is-size-7 has-text-warning-on-scheme">{{ $t('Connection lost, retrying...') }}</p>
					</template>

					<template v-else>
						<template v-if="dockerRestartPending">
							<p class="has-text-warning-on-scheme">{{ $t('Docker is updated, but the old version is still running. Restart it to finish the update.') }}</p>
							<p class="mt-1 is-size-7">{{ $t('Restarting Docker stops every container until it is back.') }}</p>
							<p class="mt-2 is-size-7">{{ $t('In a terminal on this machine:') }}</p>
							<pre class="docker-command" tabindex="0" :aria-label="$t('Command to restart Docker')">{{ restartCommand }}</pre>
						</template>
						<p v-else-if="dockerStatus.state === 'succeeded'" class="has-text-success-on-scheme">
							{{ dockerStatus.to ? $t('Docker was updated to {version}.', { version: dockerStatus.to }) : $t('Docker was updated.') }}
						</p>
						<template v-else-if="dockerStatus.state === 'failed'">
							<p class="has-text-danger-on-scheme">{{ $t('The Docker update failed.') }}</p>
							<p v-if="dockerFailureText" class="mt-1 is-size-7">{{ dockerFailureText }}</p>
							<p v-else-if="dockerStatus.error" class="mt-1 is-size-7 _has-text-gray">{{ dockerStatus.error }}</p>
							<template v-if="dockerStatus.rollback_command && !dockerNothingChanged">
								<p class="mt-2 is-size-7">{{ $t('To put the previous version back, run this in a terminal on this machine.') }}</p>
								<pre class="docker-command" tabindex="0" :aria-label="$t('Command to put the previous Docker version back')">{{ dockerStatus.rollback_command }}</pre>
								<p class="mt-1 is-size-7 _has-text-gray">{{ $t('This has not been tested after a major version change.') }}</p>
							</template>
						</template>

						<div v-if="dockerNotReturned.length" class="docker-not-returned mt-3">
							<p class="is-size-7 has-text-warning-on-scheme">
								{{ dockerNotReturned.length === 1 ? $t('One container did not come back.') : $t('{n} containers did not come back.', { n: dockerNotReturned.length }) }}
							</p>
							<div class="package-list mt-2">
								<table class="table is-fullwidth is-hoverable">
									<thead>
										<tr>
											<th>{{ $t('Container') }}</th>
											<th>{{ $t('Restart Policy') }}</th>
										</tr>
									</thead>
									<tbody>
										<tr v-for="item in dockerNotReturned" :key="item.name">
											<td>{{ item.name }}</td>
											<td>{{ item.restart_policy || 'no' }}</td>
										</tr>
									</tbody>
								</table>
							</div>
							<p v-if="dockerNotReturned.some(item => !restartsByItself(item.restart_policy))" class="mt-2 is-size-7">
								{{ $t('A container with no restart policy never starts again by itself: start it from the dashboard.') }}
							</p>
							<p v-if="dockerNotReturned.some(item => restartsByItself(item.restart_policy))" class="mt-2 is-size-7">
								{{ $t('A container with a restart policy was not running yet when the update ended. Give it a moment, then check it from the dashboard.') }}
							</p>
						</div>

						<p v-if="dockerFinishedAt" class="mt-2 is-size-7 _has-text-gray">{{ $t('Finished {date}', { date: dockerFinishedAt }) }}</p>
					</template>

					<div v-if="dockerShowsLog" class="package-log mt-3">
						<pre>{{ dockerStatus.log }}</pre>
					</div>

					<b-button v-if="dockerTerminal" class="mt-3" rounded size="is-small" @click="dismissDockerResult">
						{{ $t('Dismiss') }}
					</b-button>
				</div>

				<div v-if="isChecking" class="package-loading is-flex is-align-items-center is-justify-content-center _has-text-gray">
					<b-icon class="mr-2" custom-class="mdi-spin" custom-size="is-size-5" icon="loading" size="is-20" />
					<span>{{ $t('Checking for system package updates...') }}</span>
				</div>

				<div v-if="!isChecking && info.supported === false" class="package-empty">
					<p>{{ $t('System package updates are not supported on this host.') }}</p>
					<p v-if="info.reason" class="is-size-7 _has-text-gray mt-1">{{ info.reason }}</p>
				</div>

				<template v-if="!isChecking && info.supported !== false">
					<b-message v-if="status.reboot_required" class="mb-3" size="is-small" type="is-warning">
						{{ $t('A reboot is required to finish applying these updates. Use the existing Restart action when convenient.') }}
					</b-message>

					<div v-if="info.count === 0 && !isRunning && !dockerRunning && status.state === 'idle' && !error" class="package-empty">
						{{ $t(dockerHasUpdates ? 'No other system package updates are available.' : 'No system package updates are available.') }}
					</div>

					<div v-else-if="info.count > 0" class="package-summary">
						<p class="mb-3">
							<strong>{{ info.count }}</strong> {{ $t('updates available') }}
						</p>
						<div class="package-list">
							<table class="table is-fullwidth is-hoverable">
								<thead>
									<tr>
										<th>{{ $t('Name') }}</th>
										<th>{{ $t('Current version') }}</th>
										<th>{{ $t('New version') }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="item in info.updates" :key="item.name">
										<td>{{ item.name }}</td>
										<td>{{ item.current_version || '—' }}</td>
										<td>{{ item.candidate_version }}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div v-if="info.docker" class="docker-line mt-4">
						<h4 class="docker-title">
							{{ $t('Docker') }}
							<span v-if="info.docker.version" class="ml-1 _has-text-gray">{{ info.docker.version }}</span>
						</h4>
						<p class="is-size-7 _has-text-gray">{{ dockerOrigin }}</p>
						<template v-if="dockerHasUpdates">
							<p class="mt-2 is-size-7">{{ $t('Docker has updates. This update leaves it alone.') }}</p>
							<ul class="docker-updates is-size-7 _has-text-gray">
								<li v-for="item in info.docker.updates" :key="item.name">
									{{ item.name }} {{ item.current_version || '—' }} → {{ item.candidate_version }}
								</li>
							</ul>
							<p v-if="info.docker.restarts_docker" class="mt-2 is-size-7">
								{{ $t('Updating Docker restarts it: every container stops until it is back. Apps set to restart start again by themselves, the others stay stopped. Do it when that suits you.') }}
							</p>
						</template>
						<p v-else-if="info.docker.candidate" class="mt-2 is-size-7">{{ dockerBehind }}</p>
						<p v-else-if="dockerCanSeeUpdates" class="is-size-7">{{ $t('No newer Docker is offered by this machine\'s package sources.') }}</p>
						<p v-else class="is-size-7">{{ dockerUnseen }}</p>
						<template v-if="!dockerRunning">
							<b-button v-if="dockerUpdate && dockerUpdate.available" class="docker-update-button mt-2" :disabled="isRunning" rounded size="is-small" type="is-primary" @click="openDockerConfirm">
								{{ $t('Update Docker') }}
							</b-button>
							<p v-else-if="dockerUpdate && dockerUpdate.refusal" class="docker-refusal mt-2 is-size-7">
								{{ dockerRefusalText(dockerUpdate.refusal, dockerUpdate.refusal_detail) }}
							</p>
						</template>
						<template v-if="!dockerRunning && info.docker.manual_command && (dockerHasUpdates || info.docker.candidate || !dockerCanSeeUpdates)">
							<p class="mt-2 is-size-7">{{ $t('In a terminal on this machine:') }}</p>
							<pre class="docker-command" tabindex="0" :aria-label="$t('Command to update Docker')">{{ info.docker.manual_command }}</pre>
						</template>
						<p v-else-if="dockerHasUpdates && !dockerRunning" class="mt-2 is-size-7">{{ $t('ReCasaOS does not know how Docker was installed here, so it shows no command.') }}</p>
					</div>

					<div v-if="isRunning" class="mt-4">
						<p class="has-text-info-on-scheme">
							{{ $t(isReconciliationPending ? 'Finishing system package update...' : 'Applying system package updates...') }}
						</p>
					</div>
					<div v-else-if="status.state === 'succeeded'" class="mt-4 has-text-success-on-scheme">
						{{ $t('System package update completed.') }}
					</div>
					<div v-else-if="status.state === 'failed'" class="mt-4 has-text-danger-on-scheme">
						{{ $t('System package update failed.') }}
					</div>
					<p v-if="status.error && !isReconciliationPending && status.error !== error?.detail" class="mt-1 is-size-7 _has-text-gray">
						{{ status.error }}
					</p>

					<div v-if="status.log" class="package-log mt-4">
						<pre>{{ status.log }}</pre>
					</div>
				</template>
			</template>
		</section>

		<footer v-if="dockerConfirming" class="modal-card-foot is-justify-content-flex-end">
			<b-button :disabled="dockerStarting" rounded @click="closeDockerConfirm">
				{{ $t('Cancel') }}
			</b-button>
			<b-button class="docker-confirm-button" :disabled="dockerContainers.loading" :loading="dockerStarting" rounded type="is-primary" @click="startDockerUpdate">
				{{ $t('Update Docker to {version}', { version: dockerPlan.to }) }}
			</b-button>
		</footer>
		<!-- empty while apt runs or on a host without it: × and Escape still close -->
		<footer v-else-if="!isRunning && !dockerRunning && info.supported !== false" class="modal-card-foot is-justify-content-flex-end">
			<b-button :loading="isChecking" rounded @click="checkPackages">
				{{ $t('Check for updates') }}
			</b-button>
			<b-button v-if="hasUpdates && status.state !== 'succeeded'" rounded type="is-primary" @click="confirmUpdate">
				{{ $t('Update packages') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
const DOCKER_POLL_MS = 2000
// the status route has not answered for this long: it is called unknown, not "still running"
const DOCKER_LOST_MS = 10 * 60 * 1000
// host ports a box's DNS and web server sit on
const DOCKER_HOST_PORTS = [53, 80, 443]
const DOCKER_RESTART_COMMAND = 'sudo systemctl restart docker'

// What a refusal means, by the code the core sends (never by its English words). The ones that
// follow the static codes of `docker.update.refusal` come back from the start as well, as a 409.
const DOCKER_REFUSALS = {
	unsupported: 'This machine cannot update Docker from here.',
	origin: 'ReCasaOS only updates a Docker installed from Docker\'s own repository, and this one was not.',
	held: 'The Docker packages are on hold, and a hold is deliberate: ReCasaOS does not override it. To update anyway, use the command below.',
	daemon: 'ReCasaOS cannot reach Docker right now, so it will not update it. Check that Docker is running.',
	swarm: 'This machine is part of a Docker swarm, which ReCasaOS does not update.',
	plan: 'The update would change more than Docker\'s own packages, or could not be planned, so ReCasaOS will not run it.',
	disk: 'There is less than 1 GiB of free disk space where the update needs it, so ReCasaOS will not start it. Free some space and check again.',
	running: 'An update is already running on this machine.',
	maintenance: 'Another update or package operation is running on this machine. Try again when it is done.',
	apps: 'Some apps are busy right now, or ReCasaOS could not check. Try again in a few minutes.',
	changed: 'A newer Docker appeared since this window was opened. Look at the new versions and confirm again.',
	nothing: 'Docker has nothing to update.',
}
const DOCKER_REFUSAL_NAMES = {
	plan: 'Packages concerned: {names}.',
	apps: 'Busy apps: {names}.',
}
const DOCKER_FAILURES = {
	guard: 'The last check before the update failed, so nothing was changed.',
	plan: 'The update would have changed more than Docker\'s own packages, so it was stopped before anything changed.',
	download: 'The new packages could not be downloaded, so nothing was changed. Check the internet connection and the free disk space, then try again.',
	install: 'The new packages could not be installed. Docker may be half updated: read the log below.',
	daemon: 'The new packages were installed, but Docker did not start again, so every container is stopped. Read the log below.',
	no_result: 'The update stopped without reporting a result. Read the log below and check Docker before trying again.',
}
// a failure that stops before the install changed nothing, and a way back would mean nothing
const DOCKER_NOTHING_CHANGED = ['guard', 'plan', 'download']
// refused for a while, not for what is on screen: a new check (apt-get update) would answer nothing
const DOCKER_TRANSIENT = ['maintenance', 'apps']

function pick(table, code) {
	return Object.prototype.hasOwnProperty.call(table, code) ? table[code] : ''
}

function cleanNames(list) {
	return Array.isArray(list) ? list.filter(name => typeof name === 'string' && name).slice(0, 20) : []
}

function emptyInfo() {
	return {
		supported: null,
		manager: '',
		reason: '',
		updates: [],
		count: 0,
	}
}

function emptyStatus() {
	return {
		supported: null,
		manager: '',
		state: 'idle',
		log: '',
		error: '',
		reboot_required: false,
	}
}

function emptyDockerStatus() {
	return {
		supported: null,
		state: 'idle',
		outcome: '',
		error: '',
		error_code: '',
		exit_code: null,
		started_at: '',
		completed_at: '',
		from: '',
		to: '',
		not_returned: [],
		rollback_command: '',
		log: '',
	}
}

function emptyContainers() {
	return { loading: false, failed: false, list: [] }
}

// no policy and "no" are the same thing: Docker does not start the container again
function restartsByItself(policy) {
	return !!policy && policy !== 'no'
}

export default {
	name: 'SystemPackageUpdateModal',
	data() {
		return {
			info: emptyInfo(),
			status: emptyStatus(),
			isChecking: false,
			isStarting: false,
			error: null,
			pollTimer: null,
			// The Docker update has a state of its own: the generic one above is never shared with it.
			dockerStatus: emptyDockerStatus(),
			dockerPlan: null,
			dockerConfirming: false,
			dockerStarting: false,
			dockerRefusal: null,
			dockerContainers: emptyContainers(),
			dockerContainersSeq: 0,
			dockerPollTimer: null,
			dockerPollActive: false,
			dockerPollBusy: false,
			dockerLost: false,
			dockerLostSince: 0,
			dockerUnknown: false,
		}
	},
	computed: {
		isRunning() {
			return this.isStarting || this.status.state === 'running' || this.isReconciliationPending
		},
		isReconciliationPending() {
			return this.status.state === 'finalizing' || (
				this.status.state === 'failed'
				&& this.status.error === 'The package update stopped before it reported a result.'
				&& !this.status.exit_code
				&& !this.status.completed_at
			)
		},
		hasUpdates() {
			return Array.isArray(this.info.updates) && this.info.updates.length > 0
		},
		dockerHasUpdates() {
			return Array.isArray(this.info.docker?.updates) && this.info.docker.updates.length > 0
		},
		// apt tells of an update for Docker's own repository and for the distribution's package;
		// of a snap, or of a Docker whose source it does not know, it tells nothing, and "up to
		// date" would be a claim nobody checked
		dockerCanSeeUpdates() {
			return ['docker-repository', 'distribution'].includes(this.info.docker?.origin)
		},
		dockerOrigin() {
			const docker = this.info.docker
			if (!docker?.installed) {
				return this.$t('Docker is not installed from a package here.')
			}
			const words = {
				'docker-repository': 'Installed from Docker\'s own repository.',
				'distribution': 'Installed from your distribution\'s docker.io package.',
				'snap': 'Installed as a snap.',
			}
			return this.$t(words[docker.origin] || 'Installed from a source ReCasaOS does not recognise.')
		},
		// a newer engine exists in the package sources and the update does not offer it
		dockerBehind() {
			const version = this.info.docker?.candidate
			return this.$t(this.info.docker?.held
				? 'A newer Docker, {version}, exists in this machine\'s package sources, but the package is on hold, so no update offers it.'
				: 'A newer Docker, {version}, exists in this machine\'s package sources, but apt does not offer it for an update (a hold, or a dependency).', { version })
		},
		dockerUnseen() {
			return this.$t(this.info.docker?.origin === 'snap'
				? 'ReCasaOS cannot see updates of a snap. Update it with the command below.'
				: 'This machine\'s package sources offer no update for it, and ReCasaOS cannot tell more.')
		},
		// what the packages check says of updating Docker from here; absent on a core without the button
		dockerUpdate() {
			return this.info.docker?.update || null
		},
		dockerRunning() {
			return this.dockerStarting || this.dockerStatus.state === 'running' || this.dockerStatus.state === 'finalizing'
		},
		dockerFinalizing() {
			return this.dockerStatus.state === 'finalizing'
		},
		dockerTerminal() {
			return this.dockerStatus.state === 'succeeded' || this.dockerStatus.state === 'failed'
		},
		dockerRestartPending() {
			return this.dockerStatus.state === 'succeeded' && this.dockerStatus.outcome === 'restart_pending'
		},
		dockerShowsJob() {
			return this.dockerRunning || this.dockerTerminal
		},
		// a clean success needs no log; everything else may
		dockerShowsLog() {
			return !!this.dockerStatus.log && !(this.dockerStatus.state === 'succeeded' && !this.dockerRestartPending)
		},
		dockerNothingChanged() {
			return DOCKER_NOTHING_CHANGED.includes(this.dockerStatus.error_code)
		},
		dockerFailureText() {
			const key = pick(DOCKER_FAILURES, this.dockerStatus.error_code)
			return key ? this.$t(key) : ''
		},
		dockerFinishedAt() {
			const at = this.dockerStatus.completed_at
			const date = at ? new Date(at) : null
			return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : ''
		},
		dockerNotReturned() {
			const list = this.dockerStatus.not_returned
			return Array.isArray(list) ? list.filter(item => item && typeof item.name === 'string') : []
		},
		dockerWontReturn() {
			return this.dockerContainers.list.filter(item => !restartsByItself(item.restart_policy))
		},
		// the ones that will not come back first: they are what the person has to read
		dockerContainerRows() {
			return [...this.dockerWontReturn, ...this.dockerContainers.list.filter(item => restartsByItself(item.restart_policy))]
		},
		dockerExposed() {
			return this.dockerContainers.list.filter(item => item.host_network === true
				|| (Array.isArray(item.ports) && item.ports.some((port) => {
					const hostPort = port && port.host_port != null ? port.host_port : port?.port
					return DOCKER_HOST_PORTS.includes(Number(hostPort))
				})))
		},
		restartCommand() {
			return DOCKER_RESTART_COMMAND
		},
	},
	mounted() {
		this.loadInitialState()
	},
	beforeUnmount() {
		this.stopPolling()
		this.stopDockerPolling()
	},
	methods: {
		restartsByItself,
		async loadInitialState() {
			try {
				const response = await this.$api.sys.getSystemPackageUpdateStatus()
				const status = response.data.data
				if (status) {
					this.status = status
					if (this.isRunning) {
						this.startPolling()
						return
					}
				}
			} catch {
				// The package check below provides the useful error message.
			}
			try {
				const response = await this.$api.sys.getDockerUpdateStatus()
				const status = response.data.data
				if (status) {
					this.dockerStatus = { ...emptyDockerStatus(), ...status }
					if (this.dockerRunning) {
						// apt is busy with it: a package check now would only wait behind it
						this.startDockerPolling()
						return
					}
				}
			} catch {
				// A core older than the Docker update has no such route; the check below says what matters.
			}
			this.checkPackages(true)
		},
		async checkPackages(preserveStatus = false) {
			this.stopPolling()
			this.isChecking = true
			this.error = null
			if (preserveStatus !== true) {
				this.status = emptyStatus()
				this.dockerRefusal = null
			}
			try {
				const response = await this.$api.sys.getSystemPackages()
				this.info = response.data.data || emptyInfo()
			} catch (error) {
				this.info = emptyInfo()
				this.fail('Could not check for system package updates.', error)
			} finally {
				this.isChecking = false
			}
		},
		confirmUpdate() {
			if (this.dockerRunning) {
				return
			}
			this.$buefy.dialog.confirm({
				title: this.$t('Update system packages'),
				message: `${this.$t(this.info.docker ? 'Are you sure you want to update the system packages listed? Docker is not part of this update.' : 'Are you sure you want to update the system packages listed?')}<br><br>${this.$t('The package list may change before the update starts.')}`,
				type: 'is-warning',
				hasIcon: true,
				confirmText: this.$t('Update packages'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.startUpdate(),
			})
		},
		async startUpdate() {
			if (this.dockerRunning) {
				return
			}
			this.isStarting = true
			this.error = null
			try {
				const response = await this.$api.sys.startSystemPackageUpdate()
				this.status = response.data.data || emptyStatus()
				this.startPolling()
			} catch (error) {
				if (error?.response?.data?.data) {
					this.status = error.response.data.data
					if (this.status.state === 'running' || this.isReconciliationPending) {
						this.startPolling()
					}
				}
				this.fail('Could not start the system package update.', error)
				// refused (409) for a reason other than "already running": what was on screen may no longer be so
				if (error?.response?.status === 409 && this.status.state !== 'running' && !this.isReconciliationPending) {
					this.checkPackages(true)
				}
			} finally {
				this.isStarting = false
			}
		},
		startPolling() {
			this.stopPolling()
			this.fetchStatus()
			this.pollTimer = setInterval(() => this.fetchStatus(), 1000)
		},
		stopPolling() {
			if (this.pollTimer) {
				clearInterval(this.pollTimer)
				this.pollTimer = null
			}
		},
		async fetchStatus() {
			try {
				const response = await this.$api.sys.getSystemPackageUpdateStatus()
				this.status = response.data.data || emptyStatus()
				if (!this.isRunning) {
					this.stopPolling()
				}
			} catch (error) {
				this.fail('Could not load the system package update status.', error)
				this.stopPolling()
			}
		},
		// The confirmation is a view of this window: container names are third-party strings and
		// Buefy's dialog would render its message as HTML. What is shown is the plan the person is
		// confirming, copied here, so a check that lands meanwhile cannot change it under them.
		openDockerConfirm() {
			if (!this.dockerUpdate?.available || this.isRunning || this.dockerRunning) {
				return
			}
			this.dockerRefusal = null
			this.error = null
			this.dockerPlan = JSON.parse(JSON.stringify(this.dockerUpdate))
			this.dockerConfirming = true
			this.loadDockerContainers()
		},
		closeDockerConfirm() {
			if (this.dockerStarting) {
				return
			}
			this.dockerConfirming = false
			this.dockerContainersSeq++
		},
		async loadDockerContainers() {
			const seq = ++this.dockerContainersSeq
			this.dockerContainers = { loading: true, failed: false, list: [] }
			let next
			try {
				const data = (await this.$api.sys.getDockerContainers()).data.data
				if (!data || data.running === false || !Array.isArray(data.containers)) {
					throw new Error('Docker did not list its containers')
				}
				next = { loading: false, failed: false, list: data.containers.filter(item => item && typeof item.name === 'string') }
			} catch {
				// not being able to list them must not stand in the way of the update
				next = { loading: false, failed: true, list: [] }
			}
			if (seq === this.dockerContainersSeq) {
				this.dockerContainers = next
			}
		},
		async startDockerUpdate() {
			if (this.isRunning || this.dockerRunning || !this.dockerPlan?.plan_id) {
				return
			}
			this.dockerStarting = true
			this.dockerRefusal = null
			this.error = null
			try {
				const response = await this.$api.sys.startDockerUpdate({ plan_id: this.dockerPlan.plan_id })
				this.dockerStatus = { ...emptyDockerStatus(), ...response.data.data }
				this.dockerConfirming = false
				this.startDockerPolling()
			} catch (error) {
				const data = error?.response?.data?.data
				const code = typeof data?.error_code === 'string' ? data.error_code : ''
				const refused = error?.response && (code || [409, 501].includes(error.response.status))
				this.dockerConfirming = false
				if (!refused) {
					this.fail('Could not start the Docker update.', error)
					return
				}
				// the core's reason travels in the data because the check below clears `error`
				const reason = typeof data?.error === 'string' ? data.error : error.response.data?.message
				this.dockerRefusal = { code, reason: typeof reason === 'string' ? reason : '', names: cleanNames(data?.refusal_detail) }
				if (code === 'running') {
					this.dockerStarting = false
					await this.loadInitialState()
					// the job it ran into is on screen now, and says more than the refusal
					if (this.isRunning || this.dockerRunning) {
						this.dockerRefusal = null
					}
				} else if (error.response.status !== 501 && !DOCKER_TRANSIENT.includes(code)) {
					// what was on screen (the plan, the buttons) may no longer be so
					this.checkPackages(true)
				}
			} finally {
				this.dockerStarting = false
			}
		},
		// A setTimeout chain, not an interval: one request at a time, and it goes on after an error
		// (the gateway can blink while Docker restarts). Only a terminal state, or ten minutes
		// without an answer, ends it.
		startDockerPolling() {
			this.dockerPollActive = true
			this.dockerLostSince = 0
			clearTimeout(this.dockerPollTimer)
			this.pollDocker()
		},
		stopDockerPolling() {
			this.dockerPollActive = false
			clearTimeout(this.dockerPollTimer)
			this.dockerPollTimer = null
		},
		scheduleDockerPoll() {
			clearTimeout(this.dockerPollTimer)
			this.dockerPollTimer = setTimeout(() => this.pollDocker(), DOCKER_POLL_MS)
		},
		async pollDocker() {
			if (this.dockerPollBusy) {
				return
			}
			this.dockerPollBusy = true
			let status = null
			try {
				status = (await this.$api.sys.getDockerUpdateStatus()).data.data || null
			} catch {
				status = null
			}
			this.dockerPollBusy = false
			if (!this.dockerPollActive) {
				return
			}
			if (status) {
				this.dockerStatus = { ...emptyDockerStatus(), ...status }
				this.dockerLost = false
				this.dockerLostSince = 0
				this.dockerUnknown = false
				if (this.dockerRunning) {
					this.scheduleDockerPoll()
					return
				}
				this.stopDockerPolling()
				this.dockerRefusal = null
				// the new version shows without anyone pressing "Check for updates"
				this.checkPackages(true)
				return
			}
			const now = Date.now()
			if (!this.dockerLostSince) {
				this.dockerLostSince = now
			}
			this.dockerLost = true
			if (now - this.dockerLostSince >= DOCKER_LOST_MS) {
				this.dockerUnknown = true
				this.stopDockerPolling()
				return
			}
			this.scheduleDockerPoll()
		},
		dismissDockerResult() {
			this.dockerStatus = emptyDockerStatus()
		},
		dockerRefusalText(code, names) {
			const sentence = this.$t(pick(DOCKER_REFUSALS, code) || 'ReCasaOS did not update Docker.')
			const list = cleanNames(names)
			const extra = list.length && pick(DOCKER_REFUSAL_NAMES, code)
			return extra ? `${sentence} ${this.$t(extra, { names: list.join(', ') })}` : sentence
		},
		// A translated sentence first; the core's own words, when it sent some, as the detail.
		// axios's "Request failed with status code 500" is never shown.
		fail(message, error) {
			const detail = error?.response?.data?.message || error?.response?.data?.data
			this.error = { message: this.$t(message), detail: typeof detail === 'string' ? detail : '' }
		},
	},
}
</script>

<style lang="scss" scoped>
.package-loading {
	min-height: 8rem;
}

.package-empty {
	padding: 2rem 1rem;
	text-align: center;
}

.package-list {
	max-height: 18rem;
	overflow-y: auto;
	font-size: 0.75rem;

	table {
		margin-bottom: 0;
	}

	th,
	td {
		padding: 0.35rem 0.5rem;
		line-height: 1.35;
	}
}

// a long name or version wraps inside its cell, and a table that is still too wide scrolls inside its box
.docker-confirm .package-list,
.docker-job .package-list {
	overflow-x: auto;

	td {
		overflow-wrap: anywhere;
	}
}

.docker-wont-return td {
	background: rgba(255, 159, 10, 0.18);
	font-weight: 600;
}

.docker-subtitle {
	font-weight: 600;
}

.docker-line {
	padding-top: 1rem;
	border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.docker-title {
	font-weight: 600;
}

.docker-updates {
	margin: 0.25rem 0 0 1rem;
	list-style: disc;
}

.docker-command {
	margin: 0.25rem 0 0;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	background: rgba(128, 128, 128, 0.12);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	user-select: all;
	font-size: 0.75rem;
}

.package-log {
	max-height: 14rem;
	overflow: auto;

	pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.75rem;
	}
}
</style>
