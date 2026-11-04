<template>
	<div class="health-strip-beta">
		<div class="tiles">
			<component :is="tile.onClick ? 'button' : 'div'"
				v-for="tile in tiles"
				:key="tile.key"
				:class="{ 'is-clickable': tile.onClick }"
				:title="tile.title"
				:type="tile.onClick ? 'button' : undefined"
				class="widget has-text-grey-100 tile"
				@click="tile.onClick && tile.onClick()">
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
			</component>
		</div>

		<div class="beta-body">
			<aside class="beta-aside">
				<div ref="attentionPanel" class="widget has-text-grey-100 panel attention" tabindex="-1">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="tile-label">{{ $t('Needs attention') }}</div>
						<ul v-if="attention.length > 0">
							<li v-for="item in attention" :key="item.key" :class="`is-${item.level}`">
								<button class="attention-item" type="button" @click="openAttention(item)">{{ item.text }}</button>
							</li>
						</ul>
						<p v-else class="panel-empty">{{ $t('All good') }}</p>
					</div>
				</div>

				<div class="widget has-text-grey-100 panel storage">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="tile-label">{{ $t('Storage') }}</div>
						<div v-for="drive in drives" :key="drive.key" class="drive">
							<div class="drive-head">
								<span class="drive-name">{{ drive.name }}</span>
								<span v-if="drive.health" :class="`is-${drive.health}`" class="drive-health">{{ driveHealthLabel(drive.health) }}</span>
							</div>
							<div class="tile-bar">
								<div :class="drive.level" :style="{ width: `${drive.percent}%` }"></div>
							</div>
							<div class="tile-detail">{{ driveDetail(drive) }}</div>
						</div>
						<button class="panel-action" type="button" @click="openStorage">{{ $t('Manage storage') }}</button>
					</div>
				</div>

				<div class="widget has-text-grey-100 panel backups">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="tile-label">{{ $t('Backups') }}</div>
						<template v-if="backup.status === 'none'">
							<p class="panel-empty">{{ $t('No backup yet') }}</p>
						</template>
						<dl v-else>
							<div>
								<dt>{{ $t('Last backup') }}</dt>
								<dd>{{ new Date(backup.at).toLocaleString() }}</dd>
							</div>
							<div v-if="backup.destination">
								<dt>{{ $t('Destination') }}</dt>
								<dd>{{ backup.destination }}</dd>
							</div>
						</dl>
						<p v-if="backup.status === 'failed'" class="is-danger panel-error">{{ $t('The last backup failed') }}</p>
						<button v-if="backupDestination" class="panel-action" type="button" @click="backupNow">{{ $t('Back up now') }}</button>
						<button class="panel-action" type="button" @click="openBackups">{{ $t('Backups and restore') }}</button>
					</div>
				</div>

				<div v-if="fleet && fleet.total" class="widget has-text-grey-100 panel fleet">
					<div class="blur-background"></div>
					<div class="widget-content">
						<div class="tile-label">{{ $t('Fleet') }}</div>
						<p class="fleet-count">{{ $t('{online} of {total} boxes online', { online: fleet.online, total: fleet.total }) }}</p>
						<ul>
							<li v-for="box in fleet.boxes" :key="box.key" :class="`is-${box.state}`">
								<span class="fleet-name">{{ box.name }}</span>
								<span class="fleet-state">{{ fleetStateLabel(box.state) }}</span>
							</li>
						</ul>
						<button class="fleet-open" type="button" @click="openFleetPage">
							<span class="tag is-dark is-rounded">{{ $t('Beta') }}</span>
							<span>{{ $t('Open the Fleet page') }}</span>
						</button>
					</div>
				</div>
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
import { attentionItems, backupTile, diskRows, fleetPanel, netSpeed, percent, snapraidTile, usbPercent } from '@/components/dashboard/healthTiles'

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
			runs: [],
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
					// a VM has no thermal zone: 0 is not a reading
					detail: temperature ? `${temperature}°C` : '',
				},
				{
					key: 'mem',
					label: this.$t('Memory'),
					value: `${memPercent} %`,
					bar: memPercent,
					level: this.barLevel(memPercent),
					detail: this.mem.total ? this.renderSize(this.mem.total) : '',
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

		// role, how full, and the temperature when the drive reads one
		driveDetail(drive) {
			const role = { system: this.$t('System'), data: this.$t('Data disk'), parity: this.$t('Parity disk') }[drive.role]
			return [role, `${drive.percent} %`, drive.detail, drive.temperature ? `${drive.temperature}°C` : ''].filter(Boolean).join(' · ')
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
		'casaos:system:utilization': function (res) {
			const data = res.Properties
			this.cpu = JSON.parse(data.sys_cpu)
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
	// a button does not stretch to the row by itself: the clickable tiles sat lower
	align-items: stretch;

	.widget {
		margin-bottom: 0;
	}
}

.tile {
	border: 0;
	padding: 0;
	text-align: left;
	background: transparent;
	font: inherit;
	min-width: 0;
	align-self: stretch;
	box-sizing: border-box;

	.widget-content {
		padding: 0.75rem 1rem;
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

.panel-empty {
	margin-top: 0.25rem;
	opacity: 0.85;
}

.panel-error,
.drive-health.is-failed {
	color: #ff9d9d;
}

.drive {
	margin-top: 0.75rem;
}

.drive-head {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
}

.drive-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.drive-health {
	flex-shrink: 0;
	font-size: 0.75rem;
	opacity: 0.85;

	&.is-passed {
		color: #8fd16a;
	}
}

.backups dl > div {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	line-height: 1.75rem;

	dt {
		opacity: 0.8;
		white-space: nowrap;
	}

	dd {
		text-align: right;
	}
}

.fleet {
	ul {
		margin-top: 0.25rem;
	}

	.fleet-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fleet-state {
		flex-shrink: 0;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		line-height: 1.75rem;

		&.is-online .fleet-state {
			color: #8fd16a;
		}

		&.is-offline .fleet-state {
			color: #ff9d9d;
		}
	}
}

.fleet-open,
.panel-action {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
	margin-top: 0.5rem;
	padding: 0.375rem 0.5rem;
	border: 0;
	border-radius: 0.5rem;
	background: rgba(255, 255, 255, 0.1);
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	&:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
}

.attention:focus {
	outline: none;
}

.attention-item {
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}

.attention {
	ul {
		margin-top: 0.25rem;
	}

	li {
		padding-left: 1rem;
		position: relative;
		line-height: 1.75rem;

		&::before {
			content: '';
			position: absolute;
			left: 0;
			top: 0.7rem;
			width: 0.5rem;
			height: 0.5rem;
			border-radius: 50%;
			background: #ffc107;
		}

		&.is-danger::before {
			background: #ff6b6b;
		}
	}
}
</style>
