<template>
	<div class="modal-card">
		<header class="modal-card-head">
			<h3 class="title is-header is-flex-grow-1">{{ $t('Create a RAID storage') }}</h3>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<section class="modal-card-body">
			<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
			<p v-if="!isLoading && candidates.length < 2">{{ $t('Plug at least two blank drives to make a RAID.') }}</p>
			<template v-else-if="!isLoading">
				<b-field :label="$t('Name of the storage')" :message="$t('Letters, digits and underscores, 16 at most')" :type="name && !validName ? 'is-danger' : ''">
					<b-input v-model="name" autocomplete="off"></b-input>
				</b-field>
				<b-field :label="$t('RAID level')">
					<b-select v-model="level" expanded>
						<option v-for="option in levels" :key="option" :value="option">{{ levelLabel(option) }}</option>
					</b-select>
				</b-field>
				<div class="field">
					<label class="label">{{ $t('Drives to use') }}</label>
					<div v-for="disk in candidates" :key="disk.path" class="mb-1">
						<b-checkbox v-model="selected" :native-value="disk.path">{{ disk.name }} ({{ disk.model }} - {{ renderSize(disk.size) }})</b-checkbox>
					</div>
					<p v-if="selected.length < least" class="help">{{ $t('This level needs at least {count} drives.', { count: least }) }}</p>
				</div>
				<p v-if="estimate" class="mb-3">{{ estimateText }}</p>
				<p class="has-text-danger mb-3">{{ erasedText }}</p>
				<b-checkbox v-if="noProtection" v-model="acceptLoss" class="mb-3" type="is-danger">
					{{ $t('I understand that if one drive fails, everything on {name} is lost.', { name: name || '…' }) }}
				</b-checkbox>
				<b-field :label="$t('Type {name} to confirm', { name: name || '…' })">
					<b-input v-model="typed" autocomplete="off"></b-input>
				</b-field>
			</template>
		</section>
		<footer class="modal-card-foot is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="!ready" :loading="isCreating" rounded type="is-danger" @click="create">{{ $t('Erase and create') }}</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { RAID_LEVELS, raidEstimate, raidLevel } from './raid'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'raid-create',
	emits: ['close', 'changed'],
	data() {
		return {
			candidates: [],
			name: '',
			level: 'raid1',
			selected: [],
			typed: '',
			acceptLoss: false,
			isLoading: true,
			isCreating: false,
		}
	},
	computed: {
		// the levels the blank drives are enough for
		levels() {
			return Object.keys(RAID_LEVELS).filter(level => RAID_LEVELS[level] <= this.candidates.length)
		},
		least() {
			return RAID_LEVELS[this.level]
		},
		// a RAID 0 survives nothing: it is made only for whoever says they know
		noProtection() {
			return this.level === 'raid0'
		},
		validName() {
			return /^\w{1,16}$/.test(this.name)
		},
		estimate() {
			return raidEstimate(this.level, this.candidates.filter(disk => this.selected.includes(disk.path)).map(disk => disk.size))
		},
		estimateText() {
			const holds = renderSize(this.estimate.capacity)
			if (this.estimate.survives === 0) {
				return this.$t('Holds {size}. One failed drive loses everything.', { size: holds })
			}
			return this.estimate.survives === 1
				? this.$t('Holds {size}. One failed drive loses nothing.', { size: holds })
				: this.$t('Holds {size}. Up to {count} failed drives lose nothing.', { size: holds, count: this.estimate.survives })
		},
		erasedText() {
			const name = this.name || '…'
			return this.noProtection
				? this.$t('Everything on the chosen drives is erased. {name} is usable at once.', { name })
				: this.$t('Everything on the chosen drives is erased. {name} is usable at once, while the RAID synchronizes in the background.', { name })
		},
		ready() {
			return this.validName && this.typed === this.name && this.estimate !== null && (!this.noProtection || this.acceptLoss) && !this.isCreating
		},
	},
	watch: {
		// the consent is for the RAID 0 that was on the screen when it was given
		level() {
			this.acceptLoss = false
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		renderSize,
		levelLabel(level) {
			return {
				raid1: this.$t('RAID 1 - a mirror, from 2 drives'),
				raid5: this.$t('RAID 5 - one drive may fail, from 3 drives'),
				raid6: this.$t('RAID 6 - two drives may fail, from 4 drives'),
				raid10: this.$t('RAID 10 - mirrored pairs, from 4 drives'),
				raid0: this.$t('RAID 0 - no protection, from 2 drives'),
			}[level] || raidLevel(level)
		},
		// the blank drives LocalStorage offers for a new storage
		async load() {
			try {
				this.candidates = (await this.$api.disks.getDiskList()).data.data.avail || []
				this.level = this.levels[0] || 'raid1'
			} catch {
				this.candidates = []
			} finally {
				this.isLoading = false
			}
		},
		async create() {
			this.isCreating = true
			try {
				await this.$api.disks.createRaid(this.name, this.level, this.selected, this.typed, this.noProtection && this.acceptLoss)
				const made = this.noProtection
					? this.$t('{name} is created.', { name: this.name })
					: this.$t('{name} is created: it synchronizes in the background.', { name: this.name })
				this.$buefy.toast.open({ message: escape(made), type: 'is-success' })
				this.$emit('changed')
				this.$emit('close')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
				// the drives may be erased and the array made though the call failed: show what is there now
				this.$emit('changed')
			} finally {
				this.isCreating = false
			}
		},
	},
}
</script>
