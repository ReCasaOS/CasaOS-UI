<template>
	<div class="container-files" data-container-files>
		<!-- a text file, read in place -->
		<template v-if="viewer">
			<div class="is-flex is-align-items-center mb-2">
				<b-button icon-left="arrow-left" size="is-small" data-back @click="viewer = null">
					{{ $t('Back') }}
				</b-button>
				<span class="ml-3 is-size-7 has-text-weight-semibold container-files__path">{{ viewer.path }}</span>
				<div class="ml-auto is-flex">
					<b-button v-if="draft === null" icon-left="pencil" size="is-small" data-edit @click="draft = viewer.content">
						{{ $t('Edit') }}
					</b-button>
					<template v-else>
						<b-button size="is-small" data-cancel @click="draft = null">{{ $t('Cancel') }}</b-button>
						<b-button :loading="saving" class="ml-1" size="is-small" type="is-primary" data-save @click="save">
							{{ $t('Save') }}
						</b-button>
					</template>
					<b-button class="ml-1" icon-left="download" size="is-small" @click="download(viewer.path)">
						{{ $t('Download') }}
					</b-button>
				</div>
			</div>
			<textarea v-if="draft !== null" v-model="draft" :aria-label="viewer.path" class="textarea container-files__text" data-draft spellcheck="false"></textarea>
			<pre v-else class="container-files__text" data-text>{{ viewer.content }}</pre>
		</template>

		<template v-else>
			<div class="is-flex is-align-items-center is-flex-wrap-wrap mb-2">
				<nav aria-label="breadcrumb" class="breadcrumb is-small mb-0 container-files__crumbs">
					<ul>
						<li v-for="crumb in crumbs" :key="crumb.path" :class="{ 'is-active': crumb.path === path }">
							<a :data-crumb="crumb.path" href="#" @click.prevent="open(crumb.path)">{{ crumb.name }}</a>
						</li>
					</ul>
				</nav>
				<div class="ml-auto is-flex is-align-items-center">
					<b-button :disabled="!listed" class="mr-1" icon-left="folder-plus-outline" size="is-small" data-new-folder @click="newFolder">
						{{ $t('New folder') }}
					</b-button>
					<b-button :disabled="!listed" class="mr-1" icon-left="file-plus-outline" size="is-small" data-new-file @click="newFile">
						{{ $t('New file') }}
					</b-button>
					<b-button :disabled="!listed || !!sending" class="mr-3" icon-left="upload" size="is-small" data-upload @click="$refs.picker.click()">
						{{ $t('Upload') }}
					</b-button>
					<input ref="picker" class="is-hidden" multiple type="file" data-picker @change="upload">
					<b-checkbox v-model="showHidden" class="is-size-7 mr-3" size="is-small" data-hidden>
						{{ $t('Hidden files') }}
					</b-checkbox>
					<b-button :aria-label="$t('Up')" :disabled="path === '/'" icon-left="arrow-up" size="is-small" data-up
						@click="open(parent)" />
					<b-button :aria-label="$t('Refresh')" class="ml-1" icon-left="refresh" size="is-small" data-refresh
						@click="open(path)" />
				</div>
			</div>

			<p v-if="error" class="has-text-danger is-size-7 mb-2" data-error>{{ error }}</p>
			<p v-else-if="sending" class="is-size-7 mb-2" data-sending>{{ $t('Sending {name}: {percent}%', sending) }}</p>
			<template v-else-if="listed">
				<!-- what survives an update: a volume keeps its files, the container's own layer does not -->
				<p v-if="inVolume" class="is-size-7 _has-text-gray mb-2" data-kept>
					{{ $t('This folder is on {volume}, kept when the app is updated.', { volume: inVolume }) }}
				</p>
				<p v-else class="is-size-7 has-text-warning-dark mb-2" data-lost>
					{{ $t('This folder is in the container itself: what it holds is lost when the app is updated or recreated.') }}
				</p>
				<p v-if="truncated" class="is-size-7 has-text-warning-dark mb-2" data-truncated>
					{{ $t('Only the first 5000 entries are shown.') }}
				</p>

				<div class="table-container container-files__table">
					<table class="table is-fullwidth is-narrow is-hoverable is-size-7">
						<thead>
							<tr>
								<th>{{ $t('Name') }}</th>
								<th class="has-text-right">{{ $t('Size') }}</th>
								<th>{{ $t('Permissions') }}</th>
								<th>{{ $t('Owner') }}</th>
								<th>{{ $t('Modified') }}</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							<tr v-if="!shown.length">
								<td class="_has-text-gray" colspan="6" data-empty>
									{{ entries.length ? $t('Only hidden files here.') : $t('This folder is empty.') }}
								</td>
							</tr>
							<tr v-for="entry in shown" :key="entry.name" :data-entry="entry.name">
								<td class="container-files__name">
									<b-icon :icon="iconOf(entry)" class="mr-1" size="is-small" />
									<a v-if="entry.type !== 'other'" href="#" @click.prevent="enter(entry)">{{ entry.name }}</a>
									<span v-else>{{ entry.name }}</span>
									<span v-if="entry.type === 'symlink'" class="_has-text-gray"> → {{ entry.link }}</span>
									<b-tag v-if="entry.volume" class="ml-2" size="is-small" type="is-success is-light" data-volume>{{ $t('Volume') }}</b-tag>
								</td>
								<td class="has-text-right">{{ entry.type === 'file' ? size(entry.size) : '' }}</td>
								<td class="is-family-monospace">{{ entry.octal }} {{ entry.mode }}</td>
								<td>{{ entry.user || entry.uid }}:{{ entry.group || entry.gid }}</td>
								<td>{{ date(entry.modified) }}</td>
								<td class="has-text-right">
									<b-button v-if="entry.type === 'file' || entry.type === 'symlink'" :aria-label="$t('Download {name}', { name: entry.name })" icon-left="download"
										size="is-small" type="is-text" @click="download(joinPath(entry.name))" />
									<b-button v-if="!entry.volume" :aria-label="$t('Delete {name}', { name: entry.name })" icon-left="delete-outline"
										size="is-small" type="is-text" data-delete @click="remove(entry)" />
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</template>
		</template>
		<b-loading v-model="loading" :is-full-page="false" />
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { crumbsOf, join, parentOf } from './containerPaths'
import containerFiles from '@/service/containerFiles'
import { renderSize } from '@/mixins/file_utils'

// The files of a running container: browse, read and edit a text, download, upload, make
// a folder or a file, delete. What is outside a volume is lost when the app is updated.
export default {
	name: 'ContainerFiles',
	props: {
		containerId: { type: String, required: true },
	},
	data() {
		return {
			path: '/',
			entries: [],
			inVolume: '',
			truncated: false,
			listed: false,
			showHidden: false,
			loading: false,
			error: '',
			viewer: null,
			// the text being edited, null when it is only read
			draft: null,
			saving: false,
			// the upload under way: { name, percent }
			sending: null,
		}
	},
	computed: {
		crumbs() {
			return crumbsOf(this.path)
		},
		parent() {
			return parentOf(this.path)
		},
		shown() {
			return this.showHidden ? this.entries : this.entries.filter(entry => !entry.name.startsWith('.'))
		},
	},
	created() {
		// not reactive: counts the folders asked for
		this.asked = 0
	},
	mounted() {
		this.open('/')
	},
	methods: {
		joinPath(name) {
			return join(this.path, name)
		},
		size: renderSize,
		date(at) {
			return new Date(at).toLocaleString()
		},
		iconOf(entry) {
			return { dir: 'folder', symlink: 'link-variant', file: 'file-outline' }[entry.type] || 'file-question-outline'
		},
		// what the box said; a stopped app is told in words of the window when reading
		failure(e, reading = true) {
			const message = e?.response?.data?.message
			if (reading && e?.response?.status === 409)
				return this.$t('Start the app to see its files.')

			if (typeof message === 'string' && message)
				return message

			return reading ? this.$t('The files could not be read.') : this.$t('The change could not be made.')
		},
		async open(path) {
			// the last folder asked for wins, whichever answer comes back last
			const asked = ++this.asked
			this.loading = true
			try {
				this.show((await containerFiles.list(this.containerId, path)).data.data, asked)
			} catch (e) {
				if (asked === this.asked)
					this.error = this.failure(e)
			} finally {
				if (asked === this.asked)
					this.loading = false
			}
		},
		show(data, asked) {
			if (asked === this.asked)
				Object.assign(this, { path: data.path, entries: data.entries, inVolume: data.in_volume || '', truncated: data.truncated, listed: true, error: '' })
		},
		// a folder opens; a file or a link to one is read
		async enter(entry) {
			const path = this.joinPath(entry.name)
			if (entry.type === 'dir')
				return this.open(path)
			if (entry.type === 'symlink') {
				const asked = ++this.asked
				this.loading = true
				try {
					return this.show((await containerFiles.list(this.containerId, path)).data.data, asked)
				} catch (e) {
					if (e?.response?.status !== 400)
						return this.toast(this.failure(e))
				} finally {
					if (asked === this.asked)
						this.loading = false
				}
			}

			return this.read(path)
		},
		async read(path) {
			this.loading = true
			try {
				const res = await containerFiles.content(this.containerId, path)
				this.viewer = { path, content: res.data.data.content }
				this.draft = null
			} catch (e) {
				this.toast(this.failure(e))
			} finally {
				this.loading = false
			}
		},
		// as the Files app does: a hidden frame, so the file goes to the disk as it comes. One
		// for the page, kept: removing it with the window could stop a download under way.
		download(path) {
			let frame = document.getElementById('container-files-download')
			if (!frame) {
				frame = Object.assign(document.createElement('iframe'), { id: 'container-files-download' })
				frame.style.display = 'none'
				document.body.appendChild(frame)
			}
			frame.src = containerFiles.downloadUrl(this.containerId, path, this.$store.state.access_token)
		},
		async save() {
			// what is saved, and where: the window may be gone back from in the meantime
			const { path } = this.viewer
			const content = this.draft
			this.saving = true
			try {
				await containerFiles.write(this.containerId, path, content, true)
				if (this.viewer?.path === path) {
					this.viewer = { path, content }
					this.draft = null
				}
			} catch (e) {
				this.toast(this.failure(e, false))
			} finally {
				this.saving = false
			}
		},
		ask(folder, onConfirm) {
			this.$buefy.dialog.prompt({
				message: folder ? this.$t('Name of the new folder') : this.$t('Name of the new file'),
				inputAttrs: { maxlength: 255, required: true },
				confirmText: this.$t('Create'),
				cancelText: this.$t('Cancel'),
				trapFocus: true,
				onConfirm,
			})
		},
		// a name, not a path: no slash, and not . or ..
		nameOk(name) {
			const ok = name && !name.includes('/') && name !== '.' && name !== '..'
			if (!ok)
				this.toast(this.$t('A name cannot hold a slash, nor be . or ..'))

			return ok
		},
		newFolder() {
			this.ask(true, async (name) => {
				if (!this.nameOk(name.trim()))
					return
				try {
					await containerFiles.mkdir(this.containerId, this.joinPath(name.trim()))
					await this.open(this.path)
				} catch (e) {
					this.toast(this.failure(e, false))
				}
			})
		},
		newFile() {
			this.ask(false, async (name) => {
				if (!this.nameOk(name.trim()))
					return
				const path = this.joinPath(name.trim())
				try {
					await containerFiles.write(this.containerId, path, '', false)
					await this.open(this.path)
					this.viewer = { path, content: '' }
					this.draft = ''
				} catch (e) {
					this.toast(this.failure(e, false))
				}
			})
		},
		// one file after another, into the folder shown when they were picked; a name already
		// there is asked about before anything is sent
		async upload(event) {
			const files = [...(event.target.files || [])]
			event.target.value = ''
			if (!files.length || this.sending)
				return
			const dir = this.path
			const taken = new Set(this.entries.map(entry => entry.name))
			for (const file of files) {
				const replace = taken.has(file.name)
				if (replace && !(await this.confirmReplace(file.name)))
					continue
				this.sending = { name: file.name, percent: 0 }
				try {
					await containerFiles.upload(this.containerId, join(dir, file.name), file, replace, (progress) => {
						this.sending = { name: file.name, percent: progress.total ? Math.round(progress.loaded * 100 / progress.total) : 0 }
					})
				} catch (e) {
					this.toast(this.failure(e, false))
				}
			}
			this.sending = null
			if (this.path === dir)
				await this.open(dir)
		},
		confirmReplace(name) {
			return new Promise((resolve) => {
				this.$buefy.dialog.confirm({
					message: this.$t('{name} is already here. Replace it?', { name: escape(name) }),
					confirmText: this.$t('Replace'),
					cancelText: this.$t('Cancel'),
					type: 'is-warning',
					onConfirm: () => resolve(true),
					onCancel: () => resolve(false),
				})
			})
		},
		remove(entry) {
			const folder = entry.type === 'dir'
			this.$buefy.dialog.confirm({
				message: folder
					? this.$t('Delete the folder {name} and all it holds? This cannot be undone.', { name: escape(entry.name) })
					: this.$t('Delete {name}? This cannot be undone.', { name: escape(entry.name) }),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				focusOn: 'cancel',
				onConfirm: async () => {
					try {
						await containerFiles.remove(this.containerId, this.joinPath(entry.name))
					} catch (e) {
						this.toast(this.failure(e, false))
					}
					await this.open(this.path)
				},
			})
		},
		toast(message) {
			this.$buefy.toast.open({ message: escape(message), type: 'is-warning' })
		},
	},
}
</script>

<style lang="scss" scoped>
.container-files {
	position: relative;
	min-height: 20rem;

	&__table {
		max-height: 32rem;
		overflow-y: auto;
	}

	&__name {
		word-break: break-all;
	}

	&__text {
		max-height: 32rem;
		overflow: auto;
		white-space: pre;
		font-size: 0.75rem;
		font-family: monospace;
	}

	textarea.container-files__text {
		min-height: 24rem;
	}

	&__path {
		word-break: break-all;
	}
}
</style>
