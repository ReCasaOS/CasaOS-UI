// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FeedTicker, { RELOAD_MS, RETRY_MS, ROTATE_MS } from './FeedTicker.vue'

const items = [
	{ title: 'v0.5.180 is out', link: 'https://example.org/a', source: 'ReCasaOS' },
	{ title: 'Second', link: 'https://example.org/b', source: 'Blog' },
]
const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))

async function ticker(getFeeds) {
	const bus = {
		handlers: {},
		$on(name, fn) { this.handlers[name] = fn },
		$off(name) { delete this.handlers[name] },
	}
	const wrapper = mount(FeedTicker, { global: { mocks: { $api: { sys: { getFeeds } }, $EventBus: bus } } })
	await flushPromises()
	return { wrapper, bus }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the footer headlines', () => {
	it('shows one headline, as text, opened in a new tab', async () => {
		const { wrapper } = await ticker(answer({ enabled: true, feeds: ['f'], items: [{ ...items[0], title: '<img src=x onerror=alert(1)>' }] }))
		const link = wrapper.find('a')
		expect(link.attributes('href')).toBe('https://example.org/a')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toBe('noopener noreferrer')
		expect(wrapper.find('.feed-title').text()).toBe('<img src=x onerror=alert(1)>')
		expect(wrapper.find('img').exists()).toBe(false)
		wrapper.unmount()
	})

	it('moves to the next headline, and holds while pointed at', async () => {
		const { wrapper } = await ticker(answer({ enabled: true, feeds: ['f'], items }))
		expect(wrapper.find('.feed-title').text()).toBe('v0.5.180 is out')
		vi.advanceTimersByTime(ROTATE_MS)
		await flushPromises()
		expect(wrapper.find('.feed-title').text()).toBe('Second')

		await wrapper.find('[data-feed-ticker]').trigger('mouseenter')
		vi.advanceTimersByTime(ROTATE_MS * 3)
		await flushPromises()
		expect(wrapper.find('.feed-title').text()).toBe('Second')
		wrapper.unmount()
	})

	it('shows nothing while off, with no headline, or on a core without the feature', async () => {
		for (const getFeeds of [
			answer({ enabled: false, feeds: ['f'], items }),
			answer({ enabled: true, feeds: [], items: [] }),
			vi.fn(() => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))),
		]) {
			const { wrapper } = await ticker(getFeeds)
			expect(wrapper.find('[data-feed-ticker]').exists()).toBe(false)
			wrapper.unmount()
		}
	})

	it('asks again soon while the box is still fetching, then every ten minutes', async () => {
		const getFeeds = vi.fn()
			.mockResolvedValueOnce({ data: { data: { enabled: true, feeds: ['f'], items: [] } } })
			.mockResolvedValue({ data: { data: { enabled: true, feeds: ['f'], items } } })
		const { wrapper } = await ticker(getFeeds)
		expect(getFeeds).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(RETRY_MS)
		await flushPromises()
		expect(getFeeds).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.feed-title').text()).toBe('v0.5.180 is out')
		vi.advanceTimersByTime(RETRY_MS)
		await flushPromises()
		expect(getFeeds).toHaveBeenCalledTimes(2)
		vi.advanceTimersByTime(RELOAD_MS)
		await flushPromises()
		expect(getFeeds).toHaveBeenCalledTimes(3)
		wrapper.unmount()
	})

	it('reads again at once when the settings change, and stops when gone', async () => {
		const getFeeds = answer({ enabled: true, feeds: ['f'], items })
		const { wrapper, bus } = await ticker(getFeeds)
		bus.handlers['casaUI:feedsChanged']()
		await flushPromises()
		expect(getFeeds).toHaveBeenCalledTimes(2)
		// a feed just added beside cached ones: read again once the box has had time
		vi.advanceTimersByTime(RETRY_MS)
		await flushPromises()
		expect(getFeeds).toHaveBeenCalledTimes(3)
		wrapper.unmount()
		expect(bus.handlers['casaUI:feedsChanged']).toBeUndefined()
		vi.advanceTimersByTime(RELOAD_MS * 2)
		expect(getFeeds).toHaveBeenCalledTimes(3)
	})
})
