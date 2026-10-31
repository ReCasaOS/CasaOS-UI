import { describe, expect, it } from 'vitest'
import { raidCanBecomeRaid5, raidFreedMember, raidLevel, raidNeedsAttention, raidRemaining, raidRoomLeft, raidTag } from './raid'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, k) => values[k])

describe('what the dashboard says about an array', () => {
	it('spells the level as people do', () => {
		expect(raidLevel('raid1')).toBe('RAID 1')
		expect(raidLevel('raid10')).toBe('RAID 10')
		expect(raidLevel('linear')).toBe('Linear')
	})

	it.each([
		['ok', -1, 'is-success', 'Healthy'],
		['degraded', -1, 'is-danger', 'Degraded'],
		['rebuilding', 42.9, 'is-warning', 'Rebuilding 42 %'],
		['rebuilding', -1, 'is-warning', 'Rebuilding'],
		['resyncing', 3, 'is-info', 'Resyncing 3 %'],
		['checking', 99.99, 'is-info', 'Checking 99 %'],
		['reshaping', 50, 'is-info', 'Reshaping 50 %'],
		['reshaping', -1, 'is-info', 'Reshaping'],
		['inactive', -1, 'is-danger', 'Not running'],
	])('tags a %s array', (state, progress, type, text) => {
		expect(raidTag({ state, progress }, t)).toEqual({ type, text })
	})

	it('asks for attention only when a disk is missing or failed, a rebuild runs or the array stopped', () => {
		expect(['ok', 'resyncing', 'checking', 'reshaping', 'degraded', 'rebuilding', 'inactive'].filter(state => raidNeedsAttention({ state })))
			.toEqual(['degraded', 'rebuilding', 'inactive'])
	})

	it('offers RAID 5 only to a whole mirror of two disks that does nothing else', () => {
		const mirror = { level: 'raid1', disks: 2, state: 'ok', action: 'idle' }
		expect(raidCanBecomeRaid5(mirror)).toBe(true)
		for (const change of [{ level: 'raid5' }, { level: 'raid0' }, { disks: 3 }, { state: 'degraded' }, { state: 'resyncing', action: 'resync' }, { action: 'check' }]) {
			expect(raidCanBecomeRaid5({ ...mirror, ...change })).toBe(false)
		}
	})

	it('offers RAID 5 to a healthy mirror of three drives too, which gives back its last one', () => {
		const members = [{ disk: 'sdb', state: 'active', slot: 0 }, { disk: 'sdc', state: 'active', slot: 1 }, { disk: 'sdd', state: 'active', slot: 2 }]
		const trio = { level: 'raid1', disks: 3, state: 'ok', action: 'idle', members }
		expect(raidCanBecomeRaid5(trio)).toBe(true)
		expect(raidFreedMember(trio)).toBe('sdd')
		expect(raidFreedMember({ disks: 3, members: [...members].reverse() })).toBe('sdd') // the order of the list does not matter, the slot does
		expect(raidCanBecomeRaid5({ ...trio, members: [...members, { disk: 'sde', state: 'spare', slot: -1 }] })).toBe(false)
		expect(raidCanBecomeRaid5({ ...trio, members: members.slice(0, 2) })).toBe(false)
		expect(raidCanBecomeRaid5({ ...trio, members: [members[0], members[1], { ...members[2], slot: 5 }] })).toBe(false)
		expect(raidCanBecomeRaid5({ ...trio, state: 'degraded' })).toBe(false)
		expect(raidCanBecomeRaid5({ ...trio, disks: 4 })).toBe(false)
		expect(raidFreedMember({ disks: 2, members: [] })).toBe('')
	})

	it('says there is room to use when the array holds clearly more than the filesystem on it', () => {
		const raid5 = { state: 'ok', action: 'idle', size: 2000 }
		expect(raidRoomLeft(raid5, 940)).toBe(true) // a mirror of 1000 turned RAID 5
		expect(raidRoomLeft(raid5, 1900)).toBe(false) // the filesystem already fills it, bar its overhead
		expect(raidRoomLeft(raid5, 0)).toBe(false) // nothing mounted to grow
		expect(raidRoomLeft({ ...raid5, state: 'reshaping', action: 'reshape' }, 940)).toBe(false)
	})

	it('tells the time left in minutes, then hours', () => {
		expect(raidRemaining(-1, t)).toBe('')
		expect(raidRemaining(20, t)).toBe('1 min left')
		expect(raidRemaining(5 * 60, t)).toBe('5 min left')
		expect(raidRemaining(80 * 60, t)).toBe('1 h 20 min left')
	})
})

const KEYS = [
	'Degraded',
	'Rebuilding {percent} %',
	'Resyncing',
	'Resyncing {percent} %',
	'Checking',
	'Checking {percent} %',
	'Reshaping',
	'Reshaping {percent} %',
	'Not running',
	'Spare',
	'Faulty',
	'Missing: {count}',
	'{minutes} min left',
	'{hours} h {minutes} min left',
	'A disk is failing, missing or full, or a RAID array lacks a disk',
]

describe('the language files', () => {
	it.each(KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect((fr[key].match(/\{\w+\}/g) || []).sort()).toEqual((key.match(/\{\w+\}/g) || []).sort())
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
	})
})
