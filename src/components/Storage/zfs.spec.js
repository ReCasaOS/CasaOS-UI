import { describe, expect, it } from 'vitest'
import { zfsCapacityType, zfsDisks, zfsDuration, zfsLayout, zfsMount, zfsOps, zfsRate, zfsRates, zfsRows, zfsScanText, zfsTag, zfsUsedPercent, zfsVdevRows } from './zfs'

const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name])
const scan = over => ({ kind: 'scrub', state: 'finished', percent: -1, remaining: -1, errors: 0, duration: 1007, ended: 1762815908, repaired: '0B', ...over })
const dataset = (name, over = {}) => ({ name, pool: name.split('/')[0], type: 'filesystem', used: 100, available: 300, referenced: 100, used_by_snapshots: 0, mountpoint: `/${name}`, mounted: true, quota: 0, key_status: '', ...over })

describe('the tag of a pool', () => {
	it('is green only for ONLINE, and has a shape as well as a colour', () => {
		expect(zfsTag({ known: true, state: 'ONLINE' }, t)).toEqual({ type: 'is-success', icon: 'mdi-check', text: 'Online' })
		expect(zfsTag({ known: true, state: 'DEGRADED' }, t)).toMatchObject({ type: 'is-warning', icon: 'mdi-alert', text: 'Degraded' })
		for (const state of ['FAULTED', 'UNAVAIL', 'OFFLINE', 'REMOVED', 'SUSPENDED']) {
			expect(zfsTag({ known: true, state }, t)).toMatchObject({ type: 'is-danger', icon: 'mdi-close' })
		}
	})

	it('is not green when the state is not known, nor for a state it has never heard of', () => {
		expect(zfsTag({ known: false, state: '', health: 'ONLINE' }, t)).toEqual({ type: 'is-light', icon: 'mdi-help', text: 'State unknown' })
		expect(zfsTag({ known: true, state: 'NEWSTATE' }, t)).toMatchObject({ type: 'is-danger', text: 'NEWSTATE' })
	})
})

describe('capacity', () => {
	it('warns from 80 % and alarms from 90 %', () => {
		expect([0, 79, 80, 89, 90, 100].map(zfsCapacityType)).toEqual(['is-info', 'is-info', 'is-warning', 'is-warning', 'is-danger', 'is-danger'])
	})

	it('counts a dataset against what ZFS says it can still have, and never divides by nothing', () => {
		expect(zfsUsedPercent({ used: 100, available: 300 })).toBe(25)
		expect(zfsUsedPercent({ used: 0, available: 0 })).toBe(0)
		expect(zfsUsedPercent({ used: 5, available: 0 })).toBe(100)
	})
})

describe('the tree of datasets', () => {
	it('puts a pool first and its children after it, in order, whatever the order they came in', () => {
		const rows = zfsRows([dataset('pool1/immich-db'), dataset('pool1'), dataset('tank'), dataset('pool1/appdata'), dataset('pool1/appdata/logs')])
		expect(rows.map(r => [r.short, r.depth])).toEqual([['pool1', 0], ['appdata', 1], ['logs', 2], ['immich-db', 1], ['tank', 0]])
	})

	it('puts a dataset whose parent is not listed at the top rather than losing it', () => {
		expect(zfsRows([dataset('pool1/a/b')]).map(r => [r.short, r.depth])).toEqual([['pool1/a/b', 0]])
		expect(zfsRows([])).toEqual([])
	})

	it('says where a dataset is mounted, or why it is not', () => {
		expect(zfsMount(dataset('p/a', { mountpoint: '/p/data1' }), t)).toEqual({ text: '/p/data1', locked: false })
		expect(zfsMount(dataset('p/a', { mounted: false, mountpoint: '/p/a' }), t).text).toBe('Not mounted')
		expect(zfsMount(dataset('p/a', { mountpoint: 'none', mounted: false }), t).text).toBe('Not mounted')
		expect(zfsMount(dataset('p/a', { mountpoint: 'legacy', mounted: true }), t).text).toBe('Mounted by the system')
		expect(zfsMount(dataset('p/a', { mounted: false, key_status: 'unavailable' }), t)).toEqual({ text: 'Locked', locked: true })
		expect(zfsMount(dataset('p/z', { type: 'volume', mountpoint: '', mounted: false }), t).text).toBe('Volume')
	})
})

describe('the last scan', () => {
	it('says the result of a finished scrub', () => {
		const result = zfsScanText(scan(), t)
		expect(result.problem).toBe(false)
		expect(result.text).toMatch(/^Last scan: scrub, no error, took 00:16:47, on /)
	})

	it('counts the errors it found as a problem', () => {
		const result = zfsScanText(scan({ errors: 3 }), t)
		expect(result.problem).toBe(true)
		expect(result.text).toContain('3 errors')
	})

	it('follows one at work, with or without an estimate', () => {
		expect(zfsScanText(scan({ state: 'running', percent: 43.2, remaining: 1211 }), t).text).toBe('scrub in progress: 43.2 %, 00:20:11 left')
		expect(zfsScanText(scan({ kind: 'resilver', state: 'running', percent: 5, remaining: -1 }), t).text).toBe('resilver in progress: 5.0 %')
		expect(zfsScanText(scan({ state: 'canceled' }), t).text).toBe('scrub canceled')
		expect(zfsScanText(scan({ state: 'paused' }), t).text).toBe('scrub paused')
	})

	it('says when nothing ran, and shows a line it does not know as ZFS wrote it', () => {
		expect(zfsScanText({ kind: 'none' }, t).text).toBe('No scrub has run yet.')
		expect(zfsScanText({ kind: 'other', raw: 'something new' }, t).text).toBe('something new')
	})

	it('writes a duration as hours, minutes, seconds', () => {
		expect(zfsDuration(1007)).toBe('00:16:47')
		expect(zfsDuration(90061)).toBe('25:01:01')
		expect(zfsDuration(-1)).toBe('')
	})
})

describe('the live rates', () => {
	const reading = (at, over = {}) => ({ pool: 'p', at, read_bytes: 1000, write_bytes: 2000, read_ops: 10, write_ops: 20, ...over })

	it('is the difference between two readings over the time between them', () => {
		const rates = zfsRates(reading(1000), reading(3000, { read_bytes: 3000, write_bytes: 6000, read_ops: 30, write_ops: 60 }))
		expect(rates).toEqual({ read: 1000, write: 2000, readOps: 10, writeOps: 20 })
	})

	it('says nothing when it cannot be told: no earlier reading, no time between, a counter that went back', () => {
		expect(zfsRates(undefined, reading(1000))).toBeNull()
		expect(zfsRates(reading(1000), reading(1000))).toBeNull()
		expect(zfsRates(reading(2000), reading(1000))).toBeNull()
		expect(zfsRates(reading(1000), reading(2000, { read_bytes: 5 }))).toBeNull()
	})

	it('writes them for people', () => {
		expect(zfsRate(10600000)).toMatch(/\/s$/)
		expect(zfsOps(1320)).toBe('1.32 k')
		expect(zfsOps(3.4)).toBe('3')
	})
})

describe('the tree of vdevs', () => {
	const vdevs = [
		{ name: 'mirror-0', kind: 'mirror', state: 'ONLINE', children: [
			{ name: '/dev/disk/by-id/nvme-A-part1', kind: 'disk', state: 'ONLINE', disk: 'nvme0n1' },
			{ name: '/dev/disk/by-id/nvme-B-part1', kind: 'disk', state: 'UNAVAIL' },
		] },
		{ name: 'logs', kind: 'group', children: [{ name: '/dev/sde', kind: 'disk', state: 'ONLINE', disk: 'sde' }] },
	]

	it('lists the disks with the name ZFS knows them by and the disk they are on', () => {
		expect(zfsDisks(vdevs)).toEqual([
			{ name: 'nvme-A-part1', disk: 'nvme0n1', state: 'ONLINE' },
			{ name: 'nvme-B-part1', disk: undefined, state: 'UNAVAIL' },
			{ name: 'sde', disk: 'sde', state: 'ONLINE' },
		])
	})

	it('names the layout by the vdevs that hold data, not the logs', () => {
		expect(zfsLayout(vdevs)).toBe('mirror-0')
		expect(zfsLayout([{ name: '/dev/sda', kind: 'disk' }])).toBe('')
		expect(zfsLayout([])).toBe('')
	})

	it('flattens the tree with depths for the detail', () => {
		expect(zfsVdevRows(vdevs).map(v => [v.name.slice(-6), v.depth])).toEqual([['rror-0', 0], ['-part1', 1], ['-part1', 1], ['logs', 0], ['/dev/sde'.slice(-6), 1]])
	})
})
