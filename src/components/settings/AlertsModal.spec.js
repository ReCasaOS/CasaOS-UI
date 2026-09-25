// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AlertsModal from './AlertsModal.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// GET /v1/sys/alerts as the core answers it: never a URL.
function view(fields = {}) {
	return {
		channels: [
			{ id: 'a', name: 'Phone', service: 'ntfy', host: 'ntfy.sh' },
			{ id: 'b', name: 'Mail', service: 'smtp', host: 'smtp.example.com' },
		],
		categories: { backups: true, disks: true, updates: true, apps: true },
		disk_threshold: 90,
		last_failure: null,
		...fields,
	}
}
const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))

// sys: the slice of $api.sys the test drives; the dialogs confirm at once.
async function open(sys) {
	const buefy = {
		dialog: {
			prompt: vi.fn(options => options.onConfirm('Mobile')),
			confirm: vi.fn(options => options.onConfirm()),
		},
	}
	const wrapper = mount(AlertsModal, {
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$api: { sys: { getAlerts: answer(view()), setAlerts: answer({}), ...sys } },
				$buefy: buefy,
			},
			// The failure's words are what is checked, so its stub keeps them.
			stubs: {
				'b-button': true,
				'b-field': true,
				'b-checkbox': true,
				'b-input': true,
				'b-select': true,
				'b-message': { render() { return h('div', this.$slots.default()) } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('the alerts dialog', () => {
	it('lists each channel by name, service and host', async () => {
		const wrapper = await open({})

		expect(wrapper.text()).toContain('Phone')
		expect(wrapper.text()).toContain('ntfy · ntfy.sh')
		expect(wrapper.text()).toContain('Mail')
		expect(wrapper.text()).toContain('smtp · smtp.example.com')
	})

	it('says nothing is sent without a channel', async () => {
		const wrapper = await open({ getAlerts: answer(view({ channels: null })) })

		expect(wrapper.text()).toContain('No channel yet: nothing is sent. Add one below.')
	})

	it('renames a channel by its id, and its stored URL stays', async () => {
		const setAlerts = answer({})
		const getAlerts = answer(view())
		const wrapper = await open({ setAlerts, getAlerts })

		await wrapper.vm.rename(wrapper.vm.view.channels[0])
		await flushPromises()

		expect(setAlerts).toHaveBeenCalledWith({ channels: [{ id: 'a', name: 'Mobile' }, { id: 'b', name: 'Mail' }] })
		// then what the core says it now is
		expect(getAlerts).toHaveBeenCalledTimes(2)
	})

	it('removes a channel and keeps the others by id', async () => {
		const setAlerts = answer({})
		const wrapper = await open({ setAlerts })

		await wrapper.vm.remove(wrapper.vm.view.channels[1])
		await flushPromises()

		expect(setAlerts).toHaveBeenCalledWith({ channels: [{ id: 'a', name: 'Phone' }] })
	})

	it('adds a channel from the guided form, and does not keep the URL', async () => {
		const setAlerts = answer({})
		const added = view({ channels: [...view().channels, { id: 'c', name: 'Laptop', service: 'ntfy', host: 'ntfy.sh' }] })
		const getAlerts = vi.fn()
			.mockImplementationOnce(answer(view()))
			.mockImplementation(answer(added))
		const wrapper = await open({ setAlerts, getAlerts })

		wrapper.vm.draft.name = 'Laptop'
		wrapper.vm.draft.values.topic = 'my-box'
		expect(wrapper.vm.draftURL).toBe('ntfy://ntfy.sh/my-box')
		await wrapper.vm.add()
		await flushPromises()

		expect(setAlerts).toHaveBeenCalledWith({
			channels: [{ id: 'a', name: 'Phone' }, { id: 'b', name: 'Mail' }, { name: 'Laptop', url: 'ntfy://ntfy.sh/my-box' }],
		})
		expect(wrapper.vm.draft.name).toBe('')
		expect(wrapper.vm.draft.values.topic).toBe('')
		expect(wrapper.vm.view.channels.map(channel => channel.name)).toEqual(['Phone', 'Mail', 'Laptop'])
		expect(wrapper.text()).not.toContain('ntfy://')
	})

	it('keeps the form and the list when the core refuses the URL', async () => {
		const refused = Object.assign(new Error('400'), { response: { data: { message: 'unknown service "foo"' } } })
		const wrapper = await open({ setAlerts: vi.fn(() => Promise.reject(refused)) })

		wrapper.vm.pick('url')
		wrapper.vm.draft.name = 'Other'
		wrapper.vm.draft.values.url = 'foo://bar'
		await wrapper.vm.add()
		await flushPromises()

		expect(wrapper.text()).toContain('unknown service "foo"')
		expect(wrapper.vm.draft.values.url).toBe('foo://bar')
		expect(wrapper.vm.view.channels).toEqual(view().channels)
	})

	it('tests one channel and says how it went', async () => {
		const testAlerts = vi.fn()
			.mockImplementationOnce(answer([{ id: 'a', ok: true, error: '' }]))
			.mockImplementationOnce(answer([{ id: 'b', ok: false, error: 'dial tcp: i/o timeout' }]))
		const wrapper = await open({ testAlerts })

		await wrapper.vm.test(wrapper.vm.view.channels[0])
		await wrapper.vm.test(wrapper.vm.view.channels[1])

		expect(testAlerts).toHaveBeenNthCalledWith(1, { channel_id: 'a' })
		expect(testAlerts).toHaveBeenNthCalledWith(2, { channel_id: 'b' })
		expect(wrapper.text()).toContain('Sent')
		expect(wrapper.text()).toContain('Not sent: dial tcp: i/o timeout')
	})

	it('sends a category or the threshold alone, and goes back when refused', async () => {
		const setAlerts = answer({})
		const wrapper = await open({ setAlerts })

		await wrapper.vm.save({ categories: { ...wrapper.vm.view.categories, apps: false } })
		expect(setAlerts).toHaveBeenLastCalledWith({ categories: { backups: true, disks: true, updates: true, apps: false } })

		await wrapper.vm.save({ disk_threshold: 80 })
		expect(setAlerts).toHaveBeenLastCalledWith({ disk_threshold: 80 })

		setAlerts.mockImplementation(() => Promise.reject(new Error('offline')))
		await wrapper.vm.save({ disk_threshold: 70 })
		expect(wrapper.vm.view.disk_threshold).toBe(90)
	})

	it('offers a threshold from 50 to 99 percent', async () => {
		const wrapper = await open({})

		expect(wrapper.vm.thresholds[0]).toBe(50)
		expect(wrapper.vm.thresholds.at(-1)).toBe(99)
	})

	it('shows the last failed send, by the channel\'s name', async () => {
		const at = '2026-09-25T06:00:00Z'
		const wrapper = await open({ getAlerts: answer(view({ last_failure: { at, channel: 'a', error: 'unauthorized' } })) })

		expect(wrapper.text()).toContain(`The last alert to Phone could not be sent (${new Date(at).toLocaleString()}): unauthorized`)
	})
})

describe('the alerts dialog\'s words', () => {
	it.each([
		'Alerts',
		'Be told on your phone or by e-mail when something needs you: a backup that failed, a disk failing or full, an app that stopped, an update that paused.',
		'The last alert to {channel} could not be sent ({date}): {error}',
		'Channels',
		'No channel yet: nothing is sent. Add one below.',
		'Test',
		'A channel\'s address and its secrets stay on this box and are never shown again: to change them, remove the channel and add it again.',
		'Add a channel',
		'Phone',
		'Add channel',
		'What to send',
		'A backup or a restore fails',
		'A disk is failing, missing or full',
		'An update fails or pauses, or a new release is out',
		'An app operation fails, or an app stops or keeps restarting',
		'A disk counts as full above',
		'New name for {name}',
		'Remove {name}? Alerts are no longer sent there.',
		'Sent',
		'Not sent: {error}',
	])('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})
})
