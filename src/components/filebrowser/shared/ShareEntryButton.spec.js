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

function mountButton() {
	wrapper = mount(ShareEntryButton, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	return wrapper
}

describe('the share entry tip', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		// happy-dom lays nothing out: give the row a place
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740, left: 20, right: 200, width: 180, height: 40 })
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.restoreAllMocks()
	})

	it('is not there until the pointer is on the row', () => {
		mountButton()
		expect(tip()).toBeNull()
	})

	it('opens beside the row, in the body, while it is hovered', async () => {
		mountButton()
		await wrapper.find('.list-item').trigger('mouseenter')
		expect(tip()).not.toBeNull()
		expect(tip().style.left).toBe('208px')
		expect(tip().style.top).toBe('720px')
	})

	it('goes when the pointer leaves', async () => {
		mountButton()
		await wrapper.find('.list-item').trigger('mouseenter')
		await wrapper.find('.list-item').trigger('mouseleave')
		await flushPromises()
		expect(tip()).toBeNull()
	})

	it('goes with the component, so closing the window leaves nothing behind', async () => {
		mountButton()
		await wrapper.find('.list-item').trigger('mouseenter')
		wrapper.unmount()
		wrapper = null
		expect(tip()).toBeNull()
	})
})
