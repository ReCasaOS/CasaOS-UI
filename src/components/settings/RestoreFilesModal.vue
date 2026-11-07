<template>
	<div class="modal-card restore-files touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Put back files of {app}', { app }) }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<p class="settings-intro mb-3">
				{{ $t('The backup taken on {when}. Open a folder by clicking its name, tick what to put back. Nothing else is touched.', { when }) }}
			</p>

			<nav class="breadcrumb is-small mb-2" aria-label="breadcrumbs">
				<ul>
					<li :class="{ 'is-active': !crumbs.length }">
						<a href="#" @click.prevent="goTo(-1)">{{ $t('This backup') }}</a>
					</li>
					<li v-for="(crumb, index) in crumbs" :key="index" :class="{ 'is-active': index === crumbs.length - 1 }">
						<a href="#" @click.prevent="goTo(index)">{{ crumb }}</a>
					</li>
				</ul>
			</nav>

			<b-loading v-model="isLoading" :is-full-page="false" />

			<p v-if="!isLoading && !error && !files.length" class="_has-text-gray is-size-7">
				{{ $t('This folder is empty.') }}
			</p>

			<ul class="files">
				<li v-for="file in files" :key="file.name" class="file is-flex is-align-items-center">
					<b-checkbox :model-value="isChosen(file)" :aria-label="file.name" @update:model-value="toggle(file)" />
					<a v-if="file.directory" class="name is-flex-grow-1" href="#" @click.prevent="open(file)">{{ file.name }}/</a>
					<span v-else class="name is-flex-grow-1">{{ file.name }}</span>
					<span v-if="!file.directory" class="size _has-text-gray is-size-7">{{ size(file.size) }}</span>
				</li>
			</ul>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<span class="_has-text-gray is-size-7 is-flex-grow-1">
				{{ $t('{count} chosen', { count: chosen.length }) }}
				<a v-if="chosen.length" class="ml-2" href="#" @click.prevent="chosen = []">{{ $t('Clear') }}</a>
			</span>
			<b-button class="mr-2" rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
			<b-button :disabled="!chosen.length" :loading="restoring" rounded type="is-danger" @click="confirmRestore">
				{{ $t('Put back…') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'restore-files-modal',
	props: {
		destination: { type: String, required: true },
		app: { type: String, required: true },
		stamp: { type: String, required: true },
	},
	emits: ['close'],
	data() {
		// `crumbs` are the folders opened, from the top of the backup
		return { files: [], crumbs: [], chosen: [], isLoading: false, restoring: false, error: '' }
	},
	computed: {
		when() {
			const iso = this.stamp.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/, '$1T$2:$3:$4Z')
			const date = new Date(iso)

			return Number.isNaN(date.getTime()) ? this.stamp : date.toLocaleString()
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		pathOf(...names) {
			return [...this.crumbs, ...names].join('/')
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.backup.browse(this.destination, this.app, this.stamp, this.pathOf())
				this.files = res.data.data || []
			} catch (error) {
				const data = error.response && error.response.data
				this.files = []
				this.error = this.$t('The backup could not be read: {error}', { error: (data && data.message) || error.message })
			} finally {
				this.isLoading = false
			}
		},

		open(file) {
			this.crumbs = [...this.crumbs, file.name]

			return this.load()
		},

		// -1 is the top of the backup
		goTo(index) {
			this.crumbs = this.crumbs.slice(0, index + 1)

			return this.load()
		},

		size(bytes) {
			return renderSize(bytes)
		},

		// a choice is kept while going from folder to folder
		isChosen(file) {
			return this.chosen.includes(this.pathOf(file.name))
		},

		toggle(file) {
			const path = this.pathOf(file.name)
			this.chosen = this.chosen.includes(path) ? this.chosen.filter(chosen => chosen !== path) : [...this.chosen, path]
		},

		// Said before it is done: where it goes, over what, and that the app stops.
		confirmRestore() {
			this.$buefy.dialog.confirm({
				title: this.$t('Put these back in {app}?', { app: this.app }),
				message: this.$t('{count} chosen from the backup taken on {when} go back to where {app} keeps them now, over the files that are there. Nothing else is deleted. The app is stopped while they are copied. This cannot be undone.', { count: this.chosen.length, when: this.when, app: this.app }),
				confirmText: this.$t('Put back'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.restore(),
			})
		},

		async restore() {
			this.restoring = true
			try {
				await this.$api.backup.restore(this.destination, this.app, this.stamp, this.chosen)
				this.$buefy.toast.open({
					message: this.$t('Restore started. Its outcome will appear in the History tab.'),
					type: 'is-success',
					duration: 5000,
				})
				this.$emit('close')
			} catch (error) {
				const data = error.response && error.response.data
				this.error = (data && data.message) || error.message
			} finally {
				this.restoring = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.restore-files {
  .modal-card-body {
    min-height: 14rem;
  }

  .files {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .file {
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .name {
    overflow-wrap: anywhere;
  }
}
</style>
