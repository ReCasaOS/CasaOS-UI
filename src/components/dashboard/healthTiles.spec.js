import { describe, expect, it } from 'vitest'
import { attentionItems, backupTile, cpuFrequency, cpuWatts, diskRows, fleetPanel, netSpeed, percent, runBatch, snapraidTile, usbPercent } from './healthTiles'

const t = key => key

describe('percent', () => {
	it('rounds down, stays within 0 and 100, and reads a missing size as 0', () => {
		expect(percent(40, 100)).toBe(40)
		expect(percent(1, 3)).toBe(33)
		expect(percent(500, 100)).toBe(100)
		expect(percent(5, 0)).toBe(0)
		expect(percent(undefined, undefined)).toBe(0)
	})
})

describe('netSpeed', () => {
	it('is the bytes between two samples over the time between them', () => {
		const prev = { bytesSent: 1000, bytesRecv: 5000, time: 100 }
		const cur = { bytesSent: 3000, bytesRecv: 9000, time: 102 }

		expect(netSpeed(prev, cur)).toEqual({ up: 1000, down: 2000 })
	})

	it('says nothing before a second sample, or when no time went by', () => {
		const sample = { bytesSent: 1, bytesRecv: 1, time: 100 }

		expect(netSpeed(undefined, sample)).toBeNull()
		expect(netSpeed(sample, sample)).toBeNull()
	})

	it('reads a counter that went back as no traffic, not a negative speed', () => {
		const prev = { bytesSent: 9000, bytesRecv: 9000, time: 100 }
		const cur = { bytesSent: 10, bytesRecv: 10, time: 102 }

		expect(netSpeed(prev, cur)).toEqual({ up: 0, down: 0 })
	})
})

describe('backupTile', () => {
	it('has nothing to say without a backup, a restore is not one', () => {
		expect(backupTile([]).status).toBe('none')
		expect(backupTile(undefined).status).toBe('none')
		expect(backupTile([{ restore: true, started_at: '2026-11-01T03:00:00Z' }]).status).toBe('none')
	})

	it('is ok on a last backup that worked', () => {
		const runs = [{ started_at: '2026-11-02T03:00:00Z', destination: 'nas' }, { started_at: '2026-11-01T03:00:00Z', error: 'x' }]

		expect(backupTile(runs)).toEqual({ status: 'ok', at: '2026-11-02T03:00:00Z', destination: 'nas', error: '', batch: [runs[0]] })
	})

	it('fails on a failed last backup and still dates the last good copy', () => {
		const runs = [
			{ started_at: '2026-11-03T03:00:00Z', error: 'no route to host' },
			{ started_at: '2026-11-02T03:00:00Z' },
		]

		expect(backupTile(runs)).toEqual({ status: 'failed', at: '2026-11-02T03:00:00Z', destination: '', error: 'no route to host', batch: [runs[1]] })
	})

	it('takes as one go the runs to one destination, set off the same way, within six hours before the last', () => {
		const run = (started_at, more = {}) => ({ destination: 'nas', scheduled: true, started_at, ...more })
		const last = run('2026-11-02T03:12:00Z')
		const runs = [
			last,
			run('2026-11-02T03:04:00Z'),
			// by hand, elsewhere, or the night before: not this go
			run('2026-11-02T03:00:00Z', { scheduled: false }),
			run('2026-11-02T03:00:00Z', { destination: 'usb' }),
			run('2026-11-01T03:00:00Z'),
		]

		expect(runBatch(runs, last)).toEqual([last, runs[1]])
	})
})

describe('usbPercent', () => {
	it('reads used where the box gives it, size - avail where it does not', () => {
		expect(usbPercent({ size: 100, used: 25, avail: 75 })).toBe(25)
		expect(usbPercent({ size: 100, avail: 40 })).toBe(60)
		expect(usbPercent({ size: 0, used: 5 })).toBe(0)
	})
})

describe('snapraidTile', () => {
	it('is absent on a box without SnapRAID, or one it is not set up on', () => {
		expect(snapraidTile(null, t)).toBeNull()
		expect(snapraidTile({ configured: false }, t)).toBeNull()
	})

	it('reads the protection as ok, late, or broken', () => {
		const ok = { configured: true, last: { sync: { at: '2026-11-02T03:00:00Z', ok: true } } }
		const late = { configured: true, last: {} }
		const broken = { configured: true, missing: ['d2'], last: {} }

		expect(snapraidTile(ok, t)).toMatchObject({ level: 'ok', text: 'Protected' })
		expect(snapraidTile(late, t)).toMatchObject({ level: 'warning', text: 'Not synced yet' })
		expect(snapraidTile(broken, t)).toMatchObject({ level: 'danger', text: 'A disk is missing' })
	})
})

describe('attentionItems', () => {
	const healthy = { health: 'passed', snapraid: null, backup: { status: 'ok' } }

	it('has nothing when everything is fine, and a drive with no SMART data is not a failure', () => {
		expect(attentionItems(healthy, t)).toEqual([])
		expect(attentionItems({ ...healthy, health: 'unavailable' }, t)).toEqual([])
	})

	it('lists what needs a person, the failures before the lateness', () => {
		const items = attentionItems({
			health: 'failed',
			snapraid: { configured: true, last: {} },
			backup: { status: 'failed' },
		}, t)

		expect(items.map(item => item.key)).toEqual(['disk', 'backup', 'snapraid'])
		expect(items.find(item => item.key === 'snapraid')).toMatchObject({ level: 'warning', text: 'SnapRAID: Not synced yet' })
	})

	it('says nothing of a SnapRAID that is protecting, or at work', () => {
		const working = { configured: true, job: { action: 'sync', percent: 40 }, last: {} }

		expect(attentionItems({ ...healthy, snapraid: working }, t)).toEqual([])
	})
})

describe('fleetPanel', () => {
	const boxes = [
		{ id: 'a', name: 'Home', online: true, last_seen: '2026-11-03T10:00:00Z' },
		{ id: 'b', name: 'Cabin', online: false, last_seen: '2026-11-03T08:00:00Z' },
		{ id: 'c', name: 'New', online: false },
	]

	it('is the master’s: a plain box, a member and a core with no fleet have none', () => {
		expect(fleetPanel(undefined)).toBeNull()
		expect(fleetPanel({ role: 'none' })).toBeNull()
		expect(fleetPanel({ role: 'member', member: { connected: true } })).toBeNull()
	})

	it('counts the boxes online, and tells a box that went from one that never came', () => {
		const panel = fleetPanel({ role: 'master', master: { boxes } })

		expect(panel).toMatchObject({ total: 3, online: 1 })
		expect(panel.boxes.map(box => [box.name, box.state])).toEqual([['Home', 'online'], ['Cabin', 'offline'], ['New', 'never']])
	})

	it('is an empty fleet for a master with no box yet', () => {
		expect(fleetPanel({ role: 'master', master: { boxes: [] } })).toMatchObject({ total: 0, online: 0, boxes: [] })
	})
})

describe('attentionItems and the fleet', () => {
	const tp = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name])
	const healthy = { health: 'passed', snapraid: null, backup: { status: 'ok' } }
	const fleet = {
		role: 'master',
		master: {
			boxes: [
				{ id: 'a', name: 'Home', online: true, last_seen: '2026-11-03T10:00:00Z' },
				{ id: 'b', name: 'Cabin', online: false, last_seen: '2026-11-03T08:00:00Z' },
				{ id: 'c', name: 'Shed', online: false, last_seen: '2026-11-03T09:55:00Z' },
				{ id: 'd', name: 'New', online: false },
			],
		},
	}
	const now = Date.parse('2026-11-03T10:00:00Z')

	it('names a box gone for ten minutes, and not one that is online, back for a moment or yet to come', () => {
		const items = attentionItems({ ...healthy, fleet }, tp, now)

		expect(items).toEqual([{ key: 'fleet_b', level: 'warning', text: 'The box Cabin is offline' }])
	})

	it('says nothing of a fleet when the box is not a master', () => {
		expect(attentionItems({ ...healthy, fleet: { role: 'none' } }, tp, now)).toEqual([])
		expect(attentionItems({ ...healthy, fleet: null }, tp, now)).toEqual([])
	})
})

describe('attentionItems and the mounts df cannot read', () => {
	const tp = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name])
	const healthy = { health: 'passed', snapraid: null, backup: { status: 'ok' } }

	it('names each dead mount with its complaint, and says so when df itself hangs', () => {
		const items = attentionItems({ ...healthy, mounts: [{ mount_point: '/media/ser/fotos', error: 'Stale file handle' }, { mount_point: '', error: 'df did not answer within 15 s' }] }, tp)

		expect(items).toEqual([
			{ key: 'mount_/media/ser/fotos', level: 'warning', text: 'The mount /media/ser/fotos cannot be read (Stale file handle): check /etc/fstab or the server it comes from' },
			{ key: 'mount_hung', level: 'warning', text: 'A mount does not answer: check /etc/fstab or the servers of the network shares' },
		])
	})

	it('says nothing without dead mounts, or on a LocalStorage without the route', () => {
		expect(attentionItems({ ...healthy, mounts: [] }, tp)).toEqual([])
		expect(attentionItems({ ...healthy, mounts: undefined }, tp)).toEqual([])
	})
})

describe('attentionItems and the protection of shared apps', () => {
	const tp = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name])
	const healthy = { health: 'passed', snapraid: null, backup: { status: 'ok' } }
	const app = mode => ({ access: 'code', override: null, effective: { countries: { mode } } })

	it('names a ban wave on a shared app, danger, and says nothing without a guard (older core)', () => {
		const items = attentionItems({ ...healthy, guard: { apps: { jellyfin: app('none') }, waves: [{ app: 'jellyfin', bans: 23 }] } }, tp)

		expect(items).toEqual([{ key: 'share-wave-jellyfin', level: 'danger', text: 'jellyfin: 23 addresses banned in 10 minutes' }])
		expect(attentionItems({ ...healthy, guard: { waves: [{ app: 'jellyfin', bans: 23 }] } }, tp)).toHaveLength(1)
		expect(attentionItems({ ...healthy, guard: null }, tp)).toEqual([])
		expect(attentionItems(healthy, tp)).toEqual([])
	})

	it('skips a wave on an app that is not shared any more', () => {
		expect(attentionItems({ ...healthy, guard: { apps: { nextcloud: app('none') }, waves: [{ app: 'jellyfin', bans: 23 }] } }, tp)).toEqual([])
	})

	it('says the protection settings were reset, danger', () => {
		expect(attentionItems({ ...healthy, guard: { reset: true } }, tp)).toEqual([expect.objectContaining({ key: 'share-reset', level: 'danger' })])
		expect(attentionItems({ ...healthy, guard: { reset: false } }, tp)).toEqual([])
	})

	it('warns of country filtering without data only when protection is on and a country list applies', () => {
		const view = { protection: true, apps: { jellyfin: app('block') }, geo: { country: false } }

		expect(attentionItems({ ...healthy, guard: view }, tp)).toEqual([{ key: 'share-geo', level: 'warning', text: 'Country filtering of shared apps is not working' }])
		expect(attentionItems({ ...healthy, guard: { ...view, protection: false } }, tp)).toEqual([])
		expect(attentionItems({ ...healthy, guard: { ...view, apps: { jellyfin: app('none') } } }, tp)).toEqual([])
		expect(attentionItems({ ...healthy, guard: { ...view, geo: { country: true } } }, tp)).toEqual([])
	})

	it('puts the dangers before the warnings', () => {
		const view = { reset: true, protection: true, apps: { jellyfin: app('allow') }, geo: { country: false } }

		expect(attentionItems({ ...healthy, guard: view }, tp).map(item => item.key)).toEqual(['share-reset', 'share-geo'])
	})
})

describe('diskRows', () => {
	const storages = [
		{ path: '/dev/sda', disk_name: 'System', disk_model: 'Samsung SSD', children: [{ mount_point: '/', size: '100', used: '40' }] },
		{ path: '/dev/sdb', disk_name: 'Disk1', disk_model: 'WD Red', children: [{ mount_point: '/media/a', size: '1000', used: '250' }, { mount_point: '/media/b', size: '1000', used: '250' }] },
		{ path: '/dev/sdc', disk_name: 'Disk2', disk_model: '', children: [{ mount_point: '/media/p', size: '2000', used: '0' }] },
		{ path: '/dev/sdd', disk_name: 'Disk3', disk_model: 'Stick', children: [] },
	]
	const drives = [{ path: '/dev/sdb', temperature: 38, smart_status: 'passed' }]
	const held = { '/media/a': 'data', '/media/p': 'parity' }

	it('says the role of each disk, adds up its volumes and finds its drive by path', () => {
		const rows = diskRows(storages, drives, held)

		expect(rows.map(row => row.role)).toEqual(['system', 'data', 'parity', ''])
		expect(rows[1]).toMatchObject({ name: 'WD Red', size: 2000, used: 500, drive: drives[0] })
		expect(rows[0].drive).toBeNull()
		expect(rows[2].name).toBe('Disk2')
		expect(rows[3]).toMatchObject({ size: 0, used: 0 })
	})

	it('is empty when the box answers something else than a list', () => {
		expect(diskRows(undefined, undefined, {})).toEqual([])
	})
})

describe('cpuWatts', () => {
	it('is the energy between two samples over the time between them', () => {
		const prev = { timestamp: '100', value: '1000000' }
		const cur = { timestamp: '102', value: '31000000' }

		expect(cpuWatts(prev, cur)).toBe(15)
	})

	it('gives no figure without a counter, before a second sample, or after a wrap', () => {
		const sample = { timestamp: '100', value: '5000000' }

		expect(cpuWatts({ timestamp: '100', value: '0' }, { timestamp: '102', value: '0' })).toBeNull()
		expect(cpuWatts(undefined, sample)).toBeNull()
		expect(cpuWatts(sample, sample)).toBeNull()
		expect(cpuWatts(sample, { timestamp: '102', value: '1000' })).toBeNull()
	})
})

describe('cpuFrequency', () => {
	it('reads MHz as GHz from 1000 up, and says nothing without a reading', () => {
		expect(cpuFrequency(3400)).toBe('3.4 GHz')
		expect(cpuFrequency(800)).toBe('800 MHz')
		expect(cpuFrequency(0)).toBeNull()
		expect(cpuFrequency(undefined)).toBeNull()
	})
})

describe('a backup somebody stopped', () => {
	it('is told apart from one that failed', () => {
		expect(backupTile([{ app: 'happy_rik', started_at: '2026-11-09T07:00:00Z', error: 'stopped from the interface: copying /DATA/AppData/overseerr/config: context canceled' }]).status).toBe('stopped')
	})
})
