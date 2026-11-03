import { describe, expect, it } from 'vitest'
import { attentionItems, backupTile, netSpeed, percent, snapraidTile, usbPercent } from './healthTiles'

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

		expect(backupTile(runs)).toEqual({ status: 'ok', at: '2026-11-02T03:00:00Z', destination: 'nas', error: '' })
	})

	it('fails on a failed last backup and still dates the last good copy', () => {
		const runs = [
			{ started_at: '2026-11-03T03:00:00Z', error: 'no route to host' },
			{ started_at: '2026-11-02T03:00:00Z' },
		]

		expect(backupTile(runs)).toEqual({ status: 'failed', at: '2026-11-02T03:00:00Z', destination: '', error: 'no route to host' })
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
