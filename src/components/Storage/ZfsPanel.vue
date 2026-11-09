<template>
	<div class="zfs has-text-full-04">
		<div class="is-flex is-align-items-center is-gap-2 mb-3">
			<p class="settings-intro is-flex-grow-1">{{ $t('The ZFS pools and datasets of this box, read only. Read again every 15 s while the tab is on show; the rates come from the kernel counters.') }}</p>
			<b-button rounded size="is-small" @click="refresh">{{ $t('Refresh') }}</b-button>
		</div>

		<p v-if="!state && !failed" class="has-text-centered has-text-grey-light mt-5">{{ $t('Reading ZFS…') }}</p>
		<p v-else-if="!state" class="has-text-centered has-text-grey-light mt-5">{{ $t('ZFS did not answer.') }}</p>
		<p v-else-if="state.busy" class="has-text-centered has-text-grey-light mt-5">{{ $t('ZFS is not answering yet.') }}</p>
		<p v-if="state && (state.stale || failed)" class="has-text-warning mb-2 stale">{{ $t('Showing the last reading: ZFS did not answer.') }}</p>

		<!-- one card per pool: a head that says its health, its layout and what the last scan found, the live rates at the
			right; its capacity and drives; then its datasets as a table, each row able to open its snapshots -->
		<section v-for="card in cards" :key="card.pool.name" class="pool settings-card p-0 mb-4">
			<div class="_head">
				<span :class="card.tag.type" class="_tile"><b-icon icon="database-outline" /></span>
				<div class="_text">
					<p class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1">
						<span class="_name">{{ card.pool.name }}</span>
						<b-tag :type="card.tag.type" class="health" rounded><i class="mdi mr-1" :class="[card.tag.icon]"></i>{{ card.tag.text }}</b-tag>
						<span v-if="card.layout" class="_has-text-gray is-size-7">{{ card.layout }} · {{ $t('{count} disks', { count: card.disks.length }) }}</span>
					</p>
					<p v-if="card.pool.known" :class="{ 'has-text-danger': card.scan.problem }" class="scan is-size-7 _has-text-gray">
						{{ card.scan.text }}<template v-if="card.pool.data_errors === 0"> · {{ $t('No known data errors') }}</template>
					</p>
					<p v-if="card.pool.data_errors > 0" class="is-size-7 has-text-danger">{{ $t('{count} files have permanent errors', { count: card.pool.data_errors }) }}</p>
				</div>
				<div v-if="card.io" class="io _io is-size-7">
					<span class="is-sr-only">{{ $t('Live: read {read} ({readOps} op/s), write {write} ({writeOps} op/s)', card.io) }}</span>
					<span aria-hidden="true"><span class="_has-text-gray">↓</span> <b>{{ card.io.read }}</b> <span class="_has-text-gray">{{ card.io.readOps }} op/s</span></span>
					<span aria-hidden="true"><span class="_has-text-gray">↑</span> <b>{{ card.io.write }}</b> <span class="_has-text-gray">{{ card.io.writeOps }} op/s</span></span>
				</div>
			</div>

			<div class="_body">
				<b-progress :max="100" :type="card.capacityType" :value="Math.max(card.pool.capacity, 0)" class="capacity mb-0" size="is-small" />
				<p class="is-size-7">
					{{ $t('Allocated {size}', { size: size(card.pool.allocated) }) }} · {{ $t('Free {size}', { size: size(card.pool.free) }) }}
					<span class="_has-text-gray">· {{ $t('Total {size}', { size: size(card.pool.size) }) }}<template v-if="card.pool.capacity >= 0"> · {{ card.pool.capacity }} %</template><template v-if="card.pool.fragmentation >= 0"> · {{ $t('Fragmentation {percent} %', { percent: card.pool.fragmentation }) }}</template></span>
				</p>
				<p v-if="card.disks.length" class="drives is-flex is-align-items-center is-flex-wrap-wrap is-gap-1 is-size-7">
					<span class="_has-text-gray mr-1">{{ $t('Drives') }}</span>
					<span v-for="disk in card.disks" :key="disk.name" class="_chip">
						<span :class="`is-${String(disk.state || '').toLowerCase()}`" class="_dot"></span>
						{{ disk.name }}<template v-if="disk.disk"> <span class="_has-text-gray">· {{ $t('on {disk}', { disk: disk.disk }) }}</span></template><template v-if="disk.state && disk.state !== 'ONLINE'"> <span class="has-text-danger">{{ disk.state }}</span></template>
					</span>
				</p>
				<details v-if="card.pool.known" class="_details is-size-7">
					<summary>{{ $t('Details: vdev tree, counters, raw status') }}</summary>
					<p v-if="card.pool.status" class="mt-1 words">{{ card.pool.status }}</p>
					<p v-if="card.pool.action" class="mt-1 words">{{ card.pool.action }}</p>
					<div v-for="row in card.vdevs" :key="row.key" :style="{ paddingLeft: `${row.depth * 16}px` }" class="vdev">
						{{ row.short }} <b-tag v-if="row.state" :type="row.state === 'ONLINE' ? 'is-success is-light' : 'is-danger'">{{ row.state }}</b-tag>
						<span v-if="row.read >= 0" class="has-text-grey-light"> {{ $t('read {read}, write {write}, checksum {cksum}', { read: row.read, write: row.write, cksum: row.cksum }) }}</span>
						<span v-if="row.note" class="has-text-grey-light"> {{ row.note }}</span>
					</div>
				</details>
			</div>

			<div class="_datasets">
				<p v-if="!state.datasets_known" class="_has-text-gray is-size-7 px-3 pb-3">{{ $t('The datasets could not be read.') }}</p>
				<template v-else>
					<div class="_row _hd is-size-7" aria-hidden="true">
						<span>{{ $t('Dataset') }}</span>
						<span class="_mount">{{ $t('Mount') }}</span>
						<span class="_usage">{{ $t('Usage') }}</span>
						<span class="_num">{{ $t('Used') }}</span>
						<span class="_num _avail">{{ $t('Available') }}</span>
						<span class="_num">{{ $t('Snapshots') }}</span>
					</div>
					<template v-for="row in card.rows" :key="row.name">
						<div class="dataset _row">
							<span :style="{ paddingLeft: `${row.depth * 18}px` }" class="_tree">
								<span v-if="row.depth" class="_has-text-gray mr-2" aria-hidden="true">└</span>
								<span class="name has-text-weight-medium">{{ row.short }}</span>
								<b-tag v-if="row.mount.locked" class="ml-2" size="is-small" type="is-warning"><i class="mdi mdi-lock mr-1"></i>{{ row.mount.text }}</b-tag>
								<b-tag v-else-if="row.type === 'volume'" class="ml-2" size="is-small">{{ row.mount.text }}</b-tag>
							</span>
							<span class="_mount is-size-7 _has-text-gray">{{ mountCell(row) }}</span>
							<b-progress :max="100" :value="row.percent" class="zfs-bar _usage mb-0" size="is-small" type="is-info" />
							<span class="_num used">{{ size(row.used) }}</span>
							<span class="_num _avail _has-text-gray">{{ row.type === 'volume' ? '—' : size(row.available) }}</span>
							<span class="_num">
								<b-button :class="{ 'is-open': snaps[row.name] && snaps[row.name].open }" :title="$t('Snapshots')" class="toggle _snaps" rounded size="is-small" @click="toggle(row.name)">
									<template v-if="snaps[row.name] && snaps[row.name].list && snaps[row.name].list.length">{{ snaps[row.name].list.length }} · </template>{{ row.used_by_snapshots > 0 ? size(row.used_by_snapshots) : '—' }}
									<i :class="snaps[row.name] && snaps[row.name].open ? 'mdi-chevron-up' : 'mdi-chevron-down'" class="mdi ml-1"></i>
								</b-button>
							</span>
						</div>
						<div v-if="snaps[row.name] && snaps[row.name].open" :style="{ marginLeft: `${row.depth * 18 + 32}px` }" class="snapshots is-size-7">
							<p v-if="snaps[row.name].loading" class="_has-text-gray">…</p>
							<p v-else-if="snaps[row.name].error" class="has-text-danger">{{ $t('The snapshots could not be read.') }}</p>
							<p v-else-if="!snaps[row.name].list.length" class="_has-text-gray">{{ $t('No snapshots.') }}</p>
							<template v-else>
								<div class="_srow _has-text-gray" aria-hidden="true">
									<span>{{ $t('Snapshot') }}</span><span>{{ $t('Taken on') }}</span><span class="_num">{{ $t('Own size') }}</span><span class="_num">{{ $t('Written since') }}</span>
								</div>
								<div v-for="snap in snaps[row.name].list" :key="snap.name" class="snapshot _srow">
									<span class="_mono">@{{ snap.name }}</span><span>{{ when(snap.created) }}</span><span class="_num">{{ size(snap.used) }}</span><span class="_num">{{ size(snap.written) }}</span>
								</div>
								<p v-if="snaps[row.name].truncated" class="_has-text-gray">{{ $t('Only the newest {count} are shown.', { count: snaps[row.name].list.length }) }}</p>
								<p class="_has-text-gray">{{ $t('Own size: what the snapshot alone retains. Written since: what changed since the one before.') }}</p>
							</template>
						</div>
					</template>
				</template>
			</div>
		</section>
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

		// the mount column: where it is mounted, or in two words why it is not
		mountCell(row) {
			if (row.mount.locked) {
				return this.$t('key not loaded')
			}
			if (row.type === 'volume') {
				return this.$t('block device, no mount point')
			}

			return row.mount.text
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
.zfs {
	._head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
	}

	._tile {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: var(--casa-hover-tint);
		color: var(--casa-text-hint);

		&.is-success {
			background: rgba($primary, 0.12);
			color: $primary;
		}

		&.is-warning {
			background: rgba($warning, 0.18);
			color: $warning;
		}

		&.is-danger {
			background: rgba($danger, 0.16);
			color: $danger;
		}
	}

	._text {
		flex: 1;
		min-width: 0;
	}

	._name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--casa-text-strong);
	}

	// read and write, one above the other, the figures aligned
	._io {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	._body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 1rem 0.875rem;
	}

	._chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		height: 1.375rem;
		padding: 0 0.5625rem;
		border-radius: 0.6875rem;
		background: var(--casa-hover-tint);
		font-weight: 500;
		white-space: nowrap;
	}

	._dot {
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: rgba(128, 128, 128, 0.5);

		&.is-online {
			background: $success;
		}

		&.is-degraded {
			background: $warning;
		}

		&.is-unavail,
		&.is-faulted,
		&.is-removed,
		&.is-offline {
			background: $danger;
		}
	}

	._details summary {
		cursor: pointer;
	}

	.words {
		white-space: pre-wrap;
	}

	// the datasets as a table: name in a tree, mount, bar, used, available, snapshots
	._datasets {
		padding: 0.5rem 0.25rem 0.25rem;
		border-top: 1px solid var(--casa-divider-soft);
	}

	._row {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(5rem, 1fr) 5.5rem 5.5rem 7rem;
		gap: 0.75rem;
		align-items: center;
		min-height: 2.25rem;
		padding: 0 0.75rem;
	}

	._hd {
		min-height: 1.75rem;
		color: var(--casa-text-hint);
		font-weight: 600;
	}

	.dataset + .dataset,
	.snapshots + .dataset {
		border-top: 1px solid var(--casa-divider-soft);
	}

	._num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	._tree {
		display: flex;
		align-items: center;
		min-width: 0;

		.name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	._mount,
	._mono {
		overflow: hidden;
		font-family: ui-monospace, sfmono-regular, menlo, consolas, monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.zfs-bar {
		margin: 0;
	}

	._snaps {
		height: 1.625rem;
		font-size: 0.75rem;
		font-weight: 600;

		&.is-open {
			border-color: $primary;
			background: rgba($primary, 0.12);
		}
	}

	.snapshots {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0 0.75rem 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.625rem;
		background: var(--casa-hover-tint);
	}

	._srow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 10rem 5.5rem 7rem;
		gap: 0.75rem;
	}

	// a narrower window drops the mount point first: the name and the figures matter more
	@media (max-width: 1023px) {
		._row {
			grid-template-columns: minmax(0, 1.6fr) minmax(5rem, 1fr) 5.5rem 5.5rem 7rem;
		}

		._mount {
			display: none;
		}
	}

	// a phone keeps the name, what is used and the snapshots; the bar and the available go too
	@media (max-width: 768px) {
		._row {
			grid-template-columns: minmax(0, 1fr) 5rem 6.5rem;
		}

		._mount,
		._usage,
		._avail {
			display: none;
		}

		._srow {
			grid-template-columns: minmax(0, 1fr) 5.5rem;

			> :nth-child(2),
			> :nth-child(4) {
				display: none;
			}
		}

		._io {
			display: none;
		}
	}
}
</style>
