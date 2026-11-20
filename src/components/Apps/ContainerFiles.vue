<template>
	<div class="container-files" data-container-files>
		<!-- a text file, read in place -->
		<template v-if="viewer">
			<div class="is-flex is-align-items-center mb-2">
				<b-button icon-left="arrow-left" size="is-small" data-back @click="viewer = null">
					{{ $t('Back') }}
				</b-button>
				<span class="ml-3 is-size-7 has-text-weight-semibold container-files__path">{{ viewer.path }}</span>
				<b-button class="ml-auto" icon-left="download" size="is-small" @click="download(viewer.path)">
					{{ $t('Download') }}
				</b-button>
			</div>
			<pre class="container-files__text" data-text>{{ viewer.content }}</pre>
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

// The files of a running container: browse, read a text, download. Nothing is changed.
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
		failure(e) {
			const message = e?.response?.data?.message
			if (e?.response?.status === 409)
				return this.$t('Start the app to see its files.')

			return typeof message === 'string' && message ? message : this.$t('The files could not be read.')
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
	}

	&__path {
		word-break: break-all;
	}
}
</style>
