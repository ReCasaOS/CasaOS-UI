// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppIframe from './AppIframe.vue'
import { forgetFrameChecks, frameRefused } from '@/mixins/app/frameCheck'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const NIFI = 'https://192.168.10.3:8443/nifi/'

function setup(answer) {
	const check = vi.fn(answer)
	const wrapper = mount(AppIframe, {
		props: { appName: 'nifi', url: NIFI },
		global: {
			plugins: [Buefy, i18n],
			stubs: { transition: false },
			mocks: { $api: { webFrame: { check } } },
		},
	})
	return { wrapper, check }
}

describe('the app frame', () => {
	afterEach(() => forgetFrameChecks())

	// NiFi: frame-ancestors 'self' on another origin and a self-signed certificate.
	// The browser left the frame empty and told the page nothing.
	it('says why an app refuses the frame, and offers a tab instead', async () => {
		const { wrapper, check } = setup(async () => ({ data: { data: { embeddable: false, reason: 'untrusted-certificate' } } }))
		await flushPromises()

		expect(check).toHaveBeenCalledWith(NIFI, window.location.origin)
		expect(wrapper.find('iframe').exists()).toBe(false)
		expect(wrapper.text()).toContain('uses an HTTPS certificate the browser does not trust')
		// the next click on the card goes to a tab straight away
		expect(frameRefused(NIFI)).toBe(true)

		const open = vi.spyOn(window, 'open').mockImplementation(() => null)
		await wrapper.find('.app-iframe-refused button').trigger('click')
		expect(open).toHaveBeenCalledWith(NIFI, '_blank')
		expect(wrapper.emitted('close')).toHaveLength(1)
		open.mockRestore()
	})

	it.each([
		['an app that allows it', async () => ({ data: { data: { embeddable: true } } })],
		['an app that did not answer', async () => ({ data: { data: {} } })],
		['an AppManagement without the check', async () => { throw new Error('404') }],
	])('keeps the frame for %s', async (_, answer) => {
		const { wrapper } = setup(answer)
		await flushPromises()

		expect(wrapper.find('iframe').attributes('src')).toBe(NIFI)
		expect(frameRefused(NIFI)).toBe(false)
	})
})
