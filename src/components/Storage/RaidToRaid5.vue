<template>
	<div class="modal-card">
		<header class="modal-card-head">
			<h3 class="title is-header is-flex-grow-1">{{ $t('Change {name} to RAID 5', { name: array.name }) }}</h3>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<section class="modal-card-body">
			<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
			<p v-if="!isLoading && !isTrio && !candidates.length">
				{{ $t('No blank disk is big enough: it must hold at least {size}.', { size: renderSize(array.component_size) }) }}
			</p>
			<template v-else-if="!isLoading">
				<p v-if="isTrio" class="mb-3">
					{{ $t('The mirror of three drives becomes a RAID 5 of three drives: it holds twice as much, but survives one failed drive instead of two. {disk} comes out of the mirror, is erased and goes back in as the third drive, so no drive is needed. It stays usable while it reorganizes, which takes hours for large drives, so do not switch the box off before it is over.', { disk: name }) }}
				</p>
				<p v-else class="mb-3">
					{{ $t('The mirror becomes a RAID 5 of three drives: it holds twice as much and still survives one failed drive. It stays usable while it reorganizes onto the new drive, which takes hours for large drives, so do not switch the box off before it is over.') }}
				</p>
				<b-field v-if="!isTrio" :label="$t('Drive')">
					<b-select v-model="path" expanded>
						<option v-for="disk in candidates" :key="disk.path" :value="disk.path">
							{{ disk.name }} ({{ disk.model }} - {{ renderSize(disk.size) }})
						</option>
					</b-select>
				</b-field>
				<p class="has-text-danger mb-3">{{ $t('Everything on {disk} is erased.', { disk: name }) }}</p>
				<b-field :label="$t('Type {disk} to confirm', { disk: name })">
					<b-input v-model="typed" autocomplete="off"></b-input>
				</b-field>
			</template>
		</section>
		<footer class="modal-card-foot is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="!ready" :loading="isChanging" rounded type="is-danger" @click="change">{{ $t('Erase and change') }}</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { raidFreedMember } from './raid'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'raid-to-raid5',
	props: {
		array: {
			type: Object,
			required: true,
		},
	},
	emits: ['close', 'changed'],
	data() {
		return {
			candidates: [],
			path: '',
			typed: '',
			isLoading: true,
			isChanging: false,
		}
	},
	computed: {
		// a mirror of three has no drive to add: it gives one back
		isTrio() {
			return this.array.disks === 3
		},
		// the disk's short name, sdd: what has to be typed again
		name() {
			return this.path.replace('/dev/', '')
		},
		ready() {
			return this.path !== '' && this.typed === this.name && !this.isChanging
		},
	},
	watch: {
		path() {
			this.typed = ''
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		renderSize,
		// the blank disks LocalStorage offers for a new storage, big enough for the array
		async load() {
			if (this.isTrio) {
				const freed = raidFreedMember(this.array)
				this.path = freed ? `/dev/${freed}` : ''
				this.isLoading = false
				return
			}
			try {
				const avail = (await this.$api.disks.getDiskList()).data.data.avail || []
				this.candidates = avail.filter(disk => disk.size >= (this.array.component_size || 0))
				this.path = this.candidates[0]?.path || ''
			} catch {
				this.candidates = []
			} finally {
				this.isLoading = false
			}
		},
		async change() {
			this.isChanging = true
			try {
				await this.$api.disks.raidToRaid5(this.array.name, this.path, this.typed)
				this.$buefy.toast.open({ message: escape(this.$t('{name} is changing to RAID 5: it reorganizes in the background.', { name: this.array.name })), type: 'is-success' })
				this.$emit('changed')
				this.$emit('close')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
				// the drive may be erased and the array changed though the call failed: show what is there now
				this.$emit('changed')
			} finally {
				this.isChanging = false
			}
		},
	},
}
</script>
