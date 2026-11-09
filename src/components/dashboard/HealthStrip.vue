<template>
	<div class="health-strip-beta">
		<div class="tiles">
			<!-- a div that acts as a button: a real <button> is not stretched to the row by every browser, and the clickable tiles sat lower -->
			<div v-for="tile in tiles"
				:key="tile.key"
				:class="{ 'is-clickable': tile.onClick }"
				:role="tile.onClick ? 'button' : undefined"
				:tabindex="tile.onClick ? 0 : undefined"
				:title="tile.title"
				class="widget has-text-grey-100 tile"
				@click="tile.onClick && tile.onClick()"
				@keydown.enter.self.prevent="tile.onClick && tile.onClick()"
				@keydown.space.self.prevent="tile.onClick && tile.onClick()">
				<div class="blur-background"></div>
				<div class="widget-content">
					<div class="tile-label">{{ tile.label }}</div>
					<div class="tile-value">{{ tile.value }}</div>
					<div v-if="tile.bar !== null" class="tile-bar">
						<div :class="tile.level" :style="{ width: `${tile.bar}%` }"></div>
					</div>
					<div :class="{ [`is-${tile.level}`]: tile.status }" class="tile-detail">
						{{ tile.status || tile.detail }}
					</div>
				</div>
			</div>
		</div>

		<div class="beta-body">
			<aside class="beta-aside">
				<!-- the four cards share one anatomy: a head with an icon tile, the title and a chip that says the essential; rows; a foot with the action -->
				<section ref="attentionPanel" :class="`is-${attentionChip.level}`" class="widget has-text-grey-100 panel attention" tabindex="-1">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="panel-head">
							<span class="panel-tile"><b-icon icon="bell-outline" /></span>
							<span class="panel-title">{{ $t('Needs attention') }}</span>
							<span :class="`is-${attentionChip.level}`" class="panel-chip">{{ attentionChip.text }}</span>
						</div>
						<ul v-if="attention.length > 0" class="panel-body">
							<li v-for="item in attention" :key="item.key" :class="`is-${item.level}`">
								<button class="attention-item panel-row" type="button" @click="openAttention(item)">
									<span :class="`is-${item.level}`" class="panel-dot"></span>
									<span class="panel-grow">{{ item.text }}</span>
									<b-icon icon="chevron-right" size="is-small" />
								</button>
							</li>
						</ul>
					</div>
				</section>

				<section class="widget has-text-grey-100 panel storage">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="panel-head">
							<span class="panel-tile"><b-icon icon="harddisk" /></span>
							<span class="panel-title">{{ $t('Storage') }}</span>
							<span :class="`is-${storageChip.level}`" class="panel-chip">{{ storageChip.text }}</span>
						</div>
						<div class="panel-body">
							<div v-for="drive in drives" :key="drive.key" class="drive">
								<div class="panel-row">
									<span :class="`is-${drive.health || 'none'}`" class="panel-dot"></span>
									<span class="panel-grow">{{ drive.name }}</span>
									<!-- the colour of the dot, in words, read out always and shown when it is bad news -->
									<span v-if="drive.health" :class="[`is-${drive.health}`, { 'is-sr-only': drive.health !== 'failed' }]" class="drive-health">{{ driveHealthLabel(drive.health) }}</span>
									<span v-if="roleLabel(drive.role)" class="panel-role">{{ roleLabel(drive.role) }}</span>
									<span class="panel-value">{{ drive.percent }} %</span>
								</div>
								<div class="tile-bar">
									<div :class="drive.level" :style="{ width: `${drive.percent}%` }"></div>
								</div>
								<div class="tile-detail">{{ driveDetail(drive) }}</div>
							</div>
						</div>
						<div class="panel-foot">
							<button class="panel-action" type="button" @click="openStorage">
								<span class="panel-grow">{{ $t('Manage storage') }}</span>
								<b-icon icon="chevron-right" size="is-small" />
							</button>
						</div>
					</div>
				</section>

				<section class="widget has-text-grey-100 panel backups">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="panel-head">
							<span class="panel-tile"><b-icon icon="backup-restore" /></span>
							<span class="panel-title">{{ $t('Backups') }}</span>
							<span v-if="backupChip" :class="`is-${backupChip.level}`" class="panel-chip">{{ backupChip.text }}</span>
						</div>
						<div class="panel-body">
							<p v-if="runningBackup" class="tile-detail">
								{{ $t(runningBackup.restore ? 'Restoring {title}' : 'Backing up {title}', { title: runningBackup.title }) }} · {{ $t('{percent}% done', { percent: runningBackup.percent }) }}
							</p>
							<p v-if="backup.status === 'none' && !runningBackup" class="panel-empty">{{ $t('No backup yet') }}</p>
							<div v-else>
								<div>{{ $t('Last: {when}', { when: whenOf(new Date(backup.at)) }) }}</div>
								<div class="tile-detail">{{ lastBackupDetail }}</div>
							</div>
							<p v-if="backup.status === 'failed'" class="panel-error">{{ backup.error }}</p>
							<p v-if="nextBackup" class="tile-detail">{{ $t('Next: {when}', { when: nextBackup }) }}</p>
						</div>
						<div class="panel-foot">
							<button v-if="backupDestination" class="panel-action is-primary" type="button" @click="backupNow">{{ $t('Back up') }}</button>
							<button class="panel-action" type="button" @click="openBackups">
								<span class="panel-grow">{{ $t('Backups and restore') }}</span>
								<b-icon icon="chevron-right" size="is-small" />
							</button>
						</div>
					</div>
				</section>

				<section v-if="fleet && fleet.total" class="widget has-text-grey-100 panel fleet">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="panel-head">
							<span class="panel-tile"><b-icon icon="server-network" /></span>
							<span class="panel-title">{{ $t('Fleet') }}</span>
							<span class="panel-chip">{{ $t('{online} of {total} boxes online', { online: fleet.online, total: fleet.total }) }}</span>
						</div>
						<ul class="panel-body">
							<li v-for="box in fleet.boxes" :key="box.key" :class="`is-${box.state}`" class="panel-row">
								<span :class="`is-${box.state}`" class="panel-dot"></span>
								<span class="panel-grow">{{ box.name }}</span>
								<span class="fleet-state">{{ fleetStateLabel(box.state) }}</span>
							</li>
						</ul>
						<div class="panel-foot">
							<button class="fleet-open panel-action" type="button" @click="openFleetPage">
								<span class="tag is-dark is-rounded">{{ $t('Beta') }}</span>
								<span class="panel-grow">{{ $t('Open the Fleet page') }}</span>
								<b-icon icon="chevron-right" size="is-small" />
							</button>
						</div>
					</div>
				</section>
			</aside>

			<div class="beta-main">
				<slot></slot>
			</div>
		</div>
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { mixin } from '@/mixins/mixin'
import { openFleet } from '@/components/Fleet/entry'
import { snapraidHeld } from '@/components/Storage/snapraidPool'
import { attentionItems, backupTile, cpuFrequency, cpuWatts, diskRows, fleetPanel, netSpeed, percent, snapraidTile, usbPercent } from '@/components/dashboard/healthTiles'
import { DUE_GRACE, backupSubject, durationText, longestRun, nextOfAll, whenOf } from '@/components/settings/backupScheduleGroups.js'

// The classic widgets read these once and then follow the socket; the backup runs and
// SnapRAID have no event, so they are read again now and then.
const SLOW_REFRESH = 60 * 1000

export default {
	name: 'HealthStrip',
	mixins: [mixin],
	emits: ['attention'],
	data() {
		const info = this.$store.state.hardwareInfo || {}
		return {
			cpu: info.cpu || {},
			mem: info.mem || {},
			disk: info.sys_disk || {},
			net: info.net || [],
			usb: info.sys_usb || [],
			// the disks with their volumes (GET /v1/storage) and the drives (GET /v1/disks); empty on a box that does not answer
			storageList: [],
			driveList: [],
			speed: null,
			watts: null,
			runs: [],
			// the backups and restores going on now, by kind and app, from the socket:
			// the run log only has the ones that finished
			running: {},
			// the schedules, for the next run to come; none on an older box
			schedules: [],
			// the names of the backup destinations; none on a box that has not set one up
			destinations: [],
			snapraidState: null,
			fleetState: null,
			timer: 0,
		}
	},
	computed: {
		health() {
			return this.smartHealth(this.disk)
		},
		backup() {
			return backupTile(this.runs)
		},
		// the helpers take t as a function: $t unbound would lose its instance
		translate() {
			return (...args) => this.$t(...args)
		},
		raid() {
			return snapraidTile(this.snapraidState, this.translate)
		},
		// where Back up now sends it: where the last backup went, else the first destination
		backupDestination() {
			return this.destinations.includes(this.backup.destination) ? this.backup.destination : (this.destinations[0] || '')
		},
		attention() {
			return attentionItems({ health: this.health, snapraid: this.snapraidState, backup: this.backup, fleet: this.fleetState }, this.translate)
		},
		// the chips of the heads: what each card says before it is read. The attention list is worst first.
		attentionChip() {
			const items = this.attention

			return items.length ? { level: items[0].level, text: String(items.length) } : { level: 'ok', text: this.$t('All good') }
		},
		storageChip() {
			const failed = this.drives.filter(drive => drive.health === 'failed').length
			if (failed) {
				return { level: 'danger', text: this.$t('{count} failing', { count: failed }) }
			}
			const count = this.drives.length
			if (count && this.drives.every(drive => drive.health === 'passed')) {
				return { level: 'ok', text: count === 1 ? this.$t('Healthy') : this.$t('{count} healthy', { count }) }
			}

			// no SMART word for them all: the count alone
			return { level: 'none', text: String(count) }
		},
		runningBackup() {
			return Object.values(this.running)[0] || null
		},
		backupChip() {
			if (this.runningBackup) {
				return { level: 'info', text: this.$t('Running') }
			}
			if (this.backup.status === 'none') {
				return null
			}

			return this.backup.status === 'failed' ? { level: 'danger', text: this.$t('Failed') } : { level: 'ok', text: this.$t('Succeeded') }
		},
		// how long the last go took, how much it read, where it went; a record too old for a figure says nothing of it
		lastBackupDetail() {
			const batch = this.backup.batch || []
			const parts = []
			if (batch.length) {
				const longest = longestRun(batch)
				if (longest !== null) {
					parts.push(durationText(longest))
				}
				const bytes = batch.reduce((sum, run) => sum + (run.bytes || 0), 0)
				if (bytes) {
					parts.push(this.renderSize(bytes))
				}
			}
			if (this.backup.destination) {
				parts.push(this.$t('to {destination}', { destination: this.backup.destination }))
			}

			return parts.join(' · ')
		},
		nextBackup() {
			const next = nextOfAll(this.schedules)
			if (!next) {
				return ''
			}

			if (!next.due) {
				return this.whenOf(next.at)
			}

			// a slot due for hours is not about to go off: the scheduler is stopped or held back
			return next.late < DUE_GRACE ? this.$t('within a minute') : this.$t('Overdue since {when}', { when: this.whenOf(next.at) })
		},
		// null unless this box is a master
		fleet() {
			return fleetPanel(this.fleetState)
		},
		// one row per disk where the box lists them, else the system drive and the USB disks of the utilization
		drives() {
			const rows = diskRows(this.storageList, this.driveList, snapraidHeld(this.snapraidState && this.snapraidState.config))
			const list = rows.length > 0
				? rows.map(row => ({
					key: row.key,
					name: row.name,
					role: row.role,
					// the system disk may not be among the drives: its SMART is the utilization's
					health: row.drive ? this.smartHealth(row.drive) : (row.role === 'system' ? this.health : ''),
					// 0 is no reading
					temperature: row.drive && row.drive.temperature > 0 ? row.drive.temperature : 0,
					percent: percent(row.used, row.size),
					detail: `${this.renderSize(row.used)} / ${this.renderSize(row.size)}`,
				}))
				: this.utilizationDrives()
			return list.map(drive => ({
				...drive,
				level: drive.health === 'failed' ? 'danger' : this.barLevel(drive.percent),
			}))
		},
		tiles() {
			const cpuPercent = Math.round(Number(this.cpu.percent) || 0)
			const memPercent = Math.round(Number(this.mem.usedPercent) || 0)
			const diskPercent = percent(this.disk.used, this.disk.size)
			const temperature = Number(this.cpu.temperature) || 0
			const tiles = [
				{
					key: 'cpu',
					label: 'CPU',
					value: `${cpuPercent} %`,
					bar: cpuPercent,
					level: this.barLevel(cpuPercent),
					// a VM has no thermal zone, and only some boxes have a power counter or a
					// frequency: what is missing is left out, not shown as 0
					detail: [
						Number(this.cpu.num) > 0 ? this.$t('{count} cores', { count: this.cpu.num }) : '',
						cpuFrequency(this.cpu.freq),
						this.watts === null ? '' : `${this.watts.toFixed(1)} W`,
						temperature ? `${temperature}°C` : '',
					].filter(Boolean).join(' · '),
				},
				{
					key: 'mem',
					label: this.$t('Memory'),
					value: `${memPercent} %`,
					bar: memPercent,
					level: this.barLevel(memPercent),
					detail: this.mem.total ? `${this.renderSize(this.mem.used || 0)} / ${this.renderSize(this.mem.total)}` : '',
				},
				{
					key: 'storage',
					label: this.$t('Storage'),
					value: `${diskPercent} %`,
					bar: diskPercent,
					level: this.health === 'failed' ? 'danger' : this.barLevel(diskPercent),
					detail: `${this.renderSize(this.disk.used || 0)} / ${this.renderSize(this.disk.size || 0)}`,
					status: this.health === 'failed' ? this.$t('Damage') : '',
					onClick: this.openStorage,
				},
				{
					key: 'net',
					label: this.$t('Network'),
					value: this.speed ? `↓ ${this.renderSize(this.speed.down)}/s` : '—',
					bar: null,
					level: 'ok',
					detail: this.speed ? `↑ ${this.renderSize(this.speed.up)}/s` : '',
				},
				this.backupTileData(),
			]
			if (this.raid) {
				tiles.push({
					key: 'snapraid',
					label: 'SnapRAID',
					value: this.raid.text,
					bar: null,
					level: this.raid.level,
					detail: this.raid.at,
					onClick: this.openStorage,
				})
			}
			return tiles
		},
	},
	watch: {
		// the bell of the beta bar counts them
		attention: {
			immediate: true,
			handler(items) {
				this.$emit('attention', items.length)
			},
		},
	},
	mounted() {
		this.refreshSlow()
		this.timer = setInterval(this.refreshSlow, SLOW_REFRESH)
	},
	beforeUnmount() {
		clearInterval(this.timer)
	},
	methods: {
		barLevel(value) {
			if (value >= 90) {
				return 'danger'
			}
			return value >= 80 ? 'warning' : 'ok'
		},

		// the event Home.vue already listens for to open the Storage manager
		openStorage() {
			// eslint-disable-next-line vue/custom-event-name-casing
			this.$EventBus.$emit('casaUI:openStorageManager')
		},

		// the box itself, as the Backups dialog does it: said first, since the services holding its files are stopped for the copy
		backupNow() {
			const name = this.backupDestination
			this.$buefy.dialog.confirm({
				title: this.$t('Back up this box to {name}?', { name }),
				message: this.$t('The services holding its files are stopped for the length of the copy, so the dashboard is unreachable for a few seconds. The backup shows in History as "This box".'),
				confirmText: this.$t('Back up'),
				cancelText: this.$t('Cancel'),
				onConfirm: async () => {
					try {
						await this.$api.backup.backupSystem(name, true)
						this.$buefy.toast.open({ message: this.$t('Backup of this box started.'), type: 'is-success', duration: 5000 })
					} catch (error) {
						const data = error.response && error.response.data
						this.$buefy.toast.open({ message: (data && data.message) || error.message, type: 'is-danger', duration: 6000 })
					}
				},
			})
		},

		// the same dialog as the settings menu's Backups entry
		openBackups() {
			this.$buefy.modal.open({
				component: defineAsyncComponent(() => import('@/components/settings/BackupDestinations.vue')),
				hasModalCard: true,
				customClass: 'backup-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},

		// a failure opens what it is about: the disks, the backups, the fleet
		openAttention(item) {
			if (item.key === 'backup') {
				this.openBackups()
			} else if (item.key.startsWith('fleet_')) {
				this.openFleetPage()
			} else {
				this.openStorage()
			}
		},

		// the bell of the beta bar: brings the list into view, whatever the width (on a phone it is under the apps)
		showAttention() {
			const panel = this.$refs.attentionPanel
			panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
			panel.focus({ preventScroll: true })
		},

		openFleetPage() {
			openFleet(this.$buefy, this.$store.state)
		},

		whenOf(date) {
			return whenOf(date, this.translate)
		},

		roleLabel(role) {
			return { system: this.$t('System'), data: this.$t('Data disk'), parity: this.$t('Parity disk') }[role] || ''
		},

		fleetStateLabel(state) {
			return { online: this.$t('Online'), offline: this.$t('Offline'), never: this.$t('Never connected') }[state]
		},

		utilizationDrives() {
			const system = {
				key: 'system',
				name: this.$t('System drive'),
				role: 'system',
				health: this.health,
				temperature: 0,
				percent: percent(this.disk.used, this.disk.size),
				detail: `${this.renderSize(this.disk.used || 0)} / ${this.renderSize(this.disk.size || 0)}`,
			}
			const usb = this.usb.map(disk => ({
				key: `usb_${disk.name}`,
				name: disk.model || disk.name,
				role: '',
				health: '',
				temperature: 0,
				percent: usbPercent(disk),
				detail: this.renderSize(disk.size || 0),
			}))
			return [system, ...usb]
		},

		// the figures, and the temperature when the drive reads one
		driveDetail(drive) {
			return [drive.detail, drive.temperature ? `${drive.temperature}°C` : ''].filter(Boolean).join(' · ')
		},

		driveHealthLabel(health) {
			if (health === 'passed') {
				return this.$t('Healthy')
			}
			return health === 'failed' ? this.$t('Damage') : this.$t('No SMART data')
		},

		backupTileData() {
			const { status, at, error } = this.backup
			// the strip is narrow: the day here, the full date and time in the Backups panel
			const when = new Date(at)
			return {
				key: 'backup',
				label: this.$t('Backups'),
				value: status === 'none' ? this.$t('No backup yet') : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
				bar: null,
				level: status === 'failed' ? 'danger' : 'ok',
				detail: status === 'none' ? '' : when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
				status: status === 'failed' ? this.$t('The last backup failed') : '',
				title: error,
				onClick: this.openBackups,
			}
		},

		// the interface is the one the Network widget shows
		follow(sample) {
			const wanted = Number(localStorage.getItem('networkId')) || 0
			const index = wanted < sample.length ? wanted : 0
			this.speed = netSpeed(this.net[index], sample[index])
			this.net = sample
		},

		followBackup(properties, percent) {
			const kind = properties['backup:kind'] || 'backup'
			this.running[`${kind}:${properties['app:name']}`] = { title: backupSubject(properties, this.translate), percent, restore: kind === 'restore' }
		},

		// the finished run is in the log now: read it rather than wait a minute
		endBackup(properties) {
			delete this.running[`${properties['backup:kind'] || 'backup'}:${properties['app:name']}`]
			if (!this.runningBackup) {
				this.refreshSlow()
			}
		},

		async refreshSlow() {
			// an older box answers 404 to either: its tile is then left out
			try {
				this.runs = (await this.$api.backup.getRuns()).data.data || []
			} catch {
				this.runs = []
			}
			try {
				this.destinations = (await this.$api.backup.getDestinations()).data.data || []
			} catch {
				this.destinations = []
			}
			try {
				this.schedules = (await this.$api.backup.getSchedules()).data.data || []
			} catch {
				this.schedules = []
			}
			try {
				this.snapraidState = (await this.$api.disks.snapraid()).data.data
			} catch {
				this.snapraidState = null
			}
			// an older box answers 404 to either: the panel then has the utilization's drives
			try {
				this.storageList = (await this.$api.storage.list({ system: 'show' })).data.data || []
				this.driveList = (await this.$api.disks.getDiskList()).data.data.disks || []
			} catch {
				this.storageList = []
				this.driveList = []
			}
			// 404 on a core without a fleet, nothing to show on a box that is not a master
			try {
				this.fleetState = (await this.$api.fleet.status()).data.data
			} catch {
				this.fleetState = null
			}
		},
	},
	sockets: {
		'backup:begin': function (res) {
			this.followBackup(res.Properties, 0)
		},
		'backup:progress': function (res) {
			this.followBackup(res.Properties, Math.max(0, Number(res.Properties['app:progress']) || 0))
		},
		'backup:end': function (res) {
			this.endBackup(res.Properties)
		},
		'backup:error': function (res) {
			this.endBackup(res.Properties)
		},
		'casaos:system:utilization': function (res) {
			const data = res.Properties
			const cpu = JSON.parse(data.sys_cpu)
			this.watts = cpuWatts(this.cpu.power, cpu.power)
			this.cpu = cpu
			this.mem = JSON.parse(data.sys_mem)
			this.disk = JSON.parse(data.sys_disk)
			this.usb = JSON.parse(data.sys_usb || '[]')
			this.follow(JSON.parse(data.sys_net))
		},
	},
}
</script>

<style lang="scss" scoped>
.tiles {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
	gap: 0.75rem;
	margin-bottom: 1rem;
	align-items: stretch;

	.widget {
		margin-bottom: 0;
	}
}

.tile {
	min-width: 0;

	.widget-content {
		padding: 0.75rem 1rem;
	}

	&.is-clickable {
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid #fff;
			outline-offset: 2px;
		}
	}
}

.tile-label {
	font-size: 0.75rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.8;
}

.tile-value {
	font-size: 1.375rem;
	font-weight: 600;
	line-height: 1.75rem;
	// a word such as "No backup yet" wraps rather than ending in an ellipsis
	overflow-wrap: anywhere;
}

.tile-bar {
	height: 4px;
	border-radius: 2px;
	background: rgba(255, 255, 255, 0.2);
	margin: 0.375rem 0;
	overflow: hidden;

	div {
		height: 100%;
		background: #fff;

		&.warning {
			background: #ffc107;
		}

		&.danger {
			background: #ff6b6b;
		}
	}
}

.tile-detail {
	font-size: 0.75rem;
	min-height: 1rem;
	opacity: 0.85;

	&.is-danger {
		color: #ff9d9d;
		opacity: 1;
	}
}

// side panels on the left, the apps on the right; one column on a narrow screen
.beta-body {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 1rem;
	align-items: start;

	@include desktop {
		grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
	}
}

.beta-aside {
	display: grid;
	// the track stays the column's width: a long label is cut short, it does not widen the cards
	grid-template-columns: minmax(0, 1fr);
	gap: 0.75rem;

	.widget {
		margin-bottom: 0;
	}
}

.beta-main {
	min-width: 0;
	// one column: the apps before the panels
	order: -1;

	@include desktop {
		order: 0;
	}
}

// the side panels: one anatomy, head / rows / foot, the foot's line edge to edge
.panel .widget-content {
	padding: 0;
}

.panel-head {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	padding: 0.75rem 0.875rem;
}

.panel-tile {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 2rem;
	height: 2rem;
	border-radius: 0.625rem;
	background: rgba(255, 255, 255, 0.1);
}

.panel-title {
	flex: 1;
	min-width: 0;
	font-weight: 600;
}

.panel-chip {
	flex-shrink: 0;
	height: 1.375rem;
	padding: 0 0.5625rem;
	border-radius: 0.6875rem;
	background: rgba(255, 255, 255, 0.1);
	font-size: 0.75rem;
	font-weight: 600;
	line-height: 1.375rem;
	white-space: nowrap;

	&.is-ok {
		background: rgba(34, 197, 94, 0.16);
		color: #4ade80;
	}

	&.is-warning {
		background: rgba(245, 158, 11, 0.18);
		color: #fbbf24;
	}

	&.is-danger {
		background: rgba(239, 68, 68, 0.18);
		color: #fca5a5;
	}

	&.is-info {
		background: rgba(59, 130, 246, 0.18);
		color: #93c5fd;
	}
}

.panel-body {
	display: flex;
	flex-direction: column;
	gap: 0.625rem;
	margin: 0;
	padding: 0 0.875rem 0.75rem;
	list-style: none;
}

.panel-row {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	width: 100%;
	min-height: 1.75rem;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	text-align: left;
}

.panel-grow {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.panel-dot {
	flex-shrink: 0;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.35);

	&.is-ok,
	&.is-passed,
	&.is-online {
		background: #4ade80;
	}

	&.is-warning {
		background: #fbbf24;
	}

	&.is-danger,
	&.is-failed,
	&.is-offline {
		background: #f87171;
	}
}

.panel-value {
	flex-shrink: 0;
	width: 2.25rem;
	font-size: 0.75rem;
	text-align: right;
	opacity: 0.85;
}

.panel-role {
	flex-shrink: 0;
	height: 1.125rem;
	padding: 0 0.375rem;
	border-radius: 0.5625rem;
	background: rgba(255, 255, 255, 0.1);
	font-size: 0.6875rem;
	font-weight: 600;
	line-height: 1.125rem;
}

.panel-foot {
	display: flex;
	align-items: center;
	// two actions that do not fit side by side go one under the other, whole
	flex-wrap: wrap;
	gap: 0.5rem;
	padding: 0.625rem 0.875rem;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-action {
	display: flex;
	align-items: center;
	flex: 1 1 14rem;
	gap: 0.5rem;
	min-width: 0;
	height: 2.25rem;
	padding: 0 0.75rem;
	border: 0;
	border-radius: 0.625rem;
	background: rgba(255, 255, 255, 0.08);
	color: inherit;
	font: inherit;
	font-weight: 500;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: rgba(255, 255, 255, 0.16);
	}

	&:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	&.is-primary {
		flex: 0 0 auto;
		justify-content: center;
		background: #3b82f6;
		color: #fff;
		font-weight: 600;

		&:hover {
			background: #2563eb;
		}
	}
}

// the worst alert colours the edge of the card; the ring, not a border, so nothing moves
.attention {
	&.is-warning {
		box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45);
	}

	&.is-danger {
		box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.5);
	}

	&:focus {
		outline: none;
	}
}

.attention-item {
	cursor: pointer;

	&:hover .panel-grow {
		text-decoration: underline;
	}
}

.drive {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;

	.tile-bar {
		margin: 0;
	}
}

.drive-health.is-failed {
	flex-shrink: 0;
	color: #ff9d9d;
	font-size: 0.75rem;
}

.panel-empty,
.panel-error {
	margin: 0;
}

.panel-empty {
	opacity: 0.85;
}

.panel-error {
	color: #ff9d9d;
}

.fleet-state {
	flex-shrink: 0;
	font-size: 0.75rem;
	opacity: 0.85;

	.is-offline & {
		color: #ff9d9d;
		opacity: 1;
	}
}
</style>
