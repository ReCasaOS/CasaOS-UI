<template>
	<div class="zfs has-text-full-04">
		<div class="is-flex is-justify-content-flex-end mb-2">
			<b-button rounded size="is-small" @click="refresh">{{ $t('Refresh') }}</b-button>
		</div>

		<p v-if="!state && !failed" class="has-text-centered has-text-grey-light mt-5">{{ $t('Reading ZFS…') }}</p>
		<p v-else-if="!state" class="has-text-centered has-text-grey-light mt-5">{{ $t('ZFS did not answer.') }}</p>
		<p v-else-if="state.busy" class="has-text-centered has-text-grey-light mt-5">{{ $t('ZFS is not answering yet.') }}</p>
		<p v-if="state && (state.stale || failed)" class="has-text-warning mb-2 stale">{{ $t('Showing the last reading: ZFS did not answer.') }}</p>

		<div v-for="card in cards" :key="card.pool.name" class="mb-4 pb-3 pt-3 pl-3 pr-3 background-item pool">
			<p class="is-flex is-align-items-center is-flex-wrap-wrap">
				<b-tag :type="card.tag.type" class="mr-2 health"><i class="mdi mr-1" :class="[card.tag.icon]"></i>{{ card.tag.text }}</b-tag>
				<span class="has-text-weight-medium">{{ card.pool.name }}</span>
				<span v-if="card.layout" class="ml-2 has-text-grey-light">{{ card.layout }}</span>
			</p>

			<p v-if="card.disks.length" class="mt-1 is-size-7 drives">
				{{ $t('Drives') }}:
				<span v-for="disk in card.disks" :key="disk.name" class="mr-3">
					{{ disk.name }}<template v-if="disk.disk"> ({{ $t('on {disk}', { disk: disk.disk }) }})</template>
					<b-tag v-if="disk.state && disk.state !== 'ONLINE'" class="ml-1" type="is-danger">{{ disk.state }}</b-tag>
				</span>
			</p>

			<p v-if="card.pool.known" :class="{ 'has-text-danger': card.scan.problem }" class="mt-1 scan">{{ card.scan.text }}</p>
			<p v-if="card.pool.data_errors > 0" class="mt-1 has-text-danger">{{ $t('{count} files have permanent errors', { count: card.pool.data_errors }) }}</p>

			<b-progress :max="100" :type="card.capacityType" :value="Math.max(card.pool.capacity, 0)" class="mt-2 mb-1 capacity" size="is-small" />
			<p class="is-size-7">
				{{ $t('Allocated {size}', { size: size(card.pool.allocated) }) }} · {{ $t('Free {size}', { size: size(card.pool.free) }) }} · {{ $t('Total {size}', { size: size(card.pool.size) }) }}
				<template v-if="card.pool.fragmentation >= 0"> · {{ $t('Fragmentation {percent} %', { percent: card.pool.fragmentation }) }}</template>
			</p>

			<p v-if="card.io" class="mt-1 is-size-7 io">
				{{ $t('Live: read {read} ({readOps} op/s), write {write} ({writeOps} op/s)', card.io) }}
			</p>

			<details v-if="card.pool.known" class="mt-2 is-size-7">
				<summary>{{ $t('Details') }}</summary>
				<p v-if="card.pool.status" class="mt-1 words">{{ card.pool.status }}</p>
				<p v-if="card.pool.action" class="mt-1 words">{{ card.pool.action }}</p>
				<div v-for="row in card.vdevs" :key="row.key" :style="{ paddingLeft: `${row.depth * 16}px` }" class="vdev">
					{{ row.short }} <b-tag v-if="row.state" :type="row.state === 'ONLINE' ? 'is-success is-light' : 'is-danger'">{{ row.state }}</b-tag>
					<span v-if="row.read >= 0" class="has-text-grey-light"> {{ $t('read {read}, write {write}, checksum {cksum}', { read: row.read, write: row.write, cksum: row.cksum }) }}</span>
					<span v-if="row.note" class="has-text-grey-light"> {{ row.note }}</span>
				</div>
			</details>

			<div class="mt-3 datasets">
				<p class="has-text-weight-medium">{{ $t('Datasets') }}</p>
				<p v-if="!state.datasets_known" class="has-text-grey-light">{{ $t('The datasets could not be read.') }}</p>
				<div v-for="row in card.rows" :key="row.name" :style="{ paddingLeft: `${row.depth * 18}px` }" class="mt-2 dataset">
					<div class="is-flex is-align-items-center">
						<span class="has-text-weight-medium name">{{ row.short }}</span>
						<b-tag v-if="row.mount.locked" class="ml-2" type="is-warning"><i class="mdi mdi-lock mr-1"></i>{{ row.mount.text }}</b-tag>
						<b-progress :max="100" :value="row.percent" class="zfs-bar mx-3 mb-0" size="is-small" type="is-info" />
						<span class="used">{{ size(row.used) }}</span>
					</div>
					<p class="is-size-7 has-text-grey-light">
						<template v-if="!row.mount.locked">{{ row.mount.text }} · </template>{{ $t('Available {size}', { size: size(row.available) }) }} · {{ $t('Referenced {size}', { size: size(row.referenced) }) }}<template v-if="row.used_by_snapshots > 0"> · {{ $t('Snapshots {size}', { size: size(row.used_by_snapshots) }) }}</template>
						<b-button class="ml-2 toggle" size="is-small" type="is-text" @click="toggle(row.name)">{{ snaps[row.name] && snaps[row.name].open ? $t('Hide snapshots') : $t('Snapshots') }}</b-button>
					</p>
					<div v-if="snaps[row.name] && snaps[row.name].open" class="is-size-7 pl-3 snapshots">
						<p v-if="snaps[row.name].loading" class="has-text-grey-light">…</p>
						<p v-else-if="snaps[row.name].error" class="has-text-danger">{{ $t('The snapshots could not be read.') }}</p>
						<p v-else-if="!snaps[row.name].list.length" class="has-text-grey-light">{{ $t('No snapshots.') }}</p>
						<template v-else>
							<p v-for="snap in snaps[row.name].list" :key="snap.name" class="snapshot">
								@{{ snap.name }} · {{ when(snap.created) }} · {{ $t('size {size}, written {written}', { size: size(snap.used), written: size(snap.written) }) }}
							</p>
							<p v-if="snaps[row.name].truncated" class="has-text-grey-light">{{ $t('Only the newest {count} are shown.', { count: snaps[row.name].list.length }) }}</p>
						</template>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { zfsCapacityType, zfsDisks, zfsLayout, zfsMount, zfsOps, zfsRate, zfsRates, zfsRows, zfsScanText, zfsTag, zfsUsedPercent, zfsVdevRows } from './zfs'
import { renderSize } from '@/mixins/file_utils'

const LIST_EVERY = 15000
const IO_EVERY = 3000

export default {
	name: 'zfs-panel',
	props: {
		// the tab is the one on show: nothing is asked of the box otherwise
		active: {
			type: Boolean,
			default: true,
		},
	},
	data() {
		return { state: null, failed: false, io: {}, lastIO: {}, snaps: {}, timer: null, ioTimer: null }
	},
	computed: {
		cards() {
			if (!this.state) {
				return []
			}
			return (this.state.pools || []).map(pool => ({
				pool,
				tag: zfsTag(pool, this.$t),
				layout: zfsLayout(pool.vdevs || []),
				disks: zfsDisks(pool.vdevs || []),
				scan: zfsScanText(pool.scan, this.$t),
				capacityType: zfsCapacityType(pool.capacity),
				io: this.io[pool.name] || null,
				vdevs: zfsVdevRows(pool.vdevs || []).map((v, i) => ({ ...v, key: `${i}${v.name}`, short: v.name.slice(v.name.lastIndexOf('/') + 1) })),
				rows: zfsRows((this.state.datasets || []).filter(d => d.pool === pool.name)).map(d => ({ ...d, mount: zfsMount(d, this.$t), percent: zfsUsedPercent(d) })),
			}))
		},
	},
	watch: {
		active: {
			immediate: true,
			handler(on) {
				on ? this.start() : this.stop()
			},
		},
	},
	beforeUnmount() {
		this.stop()
	},
	methods: {
		size(bytes) {
			return renderSize(bytes)
		},

		when(seconds) {
			return seconds > 0 ? new Date(seconds * 1000).toLocaleString() : ''
		},

		start() {
			this.refresh()
			this.pollIO()
		},

		// no more request, and the readings of the counters are forgotten: a rate between two readings far apart says nothing
		stop() {
			clearTimeout(this.timer)
			clearTimeout(this.ioTimer)
			this.timer = this.ioTimer = null
			this.io = {}
			this.lastIO = {}
		},

		// read again, and again every few seconds while the tab is on show and the page is visible
		async refresh() {
			clearTimeout(this.timer)
			if (!document.hidden) {
				try {
					this.state = (await this.$api.disks.zfs()).data.data
					this.failed = false
				} catch {
					this.failed = true
				}
			}
			if (this.active) {
				this.timer = setTimeout(() => this.refresh(), LIST_EVERY)
			}
		},

		async pollIO() {
			clearTimeout(this.ioTimer)
			if (!document.hidden) {
				try {
					const readings = (await this.$api.disks.zfsIo()).data.data || []
					const io = {}
					for (const reading of readings) {
						const rates = zfsRates(this.lastIO[reading.pool], reading)
						this.lastIO[reading.pool] = reading
						if (rates) {
							io[reading.pool] = { read: zfsRate(rates.read), write: zfsRate(rates.write), readOps: zfsOps(rates.readOps), writeOps: zfsOps(rates.writeOps) }
						}
					}
					this.io = io
				} catch {
					this.io = {}
				}
			}
			if (this.active) {
				this.ioTimer = setTimeout(() => this.pollIO(), IO_EVERY)
			}
		},

		// the snapshots of a dataset are asked for when its list is opened, not before
		async toggle(name) {
			const current = this.snaps[name]
			if (current) {
				this.snaps = { ...this.snaps, [name]: { ...current, open: !current.open } }
				if (current.open || current.list) {
					return
				}
			} else {
				this.snaps = { ...this.snaps, [name]: { open: true, loading: true, list: [] } }
			}
			try {
				const data = (await this.$api.disks.zfsSnapshots(name)).data.data
				this.snaps = { ...this.snaps, [name]: { ...this.snaps[name], loading: false, error: false, list: data.snapshots || [], truncated: !!data.truncated } }
			} catch (e) {
				this.snaps = { ...this.snaps, [name]: { ...this.snaps[name], loading: false, error: true, list: [] } }
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger', duration: 4000 })
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.zfs-bar {
	flex: 1 1 auto;
	min-width: 80px;
}
.words {
	white-space: pre-wrap;
}
</style>
