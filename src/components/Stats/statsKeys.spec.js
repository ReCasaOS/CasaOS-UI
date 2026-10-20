import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SENTENCES } from './resourceAlerts'
import { STATS_KEYS } from './statsData'

// A key used by the Statistics code that one of the language files lacks would show as the bare English sentence, or worse.
const folder = import.meta.dirname
const lang = file => join(folder, '../../assets/lang', file)
const read = file => readFileSync(file, 'utf8')
const en = JSON.parse(read(lang('en_US.json')))
const fr = JSON.parse(read(lang('fr_FR.json')))

// words that are the same in French
const SAME = ['OK', 'Min', 'Max', 'Direct', 'Machine', 'Total', 'Cache', 'Swap', '{label} (max)', '{hours} h {minutes} min', '{minutes} min', '{seconds} s']

const sources = [
	...readdirSync(folder).filter(f => /\.(?:vue|js)$/.test(f) && !f.endsWith('.spec.js')).map(f => join(folder, f)),
	join(folder, '../../service/stats.js'),
]
// $t('key') and t('key'), with any of the three quotes (\x60 is the backtick)
const CALL = /(?:\$t|\bt)\(\s*(['"\x60])((?:\\.|(?!\1)[^\\])*)\1/g
const used = new Set([...STATS_KEYS, ...Object.values(SENTENCES).flatMap(s => Object.values(s))])
for (const file of sources) {
	for (const [, , key] of read(file).matchAll(CALL)) {
		used.add(key.replace(/\\(.)/g, '$1'))
	}
}

describe('the language keys of the Statistics code', () => {
	it('finds the keys it is made to find', () => {
		expect(used.size).toBeGreaterThan(60)
		expect(used).toContain('Alert settings')
		expect(used).toContain('Processor of {name} is high')
	})

	it.each([['en_US', en], ['fr_FR', fr]])('are all in %s', (_, file) => {
		expect([...used].filter(k => typeof file[k] !== 'string' || file[k] === '')).toEqual([])
	})

	it('are English for English, French for French', () => {
		expect([...used].filter(k => en[k] !== k)).toEqual([])
		expect([...used].filter(k => fr[k] === k && !SAME.includes(k))).toEqual([])
	})

	it.each(['en_US.json', 'fr_FR.json'])('%s has no key twice', (name) => {
		const keys = [...read(lang(name)).matchAll(/^ {2}("(?:[^"\\]|\\.)*"): /gm)].map(m => m[1])
		expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
	})
})
