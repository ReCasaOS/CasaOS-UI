<template>
	<div class="modal-card backup-destinations touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Backups') }}</h3>
		</header>
		<section class="modal-card-body">
			<b-tabs v-model="tab">
				<b-tab-item v-if="showRunning" value="running" :label="$t('Running')">
					<BackupRunning :running="running" @refresh="readRunning" />
				</b-tab-item>

				<b-tab-item value="destinations" :label="$t('Destinations')">
					<div class="is-flex is-align-items-center mb-2">
						<p class="settings-intro is-flex-grow-1 mr-2">
							{{ $t('Where backups are sent. Credentials are kept by rclone, alongside the cloud drives this box already mounts.') }}
						</p>
						<b-button :loading="isLoading" rounded size="is-small" @click="load">
							{{ $t('Refresh') }}
						</b-button>
					</div>

					<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">
						{{ error }}
					</b-message>

					<p v-if="!isLoading && !error && !destinations.length" class="_has-text-gray is-size-7 mb-4">
						{{ $t('No destination yet. Add one below.') }}
					</p>

					<!-- One card per destination: a tile, the name with a chip that says where it
						stands, what is known of it under, the two usual actions and a menu for the
						rest. The rclone error of a check is a paragraph: under the name, not beside
						the buttons, where it pushed them off a phone. -->
					<section v-for="name in destinations" :key="name" class="destination settings-card">
						<span class="_tile"><b-icon icon="cloud-upload-outline" /></span>
						<div class="_text">
							<div class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1">
								<p class="_name">{{ name }}</p>
								<span :class="`is-${stateOf(name).level}`" class="_chip">{{ stateOf(name).text }}</span>
							</div>
							<p v-if="checked[name]" class="_has-text-gray is-size-7">{{ checked[name] }}</p>
							<p v-if="restic[name] && restic[name].enabled" class="_has-text-gray is-size-7">{{ $t('Kept with restic') }}</p>
							<p v-if="restic[name] && restic[name].kept && !restic[name].enabled" class="_has-text-gray is-size-7">
								{{ $t('Switched back to rclone: the restic repository is still read') }}
							</p>
							<p v-if="restic[name] && restic[name].last_check" class="is-size-7"
								:class="restic[name].last_check.ok ? '_has-text-gray' : 'has-text-danger'">
								{{ resticCheckText(restic[name].last_check) }}
							</p>
						</div>

						<!-- ml-auto: on a line of their own, the buttons stay on the right; they wrap
							rather than run off a phone -->
						<div class="_actions is-flex is-flex-wrap-wrap is-gap-1 ml-auto">
							<b-button :loading="busy === `check:${name}`" rounded size="is-small" @click="check(name)">
								{{ $t('Check') }}
							</b-button>
							<b-button rounded size="is-small" @click="browse(name)">
								{{ $t('Restore\u2026') }}
							</b-button>
							<!-- the restic choices and Forget: rarer, and six pills in a row said nothing -->
							<b-dropdown aria-role="list" position="is-bottom-left">
								<template #trigger>
									<b-button :aria-label="$t('Other actions')" :loading="busy.endsWith(`:${name}`) && busy !== `check:${name}`"
										icon-left="dots-horizontal" rounded size="is-small" />
								</template>
								<b-dropdown-item v-if="restic[name] && restic[name].available && !restic[name].kept" aria-role="listitem"
									@click="confirmRestic(name)">
									{{ $t('Keep with restic\u2026') }}
								</b-dropdown-item>
								<b-dropdown-item v-if="restic[name] && restic[name].available && restic[name].kept && !restic[name].enabled" aria-role="listitem"
									@click="enableRestic(name, '')">
									{{ $t('Resume restic') }}
								</b-dropdown-item>
								<b-dropdown-item v-if="restic[name] && restic[name].kept" aria-role="listitem" @click="checkRestic(name)">
									{{ $t('Check repository') }}
								</b-dropdown-item>
								<b-dropdown-item v-if="restic[name] && restic[name].kept" aria-role="listitem" @click="readResticPassword(name)">
									{{ $t('Restic password') }}
								</b-dropdown-item>
								<b-dropdown-item v-if="restic[name] && restic[name].enabled" aria-role="listitem" @click="confirmSwitchBack(name)">
									{{ $t('Switch back to rclone\u2026') }}
								</b-dropdown-item>
								<b-dropdown-item separator />
								<b-dropdown-item aria-role="listitem" class="_danger" @click="confirmForget(name)">
									{{ $t('Forget this destination\u2026') }}
								</b-dropdown-item>
							</b-dropdown>
						</div>
					</section>

					<!-- The box itself: users, shares and their accounts, schedules, the
						destinations above. Restored from the destination browser like an app,
						under "This box". -->
					<section v-if="destinations.length" class="settings-card _row">
						<span class="_tile"><b-icon icon="home-outline" /></span>
						<div class="_text">
							<p class="_name">{{ $t('This box') }}</p>
							<p class="_has-text-gray is-size-7">{{ $t('Its users, its shares and their accounts, its schedules, these destinations.') }}</p>
							<details class="_what is-size-7">
								<summary>{{ $t('What is copied') }}</summary>
								<ul class="mt-1">
									<li v-for="part in systemParts" :key="part.path"><code>{{ part.path }}</code> {{ $t(part.what) }}</li>
								</ul>
								<p class="mt-1">{{ $t('Not copied: the apps and their data, the files in your folders, and the restic passwords (keep each one with its Restic password button). Back the apps up on their own, or schedule them with this box.') }}</p>
							</details>
						</div>
						<b-select v-model="systemDestination" size="is-small">
							<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
						</b-select>
						<b-button :disabled="!systemDestination" :loading="busy === 'system'" rounded size="is-small"
							@click="backupSystem">
							{{ $t('Back up now') }}
						</b-button>
					</section>

					<section class="settings-card _form">
						<div class="_head">
							<span class="_tile"><b-icon icon="plus" /></span>
							<div class="_text">
								<p class="_name">{{ $t('New destination') }}</p>
								<p class="_has-text-gray is-size-7">{{ $t('A name, a type, and the few options that type asks for.') }}</p>
							</div>
						</div>

						<div class="_grid">
							<b-field :label="$t('Name')" label-position="on-border">
								<b-input v-model="draft.name" placeholder="offsite" expanded size="is-small" />
							</b-field>

							<b-field :label="$t('Backend')" label-position="on-border">
								<b-select v-model="draft.backend" expanded size="is-small" @update:model-value="fillSuggestions">
									<option v-for="backend in backends" :key="backend.id" :value="backend.id">
										{{ backend.label }}
									</option>
								</b-select>
							</b-field>
						</div>

						<b-field :label="draft.backend === 's3' ? $t('Bucket') : $t('Folder (optional)')" label-position="on-border">
							<b-input v-model="draft.root" :placeholder="draft.backend === 's3' ? 'my-box-backups' : ''" expanded size="is-small" />
						</b-field>
						<p v-if="draft.backend === 's3'" class="_has-text-gray is-size-7">
							{{ $t('The bucket you made at your provider. Without one, each app is put in a bucket named after it, which most providers refuse because bucket names are shared by everyone.') }}
						</p>

						<div v-if="canSignIn(draft.backend)">
							<b-button :loading="busy === 'signin'" rounded size="is-small" type="is-info" @click="startSignIn">
								{{ $t('Sign in with {provider}', { provider: backendLabel(draft.backend) }) }}
							</b-button>
							<template v-if="signIn.url">
								<a :href="signIn.url" class="is-size-7 ml-2" rel="noopener noreferrer" target="_blank">{{ $t('Open the sign-in page again') }}</a>
								<p class="_has-text-gray is-size-7 mt-2 mb-1">
									{{ $t('When you are done, your browser shows a page that does not load (127.0.0.1:53682). That is expected: copy the whole address of that page from the address bar and paste it below.') }}
								</p>
								<div class="is-flex">
									<b-input v-model="signIn.redirected" :placeholder="$t('Address of the page that did not load')" autocomplete="off"
										class="mr-1" expanded size="is-small" />
									<b-button :disabled="!signIn.redirected" :loading="busy === 'signin-finish'" rounded size="is-small"
										type="is-primary" @click="finishSignIn">
										{{ $t('Finish sign-in') }}
									</b-button>
								</div>
							</template>
						</div>

						<p v-if="backendHelp(draft.backend)" class="_has-text-gray is-size-7">
							{{ $t(backendHelp(draft.backend)) }}
						</p>

						<div class="_section">
							<span class="_section-title">{{ $t('rclone options') }}</span>
							<span class="_has-text-gray is-size-7">{{ $t('These are rclone\'s own option names. Leave blank what you do not need; add a row for anything not listed.') }}</span>
						</div>

						<!-- The options the backend usually wants are fields named after rclone's own
							keys; a row added by hand takes its key too. new-password on anything typed
							as a password: otherwise the browser fills the dashboard's own login in, and
							it is sent to rclone -->
						<div class="_grid">
							<template v-for="(row, index) in draft.rows" :key="index">
								<b-field v-if="isSuggested(row)" :label="row.key" custom-class="_key" label-position="on-border">
									<b-input v-model="row.value" :autocomplete="isSecret(row.key) ? 'new-password' : undefined"
										:type="isSecret(row.key) ? 'password' : 'text'" expanded password-reveal size="is-small" />
								</b-field>
								<div v-else class="_custom">
									<b-input v-model="row.key" :placeholder="$t('Option')" class="_key" expanded size="is-small" />
									<b-input v-model="row.value" :autocomplete="isSecret(row.key) ? 'new-password' : undefined"
										:placeholder="$t('Value')" :type="isSecret(row.key) ? 'password' : 'text'"
										expanded password-reveal size="is-small" />
									<b-button :title="$t('Remove')" icon-left="close-outline" icon-pack="casa" rounded size="is-small"
										@click="draft.rows.splice(index, 1)" />
								</div>
							</template>
						</div>
						<b-button class="_add" size="is-small" type="is-text" @click="draft.rows.push({ key: '', value: '' })">
							{{ $t('Add an option rclone knows') }}
						</b-button>

						<!-- said here rather than in a dialog later: the password is kept by
						rclone and never comes back, and a destination without it is a
						bucket of ciphertext -->
						<b-checkbox v-model="draft.encrypt" class="_choice" size="is-small">
							<span class="_choice-text">
								<span>{{ $t('Encrypt this destination') }}</span>
								<span class="_has-text-gray is-size-7">{{ $t('Names and contents are encrypted before they leave this box. Keep the password somewhere else: it cannot be read back, and without it every backup at this destination is lost.') }}</span>
							</span>
						</b-checkbox>
						<b-field v-if="draft.encrypt" :label="$t('Encryption password')" label-position="on-border">
							<b-input v-model="draft.password" autocomplete="new-password" expanded password-reveal size="is-small"
								type="password" />
						</b-field>

						<div class="_foot">
							<span class="_has-text-gray is-size-7 is-flex-grow-1">{{ $t('Nothing is sent before Save. Check the destination afterwards to see whether rclone reaches it.') }}</span>
							<b-button :disabled="!draft.name || !draft.backend || (draft.encrypt && !draft.password)" :loading="busy === 'save'"
								rounded size="is-small" type="is-primary" @click="save">
								{{ $t('Save destination') }}
							</b-button>
						</div>
					</section>
				</b-tab-item>

				<b-tab-item value="schedules" :label="$t('Schedules')">
					<BackupSchedules v-if="tab === 'schedules'" />
				</b-tab-item>

				<b-tab-item value="exclusions" :label="$t('Left out')">
					<BackupExclusions v-if="tab === 'exclusions'" />
				</b-tab-item>

				<b-tab-item value="history" :label="$t('History')">
					<BackupHistory v-if="tab === 'history'" />
				</b-tab-item>
			</b-tabs>
		</section>
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import BackupExclusions from './BackupExclusions.vue'
import BackupHistory from './BackupHistory.vue'
import BackupRunning from './BackupRunning.vue'
import RestoreFromDestinationModal from './RestoreFromDestinationModal.vue'
import BackupSchedules from './BackupSchedules.vue'
import { BACKUP_BACKENDS, backendHelp, canSignIn, parametersFrom, suggestedFields } from './backupBackends'
import { renderSize } from '@/mixins/file_utils'

const CHECK_POLL_MS = 3000
const CHECK_WAIT_MS = 120000
// how often the Running tab is read while the dialog is open
const RUNNING_POLL_MS = 3000

export default {
	name: 'backup-destinations',
	components: { BackupSchedules, BackupExclusions, BackupHistory, BackupRunning },
	props: {
		// 'running', 'destinations', 'schedules' or 'history'; the dashboard opens it on what runs
		initialTab: { type: String, default: 'destinations' },
	},
	emits: ['close'],
	data() {
		return {
			tab: 'destinations',
			// GET /backup/running; the tab shows once something runs, and stays until the dialog
			// closes so it does not vanish under the reader's eyes when the backup ends
			running: { backups: [], passes: [] },
			showRunning: false,
			runningTimer: 0,
			// once the box has answered, a failed read is passing (a restart, a 502), not an old box
			runningAnswered: false,
			destinations: [],
			// name -> what the last check said about it
			checked: {},
			// name -> { available, enabled }: whether this box has restic, and whether
			// the destination keeps its backups with it
			restic: {},
			isLoading: false,
			error: '',
			busy: '',
			backends: BACKUP_BACKENDS,
			draft: { name: '', backend: 's3', root: '', rows: suggestedFields('s3'), encrypt: false, password: '' },
			systemDestination: '',
			// shortcut: copied by hand from systemPaths in AppManagement's service/backup_system.go;
			// serve it from there if the list starts to change.
			systemParts: [
				{ path: '/etc/casaos', what: 'the settings of the ReCasaOS services' },
				{ path: '/etc/samba/smb.casa.conf', what: 'the shared folders' },
				{ path: '/var/lib/casaos/db', what: 'users and their passwords, shares, disks and merged storage' },
				{ path: '/var/lib/casaos/conf', what: 'each user\'s dashboard settings' },
				{ path: '/root/.config/rclone/rclone.conf', what: 'the backup destinations and cloud drives, with their credentials' },
				{ path: '/var/lib/casaos/backups/schedules.json', what: 'the backup schedules' },
			],
			// the sign-in waiting: the provider's address, and what was pasted back
			signIn: { url: '', redirected: '' },
		}
	},
	async mounted() {
		this.load()
		await this.readRunning()
		if (this.initialTab !== 'running' || this.showRunning) {
			this.tab = this.initialTab
		}
		// a box that cannot say what runs is not asked again
		if (this.runningTimer !== -1) {
			this.runningTimer = setInterval(this.readRunning, RUNNING_POLL_MS)
		}
	},
	beforeUnmount() {
		clearInterval(this.runningTimer)
	},
	methods: {
		async readRunning() {
			try {
				// no envelope: the body is {backups, passes}
				const data = (await this.$api.backup.getRunning()).data || {}
				this.running = { backups: data.backups || [], passes: data.passes || [] }
				this.runningAnswered = true
				if (this.running.backups.length || this.running.passes.some(pass => !pass.finished_at)) {
					this.showRunning = true
				}
			} catch (error) {
				// an older box (404), or one that never answered: no tab, and no more asking
				if (!this.runningAnswered || (error.response && error.response.status === 404)) {
					clearInterval(this.runningTimer)
					this.runningTimer = -1
				}
			}
		},

		// The dashboard goes away for a few seconds: the core is among the services
		// stopped for the copy, and that is said before the button is pressed.
		backupSystem() {
			this.$buefy.dialog.confirm({
				title: this.$t('Back up this box to {name}?', { name: this.systemDestination }),
				message: this.$t('The services holding its files are stopped for the length of the copy, so the dashboard is unreachable for a few seconds. The backup shows in History as "This box".'),
				confirmText: this.$t('Back up'),
				cancelText: this.$t('Cancel'),
				onConfirm: async () => {
					this.busy = 'system'
					try {
						await this.$api.backup.backupSystem(this.systemDestination, true)
						this.$buefy.toast.open({ message: this.$t('Backup of this box started.'), type: 'is-success', duration: 5000 })
					} catch (error) {
						const data = error.response && error.response.data
						this.$buefy.toast.open({ message: (data && data.message) || error.message, type: 'is-danger', duration: 6000 })
					} finally {
						this.busy = ''
					}
				},
			})
		},

		// For a box whose own run log is empty: what the destination holds, and a
		// way back from it.
		browse(name) {
			this.$buefy.modal.open({
				component: RestoreFromDestinationModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				customClass: 'backup-modal',
				props: { destination: name },
			})
		},

		// A value that looks like a credential is not shown while it is typed. The
		// field names are rclone's, and its secrets are consistently named.
		backendHelp,
		canSignIn,

		backendLabel(id) {
			const backend = BACKUP_BACKENDS.find(candidate => candidate.id === id)
			return backend ? backend.label : id
		},

		// The box runs rclone authorize and gives back the provider's address.
		async startSignIn() {
			this.busy = 'signin'
			try {
				const url = (await this.$api.backup.signIn(this.draft.backend)).data.data.url
				// it ends up in an href: nothing but a web address belongs there
				if (!/^https:\/\//.test(url))
					throw new Error('unexpected sign-in address')

				this.signIn = { url, redirected: '' }
				window.open(url, '_blank', 'noopener,noreferrer')
			} catch (error) {
				this.toastError(error)
			} finally {
				this.busy = ''
			}
		},

		async finishSignIn() {
			this.busy = 'signin-finish'
			try {
				const { token, parameters } = (await this.$api.backup.signInFinish(this.signIn.redirected)).data.data
				// OneDrive also comes back with its drive_id and drive_type
				for (const [key, value] of Object.entries({ ...parameters, token })) {
					const row = this.draft.rows.find(candidate => candidate.key === key)
					if (row)
						row.value = value
					else
						this.draft.rows.push({ key, value })
				}

				this.signIn = { url: '', redirected: '' }
				this.$buefy.toast.open({ message: this.$t('Signed in: the token is filled in below. Save the destination to keep it.'), type: 'is-success', duration: 6000 })
			} catch (error) {
				this.toastError(error)
			} finally {
				this.busy = ''
			}
		},

		toastError(error) {
			const data = error.response && error.response.data
			this.$buefy.toast.open({ message: (data && data.message) || error.message, type: 'is-danger', duration: 6000 })
		},

		isSecret(key) {
			return /pass|secret|key|token/i.test(key || '') && !/key_file|public/i.test(key || '')
		},

		// an option the backend usually wants is a field named after it; one added by hand
		// has its key typed too
		isSuggested(row) {
			return suggestedFields(this.draft.backend).some(field => field.key === row.key)
		},

		// Two words beside the name: the restic repository's last check when there is
		// one, else what the last reachability check said, else that none was made.
		stateOf(name) {
			const check = this.restic[name] && this.restic[name].last_check
			if (check) {
				return check.ok ? { level: 'ok', text: this.$t('Repository checked') } : { level: 'danger', text: this.$t('Check failed') }
			}
			if (this.checked[name]) {
				return this.checked[name].startsWith(this.$t('Reachable')) ? { level: 'ok', text: this.$t('Reachable') } : { level: 'danger', text: this.$t('Unreachable') }
			}

			return { level: 'none', text: this.$t('Not checked yet') }
		},

		fillSuggestions(backend) {
			this.draft.rows = suggestedFields(backend)
			this.signIn = { url: '', redirected: '' }
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.backup.getDestinations()
				this.destinations = res.data.data || []
				// the box's own backup goes to the first destination unless another was picked
				if (!this.destinations.includes(this.systemDestination)) {
					this.systemDestination = this.destinations[0] || ''
				}
				await this.loadRestic()
			} catch (error) {
				this.error = this.$t('Destinations could not be loaded: {error}', { error: this.messageOf(error) })
			} finally {
				this.isLoading = false
			}
		},

		// Optional: a box without the call, or a destination that does not answer it,
		// is a destination without the button, not an error.
		async loadRestic() {
			const states = {}
			await Promise.all(this.destinations.map(async (name) => {
				try {
					const state = (await this.$api.backup.getResticState(name)).data.data
					// a box older than the switch back does not say `kept`: the repository it
					// reads is the one it is enabled for
					states[name] = { ...state, kept: state.kept ?? state.enabled }
				} catch {
					// no button for this one
				}
			}))
			this.restic = states
		},

		// Said before it is done: what changes, what stays, and that the password
		// comes back once. A repository's password is also what reaches it again
		// from another box, so the dialog takes one.
		confirmRestic(name) {
			this.$buefy.dialog.prompt({
				title: this.$t('Keep backups to {name} with restic?', { name }),
				message: this.$t('Backups to this destination will go into a restic repository: each costs only what changed since the last one, and files keep their owners and permissions. Backups already there stay where they are and can still be restored. A password is made for the repository and shown once. To reach a repository that is already there, for instance from another box, type its password below.'),
				inputAttrs: { type: 'password', autocomplete: 'new-password', placeholder: this.$t('Password of an existing repository, empty for a new one'), required: false },
				confirmText: this.$t('Switch to restic'),
				cancelText: this.$t('Cancel'),
				onConfirm: password => this.enableRestic(name, (password || '').trim()),
			})
		},

		async enableRestic(name, password) {
			this.busy = `restic:${name}`
			try {
				const res = await this.$api.backup.enableRestic(name, password)
				await this.loadRestic()
				const made = res.data.data && res.data.data.password
				if (password || !made) {
					this.$buefy.toast.open({ message: this.$t('Backups to {name} are now kept with restic.', { name }), type: 'is-success', duration: 5000 })
				} else {
					this.showResticPassword(name, made)
				}
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		async readResticPassword(name) {
			this.busy = `resticpass:${name}`
			this.error = ''
			try {
				const res = await this.$api.backup.getResticPassword(name)
				this.showResticPassword(name, res.data.data.password)
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		// The box's own backup leaves this password out, so a lost box takes it along:
		// it is worth a copy somewhere else, which is what Download is for.
		showResticPassword(name, password) {
			this.$buefy.dialog.confirm({
				title: this.$t('Write this password down'),
				message: `${this.$t('This is the password of the restic repository at {name}. Without it the backups there cannot be read, and the backup of this box does not hold it: keep a copy away from this box.', { name: this.htmlEscape(name) })}<br><br><code>${this.htmlEscape(password)}</code>`,
				confirmText: this.$t('Download'),
				cancelText: this.$t('Close'),
				onConfirm: () => {
					const link = document.createElement('a')
					link.href = URL.createObjectURL(new Blob([`${password}\n`], { type: 'text/plain' }))
					link.download = `restic-password-${name}.txt`
					link.click()
					URL.revokeObjectURL(link.href)
				},
			})
		},

		// Said before it is done: nothing is deleted, the repository and its password stay,
		// and what it holds stays listed and restorable, so this is not a leap.
		confirmSwitchBack(name) {
			this.$buefy.dialog.confirm({
				title: this.$t('Go back to rclone for backups to {name}?', { name }),
				message: this.$t('The next backups to this destination will be stamped copies again. Nothing is deleted: the restic repository stays on the destination, this box keeps its password, and what the repository holds stays listed and restorable. A schedule\'s retention counts the copies of both kinds. You can switch to restic again whenever you want.'),
				confirmText: this.$t('Switch back'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.disableRestic(name),
			})
		},

		async disableRestic(name) {
			this.busy = `resticback:${name}`
			this.error = ''
			try {
				await this.$api.backup.disableRestic(name)
				await this.loadRestic()
				this.$buefy.toast.open({ message: this.$t('Backups to {name} are stamped copies again. The restic repository is kept.', { name }), type: 'is-success', duration: 5000 })
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		resticCheckText(check) {
			const when = new Date(check.at).toLocaleString()
			return check.ok
				? this.$t('Repository checked {when}: sound.', { when })
				: this.$t('Repository check failed {when}: {error}', { when, error: check.error || '' })
		},

		// The check starts and returns; it reads the whole repository, so it ends when it
		// ends. The state is asked again until the last check is a new one, for as long as
		// two minutes: past that the answer is there the next time the list is opened.
		async checkRestic(name) {
			this.busy = `resticcheck:${name}`
			this.error = ''
			const before = this.restic[name] && this.restic[name].last_check && this.restic[name].last_check.at
			try {
				await this.$api.backup.checkRestic(name)
				for (let waited = 0; waited < CHECK_WAIT_MS; waited += CHECK_POLL_MS) {
					await new Promise(resolve => setTimeout(resolve, CHECK_POLL_MS))
					await this.loadRestic()
					const now = this.restic[name] && this.restic[name].last_check && this.restic[name].last_check.at
					if (now !== before)
						break
				}
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		htmlEscape(text) {
			return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
		},

		async save() {
			this.busy = 'save'
			this.error = ''
			try {
				await this.$api.backup.saveDestination(
					this.draft.name.trim(),
					this.draft.backend,
					parametersFrom(this.draft.rows),
					this.draft.encrypt,
					this.draft.password,
					this.draft.root,
				)

				const saved = this.draft.name.trim()
				this.draft = { name: '', backend: this.draft.backend, root: '', rows: suggestedFields(this.draft.backend), encrypt: false, password: '' }
				await this.load()
				// Checked straight away: a destination that cannot be reached is worth
				// knowing about now rather than the first time a backup needs it.
				await this.check(saved)
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		async check(name) {
			this.busy = `check:${name}`
			try {
				const res = await this.$api.backup.checkDestination(name)
				this.checked = { ...this.checked, [name]: this.spaceText(res.data.data) }
			} catch (error) {
				this.checked = { ...this.checked, [name]: this.messageOf(error) }
			} finally {
				this.busy = ''
			}
		},

		// Forgetting a destination is not undoable from here, and the word "delete"
		// next to a backup reads as though it removes the backups.
		confirmForget(name) {
			this.$buefy.dialog.confirm({
				title: this.$t('Forget this destination?'),
				message: this.$t('{name} will be removed from this box, along with the credentials for it. Backups already sent there are not touched.', { name }),
				confirmText: this.$t('Forget'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.forget(name),
			})
		},

		async forget(name) {
			this.busy = `delete:${name}`
			try {
				await this.$api.backup.deleteDestination(name)
				await this.load()
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		// Most object stores have no answer to how much room is left, and inventing a
		// zero would read as a destination that is full. Reachable is the whole of
		// what a check can honestly say about those.
		spaceText(space) {
			if (space && space.free != null)
				return this.$t('Reachable, {free} free', { free: renderSize(space.free) })

			return this.$t('Reachable')
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>

<style lang="scss">
// Not scoped, and for the same reason as the container panel: `account-modal`
// styles nothing, so this fell back to Buefy's ~640px. A schedule row holds two
// selects, a frequency, a weekday, a time, a retention and two switches, which at
// that width wrapped into something unreadable.
@media screen and (min-width: 769px) {
  .backup-modal {
    .animation-content {
      max-width: 94% !important;
    }

    .modal-card {
      width: min(94vw, 60rem) !important;
    }
  }
}
</style>

<style lang="scss" scoped>
.backup-destinations {
  // a destination, the box itself: one row of tile, text, controls; the controls
  // take a line of their own on a phone
  .destination,
  ._row,
  ._head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  ._tile {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: rgba($primary, 0.12);
    color: $primary;
  }

  // a basis rather than flex-grow alone: the text shares its line with the
  // controls on a wide card and takes its own line on a phone
  ._text {
    flex: 1 1 14rem;
    min-width: 0;
  }

  ._name {
    font-weight: 600;
    color: var(--casa-text-strong);
  }

  // where the destination stands, in two words, beside its name
  ._chip {
    display: inline-flex;
    align-items: center;
    height: 1.375rem;
    padding: 0 0.5625rem;
    border-radius: 0.6875rem;
    background: var(--casa-hover-tint);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;

    &.is-ok {
      background: rgba($success, 0.16);
      color: $success;
    }

    &.is-danger {
      background: rgba($danger, 0.16);
      color: $danger;
    }
  }

  ._what summary {
    cursor: pointer;
  }

  // Forget, the one way out of the menu, in red; not Bulma's has-text-danger, which the check line uses
  :deep(._danger) {
    color: $danger;
  }

  ._form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  // two fields a row, one on a phone
  ._grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem 1rem;

    .field {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  // a row added by hand: its key, its value, and the way to drop it
  ._custom {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 0.5rem;
  }

  ._section {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    margin-top: 0.25rem;
  }

  ._section-title {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--casa-text-hint);
  }

  // rclone's own names, shown as such
  :deep(._key),
  :deep(._key input) {
    font-family: ui-monospace, sfmono-regular, menlo, consolas, monospace;
  }

  ._add {
    align-self: flex-start;
  }

  ._choice {
    align-items: flex-start;
    padding: 0.625rem 0.75rem;
    border-radius: 0.625rem;
    background: var(--casa-hover-tint);

    :deep(.control-label) {
      white-space: normal;
    }
  }

  ._choice-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  ._foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--casa-divider-soft);
  }
}
</style>
