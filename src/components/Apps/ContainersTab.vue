<template>
	<section class="modal-card-body containers-tab">
		<div class="is-flex is-align-items-center mb-2">
			<p class="has-text-full-03 is-size-7 is-flex-grow-1">
				{{ $t('One row per container of this app, as Docker sees it right now.') }}
			</p>
			<b-button :loading="isLoading" rounded size="is-small" @click="load">
				{{ $t('Refresh') }}
			</b-button>
		</div>

		<b-message v-if="error" class="mb-0" size="is-small" type="is-danger">
			{{ error }}
		</b-message>

		<b-table v-else :data="rows" :loading="isLoading" :mobile-cards="false" :opened-detailed="opened"
			:show-detail-icon="false" class="is-size-7" custom-row-key="key" detail-key="key" detailed>
			<b-table-column v-slot="{ row }" :label="$t('Service')" field="service">
				<span class="has-text-weight-medium">{{ row.service }}</span>
				<!-- Almost every service holds a single container and naming it would say
					nothing; a scaled one needs the name to tell its replicas apart. -->
				<div v-if="row.replicas > 1" class="containers-tab__mono has-text-full-03">
					{{ row.name }}
				</div>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('State')" field="state">
				<b-tag v-if="stateOf(row)" :title="$t(stateOf(row).hint)" :type="stateOf(row).type">
					{{ $t(stateOf(row).label) }}
				</b-tag>
				<span v-else>{{ row.state }}</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Health')" field="health">
				<!-- The chip opens what it stands for: the command, how often it runs and
					what it last answered. -->
				<button v-if="healthOf(row).tag" :aria-expanded="isOpen(row)" :title="isOpen(row) ? $t('Hide the health check') : $t('Show the health check')"
					class="containers-tab__health" data-action="health" type="button" @click="toggle(row)">
					<b-tag :type="healthOf(row).tag.type">
						{{ $t(healthOf(row).tag.label) }}
					</b-tag>
					<b-icon :icon="isOpen(row) ? 'chevron-up' : 'chevron-down'" custom-size="mdi-18px" />
				</button>
				<span v-else class="has-text-full-03">{{ healthOf(row).text ? $t(healthOf(row).text) : '-' }}</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Image')" field="image">
				<span class="containers-tab__mono">{{ row.image }}</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('CPU')" field="cpu" numeric>
				<span v-if="statsOf(row)">{{ cpuText(statsOf(row)) }}</span>
				<span v-else class="has-text-full-03">-</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Memory')" field="memory">
				<span v-if="statsOf(row)" class="containers-tab__mono">{{ memoryText(statsOf(row)) }}</span>
				<span v-else class="has-text-full-03">-</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Published ports')" field="ports">
				<span v-if="!row.ports.length" class="has-text-full-03">{{ $t('None') }}</span>
				<template v-else>
					<div v-for="port in row.ports" :key="port" class="containers-tab__port">
						{{ port }}
					</div>
				</template>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Uptime')" field="uptime">
				<span v-if="row.uptime">{{ row.uptime }}</span>
				<span v-else class="has-text-full-03">-</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Exit code')" field="exitCode" numeric>
				<span v-if="row.exitCode !== null">{{ row.exitCode }}</span>
				<span v-else class="has-text-full-03">-</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Actions')">
				<div class="containers-tab__actions">
					<!-- One service at a time: the app-level buttons take the whole stack
						down, which is a bigger outage than the fault they usually fix. -->
					<b-tooltip v-for="act in actionsFor(row)" :key="act.action" :label="$t(act.label)"
						position="is-left" type="is-dark">
						<b-button :data-action="act.action"
							:disabled="!!busy[row.id]"
							:icon-left="act.icon"
							:loading="busy[row.id] === act.action"
							class="mr-1"
							rounded
							size="is-small"
							@click="run(row, act.action)" />
					</b-tooltip>
					<b-tooltip :label="logsTooltip(row)" position="is-left" type="is-dark">
						<b-button :disabled="!row.id"
							class="mr-1"
							data-action="logs"
							icon-left="text-box-outline"
							rounded
							size="is-small"
							@click="open(row, 'logs')" />
					</b-tooltip>
					<b-tooltip :label="terminalTooltip(row)" position="is-left" type="is-dark">
						<b-button :disabled="row.state !== 'running'"
							data-action="terminal"
							icon-left="console"
							rounded
							size="is-small"
							@click="open(row, 'terminal')" />
					</b-tooltip>
					<!-- the container's files are read through its running process -->
					<b-tooltip :label="filesTooltip(row)" position="is-left" type="is-dark">
						<b-button :disabled="row.state !== 'running'"
							class="ml-1"
							data-action="files"
							icon-left="folder-outline"
							rounded
							size="is-small"
							@click="open(row, 'files')" />
					</b-tooltip>
				</div>
			</b-table-column>

			<template #detail="{ row }">
				<div class="containers-tab__check" data-health-detail>
					<b-message v-if="healthError[row.id]" class="mb-0" size="is-small" type="is-danger">
						{{ healthError[row.id] }}
					</b-message>
					<p v-else-if="!health[row.id]" class="has-text-full-03">
						{{ $t('Loading…') }}
					</p>
					<template v-else>
						<template v-if="health[row.id].command">
							<p class="has-text-full-03">
								{{ $t('Command') }}
							</p>
							<p class="containers-tab__mono mb-2">
								{{ health[row.id].command }}
							</p>
						</template>
						<p class="has-text-full-03 mb-2">
							{{ timingOf(health[row.id]) }}
						</p>
						<p class="has-text-full-03">
							{{ $t('Last checks') }}
						</p>
						<p v-if="!runsOf(row).length" class="has-text-full-03">
							{{ $t('The check has not run yet.') }}
						</p>
						<p v-for="(check, index) in runsOf(row)" :key="index" :class="check.passed ? 'has-text-success' : 'has-text-danger'"
							class="containers-tab__mono">
							{{ check.at }} {{ check.passed ? $t('passed') : $t('failed ({code})', { code: check.exitCode }) }}<template v-if="check.output"> — {{ check.output }}</template>
						</p>
					</template>
					<div class="mt-2">
						<!-- the Compose tab of an app built from a repository only says where its file is edited -->
						<b-button v-if="canEditCompose" class="mr-1" data-action="edit-check" rounded size="is-small" @click="$emit('compose')">
							{{ $t('Edit in Compose') }}
						</b-button>
						<b-button data-action="check-logs" rounded size="is-small" @click="open(row, 'logs')">
							{{ $t('Logs') }}
						</b-button>
					</div>
				</div>
			</template>

			<template #empty>
				<p class="has-text-centered has-text-full-03 is-size-7 py-4">
					{{ $t('Docker knows no container for this app.') }}
				</p>
			</template>
		</b-table>
	</section>
</template>

<script>
import escape from 'lodash/escape'
import { CONTAINER_STATES, containerActions, containerRows, healthCell, healthRuns } from './containerSummary'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'ContainersTab',
	props: {
		appId: { type: String, required: true },
		// false for an app whose compose file is not edited here (built from a repository)
		canEditCompose: { type: Boolean, default: true },
	},
	emits: ['open', 'compose'],
	data() {
		return {
			rows: [],
			isLoading: false,
			error: '',
			// container id -> the action running on it, so one row's button spins
			// without disabling the tab
			busy: {},
			// container id -> its last sample. Kept apart from the rows, which are
			// rebuilt on every reload: merged in, a refresh would blank both columns
			// for as long as the sample takes, which is most of the time between two.
			stats: {},
			statsTimer: null,
			// the keys of the rows whose health check is open
			opened: [],
			// container id -> its health check, as last read; and what went wrong reading it
			health: {},
			healthError: {},
		}
	},
	mounted() {
		this.load()
		// Numbers nobody refreshes are not worth a column. Cleared below -- an
		// interval that outlives its component is how this dashboard once made
		// people log in twice.
		this.statsTimer = setInterval(this.loadStats, 5000)
	},
	beforeUnmount() {
		clearInterval(this.statsTimer)
	},
	methods: {
		actionsFor(row) {
			return containerActions(row)
		},

		statsOf(row) {
			return row.id ? this.stats[row.id] : null
		},

		cpuText(stat) {
			// Percent of ONE CPU, like `docker stats`: a container using two whole
			// cores reads 200%, which is information rather than an error.
			return `${stat.cpu_percent.toFixed(1)}%`
		},

		memoryText(stat) {
			if (!stat.memory_limit)
				return renderSize(stat.memory_used)

			return `${renderSize(stat.memory_used)} / ${renderSize(stat.memory_limit)}`
		},

		// Failure here is silent on purpose: this runs every few seconds in the
		// background, and a toast per tick would bury the tab. The columns fall back
		// to showing nothing, which is what "not measured" looks like.
		async loadStats() {
			try {
				const res = await this.$api.container.getContainerStats(this.appId)
				const byId = {}
				for (const stat of res.data.data || [])
					byId[stat.container_id] = stat

				this.stats = byId
			} catch {
				// keep the last sample rather than blanking the columns on one bad tick
			}
		},

		// Synchronously, then reload: the row has to show what actually happened, and
		// the endpoint answers once Docker has done it rather than promising to.
		async run(row, action) {
			if (!row.id || this.busy[row.id])
				return

			this.busy = { ...this.busy, [row.id]: action }
			try {
				await this.$api.container.setContainerStatus(this.appId, row.id, action)
				await this.load()
			} catch (error) {
				const data = error.response && error.response.data
				this.$buefy.toast.open({
					message: escape((data && data.message) || error.message),
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
				})
			} finally {
				const { [row.id]: _done, ...rest } = this.busy
				this.busy = rest
			}
		},

		stateOf(row) {
			return CONTAINER_STATES[row.state]
		},

		isOpen(row) {
			return this.opened.includes(row.key)
		},

		toggle(row) {
			if (this.isOpen(row)) {
				this.opened = this.opened.filter(key => key !== row.key)
				return
			}
			this.opened = [...this.opened, row.key]
			this.loadHealth(row)
		},

		async loadHealth(row) {
			const { [row.id]: _gone, ...rest } = this.healthError
			this.healthError = rest
			try {
				const res = await this.$api.container.getContainerHealth(this.appId, row.id)
				this.health = { ...this.health, [row.id]: res.data.data || {} }
			} catch (error) {
				const data = error.response && error.response.data
				this.healthError = { ...this.healthError, [row.id]: (data && data.message) || error.message }
			}
		},

		runsOf(row) {
			return healthRuns(this.health[row.id] && this.health[row.id].checks)
		},

		// One sentence for the four numbers of a check; the start period only when there is one.
		timingOf(check) {
			const words = this.$t('Every {interval} s, {timeout} s allowed per run. Failed runs in a row before it is unhealthy: {retries}.', {
				interval: check.interval,
				timeout: check.timeout,
				retries: check.retries,
			})

			return check.start_period ? `${words} ${this.$t('Failed runs in the first {start} s do not count.', { start: check.start_period })}` : words
		},

		healthOf(row) {
			return healthCell(row)
		},

		terminalTooltip(row) {
			// A shell can only be opened inside a process that is running; saying so
			// beats a button that fails when pressed.
			if (!row.id)
				return this.$t('The compose file declares this service, but Docker runs no container for it.')

			return row.state === 'running' ? this.$t('Terminal') : this.$t('Only a running service has a terminal.')
		},

		filesTooltip(row) {
			if (!row.id)
				return this.$t('The compose file declares this service, but Docker runs no container for it.')

			return row.state === 'running' ? this.$t('Files') : this.$t('Only a running service shows its files.')
		},

		logsTooltip(row) {
			return row.id ? this.$t('Logs') : this.$t('The compose file declares this service, but Docker runs no container for it.')
		},

		// The row names the exact container, so a service with several of them opens the
		// one that was clicked instead of whichever the panel would have guessed.
		open(row, tab) {
			this.$emit('open', { service: row.service, containerId: row.id, tab })
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$openAPI.appManagement.compose.composeAppContainers(this.appId)
				this.rows = containerRows(res.data.data)
				this.loadStats()
				// An open check is re-read with its row. It is closed when its container is
				// gone or stopped: the chip that would close it is no longer drawn.
				this.opened = this.opened.filter(key => this.rows.some(row => row.key === key && healthCell(row).tag))
				this.rows.filter(row => this.isOpen(row)).forEach(row => this.loadHealth(row))
			} catch (error) {
				const data = error.response && error.response.data
				this.error = (data && data.message) || error.message
			} finally {
				this.isLoading = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.containers-tab {
  // ten columns: on a narrow window the table scrolls rather than crushing every
  // cell to fit, and the page itself never scrolls sideways
  .table-wrapper {
    overflow-x: auto;
  }

  &__mono {
    font-family: 'Monaco', 'Consolas', monospace;
    word-break: break-all;
  }

  // An image reference is long and has to break somewhere; a port mapping is
  // short and breaking it mid-token turned `6881 -> 6881/tcp` into a column one
  // character wide.
  &__port {
    font-family: 'Monaco', 'Consolas', monospace;
    white-space: nowrap;
  }

  &__actions {
    white-space: nowrap;
  }

  // the chip and its chevron, as one control
  &__health {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  &__check {
    padding: 0.25rem 0.5rem;
  }
}
</style>
