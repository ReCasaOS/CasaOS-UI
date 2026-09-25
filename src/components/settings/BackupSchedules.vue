<template>
	<div>
		<div class="is-flex is-align-items-center mb-2">
			<p class="_has-text-gray is-size-7 is-flex-grow-1">
				{{ $t('Backups that run on their own. A missed slot catches up at the next check rather than waiting for the next day.') }}
			</p>
			<b-button :loading="isLoading" rounded size="is-small" @click="load">{{ $t('Refresh') }}</b-button>
		</div>

		<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">{{ error }}</b-message>

		<p v-if="!isLoading && !error && !schedules.length" class="_has-text-gray is-size-7 mb-3">
			{{ $t('Nothing is scheduled.') }}
		</p>

		<div v-for="(schedule, index) in schedules" :key="index" class="schedule mb-3 pb-2">
			<div class="is-flex is-align-items-center mb-1">
				<b-select v-model="schedule.app" class="mr-1" expanded size="is-small">
					<option v-for="app in apps" :key="app" :value="app">{{ app }}</option>
				</b-select>
				<span class="mr-1 _has-text-gray is-size-7">{{ $t('to') }}</span>
				<b-select v-model="schedule.destination" class="mr-1" expanded size="is-small">
					<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
				</b-select>
				<b-button icon-left="close-outline" icon-pack="casa" rounded size="is-small"
					@click="schedules.splice(index, 1)" />
			</div>

			<div class="is-flex is-flex-wrap-wrap is-row-gap-1 is-align-items-center">
				<b-select v-model="schedule.every" class="mr-1" size="is-small">
					<option value="daily">{{ $t('Every day') }}</option>
					<option value="weekly">{{ $t('Every week') }}</option>
				</b-select>

				<b-select v-if="schedule.every === 'weekly'" v-model.number="schedule.weekday" class="mr-1" size="is-small">
					<option v-for="(day, number) in weekdays" :key="number" :value="number">{{ $t(day) }}</option>
				</b-select>

				<span class="mr-1 _has-text-gray is-size-7">{{ $t('at') }}</span>
				<b-input v-model="schedule.at" class="mr-2 _time" placeholder="03:00" size="is-small" />

				<span class="mr-1 _has-text-gray is-size-7">{{ $t('keep') }}</span>
				<b-input v-model.number="schedule.keep" class="mr-2 _keep" min="0" size="is-small" type="number" />

				<b-switch v-model="schedule.hold_still" class="mr-2" size="is-small">{{ $t('Stop app') }}</b-switch>
				<b-switch v-model="schedule.enabled" size="is-small">{{ $t('Enabled') }}</b-switch>
			</div>
		</div>

		<p class="_has-text-gray is-size-7 mb-2">
			{{ $t('Keep 0 means every backup is kept. Nothing here deletes a backup unless a number says to.') }}
		</p>

		<div class="is-flex is-align-items-center">
			<b-button :disabled="!apps.length || !destinations.length" class="mr-2" rounded size="is-small" @click="add">
				{{ $t('Add') }}
			</b-button>
			<div class="is-flex-grow-1"></div>
			<b-button :loading="busy" rounded size="is-small" type="is-primary" @click="save">
				{{ $t('Save') }}
			</b-button>
		</div>
	</div>
</template>

<script>
export default {
	name: 'backup-schedules',
	data() {
		return {
			schedules: [],
			destinations: [],
			apps: [],
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
				const [schedules, destinations, grid] = await Promise.all([
					this.$api.backup.getSchedules(),
					this.$api.backup.getDestinations(),
					this.$openAPI.appGrid.getAppGrid(),
				])

				this.schedules = schedules.data.data || []
				this.destinations = destinations.data.data || []
				// only compose apps: the others have no backup route
				this.apps = (grid.data.data || [])
					.filter(item => item.app_type === 'v2app')
					.map(item => item.name)
					.sort()
			} catch (error) {
				this.error = this.$t('Schedules could not be loaded: {error}', { error: this.messageOf(error) })
			} finally {
				this.isLoading = false
			}
		},

		add() {
			this.schedules.push({
				app: this.apps[0],
				destination: this.destinations[0],
				every: 'daily',
				at: '03:00',
				weekday: 1,
				// Nothing is deleted unless somebody says a number.
				keep: 0,
				hold_still: true,
				enabled: true,
			})
		},

		async save() {
			this.busy = true
			this.error = ''
			try {
				await this.$api.backup.saveSchedules(this.schedules)
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
  border-bottom: 1px solid var(--casa-border, rgba(128, 128, 128, 0.2));

  ._time {
    width: 5rem;
  }

  ._keep {
    width: 4.5rem;
  }
}
</style>
