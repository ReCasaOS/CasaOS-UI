<template>
	<div class="modal-card backup-destinations">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Backups') }}</h3>
		</header>
		<section class="modal-card-body">
			<b-tabs v-model="tab">
				<b-tab-item :label="$t('Destinations')">
					<div class="is-flex is-align-items-center mb-2">
						<p class="_has-text-gray is-size-7 is-flex-grow-1">
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

					<!-- the check result sits under the name: an rclone error is a paragraph,
						and beside the buttons it pushed them off a phone -->
					<div v-for="name in destinations" :key="name"
						class="destination is-flex is-flex-wrap-wrap is-row-gap-1 is-align-items-center mb-2">
						<div class="_text mr-3">
							<p class="has-text-weight-medium">{{ name }}</p>
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

						<!-- ml-auto: on a line of their own, the buttons stay on the right -->
						<div class="is-flex ml-auto">
							<b-button :loading="busy === `check:${name}`" class="mr-1" rounded size="is-small"
								@click="check(name)">
								{{ $t('Check') }}
							</b-button>
							<b-button v-if="restic[name] && restic[name].available && !restic[name].kept"
								:loading="busy === `restic:${name}`" class="mr-1" rounded size="is-small" @click="confirmRestic(name)">
								{{ $t('Keep with restic\u2026') }}
							</b-button>
							<b-button v-if="restic[name] && restic[name].available && restic[name].kept && !restic[name].enabled"
								:loading="busy === `restic:${name}`" class="mr-1" rounded size="is-small" @click="enableRestic(name, '')">
								{{ $t('Resume restic') }}
							</b-button>
							<b-button v-if="restic[name] && restic[name].kept" :loading="busy === `resticcheck:${name}`" class="mr-1"
								rounded size="is-small" @click="checkRestic(name)">
								{{ $t('Check repository') }}
							</b-button>
							<b-button v-if="restic[name] && restic[name].enabled" :loading="busy === `resticback:${name}`" class="mr-1"
								rounded size="is-small" @click="confirmSwitchBack(name)">
								{{ $t('Switch back to rclone\u2026') }}
							</b-button>
							<b-button class="mr-1" rounded size="is-small" @click="browse(name)">
								{{ $t('Restore\u2026') }}
							</b-button>
							<b-button :loading="busy === `delete:${name}`" rounded size="is-small" type="is-danger"
								@click="confirmForget(name)">
								{{ $t('Forget') }}
							</b-button>
						</div>
					</div>

					<!-- The box itself: users, shares and their accounts, schedules, the
						destinations above. Restored from the destination browser like an app,
						under "This box". -->
					<div v-if="destinations.length" class="is-flex is-flex-wrap-wrap is-row-gap-1 is-align-items-center mt-3 mb-2">
						<p class="_text _has-text-gray is-size-7 mr-2">
							{{ $t('Back up this box itself: its users, its shares and their accounts, its schedules, these destinations.') }}
						</p>
						<b-select v-model="systemDestination" class="mr-2" size="is-small">
							<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
						</b-select>
						<b-button :disabled="!systemDestination" :loading="busy === 'system'" rounded size="is-small"
							@click="backupSystem">
							{{ $t('Back up this box') }}
						</b-button>
					</div>

					<hr>

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

					<b-field :label="draft.backend === 's3' ? $t('Bucket') : $t('Folder (optional)')" label-position="on-border">
						<b-input v-model="draft.root" :placeholder="draft.backend === 's3' ? 'my-box-backups' : ''" expanded size="is-small" />
					</b-field>
					<p v-if="draft.backend === 's3'" class="_has-text-gray is-size-7 mb-2">
						{{ $t('The bucket you made at your provider. Without one, each app is put in a bucket named after it, which most providers refuse because bucket names are shared by everyone.') }}
					</p>

					<div v-if="canSignIn(draft.backend)" class="mb-3">
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

					<p v-if="backendHelp(draft.backend)" class="_has-text-gray is-size-7 mb-2">
						{{ $t(backendHelp(draft.backend)) }}
					</p>
					<p class="_has-text-gray is-size-7 mb-2">
						{{ $t('These are rclone\'s own option names. Leave blank what you do not need; add a row for anything not listed.') }}
					</p>

					<!-- new-password on anything typed as a password: otherwise the browser
						fills the dashboard's own login in, and it is sent to rclone -->
					<div v-for="(row, index) in draft.rows" :key="index" class="is-flex mb-1">
						<b-input v-model="row.key" :placeholder="$t('Option')" class="mr-1" expanded size="is-small" />
						<b-input v-model="row.value" :autocomplete="isSecret(row.key) ? 'new-password' : undefined"
							:placeholder="$t('Value')" :type="isSecret(row.key) ? 'password' : 'text'"
							expanded password-reveal size="is-small" />
						<b-button class="ml-1" icon-left="close-outline" icon-pack="casa" rounded size="is-small"
							@click="draft.rows.splice(index, 1)" />
					</div>

					<b-field class="mt-3">
						<b-checkbox v-model="draft.encrypt" size="is-small">{{ $t('Encrypt this destination') }}</b-checkbox>
					</b-field>
					<template v-if="draft.encrypt">
						<b-field :label="$t('Encryption password')" label-position="on-border">
							<b-input v-model="draft.password" autocomplete="new-password" expanded password-reveal size="is-small"
								type="password" />
						</b-field>
						<!-- said here rather than in a dialog later: the password is kept by
							rclone and never comes back, and a destination without it is a
							bucket of ciphertext -->
						<p class="_has-text-gray is-size-7 mb-2">
							{{ $t('Names and contents are encrypted before they leave this box. Keep the password somewhere else: it cannot be read back, and without it every backup at this destination is lost.') }}
						</p>
					</template>

					<div class="is-flex is-align-items-center mt-2">
						<b-button class="mr-2" rounded size="is-small" @click="draft.rows.push({ key: '', value: '' })">
							{{ $t('Add') }}
						</b-button>
						<div class="is-flex-grow-1"></div>
						<b-button :disabled="!draft.name || !draft.backend || (draft.encrypt && !draft.password)" :loading="busy === 'save'"
							rounded size="is-small" type="is-primary" @click="save">
							{{ $t('Save destination') }}
						</b-button>
					</div>
				</b-tab-item>

				<b-tab-item :label="$t('Schedules')">
					<BackupSchedules v-if="tab === 1" />
				</b-tab-item>

				<b-tab-item :label="$t('History')">
					<BackupHistory v-if="tab === 2" />
				</b-tab-item>
			</b-tabs>
		</section>
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import BackupHistory from './BackupHistory.vue'
import RestoreFromDestinationModal from './RestoreFromDestinationModal.vue'
import BackupSchedules from './BackupSchedules.vue'
import { BACKUP_BACKENDS, backendHelp, canSignIn, parametersFrom, suggestedFields } from './backupBackends'
import { renderSize } from '@/mixins/file_utils'

const CHECK_POLL_MS = 3000
const CHECK_WAIT_MS = 120000

export default {
	name: 'backup-destinations',
	components: { BackupSchedules, BackupHistory },
	emits: ['close'],
	data() {
		return {
			tab: 0,
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
			// the sign-in waiting: the provider's address, and what was pasted back
			signIn: { url: '', redirected: '' },
		}
	},
	mounted() {
		this.load()
	},
	methods: {
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
				const token = (await this.$api.backup.signInFinish(this.signIn.redirected)).data.data.token
				const row = this.draft.rows.find(candidate => candidate.key === 'token')
				if (row)
					row.value = token
				else
					this.draft.rows.push({ key: 'token', value: token })

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
					// shown once, and never again: without it the repository cannot be read
					this.$buefy.dialog.alert({
						title: this.$t('Write this password down'),
						message: `${this.$t('This is the password of the restic repository at {name}. It is shown once. Without it the backups there cannot be read, and this box does not hold a copy anywhere else.', { name: this.htmlEscape(name) })}<br><br><code>${this.htmlEscape(made)}</code>`,
						confirmText: this.$t('I have written it down'),
					})
				}
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
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
  .destination {
    min-height: 2rem;
  }

  // a basis rather than flex-grow alone: the text shares its line with the
  // controls on a wide card and takes its own line on a phone
  ._text {
    flex: 1 1 14rem;
  }
}
</style>
