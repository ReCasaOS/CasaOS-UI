// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UpdateAllModal from './UpdateAllModal.vue'

const noRun = () => Promise.reject(new Error('no run since the service started'))

async function open(plan) {
	const wrapper = mount(UpdateAllModal, {
		global: {
			mocks: { $t: k => k, $api: { updates: { run: noRun, plan } }, $EventBus: { $emit() {} } },
			stubs: {
				'b-message': { template: '<div class="message"><slot /></div>' },
				'b-button': { template: '<button><slot /></button>' },
				'b-icon': true,
				'b-checkbox': true,
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('the update every app dialog, with nothing to confirm', () => {
	it('says the plan failed, not that every app is current, and offers Close', async () => {
		const wrapper = await open(() => Promise.reject(Object.assign(new Error('Request failed'), { response: { data: { message: 'dial tcp: i/o timeout' } } })))

		expect(wrapper.find('.message').text()).toContain('Could not load what an update would do.')
		expect(wrapper.find('.message').text()).toContain('dial tcp: i/o timeout')
		expect(wrapper.text()).not.toContain('Every app is current')
		expect(wrapper.text()).not.toContain('Each app is pulled')
		expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Close'])
		wrapper.unmount()
	})

	it('offers Close, not Cancel, when every app is current', async () => {
		const wrapper = await open(() => Promise.resolve({ data: { data: { apps: [] } } }))

		expect(wrapper.text()).toContain('Every app is current')
		expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Close'])
		wrapper.unmount()
	})
})

describe('the icon of each app in the list', () => {
	const plan = () => Promise.resolve({
		data: {
			data: {
				apps: [
					{ id: 'seerr', title: 'seerr', icon: 'https://cdn.example/moved/seerr.png', kind: 'image', services: [{ name: 'seerr', from: 'x/seerr:develop', to: 'x/seerr:develop' }] },
					{ id: 'bare', title: 'bare', icon: '', kind: 'image', services: [{ name: 'bare', from: 'x/bare:latest', to: 'x/bare:latest' }] },
				],
			},
		},
	})

	it('shows the address the app names, and the default icon when it names none', async () => {
		const wrapper = await open(plan)
		const [named, bare] = wrapper.findAll('img')

		expect(named.attributes('src')).toBe('https://cdn.example/moved/seerr.png')
		expect(bare.attributes('src')).not.toBe(named.attributes('src'))
		expect(bare.attributes('src')).toBeTruthy()
		wrapper.unmount()
	})

	it('falls back to the default icon when the address does not load, for that app only', async () => {
		const wrapper = await open(plan)
		const [named, bare] = wrapper.findAll('img')
		const fallback = bare.attributes('src')

		await named.trigger('error')

		expect(wrapper.findAll('img')[0].attributes('src')).toBe(fallback)
		expect(wrapper.findAll('img')[1].attributes('src')).toBe(fallback)
		wrapper.unmount()
	})

	it('does not change anything when the default icon itself fails', async () => {
		const wrapper = await open(plan)
		const [, bare] = wrapper.findAll('img')
		const fallback = bare.attributes('src')

		await bare.trigger('error')
		await bare.trigger('error')

		expect(wrapper.findAll('img')[1].attributes('src')).toBe(fallback)
		wrapper.unmount()
	})
})
