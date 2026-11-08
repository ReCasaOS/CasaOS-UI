<template>
	<div>
		<div class="is-flex is-align-items-center mb-2">
			<p class="settings-intro is-flex-grow-1 mr-2">
				{{ $t('Backups that run on their own. A missed slot catches up at the next check rather than waiting for the next day.') }}
			</p>
			<b-button :loading="isLoading" rounded size="is-small" @click="load">{{ $t('Refresh') }}</b-button>
		</div>

		<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">{{ error }}</b-message>

		<p v-if="!isLoading && !error && !schedules.length" class="_has-text-gray is-size-7 mb-3">
			{{ $t('Nothing is scheduled.') }}
		</p>

		<!-- The head says the whole schedule, so a folded one is a line; open, what
			to back up sits on the left and when on the right -->
		<section v-for="(schedule, index) in schedules" :key="index" :class="{ '_is-open': schedule._open }" class="schedule settings-card p-0">
			<div class="_head is-flex is-align-items-center">
				<span class="_clock mr-3"><b-icon icon="clock-outline" /></span>
				<div class="_text is-flex-grow-1 mr-2">
					<p class="has-text-weight-semibold">
						{{ whenText(schedule) }} <span class="_has-text-gray has-text-weight-normal">{{ $t('to') }}</span> {{ schedule.destination }}
					</p>
					<p class="_has-text-gray is-size-7">{{ whatText(schedule) }}</p>
				</div>
				<b-switch v-model="schedule.enabled" class="mr-1" size="is-small">{{ $t(schedule.enabled ? 'Enabled' : 'Disabled') }}</b-switch>
				<b-button :icon-left="schedule._open ? 'chevron-up' : 'chevron-down'" :title="$t(schedule._open ? 'Collapse' : 'Expand')"
					rounded size="is-small" type="is-text" @click="schedule._open = !schedule._open" />
				<b-button :title="$t('Remove')" icon-left="close-outline" icon-pack="casa" rounded size="is-small" type="is-text"
					@click="schedules.splice(index, 1)" />
			</div>

			<div v-if="schedule._open" class="_body">
				<div class="_what">
					<p class="_label">{{ $t('What to back up') }}</p>

					<b-checkbox v-model="schedule.apps" :class="{ '_is-on': schedule.apps.includes(systemApp) }" :native-value="systemApp" class="_tile _box">
						<span class="_icon _initial"><b-icon icon="home-outline" size="is-small" /></span>
						<span class="_name">
							<span class="has-text-weight-semibold">{{ $t('This box') }}</span>
							<span class="_has-text-gray is-size-7 is-block">{{ $t('Users, shares and their accounts, schedules, destinations') }}</span>
						</span>
					</b-checkbox>

					<div class="is-flex is-align-items-center mt-3 mb-2">
						<span class="has-text-weight-semibold">{{ $t('Applications') }}</span>
						<span class="_has-text-gray ml-1">· {{ $t('{selected} of {total}', { selected: chosen(schedule).length, total: appsOf(schedule).length }) }}</span>
						<span class="is-flex-grow-1"></span>
						<b-button class="px-1" size="is-small" type="is-text" @click="pick(schedule, true)">{{ $t('All') }}</b-button>
						<b-button class="px-1" size="is-small" type="is-text" @click="pick(schedule, false)">{{ $t('None') }}</b-button>
					</div>

					<div class="_grid">
						<b-checkbox v-for="app in appsOf(schedule)" :key="app.name" v-model="schedule.apps"
							:class="{ '_is-on': schedule.apps.includes(app.name) }" :native-value="app.name" class="_tile">
							<img v-if="app.icon" :src="app.icon" alt="" class="_icon">
							<span v-else class="_icon _initial">{{ app.title.slice(0, 1).toUpperCase() }}</span>
							<span class="_name">{{ app.title }}</span>
						</b-checkbox>
					</div>
				</div>

				<div class="_when">
					<p class="_label">{{ $t('When') }}</p>

					<b-field :label="$t('Destination')" label-position="on-border">
						<b-select v-model="schedule.destination" expanded size="is-small">
							<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
						</b-select>
					</b-field>

					<b-field :label="$t('Frequency')">
						<b-radio-button v-model="schedule.every" expanded native-value="daily" size="is-small">{{ $t('Every day') }}</b-radio-button>
						<b-radio-button v-model="schedule.every" expanded native-value="weekly" size="is-small">{{ $t('Every week') }}</b-radio-button>
					</b-field>

					<b-field v-if="schedule.every === 'weekly'" :label="$t('Weekday')" label-position="on-border">
						<b-select v-model.number="schedule.weekday" expanded size="is-small">
							<option v-for="(day, number) in weekdays" :key="number" :value="number">{{ $t(day) }}</option>
						</b-select>
					</b-field>

					<div class="_pair">
						<b-field :label="$t('Time')" label-position="on-border">
							<b-input v-model="schedule.at" placeholder="03:00" size="is-small" type="time" />
						</b-field>
						<b-field :label="$t('Keep')" label-position="on-border">
							<b-select v-model.number="schedule.keep" expanded size="is-small">
								<option v-for="count in keepChoices(schedule)" :key="count" :value="count">
									{{ count ? $t('The last {count}', { count }) : $t('Keep all') }}
								</option>
							</b-select>
						</b-field>
					</div>

					<div>
						<b-switch v-model="schedule.hold_still" size="is-small">{{ $t('Stop the apps during the copy') }}</b-switch>
						<p class="_has-text-gray is-size-7 mt-1">{{ $t('A consistent copy; each app is unavailable for a few minutes.') }}</p>
					</div>

					<p class="_has-text-gray is-size-7 mt-auto">{{ runsText(schedule) }}</p>
				</div>
			</div>
		</section>

		<div class="is-flex is-align-items-center">
			<b-button :disabled="!destinations.length" class="mr-2" icon-left="plus" rounded size="is-small" @click="add">
				{{ $t('Add a schedule') }}
			</b-button>
			<p class="_has-text-gray is-size-7 is-flex-grow-1">
				{{ $t('Nothing here deletes a backup unless a number says to.') }}
			</p>
			<b-button :loading="busy" rounded size="is-small" type="is-primary" @click="save">
				{{ $t('Save') }}
			</b-button>
		</div>
	</div>
</template>

<script>
import { SYSTEM_APP, groupSchedules, nextRun, spreadGroups } from './backupScheduleGroups.js'
import { renderSize } from '@/mixins/file_utils'
import { ice_i18n } from '@/mixins/base/common-i18n'

const KEEP_CHOICES = [0, 3, 7, 14, 30, 90]

export default {
	name: 'backup-schedules',
	data() {
		return {
			schedules: [],
			destinations: [],
			// the run log, newest first: what the last run of a schedule took and gave
			runs: [],
			// { name, title, icon } of the installed compose apps
			apps: [],
			systemApp: SYSTEM_APP,
			isLoading: false,
			busy: false,
			error: '',
			weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		}
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const [schedules, destinations, grid, runs] = await Promise.all([
					this.$api.backup.getSchedules(),
					this.$api.backup.getDestinations(),
					this.$openAPI.appGrid.getAppGrid(),
					this.$api.backup.getRuns(),
				])

				const groups = groupSchedules(schedules.data.data || [])
				// one schedule opens by itself; several fold, their head says enough
				for (const group of groups) {
					group._open = groups.length === 1
				}
				this.schedules = groups
				this.destinations = destinations.data.data || []
				this.runs = runs.data.data || []
				// only compose apps: the others have no backup route
				this.apps = (grid.data.data || [])
					.filter(item => item.app_type === 'v2app')
					.map(item => ({ name: item.name, title: (item.title && ice_i18n(item.title)) || item.name, icon: item.icon || '' }))
					.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
			} catch (error) {
				this.error = this.$t('Schedules could not be loaded: {error}', { error: this.messageOf(error) })
			} finally {
				this.isLoading = false
			}
		},

		// The installed apps, then any app a schedule names that is not installed any
		// more: left out, it would be saved again without anybody seeing it.
		appsOf(schedule) {
			const known = this.apps.map(app => app.name)
			const gone = schedule.apps.filter(name => name !== SYSTEM_APP && !known.includes(name))

			return [...this.apps, ...gone.map(name => ({ name, title: name, icon: '' }))]
		},

		chosen(schedule) {
			return schedule.apps.filter(name => name !== SYSTEM_APP)
		},

		pick(schedule, all) {
			const box = schedule.apps.includes(SYSTEM_APP) ? [SYSTEM_APP] : []
			schedule.apps = all ? [...box, ...this.appsOf(schedule).map(app => app.name)] : box
		},

		titleOf(name) {
			const app = this.apps.find(app => app.name === name)

			return app ? app.title : name
		},

		keepChoices(schedule) {
			return KEEP_CHOICES.includes(schedule.keep) ? KEEP_CHOICES : [...KEEP_CHOICES, schedule.keep].sort((a, b) => a - b)
		},

		// Next and last, the next by the server's own rule. The box's clock and the
		// browser's are taken as one: a schedule's time is the box's.
		runsText(schedule) {
			const next = nextRun(schedule)
			const parts = [
				this.$t('Next: {when}', { when: !next ? this.$t('Disabled').toLowerCase() : next.due ? this.$t('at the next check, a slot was missed') : this.whenOf(next.at) }),
				this.$t('Last: {when}', { when: schedule.last_run ? this.lastText(schedule) : this.$t('never yet') }),
			]

			return parts.join(' · ')
		},

		// The runs the last slot set off: one per app, sequential, so the batch
		// took from the first start to the last finish. shortcut: a run is in the
		// batch when it is scheduled, for these apps at this destination, and started
		// within six hours before the schedule's last run; a slot is a day apart at least.
		lastBatch(schedule) {
			if (!schedule.last_run) {
				return []
			}
			const last = new Date(schedule.last_run).getTime()

			return this.runs.filter((run) => {
				const started = new Date(run.started_at).getTime()

				return run.scheduled && !run.restore && run.destination === schedule.destination && schedule.apps.includes(run.app)
					&& started >= last - 6 * 3600000 && started <= last + 60000
			})
		},

		lastText(schedule) {
			const parts = [this.whenOf(new Date(schedule.last_run))]
			const batch = this.lastBatch(schedule)
			if (batch.length) {
				const started = Math.min(...batch.map(run => new Date(run.started_at).getTime()))
				const finished = Math.max(...batch.map(run => new Date(run.finished_at).getTime()))
				parts.push(this.durationText(finished - started))
				// what the copy read, added up over the apps; older boxes report nothing
				const bytes = batch.reduce((sum, run) => sum + (run.bytes || 0), 0)
				if (bytes) {
					parts.push(renderSize(bytes))
				}
				const failed = batch.filter(run => run.error).length
				parts.push(failed ? this.$t('{failed} of {total} failed', { failed, total: batch.length }) : this.$t('succeeded'))
			}

			return parts.join(', ')
		},

		durationText(ms) {
			const seconds = Math.max(0, Math.round(ms / 1000))
			if (seconds < 60) {
				return `${seconds} s`
			}
			const minutes = Math.round(seconds / 60)
			if (minutes < 60) {
				return `${minutes} min`
			}

			return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
		},

		whenOf(date) {
			const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
			const today = new Date()
			today.setHours(0, 0, 0, 0)
			const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - today) / 86400000)
			if (days === 0) {
				return this.$t('today at {time}', { time })
			}
			if (days === 1) {
				return this.$t('tomorrow at {time}', { time })
			}
			if (days === -1) {
				return this.$t('yesterday at {time}', { time })
			}
			if (Math.abs(days) < 7) {
				return date.toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
			}

			return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
		},

		whenText(schedule) {
			if (schedule.every === 'weekly') {
				return this.$t('Every {weekday} at {at}', { weekday: this.$t(this.weekdays[schedule.weekday] || 'Sunday'), at: schedule.at })
			}

			return this.$t('Every day at {at}', { at: schedule.at })
		},

		whatText(schedule) {
			const titles = this.chosen(schedule).map(name => this.titleOf(name))
			let what = titles.length > 2 ? this.$t('{count} apps', { count: titles.length }) : titles.join(', ')
			if (schedule.apps.includes(SYSTEM_APP)) {
				what = what ? this.$t('This box and {what}', { what }) : this.$t('This box')
			}
			const parts = [
				what || this.$t('Nothing chosen yet'),
				schedule.keep ? this.$t('the last {count} are kept', { count: schedule.keep }) : this.$t('everything is kept'),
			]
			if (schedule.hold_still) {
				parts.push(this.$t('apps stopped during the copy'))
			}

			return parts.join(' · ')
		},

		add() {
			this.schedules.push({
				apps: [],
				destination: this.destinations[0],
				every: 'daily',
				at: '03:00',
				weekday: 1,
				// Nothing is deleted unless somebody says a number.
				keep: 0,
				hold_still: true,
				enabled: true,
				_open: true,
			})
		},

		async save() {
			if (this.schedules.some(schedule => !schedule.apps.length)) {
				this.error = this.$t('Each schedule needs at least one app, or this box.')
				return
			}

			this.busy = true
			this.error = ''
			try {
				await this.$api.backup.saveSchedules(spreadGroups(this.schedules))
				this.$buefy.toast.open({ message: this.$t('Saved'), type: 'is-success' })
				await this.load()
			} catch (error) {
				// The server checks every schedule before saving any: a list saved
				// half-valid is a box where some backups silently never run.
				this.error = this.messageOf(error)
			} finally {
				this.busy = false
			}
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>

<style lang="scss" scoped>
.schedule {
  overflow: hidden;

  &._is-open {
    border-color: $primary;

    ._clock {
      color: $primary;
      background: rgba($primary, 0.14);
    }
  }

  ._head {
    min-height: 3.5rem;
    padding: 0.625rem 0.75rem 0.625rem 1rem;
  }

  ._clock {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--casa-hover-tint);
    color: var(--casa-text-secondary);
  }

  ._text {
    min-width: 0;
  }

  ._body {
    display: grid;
    grid-template-columns: 3fr 2fr;
    border-top: 1px solid var(--casa-divider-soft);
  }

  ._what {
    padding: 1rem;
    border-right: 1px solid var(--casa-divider-soft);
  }

  ._when {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }

  ._label {
    margin-bottom: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--casa-text-hint);
  }

  ._grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  // a checkbox drawn as a tile: the whole tile is the target
  ._tile.b-checkbox {
    display: flex;
    align-items: center;
    min-width: 0;
    // the global checkbox rule fixes a height: a two-line label spilled over the tile
    height: auto;
    min-height: 2.75rem;
    margin: 0;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--casa-divider-soft);
    border-radius: 10px;
    background: var(--casa-hover-tint);

    &._is-on {
      border-color: $primary;
      background: rgba($primary, 0.12);
    }

    :deep(.control-label) {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
      padding-left: 0.5rem;
    }
  }

  ._icon {
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border-radius: 8px;
    object-fit: cover;
  }

  ._initial {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--casa-surface-sunken);
  }

  ._name {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  ._box ._name {
    white-space: normal;
  }

  ._pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media screen and (max-width: 768px) {
    // the summary keeps its width; the switch and the buttons go to a line of their own
    ._head {
      flex-wrap: wrap;
      row-gap: 0.5rem;
    }

    ._text {
      flex: 1 1 12rem;
    }

    ._head .switch {
      margin-left: auto;
    }

    ._body {
      grid-template-columns: 1fr;
    }

    ._what {
      border-right: 0;
      border-bottom: 1px solid var(--casa-divider-soft);
    }

    ._grid {
      grid-template-columns: 1fr 1fr;
    }
  }
}
</style>
