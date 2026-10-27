<template>
	<div class="modal-card">
		<header class="modal-card-head">
			<h3 class="title is-header is-flex-grow-1">{{ $t('Add a disk to {name}', { name: array.name }) }}</h3>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<section class="modal-card-body">
			<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
			<p v-if="!isLoading && !candidates.length">
				{{ $t('No blank disk is big enough: it must hold at least {size}.', { size: renderSize(array.component_size) }) }}
			</p>
			<template v-else-if="!isLoading">
				<b-field :label="$t('Drive')">
					<b-select v-model="path" expanded>
						<option v-for="disk in candidates" :key="disk.path" :value="disk.path">
							{{ disk.name }} ({{ disk.model }} - {{ renderSize(disk.size) }})
						</option>
					</b-select>
				</b-field>
				<p class="has-text-danger mb-3">{{ $t('Everything on {disk} is erased, then {name} rebuilds onto it.', { disk: name, name: array.name }) }}</p>
				<b-field :label="$t('Type {disk} to confirm', { disk: name })">
					<b-input v-model="typed" autocomplete="off"></b-input>
				</b-field>
			</template>
		</section>
		<footer class="modal-card-foot is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="!ready" :loading="isAdding" rounded type="is-danger" @click="add">{{ $t('Erase and add') }}</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'raid-add-disk',
	props: {
		array: {
			type: Object,
			required: true,
		},
	},
	emits: ['close', 'added'],
	data() {
		return {
			candidates: [],
			path: '',
			typed: '',
			isLoading: true,
			isAdding: false,
		}
	},
	computed: {
		// the disk's short name, sdd: what has to be typed again
		name() {
			return this.path.replace('/dev/', '')
		},
		ready() {
			return this.path !== '' && this.typed === this.name && !this.isAdding
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
		async add() {
			this.isAdding = true
			try {
				await this.$api.disks.addToRaid(this.array.name, this.path, this.typed)
				this.$buefy.toast.open({ message: escape(this.$t('{disk} is added: {name} rebuilds onto it.', { disk: this.name, name: this.array.name })), type: 'is-success' })
				this.$emit('added')
				this.$emit('close')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
			} finally {
				this.isAdding = false
			}
		},
	},
}
</script>
