<template>
	<div class="modal-card cloud-sync-task touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ task ? $t('Edit sync task') : $t('New sync task') }}</h3>
		</header>
		<section class="modal-card-body">
			<b-field :label="$t('Name')" label-position="on-border">
				<b-input v-model="form.name" :placeholder="$t('Name')" size="is-small" />
			</b-field>

			<b-field :label="$t('Account')" label-position="on-border">
				<b-select v-model="form.destination" expanded size="is-small" @update:model-value="browse = null">
					<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
				</b-select>
			</b-field>
			<p class="mb-3 is-size-7">
				{{ $t('An account only reaches the folder it was added with. To sync another folder, add the same account again and leave its folder empty.') }}
				<a @click="addAccount">{{ $t('Add an account') }}</a>
			</p>

			<b-field :label="$t('Folder in the cloud')" label-position="on-border">
				<b-input v-model="form.remote_path" :placeholder="$t('Folder in the cloud')" size="is-small" />
				<p class="control">
					<b-button :disabled="!form.destination" size="is-small" @click="open('')">{{ $t('Browse the cloud') }}</b-button>
				</p>
			</b-field>
			<div v-if="browse" class="settings-card mb-3">
				<p class="is-size-7 mb-1">/{{ browse.path }}</p>
				<b-message v-if="browse.error" size="is-small" type="is-danger">{{ browse.error }}</b-message>
				<p v-else-if="!browse.loading && !browse.folders.length" class="_has-text-gray is-size-7">
					{{ $t('This account shows no folder here. An account limited to one folder only sees inside it.') }}
				</p>
				<div class="is-flex is-flex-wrap-wrap is-gap-1 my-1">
					<b-button v-if="browse.path" size="is-small" @click="open(parentOf(browse.path))">{{ $t('Up') }}</b-button>
					<b-button v-for="folder in browse.folders" :key="folder" size="is-small" @click="open(join(browse.path, folder))">{{ folder }}</b-button>
				</div>
				<b-button size="is-small" type="is-primary" @click="useFolder">{{ $t('Use this folder') }}</b-button>
			</div>

			<b-field :label="$t('Folder on this box')" label-position="on-border">
				<b-input v-model="form.local_path" placeholder="/DATA/Photos" size="is-small" />
				<p class="control">
					<b-button size="is-small" @click="pickLocal">{{ $t('Choose') }}</b-button>
				</p>
			</b-field>

			<b-field :label="$t('Direction')">
				<b-radio-button v-model="form.direction" expanded native-value="download" size="is-small">{{ $t('Download') }}</b-radio-button>
				<b-radio-button v-model="form.direction" expanded native-value="upload" size="is-small">{{ $t('Upload') }}</b-radio-button>
				<b-radio-button v-model="form.direction" expanded native-value="both" size="is-small">{{ $t('Both') }}</b-radio-button>
			</b-field>
			<p v-if="form.direction === 'upload'" class="_has-text-gray is-size-7 mb-3">
				{{ $t('If this account is encrypted, these files will only be readable from this box.') }}
			</p>

			<b-field :label="$t('When')">
				<b-radio-button v-model="form.every" expanded native-value="hourly" size="is-small">{{ $t('Every hour') }}</b-radio-button>
				<b-radio-button v-model="form.every" expanded native-value="daily" size="is-small">{{ $t('Every day') }}</b-radio-button>
				<b-radio-button v-model="form.every" expanded native-value="weekly" size="is-small">{{ $t('Every week') }}</b-radio-button>
			</b-field>
			<b-field v-if="form.every === 'weekly'" :label="$t('Weekday')" label-position="on-border">
				<b-select v-model.number="form.weekday" expanded size="is-small">
					<option v-for="(day, number) in weekdays" :key="number" :value="number">{{ $t(day) }}</option>
				</b-select>
			</b-field>
			<b-field v-if="form.every === 'hourly'" :label="$t('Minute')" label-position="on-border">
				<b-input v-model.number="minute" max="59" min="0" size="is-small" type="number" />
			</b-field>
			<b-field v-else :label="$t('Time')" label-position="on-border">
				<b-input v-model="form.at" size="is-small" type="time" />
			</b-field>

			<div class="mb-3">
				<b-switch :disabled="form.direction === 'both'" :model-value="mirrorOn" size="is-small" @update:model-value="form.mirror = $event">
					{{ $t('Delete on one side what is gone from the other') }}
				</b-switch>
				<p v-if="form.direction === 'both'" class="_has-text-gray is-size-7 mt-1">
					{{ $t('Both ways, a deletion on one side is always carried to the other; the copy kept below is what protects you.') }}
				</p>
				<p v-else-if="!mirrorOn" class="_has-text-gray is-size-7 mt-1">{{ $t('Off: this task never deletes a file.') }}</p>
				<p v-if="form.direction === 'both' && form.archive" class="_has-text-gray is-size-7 mt-1">
					{{ $t('At the first pass, when a file differs the box\'s version is kept; the cloud\'s goes to the copies.') }}
				</p>
				<p v-else-if="form.direction === 'both'" class="_has-text-gray is-size-7 mt-1">
					{{ $t('At the first pass, when a file differs the box\'s version is kept; the cloud\'s is lost.') }}
				</p>
			</div>

			<div class="mb-3">
				<b-switch v-model="form.archive" size="is-small">{{ $t('Keep a copy of what is replaced or deleted') }}</b-switch>
				<template v-if="form.archive">
					<p v-for="path in archivePaths" :key="path" class="_has-text-gray is-size-7 mt-1">
						{{ path }} · {{ form.archive_days > 0 ? $t('for {days} days', { days: form.archive_days }) : $t('forever') }}
					</p>
				</template>
				<p v-else-if="mirrorOn" class="has-text-danger is-size-7 mt-1">
					{{ $t('Without copies, up to half of the files can be lost before the task stops.') }}
				</p>
			</div>

			<b-message v-if="error" size="is-small" type="is-danger">{{ error }}</b-message>
		</section>
		<footer class="modal-card-foot">
			<b-button :disabled="!canSave" :loading="busy" rounded type="is-primary" @click="save">
				{{ $t('Save') }}
			</b-button>
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import BackupDestinations from './BackupDestinations.vue'
import FilePanel from '@/components/fileList/FilePanel.vue'

// the only fields the box takes from the UI; it restores its own last_* ones
const FIELDS = ['name', 'destination', 'remote_path', 'local_path', 'direction', 'mirror', 'archive', 'archive_days', 'every', 'at', 'weekday', 'enabled']

export default {
	name: 'cloud-sync-task-modal',
	props: {
		task: { type: Object, default: null },
		tasks: { type: Array, default: () => [] },
	},
	emits: ['saved', 'close'],
	data() {
		const form = {
			name: '',
			destination: '',
			remote_path: '',
			local_path: '',
			direction: 'download',
			mirror: false,
			archive: true,
			archive_days: 30,
			every: 'daily',
			at: '02:00',
			weekday: 0,
			enabled: true,
			...this.task,
		}
		// a stored two-way task is mirrored because the box forces it, not because the user chose it
		if (form.direction === 'both') {
			form.mirror = false
		}
		return {
			form,
			// an hourly task keeps its minute in `at`, as "00:MM"
			minute: Number(String(form.at).split(':')[1]) || 0,
			destinations: [],
			// null, or { path, folders, loading, error } while the cloud is browsed
			browse: null,
			busy: false,
			error: '',
			weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		}
	},
	computed: {
		// both ways always carries deletions over, so the switch shows on and cannot be turned off
		mirrorOn() {
			return this.form.direction === 'both' || this.form.mirror
		},
		canSave() {
			return !!(this.form.name.trim() && this.form.destination && this.form.local_path.trim())
		},
		archivePaths() {
			const local = String(this.form.local_path).replace(/\/+$/, '')
			const slash = local.lastIndexOf('/')
			const paths = []
			const remote = String(this.form.remote_path).trim().replace(/\/+$/, '')
			if (local && this.form.direction !== 'upload') {
				paths.push(`${local.slice(0, slash)}/.${local.slice(slash + 1)}-archive`)
			}
			if (remote && this.form.direction !== 'download') {
				paths.push(`${remote}-archive`)
			}
			return paths
		},
	},
	mounted() {
		this.loadDestinations()
	},
	methods: {
		async loadDestinations() {
			try {
				this.destinations = (await this.$api.backup.getDestinations()).data.data || []
			} catch (error) {
				this.error = this.messageOf(error)
			}
		},

		addAccount() {
			this.$buefy.modal.open({
				component: BackupDestinations,
				hasModalCard: true,
				customClass: 'backup-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: { initialTab: 'destinations' },
				events: { close: () => this.loadDestinations() },
			})
		},

		pickLocal() {
			this.$buefy.modal.open({
				component: FilePanel,
				hasModalCard: true,
				customClass: 'file-sel-modal',
				trapFocus: true,
				canCancel: [],
				scroll: 'keep',
				animation: 'zoom-in',
				props: { initPath: this.form.local_path || '/DATA', rootPath: '/DATA', showFile: false },
				events: { updatePath: (path) => { this.form.local_path = path } },
			})
		},

		join(path, name) {
			return path ? `${path}/${name}` : name
		},

		parentOf(path) {
			return path.split('/').slice(0, -1).join('/')
		},

		async open(path) {
			this.browse = { path, folders: [], loading: true, error: '' }
			try {
				const payload = (await this.$api.backup.getFolders(this.form.destination, path)).data.data
				this.browse.folders = (payload?.folders || []).map(folder => folder.name || folder)
			} catch (error) {
				this.browse.error = this.messageOf(error)
			} finally {
				this.browse.loading = false
			}
		},

		useFolder() {
			this.form.remote_path = this.browse.path
			this.browse = null
		},

		async save() {
			const task = {}
			FIELDS.forEach(key => task[key] = this.form[key])
			task.mirror = this.mirrorOn
			if (task.every === 'hourly') {
				task.at = `00:${String(this.minute || 0).padStart(2, '0')}`
			}
			if (this.task) {
				task.id = this.task.id
			}
			const list = this.task ? this.tasks.map(each => (each.id === task.id ? task : each)) : [...this.tasks, task]
			this.busy = true
			this.error = ''
			try {
				const saved = (await this.$api.sync.saveTasks(list)).data?.data || list
				this.$emit('saved', saved)
				this.$emit('close')
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = false
			}
		},

		messageOf(error) {
			return error.response?.data?.message || error.message || String(error)
		},
	},
}
</script>
