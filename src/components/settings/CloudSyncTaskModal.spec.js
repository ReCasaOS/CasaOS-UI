// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CloudSyncTaskModal from './CloudSyncTaskModal.vue'
import i18n from '@/plugins/i18n'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const answer = data => () => Promise.resolve({ data: { data } })
const existing = {
	id: 'a',
	name: 'Photos',
	enabled: true,
	destination: 'nas',
	remote_path: 'Photos',
	local_path: '/DATA/Photos',
	direction: 'download',
	mirror: true,
	archive: true,
	archive_days: 30,
	every: 'daily',
	at: '02:00',
	weekday: 0,
	last_result: 'ok',
}
const other = { ...existing, id: 'b', name: 'Music' }

async function open({ props = {}, backup = {}, sync = {} } = {}) {
	const $api = {
		backup: { getDestinations: answer(['nas', 'drive']), getFolders: answer({ folders: [] }), ...backup },
		sync: { saveTasks: vi.fn(answer([])), ...sync },
	}
	const $buefy = { modal: { open: vi.fn() } }
	const wrapper = mount(CloudSyncTaskModal, {
		attachTo: document.body,
		props: { task: null, tasks: [], ...props },
		global: { plugins: [Buefy, i18n], mocks: { $api, $buefy } },
	})
	await flushPromises()
	return { wrapper, $api, $buefy }
}

const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text() === text)
const fill = (wrapper, placeholder, value) => wrapper.find(`input[placeholder="${placeholder}"]`).setValue(value)

describe('the sync task dialog', () => {
	it('starts a new task with nothing deleted and copies kept 30 days', async () => {
		const { wrapper, $api } = await open()
		await fill(wrapper, 'Name', 'Photos')
		await wrapper.find('select').setValue('nas')
		await fill(wrapper, '/DATA/Photos', '/DATA/Photos')
		await fill(wrapper, 'Folder in the cloud', 'Photos')
		await button(wrapper, 'Save').trigger('click')
		await flushPromises()
		expect($api.sync.saveTasks).toHaveBeenCalledWith([{
			name: 'Photos',
			destination: 'nas',
			remote_path: 'Photos',
			local_path: '/DATA/Photos',
			direction: 'download',
			mirror: false,
			archive: true,
			archive_days: 30,
			every: 'daily',
			at: '02:00',
			weekday: 0,
			enabled: true,
		}])
		expect(wrapper.emitted('saved')).toHaveLength(1)
		wrapper.unmount()
	})

	it('locks deletions on when both ways is chosen, and says why', async () => {
		const { wrapper } = await open()
		expect(wrapper.text()).toContain('Off: this task never deletes a file.')
		await wrapper.find('input[type=radio][value=both]').setValue(true)
		const mirror = wrapper.find('input[type=checkbox]')
		expect(mirror.element.checked).toBe(true)
		expect(mirror.element.disabled).toBe(true)
		expect(wrapper.text()).toContain('Both ways, a deletion on one side is always carried to the other; the copy kept below is what protects you.')
		expect(wrapper.text()).toContain('At the first pass, when a file differs the box\'s version is kept; the cloud\'s goes to the copies.')
		await wrapper.find('input[type=radio][value=upload]').setValue(true)
		expect(wrapper.find('input[type=checkbox]').element.checked).toBe(false)
		expect(wrapper.find('input[type=checkbox]').element.disabled).toBe(false)
		wrapper.unmount()
	})

	it('says the cloud version is lost when both ways has no copies', async () => {
		const { wrapper } = await open({ props: { task: { ...existing, direction: 'both', archive: false } } })
		expect(wrapper.text()).toContain('the cloud\'s is lost.')
		expect(wrapper.text()).not.toContain('the cloud\'s goes to the copies.')
		await wrapper.findAll('input[type=checkbox]')[1].setValue(true)
		expect(wrapper.text()).toContain('the cloud\'s goes to the copies.')
		expect(wrapper.text()).not.toContain('the cloud\'s is lost.')
		wrapper.unmount()
	})

	it('does not carry deletions over when a two-way task becomes one-way', async () => {
		const both = { ...existing, direction: 'both', mirror: true }
		const { wrapper, $api } = await open({ props: { task: both, tasks: [both] } })
		await wrapper.find('input[type=radio][value=upload]').setValue(true)
		await button(wrapper, 'Save').trigger('click')
		await flushPromises()
		expect($api.sync.saveTasks.mock.calls[0][0][0]).toMatchObject({ direction: 'upload', mirror: false })
		wrapper.unmount()
	})

	it('still sends mirror on for a two-way task', async () => {
		const both = { ...existing, direction: 'both', mirror: true }
		const { wrapper, $api } = await open({ props: { task: both, tasks: [both] } })
		await button(wrapper, 'Save').trigger('click')
		await flushPromises()
		expect($api.sync.saveTasks.mock.calls[0][0][0]).toMatchObject({ direction: 'both', mirror: true })
		wrapper.unmount()
	})

	it('shows no archive path while the folders are empty, and forever when the days are zero', async () => {
		const { wrapper } = await open()
		expect(wrapper.text()).not.toContain('-archive')
		wrapper.unmount()
		const kept = await open({ props: { task: { ...existing, archive_days: 0 } } })
		expect(kept.wrapper.text()).toContain('/DATA/.Photos-archive · forever')
		kept.wrapper.unmount()
	})

	it('warns when copies are off and deletions are on', async () => {
		const { wrapper } = await open({ props: { task: { ...existing, archive: false } } })
		expect(wrapper.text()).toContain('Without copies, up to half of the files can be lost before the task stops.')
		await wrapper.findAll('input[type=checkbox]')[1].setValue(true)
		expect(wrapper.text()).not.toContain('Without copies')
		expect(wrapper.text()).toContain('/DATA/.Photos-archive')
		wrapper.unmount()
	})

	it('sends the edited task in place, with the others untouched', async () => {
		const { wrapper, $api } = await open({ props: { task: existing, tasks: [other, existing] } })
		await fill(wrapper, 'Name', 'Pictures')
		await button(wrapper, 'Save').trigger('click')
		await flushPromises()
		const sent = $api.sync.saveTasks.mock.calls[0][0]
		expect(sent[0]).toEqual(other)
		expect(sent[1]).toEqual({ ...existing, name: 'Pictures', last_result: undefined })
		expect(sent[1]).not.toHaveProperty('last_result')
		wrapper.unmount()
	})

	it('keeps the form and shows the box\'s words when saving is refused', async () => {
		const refuse = vi.fn(() => Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { message: 'encrypted account' } } })))
		const { wrapper } = await open({ props: { task: existing, tasks: [existing] }, sync: { saveTasks: refuse } })
		await fill(wrapper, 'Name', 'Pictures')
		await button(wrapper, 'Save').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('encrypted account')
		expect(wrapper.find('input[placeholder="Name"]').element.value).toBe('Pictures')
		expect(wrapper.emitted('saved')).toBeUndefined()
		expect(wrapper.emitted('close')).toBeUndefined()
		wrapper.unmount()
	})

	it('walks into a cloud folder and picks it', async () => {
		const getFolders = vi.fn((name, path) => answer({ folders: path ? ['Summer'] : ['Photos', 'Music'] })())
		const { wrapper } = await open({ props: { task: { ...existing, remote_path: '' } }, backup: { getFolders } })
		await button(wrapper, 'Browse the cloud').trigger('click')
		await flushPromises()
		expect(getFolders).toHaveBeenCalledWith('nas', '')
		await button(wrapper, 'Photos').trigger('click')
		await flushPromises()
		expect(getFolders).toHaveBeenLastCalledWith('nas', 'Photos')
		await button(wrapper, 'Use this folder').trigger('click')
		expect(wrapper.find('input[placeholder="Folder in the cloud"]').element.value).toBe('Photos')
		wrapper.unmount()
	})

	it('says so when the account shows no folder', async () => {
		const { wrapper } = await open({ props: { task: existing } })
		await button(wrapper, 'Browse the cloud').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('This account shows no folder here. An account limited to one folder only sees inside it.')
		wrapper.unmount()
	})
})
