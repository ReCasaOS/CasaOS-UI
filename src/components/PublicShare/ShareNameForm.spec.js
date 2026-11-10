// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareNameForm from './ShareNameForm.vue'
import i18n from '@/plugins/i18n'
import { publicShare, publicShareApi } from '@/service/publicShare'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/publicShare', async () => {
	const { reactive } = await import('vue')
	const store = reactive({ status: null, ok: false })
	return {
		publicShare: store,
		publicShareApi: { setName: vi.fn() },
		apply: vi.fn(async (p) => {
			store.status = (await p).data.data
		}),
	}
})

const answer = data => Promise.resolve({ data: { success: 200, data } })
const refusal = (status, message) => Promise.reject(Object.assign(new Error(String(status)), { response: { status, data: { success: false, message } } }))

let wrapper
const button = () => wrapper.findAll('button').find(b => b.text() === 'Choose this name')
const type = v => wrapper.find('input[name=share-name]').setValue(v)
const tick = () => wrapper.find('input[type=checkbox]').setValue(true)

describe('the name form', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		publicShare.status = { tos_url: 'https://le.test/tos' }
		wrapper = mount(ShareNameForm, { global: { plugins: [Buefy, i18n] } })
	})
	afterEach(() => wrapper.unmount())

	it('claims a valid name with the terms accepted', async () => {
		publicShareApi.setName.mockReturnValue(answer({ name: 'mybox' }))
		await type('MyBox')
		expect(wrapper.find('input[name=share-name]').element.value).toBe('mybox')
		expect(button().attributes('disabled')).toBeDefined()
		await tick()
		expect(button().attributes('disabled')).toBeUndefined()
		const link = wrapper.find('a[href="https://le.test/tos"]')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toBe('noopener noreferrer')
		await button().trigger('click')
		await flushPromises()
		expect(publicShareApi.setName).toHaveBeenCalledWith('mybox')
		expect(wrapper.emitted('claimed')).toHaveLength(1)
	})

	it('refuses a name the relay would refuse', async () => {
		await type('ab')
		await tick()
		expect(button().attributes('disabled')).toBeDefined()
		await button().trigger('click')
		expect(publicShareApi.setName).not.toHaveBeenCalled()
	})

	it('keeps the name and says why', async () => {
		await type('mybox')
		await tick()
		publicShareApi.setName.mockImplementationOnce(() => refusal(409, 'this name is already taken'))
		await button().trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('This name is already taken')
		expect(wrapper.find('input[name=share-name]').element.value).toBe('mybox')
		expect(wrapper.emitted('claimed')).toBeUndefined()
		publicShareApi.setName.mockImplementationOnce(() => refusal(429, ''))
		await button().trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('The relay is busy, try again later')
		expect(wrapper.text()).not.toContain('already taken')
	})
})
