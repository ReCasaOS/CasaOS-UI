<template>
	<div class="modal-card vm-path-picker">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ folderOnly ? $t('Choose a folder') : (isoOnly ? $t('Choose an ISO') : $t('Choose an image')) }}</h3>
		</header>

		<section class="modal-card-body">
			<!-- the data folder, and the drives mounted under /media -->
			<b-field v-if="roots.length > 1" class="mb-2">
				<b-radio-button v-for="r in roots" :key="r" :model-value="root" :native-value="r" size="is-small"
					@update:model-value="switchRoot">{{ r }}</b-radio-button>
			</b-field>
			<nav class="is-flex is-align-items-center is-flex-wrap-wrap mb-3 is-size-7">
				<template v-for="(crumb, i) in crumbs" :key="crumb.path">
					<span v-if="i > 0" class="mx-1 has-text-full-03">/</span>
					<a class="crumb" @click="open(crumb.path)">{{ crumb.name }}</a>
				</template>
			</nav>

			<b-message v-if="error" size="is-small" type="is-danger">{{ error }}</b-message>

			<b-loading :active="loading" :is-full-page="false"></b-loading>

			<ul v-if="!loading" class="entries">
				<li v-if="path !== root" class="entry is-clickable" @click="open(parent)">
					<b-icon icon="folder-arrow-up-outline" size="is-small" class="mr-2" />..
				</li>
				<li v-for="entry in entries" :key="entry.path" :class="{ 'is-selected': entry.path === selected }"
					class="entry is-clickable" @click="pick(entry)" @dblclick="entry.is_dir ? null : $emit('select', entry.path)">
					<b-icon :icon="entry.is_dir ? 'folder' : (entry.kind === 'iso' ? 'disc' : 'harddisk')" class="mr-2"
						size="is-small" />
					<span class="is-flex-grow-1 one-line">{{ entry.name }}</span>
					<span v-if="!entry.is_dir" class="has-text-full-03 is-size-7 ml-2">{{ formatBytes(entry.size) }}</span>
				</li>
				<li v-if="!entries.length" class="has-text-full-03 is-size-7 py-2">
					{{ folderOnly ? $t('No folders here.') : (isoOnly ? $t('No ISO in this folder.') : $t('No image in this folder.')) }}
				</li>
			</ul>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button class="mr-2" rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="!folderOnly && !selected" rounded type="is-primary"
				@click="$emit('select', folderOnly ? path : selected)">
				{{ folderOnly ? $t('Use this folder') : $t('Select') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import { formatBytes, imageKind } from './vms'

const ROOT = '/DATA'
// where VM disks may go, as the service allows
const FOLDER_ROOTS = ['/DATA', '/media']

export default {
	name: 'VmPathPicker',
	props: {
		// the folder to start in; anything outside /DATA starts at /DATA
		start: { type: String, default: '/DATA/VM/iso' },
		// only ISOs, for the CD-ROM drive
		isoOnly: { type: Boolean, default: false },
		// a folder, not a file: where VM disks go
		folderOnly: { type: Boolean, default: false },
	},
	emits: ['close', 'select'],
	data() {
		return {
			root: ROOT,
			path: ROOT,
			entries: [],
			selected: '',
			loading: false,
			error: '',
		}
	},
	computed: {
		roots() {
			return this.folderOnly ? FOLDER_ROOTS : [ROOT]
		},
		parent() {
			const i = this.path.lastIndexOf('/')
			return i > 0 && this.path.length > this.root.length ? this.path.slice(0, i) : this.root
		},
		crumbs() {
			const parts = this.path.slice(this.root.length).split('/').filter(Boolean)
			const crumbs = [{ name: this.root.slice(1), path: this.root }]
			let path = this.root
			for (const part of parts) {
				path = `${path}/${part}`
				crumbs.push({ name: part, path })
			}
			return crumbs
		},
	},
	mounted() {
		const start = this.start || ''
		this.root = this.roots.find(r => start === r || start.startsWith(`${r}/`)) || ROOT
		this.open(start.startsWith(this.root) ? start : this.root, true)
	},
	methods: {
		formatBytes,
		async open(path, fallBackToRoot) {
			this.loading = true
			this.error = ''
			this.selected = ''
			try {
				const res = await this.$api.folder.getList(path)
				const content = res.data.data?.content || []
				this.path = path
				this.entries = content
					.filter(e => !e.name.startsWith('.'))
					.map(e => ({ ...e, kind: e.is_dir ? '' : imageKind(e.name) }))
					.filter(e => e.is_dir || (!this.folderOnly && (this.isoOnly ? e.kind === 'iso' : e.kind)))
					.sort((a, b) => (b.is_dir - a.is_dir) || a.name.localeCompare(b.name))
			} catch (e) {
				if (fallBackToRoot && path !== this.root) {
					return this.open(this.root)
				}
				this.error = e.response?.data?.message || e.message
			} finally {
				this.loading = false
			}
		},
		switchRoot(root) {
			this.root = root
			this.open(root)
		},
		pick(entry) {
			if (entry.is_dir) {
				this.open(entry.path)
			} else {
				this.selected = entry.path
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-path-picker {
	width: 36rem;
	max-width: 100%;

	.modal-card-body {
		position: relative;
		min-height: 18rem;
	}

	.crumb {
		color: var(--casa-text-link, #1f7ae0);
	}

	.entries {
		.entry {
			display: flex;
			align-items: center;
			padding: 0.4rem 0.5rem;
			border-radius: 0.375rem;

			&:hover {
				background: var(--casa-hover, rgba(0, 0, 0, 0.05));
			}

			&.is-selected {
				background: rgba(31, 122, 224, 0.15);
			}
		}
	}
}
</style>
