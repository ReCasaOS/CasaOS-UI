// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareEntryButton from './ShareEntryButton.vue'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/service.js', () => ({ instance: { request: vi.fn() } }))

let wrapper
const tip = () => document.body.querySelector('.share-tip')

async function mountButton(customStorage) {
	wrapper = mount(ShareEntryButton, {
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: { $api: { users: { getCustomStorage: vi.fn().mockResolvedValue({ data: { data: customStorage } }), setCustomStorage: vi.fn() } } },
		},
	})
	await flushPromises()
	vi.advanceTimersByTime(600)
	await flushPromises()
}

describe('the share entry tip', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		document.body.innerHTML = ''
		// happy-dom lays nothing out: give the row a place
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740, left: 20, right: 200, width: 180, height: 40 })
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it('opens beside the row, in the body, on a first visit', async () => {
		await mountButton(null)
		expect(tip()).not.toBeNull()
		expect(tip().style.left).toBe('208px')
		expect(tip().style.top).toBe('720px')
	})

	it('stays away once it was dismissed', async () => {
		await mountButton({ isInit: true })
		expect(tip()).toBeNull()
	})

	it('goes with the component, so closing the window leaves nothing behind', async () => {
		await mountButton(null)
		wrapper.unmount()
		wrapper = null
		expect(tip()).toBeNull()
	})

	it('follows the row when the window is resized', async () => {
		await mountButton(null)
		HTMLElement.prototype.getBoundingClientRect.mockReturnValue({ top: 300, bottom: 340, left: 20, right: 260, width: 240, height: 40 })
		vi.advanceTimersByTime(300)
		await flushPromises()
		expect(tip().style.left).toBe('268px')
		expect(tip().style.top).toBe('320px')
	})
})
