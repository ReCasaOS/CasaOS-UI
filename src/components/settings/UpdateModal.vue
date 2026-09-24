<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('Update') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<div ref="log" class="node-card fixed-height">
				<div v-if="!isUpdating && !logOnly" v-dompurify-html="markdownToHtml" class="update-info-container  is-size-14px"></div>
				<pre v-else class="update-log is-size-14px">{{ updateLogText }}</pre>
			</div>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer v-if="!logOnly" class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Upgrade Now')" :loading="isUpdating" expaned rounded type="is-primary"
					@click="updateSystem" />
			</div>
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import { marked } from 'marked'

export default {
	props: {
		changeLog: {
			type: String,
			default: '',
		},
		// The last update's log, read once, and no Upgrade Now: "See the log" on a
		// paused automatic update opens this.
		logOnly: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			timer: 0,
			updateTimer: 0,
			reloading: false,
			isUpdating: false,
			markdown: ``,
			updateLogs: ``,
		}
	},
	mounted() {
		if (this.logOnly) {
			this.$api.file.getContent(`/var/log/casaos/upgrade.log`).then((res) => {
				this.updateLogs = res.data.data
			}).catch(() => {})
		}
	},
	// This modal is opened programmatically, outside the router view, so closing it
	// unmounts the component while its two intervals go on running. The log poll
	// then outlives the dialog by however long the update takes -- and its success
	// branch calls reloadWhenBackendIsBack, which DELETES the session. The restart
	// rotates the token keys, so that poll 401s, the interceptor bounces the browser
	// to /login, the owner signs in -- and the poll, still running, finally gets its
	// success line with the NEW token and clears the session it never knew about.
	// That is the second login. The sibling dialog has had this hook all along.
	beforeUnmount() {
		clearInterval(this.updateTimer)
		clearInterval(this.timer)
	},
	computed: {
		markdownToHtml() {
			return marked.parse(this.changeLog)
		},
		updateLogText() {
			// The installer writes plain text; drop the colour codes a sub-command may leave behind.
			// eslint-disable-next-line no-control-regex -- strips ANSI colour codes from the update log
			return this.updateLogs.replace(/\u001B\[[0-9;]*m/g, '')
		},
	},
	watch: {
		updateLogs() {
			this.$nextTick(() => {
				const log = this.$refs.log
				if (log)
					log.scrollTop = log.scrollHeight
			})
		},
	},
	methods: {
		/**
		 * @description: Update System Version and check update state
		 * @return {*} void
		 */
		async updateSystem() {
			this.isUpdating = true
			await this.$api.sys.updateCasaOS()
			// this.checkUpdateState();
			this.getUpdateLogs()
		},

		/**
		 * @description: Get update logs
		 * @return {*} void
		 */
		getUpdateLogs() {
			this.updateTimer = setInterval(() => {
				this.$api.file.getContent(`/var/log/casaos/upgrade.log`).then((res) => {
					this.updateLogs = res.data.data
					if (this.updateLogs.includes(`CasaOS upgrade successfully`)) {
						clearInterval(this.updateTimer)
						// responses still in flight carry the same line: reload once
						if (this.reloading)
							return
						this.reloading = true
						localStorage.setItem('is_update', 'true')
						this.reloadWhenBackendIsBack()
					} else if (this.updateLogs.includes(`CasaOS upgrade failed`)) {
						this.$buefy.toast.open({
							message: this.$t(`There seems to be a problem with the upgrade process, please try again!`),
							type: 'is-danger',
						})
						clearInterval(this.updateTimer)
						setTimeout(() => {
							this.isUpdating = false
						}, 1000)
					}
				}).catch(() => {}) // the services restart mid-update; the log comes back with them
			}, 200)
		},
		/**
		 * The upgrade restarts every service and rotates the token keys, so the session
		 * that started it is over either way. The page reloads - into the UI just
		 * installed - once the backend answers, or after two minutes regardless. Each
		 * probe is given three seconds: a probe left pending by a restarting service
		 * must not hold the reload.
		 *
		 * It does NOT clear the session, and that is the point. The tokens are already
		 * dead, so clearing them changes nothing in the case this was written for -- the
		 * first request after the reload 401s and the interceptor lands on the login page
		 * anyway. What it did change was the case nobody meant: this runs from an interval
		 * that used to outlive the dialog, so it could fire AFTER the owner had signed in
		 * again, and then it deleted a session that was alive. The unmount hook below stops
		 * that interval, but only in the dashboard doing the reloading -- and the dashboard
		 * doing the reloading is the OLD one, the version being replaced. Not clearing is
		 * what makes this safe no matter which version drove the upgrade.
		 */
		reloadWhenBackendIsBack() {
			const deadline = Date.now() + 120000
			const probe = () => Promise.race([
				this.$api.users.getUserStatus(),
				new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), 3000)),
			])
			const poll = () => probe()
				.then(() => location.reload())
				.catch(() => {
					if (Date.now() < deadline)
						setTimeout(poll, 1000)
					else
						location.reload()
				})
			setTimeout(poll, 1000)
		},
		/**
		 * @description: check update state if is_need is false then reload page
		 * @return {*} void
		 */
		checkUpdateState() {
			this.timer = setInterval(() => {
				this.$api.sys.getVersion().then((res) => {
					if (res.data.success == 200) {
						if (!res.data.data.is_need) {
							clearInterval(this.timer)
							location.reload()
						}
					}
				})
			}, 3000)
		},
	},
}
</script>

<style lang="scss">
.fixed-height {
	max-height: 20rem;
	overflow-y: auto;
}

.update-log {
	min-height: 20rem;
	padding: 0;
	background: transparent;
	color: inherit;
	line-height: 1.5rem;
	white-space: pre-wrap;
	word-break: break-all;
}

.update-info-container {
	line-height: 1.5rem;
	border-radius: 4px;
	overflow: hidden;
	min-height: 20rem;

	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		font-weight: bold;
		margin-bottom: 0.4rem;
	}

	h1 {
		font-size: 2em;
	}

	h2 {
		font-size: 1.5em;
	}

	h3 {
		font-size: 1.17em;
	}

	h4 {
		font-size: 1em;
	}

	h5 {
		font-size: 0.83em;
	}

	h6 {
		font-size: 0.67em;
	}

	ul {
		margin-bottom: 0.5em;

		li {
			list-style: disc;
			margin-left: 1rem;
		}
	}
}
</style>
