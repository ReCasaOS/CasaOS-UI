import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A key used by the public sharing code that one of the language files lacks would show as the bare English sentence.
const folder = import.meta.dirname
const lang = file => join(folder, '../../assets/lang', file)
const read = file => readFileSync(file, 'utf8')
const en = JSON.parse(read(lang('en_US.json')))
const fr = JSON.parse(read(lang('fr_FR.json')))

// words that are the same in French
const SAME = ['Public', 'Boxes', 'iPhone / iPad', 'minutes', 'Bans', 'Date', 'Action', 'Protection']

const sources = [
	...readdirSync(folder).filter(f => /\.(?:vue|js)$/.test(f) && !f.endsWith('.spec.js')).map(f => join(folder, f)),
	join(folder, '../../service/publicShare.js'),
	join(folder, '../settings/RemoteAccessModal.vue'),
].filter(existsSync)
// RemoteAccessModal.vue has disambiguated keys ("Copied (one)": "Copied"): the key = value rule is for the new code
const own = file => !file.endsWith('RemoteAccessModal.vue')
// $t('key') and t('key'), with any of the three quotes (\x60 is the backtick)
const CALL = /(?:\$t|\bt)\(\s*(['"\x60])((?:\\.|(?!\1)[^\\])*)\1/g
const used = new Set()
const ownKeys = new Set()
for (const file of sources) {
	for (const [, , key] of read(file).matchAll(CALL)) {
		used.add(key.replace(/\\(.)/g, '$1'))
		if (own(file)) {
			ownKeys.add(key.replace(/\\(.)/g, '$1'))
		}
	}
}

describe('the language keys of the public sharing code', () => {
	it('finds the keys it is made to find', () => {
		expect(used.size).toBeGreaterThan(30)
		expect(used).toContain('No certificate yet')
		expect(used).toContain('The relay is busy, try again later')
	})

	it.each([['en_US', en], ['fr_FR', fr]])('are all in %s', (_, file) => {
		expect([...used].filter(k => typeof file[k] !== 'string' || file[k] === '')).toEqual([])
	})

	it('are English for English, French for French', () => {
		expect([...ownKeys].filter(k => en[k] !== k)).toEqual([])
		expect([...used].filter(k => fr[k] === k && !SAME.includes(k))).toEqual([])
	})

	it.each(['en_US.json', 'fr_FR.json', 'it_IT.json'])('%s has no key twice', (name) => {
		const keys = [...read(lang(name)).matchAll(/^ {2}("(?:[^"\\]|\\.)*"): /gm)].map(m => m[1])
		expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
	})
})
