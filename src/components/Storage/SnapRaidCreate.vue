<template>
	<div class="modal-card">
		<header class="modal-card-head">
			<h3 class="title is-header is-flex-grow-1">{{ $t('Create a SnapRAID storage') }}</h3>
			<b-icon v-if="phase !== 'running'" class="close-button" icon="close-outline" pack="casa" @click="close" />
		</header>
		<section class="modal-card-body">
			<!-- running, or stopped at a step -->
			<template v-if="phase !== 'choose'">
				<p v-for="item in steps" :key="item.id" class="is-flex is-align-items-center mb-2">
					<b-tag :type="stateTag[item.state]" class="mr-2 step-tag">{{ stateText[item.state] }}</b-tag>
					{{ item.label }}
				</p>
				<b-message v-if="failure" class="mt-3 failure" type="is-danger">{{ failure }}</b-message>
			</template>

			<p v-else-if="disks.length < 2">{{ $t('Plug at least two drives to make a SnapRAID.') }}</p>

			<template v-else>
				<p class="mb-3">{{ $t('SnapRAID merges several drives into one storage and keeps a drive that can rebuild any one of them if it fails. Your files stay on their drives, as ordinary files.') }}</p>
				<div class="field">
					<label class="label">{{ $t('Drives to merge') }}</label>
					<div v-for="disk in disks" :key="disk.key" class="mb-1">
						<b-checkbox v-model="dataKeys" :native-value="disk.key">
							{{ disk.name }} ({{ size(disk.size) }})
							<b-tag v-if="disk.erased" class="ml-2" type="is-danger">{{ $t('Will be erased') }}</b-tag>
						</b-checkbox>
					</div>
				</div>
				<div class="field">
					<label class="label">{{ $t('Drive that protects them') }}</label>
					<p v-if="!parityOptions.length" class="help">{{ $t('Leave at least one drive out of the merge: it holds the protection.') }}</p>
					<div v-for="disk in parityOptions" :key="disk.key" class="mb-1">
						<b-radio v-model="parityKey" :native-value="disk.key">
							{{ disk.name }} ({{ size(disk.size) }})
							<b-tag v-if="disk.erased" class="ml-2" type="is-danger">{{ $t('Will be erased') }}</b-tag>
						</b-radio>
					</div>
					<p v-if="parityTooSmall" class="help is-danger">{{ $t('This drive is smaller than the biggest merged drive: the protection would be refused.') }}</p>
				</div>
				<b-field :label="$t('Folder')" :type="folderError ? 'is-danger' : ''" :message="folderError || $t('Where the merged storage appears. What you put there is spread over the drives.')">
					<b-input v-model="folder" autocomplete="off"></b-input>
				</b-field>
				<template v-if="parity && dataDisks.length">
					<p class="mb-2">{{ $t('The merged storage holds {size}. If a drive fails, it is rebuilt from {parity}. Files written since the last daily sync are not protected yet.', { size: size(poolSize), parity: parity.name }) }}</p>
					<p v-if="erasedNames" class="has-text-danger mb-2">{{ $t('Erased: {names}. Nothing else is erased.', { names: erasedNames }) }}</p>
					<template v-if="inData">
						<p class="mb-2">{{ $t('Existing data outside AppData may be hidden while merged storage is active. Back up important files before continuing.') }}</p>
						<p class="mb-3">{{ $t('Your apps are stopped for a moment and started again.') }}</p>
					</template>
					<p v-else class="mb-3">{{ $t('The merged storage appears in {folder}. Your apps keep running.', { folder: folderPath }) }}</p>
					<b-field :label="$t('Enter &quot;I AM SURE&quot; to proceed with the operation.')">
						<b-input v-model="typed" autocomplete="off"></b-input>
					</b-field>
				</template>
			</template>
		</section>
		<footer class="modal-card-foot is-justify-content-flex-end">
			<template v-if="phase === 'choose'">
				<b-button rounded @click="close">{{ $t('Cancel') }}</b-button>
				<b-button :disabled="!ready" rounded type="is-danger" @click="create">{{ $t('Create and protect') }}</b-button>
			</template>
			<b-button v-else-if="phase === 'failed'" rounded @click="close">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { DEFAULT_FOLDER, POOL, POOL_STEPS, createSnapRaid, errorMessage, folderProblem, normalizeFolder, parityChoices, poolDisks, suggestParity } from './snapraidPool'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'snap-raid-create',
	props: {
		// the storages and the drives that are no storage yet, as the Storage manager has them
		storages: {
			type: Array,
			default: () => [],
		},
		drives: {
			type: Array,
			default: () => [],
		},
	},
	emits: ['close', 'changed'],
	data() {
		return { dataKeys: [], pickedParity: '', folder: DEFAULT_FOLDER, typed: '', phase: 'choose', steps: [], failure: '' }
	},
	computed: {
		disks() {
			return poolDisks(this.storages, this.drives)
		},
		dataDisks() {
			return this.disks.filter(disk => this.dataKeys.includes(disk.key))
		},
		parityOptions() {
			return parityChoices(this.disks, this.dataKeys)
		},
		// what was picked while it is still on offer, else the biggest drive left
		parityKey: {
			get() {
				if (this.parityOptions.some(disk => disk.key === this.pickedParity)) {
					return this.pickedParity
				}
				return suggestParity(this.disks, this.dataKeys)?.key || ''
			},
			set(key) {
				this.pickedParity = key
			},
		},
		parity() {
			return this.parityOptions.find(disk => disk.key === this.parityKey) || null
		},
		poolSize() {
			return this.dataDisks.reduce((total, disk) => total + disk.size, 0)
		},
		parityTooSmall() {
			return Boolean(this.parity) && this.dataDisks.some(disk => disk.size > this.parity.size)
		},
		folderPath() {
			return normalizeFolder(this.folder)
		},
		inData() {
			return this.folderPath === POOL
		},
		folderError() {
			const problem = folderProblem(this.folder, this.storages)
			return {
				path: this.$t('Use an absolute folder such as /media/Pool, with letters, digits, dots, dashes and underscores only.'),
				taken: this.$t('This folder is a storage, holds one or lies inside one.'),
			}[problem] || ''
		},
		erasedNames() {
			return [...this.dataDisks, this.parity].filter(disk => disk?.erased).map(disk => disk.name).join(', ')
		},
		ready() {
			return this.dataDisks.length > 0 && Boolean(this.parity) && !this.folderError && this.typed === 'I AM SURE'
		},
		stateTag() {
			return { waiting: '', doing: 'is-info', done: 'is-success', failed: 'is-danger' }
		},
		stateText() {
			return { waiting: this.$t('Waiting'), doing: this.$t('In progress'), done: this.$t('Done'), failed: this.$t('Failed') }
		},
	},
	methods: {
		size(bytes) {
			return renderSize(bytes)
		},
		stepLabel(id) {
			return {
				storages: this.$t('Preparing the drives'),
				protection: this.$t('Setting up the protection'),
				merge: this.$t('Merging the storages'),
				sync: this.$t('Starting the first sync'),
			}[id]
		},
		// the step that was at work is done, and this one begins
		begin(id) {
			this.steps.forEach((item) => {
				if (item.state === 'doing') {
					item.state = 'done'
				}
			})
			this.steps.find(item => item.id === id).state = 'doing'
		},
		close() {
			// drives may have been made storages before a step failed: the Storage manager reads them again
			if (this.phase !== 'choose') {
				this.$emit('changed')
			}
			this.$emit('close')
		},
		async create() {
			this.phase = 'running'
			this.steps = POOL_STEPS.map(id => ({ id, label: this.stepLabel(id), state: 'waiting' }))
			try {
				const result = await createSnapRaid(this, { data: this.dataDisks, parity: this.parity, taken: this.storages.map(storage => storage.name), folder: this.folderPath }, this.begin)
				this.steps.forEach((item) => {
					item.state = 'done'
				})
				const message = result.syncStarted
					? this.$t('The SnapRAID storage is created: the first sync is running.')
					: this.$t('The SnapRAID storage is created, but the first sync did not start: {reason}. The daily sync will do it.', { reason: result.reason })
				this.$buefy.toast.open({ message: escape(message), type: result.syncStarted ? 'is-success' : 'is-warning', duration: 6000 })
				this.$emit('changed')
				this.$emit('close')
			} catch (e) {
				const failed = this.steps.find(item => item.state === 'doing')
				if (failed) {
					failed.state = 'failed'
				}
				this.failure = errorMessage(e)
				this.phase = 'failed'
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.failure {
	white-space: pre-wrap;
}

.step-tag {
	min-width: 6rem;
}
</style>
