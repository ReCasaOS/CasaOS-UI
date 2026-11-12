// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import ContactBar from '@/components/ContactBar.vue'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

describe('contact bar', () => {
	it('links to the issues, the repository and the Ko-fi page of the distribution, nothing else', () => {
		const wrapper = mount(ContactBar, { global: { plugins: [Buefy, i18n] } })
		const links = wrapper.findAll('a')
		expect(links.map(a => a.attributes('href'))).toEqual([
			'https://github.com/ReCasaOS/CasaOS/issues',
			'https://github.com/ReCasaOS/CasaOS',
			'https://ko-fi.com/recasaos',
		])
		for (const a of links) {
			expect(a.attributes('rel')).toContain('noopener')
			expect(a.attributes('target')).toBe('_blank')
		}
		// The right-anchored tooltip rule in the style block targets this path.
		expect(wrapper.find('.contact-bar .b-tooltip:last-child .tooltip-content.contact-tip').text()).toBe('Support ReCasaOS on Ko-fi')
		wrapper.unmount()
	})
})
