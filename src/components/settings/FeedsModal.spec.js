// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FeedsModal from './FeedsModal.vue'

const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))

async function open(sys) {
	const wrapper = mount(FeedsModal, {
		global: {
			plugins: [Buefy],
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$api: { sys: { getFeeds: answer({ enabled: false, feeds: ['https://a.example/feed'], items: [] }), setFeeds: answer({}), ...sys } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('the footer news settings', () => {
	it('shows the feeds one per line, and saves them trimmed, blank lines left out', async () => {
		const setFeeds = answer({})
		const wrapper = await open({ setFeeds })
		const textarea = wrapper.find('textarea')
		expect(textarea.element.value).toBe('https://a.example/feed')

		await textarea.setValue('  https://a.example/feed \n\nhttps://b.example/atom\n')
		await wrapper.find('[data-feeds-switch] input').setValue(true)
		await wrapper.find('[data-feeds-save]').trigger('click')
		await flushPromises()

		expect(setFeeds).toHaveBeenCalledWith({ enabled: true, feeds: ['https://a.example/feed', 'https://b.example/atom'] })
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('says why the box could not read a feed', async () => {
		const wrapper = await open({ getFeeds: answer({ enabled: true, feeds: ['http://192.168.1.5/rss'], items: [], errors: { 'http://192.168.1.5/rss': 'refused: the box reads feeds from the Internet only' } }) })
		expect(wrapper.find('[data-feeds-error]').text()).toBe('http://192.168.1.5/rss could not be read: refused: the box reads feeds from the Internet only')
	})

	it('says why the core refused, and stays open', async () => {
		const setFeeds = vi.fn(() => Promise.reject(Object.assign(new Error('400'), { response: { data: { message: 'invalid feeds settings: "ftp://x" is not an http(s) address' } } })))
		const wrapper = await open({ setFeeds })
		await wrapper.find('[data-feeds-save]').trigger('click')
		await flushPromises()

		expect(wrapper.text()).toContain('The feeds could not be saved: invalid feeds settings: "ftp://x" is not an http(s) address')
		expect(wrapper.emitted('close')).toBeUndefined()
	})
})
