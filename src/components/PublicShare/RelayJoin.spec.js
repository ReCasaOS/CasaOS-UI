// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RelayJoin from './RelayJoin.vue'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

let wrapper
async function open(busy) {
	wrapper = mount(RelayJoin, { attachTo: document.body, props: { relay: { community_size: 5 }, waves: [], busy }, global: { plugins: [Buefy, i18n] } })
	await wrapper.find('.relay-join').trigger('click')
	await flushPromises()
}
afterEach(() => {
	wrapper.unmount()
	document.body.innerHTML = ''
})

describe('the relay join card', () => {
	it('emits join only after the box is ticked and "I agree" clicked', async () => {
		await open(false)
		document.querySelector('.relay-agree-go').click()
		expect(wrapper.emitted('join')).toBeUndefined()
		document.querySelector('.relay-agree input').click()
		await flushPromises()
		document.querySelector('.relay-agree-go').click()
		expect(wrapper.emitted('join')).toHaveLength(1)
	})

	it('cannot be agreed to while busy', async () => {
		await open(true)
		document.querySelector('.relay-agree input').click()
		await flushPromises()
		expect(document.querySelector('.relay-agree-go').disabled).toBe(true)
	})
})
