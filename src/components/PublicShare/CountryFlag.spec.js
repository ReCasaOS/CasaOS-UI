// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CountryFlag from './CountryFlag.vue'

// The flag files come through webpack's require.context, which Vitest does not have: the component then draws
// nothing, and the country name next to it is what the owner reads. Codes that are not two letters never draw.
describe('countryFlag', () => {
	it('draws nothing without the webpack flag table', () => {
		expect(mount(CountryFlag, { props: { cc: 'FR' } }).find('img').exists()).toBe(false)
	})

	it('draws nothing for an empty or malformed code', () => {
		for (const cc of ['', 'FRA', 'f1', '../x']) {
			expect(mount(CountryFlag, { props: { cc } }).find('img').exists()).toBe(false)
		}
	})
})
