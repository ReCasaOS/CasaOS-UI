import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// The page's animations need more scaffolding than a mount is worth: the
// template is checked as text.
const source = readFileSync('src/views/Welcome.vue', 'utf8')
const local = 'The first account is created on the machine itself. Once it exists, reload this page to sign in.'

describe('welcome, first account made on the machine', () => {
	it('says so instead of offering the form', () => {
		expect(source).toMatch(/v-if="\$store.state.firstAdmin === 'local'"[^>]*>\{\{\s*\$t\('The first account is created on the machine itself/)
		expect(source).toMatch(/<template v-else>\s*<h2[^>]*>\{\{\s*\$t\(`Let's create your initial account`\)/)
	})

	it('says it in English and French', () => {
		expect(en[local]).toBe(local)
		expect(fr[local]).toBeTruthy()
		expect(fr[local]).not.toBe(local)
	})
})
