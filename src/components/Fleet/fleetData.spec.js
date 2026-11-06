// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { CONTAINER_FILTERS, VM_FILTERS, containerRows, countRows, failureCode, filterBoxes, fleetSummary, groupByBox, overviewRow, sortBoxes, sortRows, updatesRow, vmRows } from './fleetData'

// the payload of each route, as the box sends it under `data`
const ok = data => ({ ok: true, data })
const failed = (status, error = 'failed') => ({ ok: false, status, error })
const box = { id: 'b1', name: 'Home', url: 'https://home', self: false, online: true, last_seen: '2026-11-02T10:00:00Z' }

const VERSION = { current_version: '0.4.80', need_update: true, version: { version: '0.4.81' } }
const OS = { id: 'debian', version_id: '12', pretty_name: 'Debian GNU/Linux 12 (bookworm)', known: true, support: { state: 'supported' } }
const UTIL = { cpu: { percent: 12.5 }, mem: { usedPercent: 40.2 }, sys_disk: { size: 1000, used: 333 } }
const GRID = [
	{ name: 'jellyfin', app_type: 'v2app', status: 'running', title: { en_us: 'Jellyfin' }, update_available: true },
	{ name: 'plex', app_type: 'v2app', status: 'exited', title: { en_us: 'Plex' } },
	{ name: 'db', app_type: 'container', status: 'running', title: { en_us: 'Postgres' } },
]
const VMS = [{ id: 'vm-1', title: 'Debian', state: 'running', vcpus: 2, memory_mib: 2048, os: 'debian12' }, { id: 'vm-2', title: 'Win', state: 'shut-off', vcpus: 4, memory_mib: 4096, os: '' }]
const all = () => ({ version: ok(VERSION), os: ok(OS), utilization: ok(UTIL), grid: ok(GRID), vms: ok(VMS) })

describe('the overview row of one box', () => {
	it('counts apps and VMs of one box', () => {
		const row = overviewRow(box, all())
		expect(row).toMatchObject({ id: 'b1', name: 'Home', url: 'https://home', self: false, online: true, lastSeen: '2026-11-02T10:00:00Z' })
		expect(row.version).toEqual({ current: '0.4.80', latest: '0.4.81', available: true })
		expect(row.os).toEqual({ label: 'Debian GNU/Linux 12 (bookworm)', support: 'supported' })
		expect(row.apps).toEqual({ running: 2, total: 3, down: 1, updates: 1 })
		expect(row.vms).toEqual({ running: 1, total: 2 })
		expect([row.cpu, row.mem, row.disk]).toEqual([12.5, 40.2, 33])
		expect(row.errors).toEqual([])
	})

	it('keeps a box with a failed source, naming the source', () => {
		const row = overviewRow(box, { ...all(), os: failed(0, 'Network Error') })
		expect(row.os).toBeNull()
		expect(row.errors).toEqual(['os'])
		expect(row.apps).toEqual({ running: 2, total: 3, down: 1, updates: 1 })
	})

	it('reads no VMs from a 404', () => {
		const row = overviewRow(box, { ...all(), vms: failed(404) })
		expect(row.vms).toBeNull()
		expect(row.errors).toEqual([])
	})

	it('has nothing but the status for an offline box', () => {
		const row = overviewRow({ ...box, online: false }, { version: failed(503), os: failed(503), utilization: failed(503), grid: failed(503), vms: failed(503) })
		expect(row.online).toBe(false)
		expect([row.version, row.os, row.apps, row.vms, row.cpu]).toEqual([null, null, null, null, null])
		expect(row.errors).toEqual(['version', 'os', 'utilization', 'grid', 'vms'])
	})

	it('counts a restarting or dead app as down', () => {
		const grid = [{ name: 'a', app_type: 'v2app', status: 'restarting' }, { name: 'b', app_type: 'v2app', status: 'dead' }, { name: 'c', app_type: 'v2app', status: 'paused' }]
		expect(overviewRow(box, { ...all(), grid: ok(grid) }).apps).toEqual({ running: 0, total: 3, down: 2, updates: 0 })
	})
})

describe('the rows of the containers and the VMs', () => {
	it('marks only v2 apps as actionable', () => {
		const rows = containerRows(box, GRID)
		expect(rows.map(r => [r.key, r.id, r.title, r.status, r.updateAvailable, r.type, r.actionable])).toEqual([
			['b1/jellyfin', 'jellyfin', 'Jellyfin', 'running', true, 'v2app', true],
			['b1/plex', 'plex', 'Plex', 'exited', false, 'v2app', true],
			['b1/db', 'db', 'Postgres', 'running', false, 'container', false],
		])
		expect(rows[0]).toMatchObject({ boxId: 'b1', boxName: 'Home' })
	})

	it('names an app by its id when it has no title', () => {
		expect(containerRows(box, [{ name: 'x', app_type: 'v1app', status: 'running' }])[0].title).toBe('x')
	})

	it('lists the VMs with their box', () => {
		expect(vmRows(box, VMS)[0]).toEqual({ key: 'b1/vm-1', boxId: 'b1', boxName: 'Home', id: 'vm-1', title: 'Debian', state: 'running', vcpus: 2, memoryMib: 2048, os: 'debian12', actionable: true })
		expect(vmRows(box, VMS)).toHaveLength(2)
	})
})

describe('the updates row of one box', () => {
	it('reads the release, the automatic updates and the apps to update', () => {
		const row = updatesRow({ ...box, self: true }, { version: ok(VERSION), autoupdate: ok({ enabled: true, state: 'waiting' }), grid: ok(GRID) })
		expect(row).toEqual({ key: 'b1', id: 'b1', name: 'Home', self: true, online: true, current: '0.4.80', latest: '0.4.81', available: true, autoState: 'waiting', appUpdates: 1, appIds: ['jellyfin'], packages: null, errors: [] })
	})

	it('shows the packages once checked, and a check that failed', () => {
		const base = { version: ok(VERSION), autoupdate: ok({ state: 'up_to_date' }), grid: ok(GRID) }
		expect(updatesRow(box, { ...base, packages: ok({ count: 7 }) }).packages).toEqual({ count: 7 })
		expect(updatesRow(box, { ...base, packages: failed(503) }).packages).toEqual({ error: 'offline' })
		expect(updatesRow(box, { ...base, packages: ok({ supported: false, reason: 'not root', count: 0 }) }).packages).toEqual({ supported: false, reason: 'not root' })
		expect(updatesRow(box, { ...base, version: failed(500) })).toMatchObject({ current: null, latest: null, available: false, errors: ['version'] })
	})
})

describe('the failures and the order', () => {
	it('maps failures the way the spec says', () => {
		const e = status => ({ response: { status } })
		expect([e(503), new Error('Network Error'), e(409), e(404), e(500), e(504)].map(failureCode)).toEqual(['offline', 'offline', 'refused', 'notfound', 'failed', 'failed'])
		expect(failureCode(failed(503))).toBe('offline')
		expect(failureCode(failed(0))).toBe('offline')
	})

	it('sorts by box then title', () => {
		const rows = [{ boxName: 'Shop', title: 'b' }, { boxName: 'Home', title: 'z' }, { boxName: 'home', title: 'A' }, { boxName: 'Shop', title: 'a' }]
		expect(sortRows(rows).map(r => `${r.boxName}/${r.title}`)).toEqual(['home/A', 'Home/z', 'Shop/a', 'Shop/b'])
		expect(rows[0].boxName).toBe('Shop')
	})
})

describe('the summary, the filters and the order of the boxes', () => {
	const row = (name, over = {}) => ({ name, online: true, needsRecode: false, version: { available: false }, apps: null, vms: null, ...over })
	const rows = [
		row('b-home', { apps: { running: 2, total: 3, down: 1, updates: 1 }, vms: { running: 1, total: 2 }, version: { available: true } }),
		row('a-shop', { apps: { running: 4, total: 4, down: 0, updates: 2 } }),
		row('c-cave', { online: false }),
		row('d-new', { needsRecode: true }),
	]

	it('adds up what the boxes that answered have', () => {
		expect(fleetSummary(rows)).toEqual({
			boxes: 4,
			online: 3,
			offline: 1,
			appsRunning: 6,
			appsTotal: 7,
			appsDown: 1,
			appUpdates: 3,
			vmsRunning: 1,
			vmsTotal: 2,
			toUpdate: 1,
		})
		expect(fleetSummary([]).boxes).toBe(0)
	})

	it('keeps the boxes a chip asks for, and all of them for a chip it does not know', () => {
		expect(filterBoxes(rows, 'online').map(r => r.name)).toEqual(['b-home', 'a-shop', 'd-new'])
		expect(filterBoxes(rows, 'offline').map(r => r.name)).toEqual(['c-cave'])
		expect(filterBoxes(rows, 'update').map(r => r.name)).toEqual(['b-home'])
		expect(filterBoxes(rows, 'nonsense')).toHaveLength(4)
	})

	it('sorts by name, or by what needs a person first, without touching the list', () => {
		expect(sortBoxes(rows, 'name').map(r => r.name)).toEqual(['a-shop', 'b-home', 'c-cave', 'd-new'])
		expect(sortBoxes(rows, 'state').map(r => r.name)).toEqual(['c-cave', 'd-new', 'b-home', 'a-shop'])
		expect(rows[0].name).toBe('b-home')
	})
})

describe('the chips and the groups of the Containers and Virtual Machines tabs', () => {
	const rows = [
		{ key: 'a/x', boxId: 'a', boxName: 'Home', title: 'Jellyfin', status: 'running', updateAvailable: true },
		{ key: 'a/y', boxId: 'a', boxName: 'Home', title: 'Db', status: 'exited', updateAvailable: false },
		{ key: 'b/!', boxId: 'b', boxName: 'Shop', title: '', status: '', error: 'offline' },
	]

	it('counts what each chip keeps, an unreadable box not counted', () => {
		expect(countRows(rows, CONTAINER_FILTERS)).toEqual({ all: 2, running: 1, stopped: 1, update: 1 })
		expect(countRows([{ state: 'running' }, { state: 'paused' }, { state: 'crashed' }, { state: 'shut-off' }], VM_FILTERS)).toEqual({ all: 4, running: 1, stopped: 1, attention: 2 })
	})

	it('groups the rows by box and keeps why a box could not be read', () => {
		const groups = groupByBox(rows)
		expect(groups.map(g => [g.name, g.rows.length, g.error])).toEqual([['Home', 2, ''], ['Shop', 0, 'offline']])
	})
})
