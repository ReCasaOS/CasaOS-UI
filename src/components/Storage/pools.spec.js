import { describe, expect, it } from 'vitest'
import { choices, diskChoices, intent, layoutName, layoutTargets, memberChoices, poolWorking, survives, verbTitle } from './pools'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, k) => values[k])

const mirror = {
	backend: 'btrfs',
	layout: { kind: 'mirror', copies: 2 },
	layout_known: true,
	members: [{ name: 'sdb', disk: 'sdb', state: 'active', size: 4000 }, { name: 'devid 2', disk: '', state: 'faulty', size: 4000 }],
}
const drives = [
	{ name: 'sdc', role: 'free', size: 8000 },
	{ name: 'sdd', role: 'free', size: 2000 },
	{ name: 'sde', role: 'foreign', size: 8000 },
]

describe('what the dashboard says about the pool', () => {
	it('names layouts and protection as people do', () => {
		expect(layoutName({ kind: 'mirror', copies: 3 }, t)).toBe('Mirror, 3 copies')
		expect(layoutName({ kind: 'parity', parity: 1 }, t)).toBe('Parity (RAID 5)')
		expect(layoutName({ kind: 'parity', parity: 2 }, t)).toBe('Double parity (RAID 6)')
		expect(layoutName({ kind: 'none' }, t)).toBe('No protection')
		expect(survives(0, t)).toBe('No disk may fail')
		expect(survives(1, t)).toBe('Survives 1 disk failing')
		expect(survives(2, t)).toBe('Survives 2 disks failing')
		expect(verbTitle('replace-disk', t)).toBe('Replace a disk')
		expect(verbTitle('restore-layout', t)).toBe('Restore protection')
	})

	it('asks each action only what it needs', () => {
		expect(choices('create-pool', null)).toEqual({ disks: 'many', layout: true })
		expect(choices('add-disk', mirror)).toEqual({ disks: 'many' })
		expect(choices('add-disk', { backend: 'md' })).toEqual({ disks: 'one' }) // a parity pool grows a disk at a time
		expect(choices('replace-disk', mirror)).toEqual({ disks: 'one', member: true })
		expect(choices('check', mirror)).toEqual({})
	})

	it('offers only blank disks, big enough for the disk they replace', () => {
		expect(diskChoices('add-disk', drives).map(d => d.name)).toEqual(['sdc', 'sdd'])
		expect(diskChoices('replace-disk', drives, mirror.members[1]).map(d => d.name)).toEqual(['sdc'])
	})

	it('takes out of a parity pool only a failed or spare disk', () => {
		const md = { backend: 'md', members: [{ name: 'vdb', state: 'active' }, { name: 'vdc', state: 'faulty' }] }
		expect(memberChoices('remove-disk', md).map(m => m.name)).toEqual(['vdc'])
		expect(memberChoices('remove-disk', mirror)).toHaveLength(2)
	})

	it('offers the other layouts a pool can change to', () => {
		expect(layoutTargets(mirror)).toEqual([{ kind: 'none' }, { kind: 'mirror', copies: 3 }])
	})

	it('sends only what was chosen', () => {
		expect(intent('check')).toEqual({ verb: 'check' })
		expect(intent('replace-disk', { disks: ['sdc'], member: 'devid 2' })).toEqual({ verb: 'replace-disk', disks: ['sdc'], member: 'devid 2' })
	})

	it('looks again while the pool works', () => {
		expect(poolWorking({ pool: { action: 'idle', state: 'ok' }, busy: false })).toBe(false)
		expect(poolWorking({ pool: { action: 'idle', state: 'degraded' }, busy: false })).toBe(false)
		expect(poolWorking({ pool: { action: 'recover', state: 'rebuilding' }, busy: false })).toBe(true)
		expect(poolWorking({ pool: null, busy: true })).toBe(true)
	})
})

const KEYS = Object.keys(fr).slice(Object.keys(fr).indexOf('Active'))

describe('the language files', () => {
	it('have the storage layer\'s words', () => {
		expect(KEYS).toContain('Survives {n} disks failing')
	})
	it.each(KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect((fr[key].match(/\{\w+\}/g) || []).sort()).toEqual((key.match(/\{\w+\}/g) || []).sort())
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
	})
})
