import { describe, expect, it } from 'vitest'
import { raidLevel, raidNeedsAttention, raidRemaining, raidTag } from './raid'
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
		['reshaping', 50, 'is-info', 'Reshaping'],
		['inactive', -1, 'is-danger', 'Not running'],
	])('tags a %s array', (state, progress, type, text) => {
		expect(raidTag({ state, progress }, t)).toEqual({ type, text })
	})

	it('asks for attention only when a disk is missing or failed, a rebuild runs or the array stopped', () => {
		expect(['ok', 'resyncing', 'checking', 'reshaping', 'degraded', 'rebuilding', 'inactive'].filter(state => raidNeedsAttention({ state })))
			.toEqual(['degraded', 'rebuilding', 'inactive'])
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
