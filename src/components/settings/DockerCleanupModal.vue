<template>
	<div class="modal-card docker-cleanup touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Docker cleanup') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('What apps left behind on the disk. Installed apps are never touched, stopped ones included.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>
			<b-message v-if="done" class="mb-3" data-done size="is-small" type="is-success">
				{{ done }}
			</b-message>
			<b-message v-if="kept.length" class="mb-3" data-kept size="is-small" type="is-warning">
				<p>{{ $t('Kept, as Docker refused or it is in use again:') }}</p>
				<p v-for="line in kept" :key="line" class="docker-cleanup__mono">
					{{ line }}
				</p>
			</b-message>

			<p v-if="isLoading && !report" class="is-size-7 _has-text-gray">
				{{ $t('Docker is measuring. This can take a minute on a box with many images.') }}
			</p>

			<b-message v-if="report && report.held" class="mb-3" data-held size="is-small" type="is-info">
				{{ $t(heldText) }}
				<span v-if="report.detail" class="docker-cleanup__mono">{{ report.detail }}</span>
			</b-message>

			<!-- Folders of apps that are gone: shown first, since one of them is the usual
				reason an app cannot be read -->
			<div v-if="orphans.length" class="settings-card" data-row="orphans">
				<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
					<div class="is-flex-grow-1">
						<div class="has-text-weight-semibold">
							{{ $t('Apps that left a folder behind') }}
						</div>
						<div class="is-size-7 _has-text-gray">
							{{ $t('Folders with no container: {count}. These apps are not on the dashboard, and their folder still keeps their images and volumes out of the lists below.', { count: orphans.length }) }}
						</div>
					</div>
					<b-button :aria-expanded="open === 'orphans'" data-action="review-orphans" rounded size="is-small" @click="review('orphans')">
						{{ open === 'orphans' ? $t('Close') : $t('Review') }}
					</b-button>
				</div>
				<div v-if="open === 'orphans'" class="mt-2">
					<div v-for="name in orphans" :key="name" class="docker-cleanup__item">
						<b-checkbox v-model="pickedOrphans" :native-value="name" size="is-small">
							<span class="docker-cleanup__mono">{{ name }}</span>
						</b-checkbox>
					</div>
					<b-button :disabled="!pickedOrphans.length || !!busy" :loading="busy === 'orphans'" class="mt-2" data-action="move-orphans" rounded size="is-small"
						@click="moveOrphans">
						{{ $t('Move the ticked folders aside ({count})', { count: pickedOrphans.length }) }}
					</b-button>
				</div>
			</div>

			<!-- Old app versions: the images an update replaced -->
			<div v-if="old" class="settings-card is-flex is-flex-wrap-wrap is-align-items-center is-gap-1" data-row="old">
				<div class="is-flex-grow-1">
					<div class="has-text-weight-semibold">
						{{ $t('Old app versions') }}
					</div>
					<div class="is-size-7 _has-text-gray">
						{{ old.count ? $t('Images replaced by an update: {count} · {size}', { count: old.count, size: sizeOf(old.size) }) : $t('Nothing to free.') }}
					</div>
				</div>
				<b-button :disabled="!old.count || !!busy || held" :loading="busy === 'old'" data-action="free-old" rounded size="is-small" @click="freeOld">
					{{ $t('Free up') }}
				</b-button>
			</div>

			<template v-if="report">
				<!-- Build cache: nobody's data -->
				<div class="settings-card is-flex is-flex-wrap-wrap is-align-items-center is-gap-1" data-row="cache">
					<div class="is-flex-grow-1">
						<div class="has-text-weight-semibold">
							{{ $t('Build cache') }}
						</div>
						<div class="is-size-7 _has-text-gray">
							{{ report.build_cache ? $t('{size} kept to build faster. Without it, the next build of an app from a repository is slower.', { size: sizeOf(report.build_cache) }) : $t('Nothing to free.') }}
						</div>
					</div>
					<!-- the cache holds the data of no app: only a build that runs keeps it, not an app that cannot be read -->
					<b-button :disabled="!report.build_cache || !!busy || report.held === 'busy'" :loading="busy === 'cache'" data-action="free-cache" rounded size="is-small" @click="freeCache">
						{{ $t('Free up') }}
					</b-button>
				</div>

				<template v-if="!held">
					<!-- Images of no installed app -->
					<div class="settings-card" data-row="images">
						<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
							<div class="is-flex-grow-1">
								<div class="has-text-weight-semibold">
									{{ $t('Images of no installed app') }}
								</div>
								<div class="is-size-7 _has-text-gray">
									{{ report.images.length ? $t('Images no container uses: {count} · {size}. An app that needs one again downloads it.', { count: report.images.length, size: sizeOf(total(report.images)) }) : $t('Nothing to free.') }}
								</div>
							</div>
							<b-button v-if="report.images.length" :aria-expanded="open === 'images'" data-action="review-images" rounded size="is-small" @click="review('images')">
								{{ open === 'images' ? $t('Close') : $t('Review') }}
							</b-button>
						</div>
						<div v-if="open === 'images'" class="mt-2">
							<div v-for="image in report.images" :key="image.id" class="docker-cleanup__item">
								<b-checkbox v-model="pickedImages" :native-value="image.id" size="is-small">
									<span class="docker-cleanup__mono">{{ image.tags.join(', ') }}</span>
									<span class="is-size-7 _has-text-gray"> · {{ sizeOf(image.size) }} · {{ dayOf(image.created * 1000) }}</span>
								</b-checkbox>
							</div>
							<b-button :disabled="!pickedImages.length || !!busy" :loading="busy === 'images'" class="mt-2" data-action="delete-images" rounded size="is-small"
								type="is-danger" @click="deleteImages">
								{{ $t('Delete the ticked images ({count})', { count: pickedImages.length }) }}
							</b-button>
						</div>
					</div>

					<!-- Volumes of no installed app: data, and nothing ticked -->
					<div class="settings-card" data-row="volumes">
						<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
							<div class="is-flex-grow-1">
								<div class="has-text-weight-semibold">
									{{ $t('Volumes of no installed app') }}
								</div>
								<div class="is-size-7 _has-text-gray">
									{{ report.volumes.length ? $t('Volumes no container uses: {count} · {size}. They can hold data you kept when you removed an app.', { count: report.volumes.length, size: sizeOf(total(report.volumes)) }) : $t('Nothing to free.') }}
								</div>
							</div>
							<b-button v-if="report.volumes.length" :aria-expanded="open === 'volumes'" data-action="review-volumes" rounded size="is-small" @click="review('volumes')">
								{{ open === 'volumes' ? $t('Close') : $t('Review') }}
							</b-button>
						</div>
						<div v-if="open === 'volumes'" class="mt-2">
							<div v-for="volume in report.volumes" :key="volume.name" class="docker-cleanup__item">
								<b-checkbox v-model="pickedVolumes" :native-value="volume.name" size="is-small">
									<span class="docker-cleanup__mono">{{ volume.name }}</span>
									<span class="is-size-7 _has-text-gray">
										<template v-if="volume.app"> · {{ $t('made by {app}', { app: volume.app }) }}</template>
										· {{ volume.size < 0 ? $t('size unknown') : sizeOf(volume.size) }}<template v-if="volume.created"> · {{ dayOf(volume.created) }}</template>
									</span>
								</b-checkbox>
							</div>
							<b-button :disabled="!pickedVolumes.length || !!busy" :loading="busy === 'volumes'" class="mt-2" data-action="delete-volumes" rounded size="is-small"
								type="is-danger" @click="deleteVolumes">
								{{ $t('Delete the ticked volumes ({count})', { count: pickedVolumes.length }) }}
							</b-button>
						</div>
					</div>
				</template>
			</template>

			<!-- The weekly cleanup and what the last cleanups freed. A box older than the
				switch does not answer for it, and the card is left out. -->
			<div v-if="schedule" class="settings-card" data-row="weekly">
				<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
					<div class="is-flex-grow-1">
						<div class="has-text-weight-semibold">
							{{ $t('Clean up every week') }}
						</div>
						<div class="is-size-7 _has-text-gray">
							{{ $t('On Sunday night, the box frees the old app versions and the build cache by itself. Images and volumes of no app stay your choice: they are only ever deleted here, after a list.') }}
						</div>
						<div v-if="schedule.weekly && schedule.next" class="is-size-7 mt-1" data-next>
							{{ $t('Next run: {date}', { date: whenOf(schedule.next) }) }}
						</div>
					</div>
					<b-switch :disabled="savingWeekly" :model-value="schedule.weekly" data-action="weekly" size="is-small" @update:model-value="setWeekly">
						<span class="is-sr-only">{{ $t('Clean up every week') }}</span>
					</b-switch>
				</div>
				<div class="is-size-7 mt-2">
					<div class="has-text-weight-semibold">
						{{ $t('Last cleanups') }}
					</div>
					<div v-if="!schedule.runs.length" class="_has-text-gray">
						{{ $t('Nothing has been freed yet.') }}
					</div>
					<div v-for="(run, index) in lastRuns" :key="index" :class="run.error ? 'has-text-danger' : '_has-text-gray'" data-run>
						{{ whenOf(run.at) }} · {{ $t(whatOf(run)) }}<template v-if="run.scheduled"> ({{ $t('automatic') }})</template> ·
						<template v-if="run.error">{{ $t('failed: {error}', { error: run.error }) }}</template>
						<template v-else>{{ $t('Freed {size}', { size: sizeOf(run.size) }) }}</template>
					</div>
				</div>
			</div>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :disabled="!!busy" :loading="isLoading" class="mr-auto" data-action="refresh" rounded @click="load">
				{{ $t('Refresh') }}
			</b-button>
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { renderSize } from '@/mixins/file_utils'

// what a run of the history freed, in the words of the rows above
const RUNS = {
	weekly: 'Weekly cleanup',
	old_versions: 'Old app versions',
	build_cache: 'Build cache',
	images: 'Images',
	volumes: 'Volumes',
}

const HELD = {
	busy: 'Something runs on an app: an install, an update, a backup, a restore, a folder sync, or a move of the data of Docker. Nothing is deleted until it has ended.',
	unreadable: 'What an app still needs cannot be read, so nothing is offered until it is fixed:',
}

export default {
	name: 'DockerCleanupModal',
	emits: ['close'],
	data() {
		return {
			// GET /cleanup: { build_cache, images, volumes, held }; null until it answered
			report: null,
			// GET /images/dangling: { count, size }; null when that route did not answer
			old: null,
			isLoading: false,
			// the row whose deletion runs: 'old', 'cache', 'images' or 'volumes'
			busy: '',
			error: '',
			done: '',
			kept: [],
			// the list that is open, and what is ticked in each
			open: '',
			pickedImages: [],
			pickedVolumes: [],
			pickedOrphans: [],
			// GET /cleanup/schedule: { weekly, next, runs }; null on a box older than the switch
			schedule: null,
			savingWeekly: false,
			// false until the images were opened once: they come ticked then, and what
			// the owner unticks stays unticked
			imagesOpened: false,
		}
	},
	computed: {
		// true while the box offers nothing: an operation runs, or an app cannot be read
		held() {
			return !!(this.report && this.report.held)
		},

		// a box older than the row sends no list
		orphans() {
			return (this.report && this.report.orphans) || []
		},

		// the history is short on screen: the last five
		lastRuns() {
			return this.schedule.runs.slice(0, 5)
		},

		heldText() {
			return HELD[this.report.held] || HELD.unreadable
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		sizeOf(bytes) {
			return renderSize(bytes)
		},

		whenOf(when) {
			return new Date(when).toLocaleString()
		},

		whatOf(run) {
			return RUNS[run.what] || run.what
		},

		// Optimistic, and put back when the box refuses: the switch must not say on
		// while nothing is scheduled.
		async setWeekly(weekly) {
			const was = this.schedule
			this.schedule = { ...was, weekly }
			this.savingWeekly = true
			try {
				this.schedule = (await this.$api.cleanup.setSchedule(weekly)).data.data
			} catch (error) {
				this.schedule = was
				this.error = this.messageOf(error)
			} finally {
				this.savingWeekly = false
			}
		},

		dayOf(when) {
			return new Date(when).toLocaleDateString()
		},

		// a volume whose driver cannot measure it says -1, which is not a size
		total(list) {
			return list.reduce((sum, item) => sum + Math.max(item.size, 0), 0)
		},

		messageOf(error) {
			const data = error.response && error.response.data
			return (data && data.message) || error.message
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const [old, report, schedule] = await Promise.all([
					// its own route, older than this window: without it the row is left out
					this.$openAPI.appManagement.image.danglingImages().then(res => res.data.data, () => null),
					this.$api.cleanup.get().then(res => res.data.data),
					// newer than this window on some boxes: without it the card is left out
					this.$api.cleanup.getSchedule().then(res => res.data.data, () => null),
				])
				this.old = old
				this.report = report
				this.schedule = schedule
				// what is ticked is kept only while it is still listed
				this.pickedImages = this.pickedImages.filter(id => report.images.some(image => image.id === id))
				this.pickedVolumes = this.pickedVolumes.filter(name => report.volumes.some(volume => volume.name === name))
				this.pickedOrphans = this.pickedOrphans.filter(name => (report.orphans || []).includes(name))
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.isLoading = false
			}
		},

		// Images come ticked: they are downloaded again when needed. Volumes do not: a
		// volume is data, and each one is a choice.
		review(what) {
			this.open = this.open === what ? '' : what
			if (this.open === 'images' && !this.imagesOpened) {
				this.imagesOpened = true
				this.pickedImages = this.report.images.map(image => image.id)
			}
		},

		// One deletion at a time; what it freed and what was kept are said, then the
		// lists are read again.
		async run(row, call, said) {
			this.busy = row
			this.error = ''
			this.done = ''
			this.kept = []
			let failed = ''
			try {
				const result = (await call()).data.data || {}
				// a deletion the box refused whole freed nothing, and the line below says why
				if (said && (result.removed || []).length)
					this.done = said(result)
				else if (result.size > 0 || (result.removed || []).length)
					this.done = this.$t('Freed {size}', { size: renderSize(result.size || 0) })
				this.kept = Object.entries(result.refused || {}).map(([name, why]) => `${name}: ${why}`)
			} catch (error) {
				failed = this.messageOf(error)
			} finally {
				this.busy = ''
			}
			// read again first: load() clears the error, and a refusal must stay on screen
			await this.load()
			if (failed)
				this.error = failed
		},

		// Each question is written out in full: Buefy shows a message as HTML, and the
		// test that guards it reads the options one by one.
		freeOld() {
			this.$buefy.dialog.confirm({
				title: this.$t('Free up {size}', { size: escape(renderSize(this.old.size)) }),
				message: this.$t('Updating an app leaves the version it replaced on the disk. Deleting those frees the space. What an installed app still names is left alone.'),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.run('old', () => this.$openAPI.appManagement.image.pruneDanglingImages()),
			})
		},

		freeCache() {
			this.$buefy.dialog.confirm({
				title: this.$t('Free up {size}', { size: escape(renderSize(this.report.build_cache)) }),
				message: this.$t('The build cache holds no data of any app. Without it, the next build of an app from a repository is slower.'),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.run('cache', () => this.$api.cleanup.pruneBuildCache()),
			})
		},

		deleteImages() {
			const names = [...this.pickedImages]
			this.$buefy.dialog.confirm({
				title: this.$t('Delete the ticked images ({count})', { count: escape(String(names.length)) }),
				message: this.$t('No container uses them and no installed app names them. An app that needs one again downloads it.'),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.run('images', () => this.$api.cleanup.removeImages(names)),
			})
		},

		moveOrphans() {
			const names = [...this.pickedOrphans]
			this.$buefy.dialog.confirm({
				title: this.$t('Move the ticked folders aside ({count})', { count: escape(String(names.length)) }),
				message: this.$t('The folder of an app holds its compose file, which is its settings. It is moved to apps-removed, beside the folder of the apps, and not deleted. The images and volumes it kept can then be reviewed here. Folders to move: {names}', { names: names.map(name => escape(name)).join(', ') }),
				type: 'is-warning',
				confirmText: this.$t('Move aside'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.run('orphans', () => this.$api.cleanup.removeOrphans(names), result => this.$t('Moved aside: {names}', { names: result.removed.join(', ') })),
			})
		},

		deleteVolumes() {
			const names = [...this.pickedVolumes]
			this.$buefy.dialog.confirm({
				title: this.$t('Delete the ticked volumes ({count})', { count: escape(String(names.length)) }),
				message: this.$t('A volume holds data: a database, settings, files. What is deleted here cannot be recovered, and is in no backup made after the app was removed. Volumes to delete: {names}', { names: names.map(name => escape(name)).join(', ') }),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.run('volumes', () => this.$api.cleanup.removeVolumes(names)),
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.docker-cleanup {
  &__mono {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 0.75rem;
    word-break: break-all;
  }

  &__item {
    padding: 0.125rem 0;
  }
}
</style>
