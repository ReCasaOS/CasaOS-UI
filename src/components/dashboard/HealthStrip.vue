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

		<div v-if="attention.length > 0" class="widget has-text-grey-100 attention">
			<div class="blur-background"></div>
			<div class="widget-content">
				<div class="tile-label">{{ $t('Needs attention') }}</div>
				<ul>
					<li v-for="item in attention" :key="item.key" :class="`is-${item.level}`">{{ item.text }}</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<script>
import { mixin } from '@/mixins/mixin'
import { attentionItems, backupTile, netSpeed, percent, snapraidTile } from '@/components/dashboard/healthTiles'

// The classic widgets read these once and then follow the socket; the backup runs and
// SnapRAID have no event, so they are read again now and then.
const SLOW_REFRESH = 60 * 1000

export default {
	name: 'HealthStrip',
	mixins: [mixin],
	data() {
		const info = this.$store.state.hardwareInfo || {}
		return {
			cpu: info.cpu || {},
			mem: info.mem || {},
			disk: info.sys_disk || {},
			net: info.net || [],
			speed: null,
			runs: [],
			snapraidState: null,
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
		attention() {
			return attentionItems({ health: this.health, snapraid: this.snapraidState, backup: this.backup }, this.translate)
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
					// the event Home.vue already listens for to open the Storage manager
					// eslint-disable-next-line vue/custom-event-name-casing
					onClick: () => this.$EventBus.$emit('casaUI:openStorageManager'),
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
				})
			}
			return tiles
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

		backupTileData() {
			const { status, at, error } = this.backup
			return {
				key: 'backup',
				label: this.$t('Backups'),
				value: status === 'none' ? this.$t('No backup yet') : new Date(at).toLocaleString(),
				bar: null,
				level: status === 'failed' ? 'danger' : 'ok',
				detail: '',
				status: status === 'failed' ? this.$t('The last backup failed') : '',
				title: error,
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
				this.snapraidState = (await this.$api.disks.snapraid()).data.data
			} catch {
				this.snapraidState = null
			}
		},
	},
	sockets: {
		'casaos:system:utilization': function (res) {
			const data = res.Properties
			this.cpu = JSON.parse(data.sys_cpu)
			this.mem = JSON.parse(data.sys_mem)
			this.disk = JSON.parse(data.sys_disk)
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
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
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

.attention {
	margin-bottom: 1rem;

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
