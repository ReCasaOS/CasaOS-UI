import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const FILES = ['cloudSyncText.js', 'CloudSync.vue', 'CloudSyncTaskModal.vue', 'BackupRunning.vue', '../TopBar.vue']

// keys that reach `t` as variables, which no regex can see
const BY_VARIABLE = [
	'pass done',
	'stopped',
	'resumed after an interruption',
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]

const KEY = /\$?\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g

function literalKeys(file) {
	const text = readFileSync(new URL(file, import.meta.url), 'utf8')

	return [...text.matchAll(KEY)].map(match => match[2].replace(/\\(['"`])/g, '$1'))
}

describe('the folder sync texts', () => {
	const keys = [...new Set([...FILES.flatMap(literalKeys), ...BY_VARIABLE])]

	it('reads some keys from every file', () => {
		for (const file of FILES) {
			expect(literalKeys(file).length, file).toBeGreaterThan(0)
		}
	})

	it('has each of them in English and in French', () => {
		const missing = keys.filter(key => !(key in en) || !(key in fr))

		expect(missing).toEqual([])
	})
})
