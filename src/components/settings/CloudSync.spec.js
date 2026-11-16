// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CloudSync from './CloudSync.vue'
import { syncAvailable } from './cloudSyncText.js'
import i18n from '@/plugins/i18n'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const base = {
	id: 'a',
	name: 'Photos',
	enabled: true,
	destination: 'Dropbox',
	remote_path: 'Photos',
	local_path: '/DATA/Photos',
	direction: 'download',
	mirror: false,
	archive: false,
	archive_days: 0,
	every: 'daily',
	at: '02:00',
	weekday: 0,
	last_run: '0001-01-01T00:00:00Z',
	last_result: '',
	last_error: '',
	last_files: 0,
	last_bytes: 0,
}
const second = { ...base, id: 'b', name: 'Music', local_path: '/DATA/Music' }
const answer = data => () => Promise.resolve({ data: { data } })

async function open(sync, buefy = {}) {
	const $buefy = { toast: { open: vi.fn() }, dialog: { confirm: vi.fn() }, modal: { open: vi.fn() }, ...buefy }
	const wrapper = mount(CloudSync, {
		attachTo: document.body,
		global: { plugins: [Buefy, i18n], mocks: { $api: { sync }, $buefy } },
	})
	await flushPromises()
	return { wrapper, $buefy }
}

describe('the folder sync window', () => {
	it('shows one card per task with its three sentences', async () => {
		const { wrapper } = await open({ getTasks: answer([base, second]) })
		expect(wrapper.findAll('section.settings-card')).toHaveLength(2)
		const text = wrapper.text()
		expect(text).toContain('Photos')
		expect(text).toContain('Dropbox /Photos → /DATA/Photos')
		// the mocked language file has no messages, so params stay unfilled
		expect(text).toContain('Every day at {time}')
		expect(text).toContain('never run')
		wrapper.unmount()
	})

	it('says so when there is no task', async () => {
		const { wrapper } = await open({ getTasks: answer([]) })
		expect(wrapper.text()).toContain('No sync task yet')
		wrapper.unmount()
	})

	it('does not call a failed load an empty list', async () => {
		const { wrapper } = await open({ getTasks: () => Promise.reject(new Error('boom')) })
		expect(wrapper.text()).toContain('Sync tasks could not be loaded')
		expect(wrapper.text()).not.toContain('No sync task yet')
		wrapper.unmount()
	})

	it('saves the whole list when a task is switched off', async () => {
		const saveTasks = vi.fn(answer([]))
		const { wrapper } = await open({ getTasks: answer([base, second]), saveTasks })
		await wrapper.findAll('section.settings-card')[1].find('input[type=checkbox]').setValue(false)
		await flushPromises()
		expect(saveTasks).toHaveBeenCalledWith([base, { ...second, enabled: false }])
		wrapper.unmount()
	})

	it('offers the first pass again only on a task that lost its state', async () => {
		const { wrapper } = await open({ getTasks: answer([{ ...base, needs_first_pass: true }, second]) })
		const cards = wrapper.findAll('section.settings-card')
		expect(cards[0].text()).toContain('Run the first pass again')
		expect(cards[1].text()).not.toContain('Run the first pass again')
		wrapper.unmount()
	})

	it('asks before confirming deletions, and calls confirmDeletes on yes', async () => {
		const confirmDeletes = vi.fn(answer(null))
		const confirm = vi.fn()
		const { wrapper } = await open({ getTasks: answer([{ ...base, needs_delete_confirm: true }]), confirmDeletes }, { dialog: { confirm } })
		const button = wrapper.findAll('button').find(b => b.text() === 'Confirm the deletions')
		await button.trigger('click')
		expect(confirmDeletes).not.toHaveBeenCalled()
		expect(confirm).toHaveBeenCalledOnce()
		await confirm.mock.calls[0][0].onConfirm()
		expect(confirmDeletes).toHaveBeenCalledWith('a')
		wrapper.unmount()
	})

	it('shows what the box answered when run now is refused', async () => {
		const run = vi.fn(() => Promise.reject(Object.assign(new Error('409'), { response: { status: 409, data: { message: 'already running' } } })))
		const { wrapper, $buefy } = await open({ getTasks: answer([base]), run })
		await wrapper.findAll('button').find(b => b.text() === 'Run now').trigger('click')
		await flushPromises()
		expect(run).toHaveBeenCalledWith('a')
		expect($buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'already running', type: 'is-danger' }))
		wrapper.unmount()
	})

	it('says a pass resumed after an interruption', async () => {
		const { wrapper } = await open({ getTasks: answer([{ ...base, last_result: 'recovered', last_run: '2026-11-15T02:00:00Z' }]) })
		expect(wrapper.text()).toContain('Resumed after an interruption: files deleted since may have come back')
		wrapper.unmount()
	})

	it('does not offer a new task while the list is not loaded or failed to load', async () => {
		const newTask = wrapper => wrapper.findAll('button').find(b => b.text() === 'New task')
		const pending = await open({ getTasks: () => new Promise(() => {}) })
		expect(newTask(pending.wrapper).element.disabled).toBe(true)
		pending.wrapper.unmount()

		const failed = await open({ getTasks: () => Promise.reject(new Error('boom')) })
		expect(newTask(failed.wrapper).element.disabled).toBe(true)
		await newTask(failed.wrapper).trigger('click')
		expect(failed.$buefy.modal.open).not.toHaveBeenCalled()
		failed.wrapper.unmount()

		const loaded = await open({ getTasks: answer([base]) })
		expect(newTask(loaded.wrapper).element.disabled).toBe(false)
		expect(loaded.wrapper.findAll('button').find(b => b.text() === 'Edit').element.disabled).toBe(false)
		loaded.wrapper.unmount()
	})

	it('puts the switch back when the box refuses the change', async () => {
		const saveTasks = vi.fn(() => Promise.reject(new Error('refused')))
		const { wrapper, $buefy } = await open({ getTasks: answer([base]), saveTasks })
		const box = wrapper.find('input[type=checkbox]')
		await box.setValue(false)
		await flushPromises()
		expect($buefy.toast.open).toHaveBeenCalled()
		expect(wrapper.vm.tasks[0].enabled).toBe(true)
		expect(wrapper.find('input[type=checkbox]').element.checked).toBe(true)
		wrapper.unmount()
	})

	it('takes one save at a time', async () => {
		let release
		const saveTasks = vi.fn(() => new Promise(resolve => release = resolve))
		const getTasks = vi.fn(answer([base, second]))
		const { wrapper } = await open({ getTasks, saveTasks })
		vi.useFakeTimers()
		const cards = () => wrapper.findAll('section.settings-card')
		await cards()[0].find('input[type=checkbox]').setValue(false)
		expect(cards()[1].find('input[type=checkbox]').element.disabled).toBe(true)
		expect(cards()[1].findAll('button').find(b => b.text() === 'Delete').element.disabled).toBe(true)
		// a poll during the save does not replace the list
		getTasks.mockClear()
		await wrapper.vm.load(true)
		expect(getTasks).not.toHaveBeenCalled()
		release({ data: { data: [] } })
		await flushPromises()
		vi.useRealTimers()
		expect(cards()[1].find('input[type=checkbox]').element.disabled).toBe(false)
		expect(cards()[1].findAll('button').find(b => b.text() === 'Delete').element.disabled).toBe(false)
		wrapper.unmount()
	})

	it('labels the switch and offers run now only to a task that does not wait for an answer', async () => {
		const { wrapper } = await open({ getTasks: answer([base, { ...second, needs_first_pass: true }, { ...base, id: 'c', needs_delete_confirm: true }]) })
		const cards = wrapper.findAll('section.settings-card')
		expect(cards[0].text()).toContain('Enabled')
		expect(cards[0].text()).toContain('Run now')
		expect(cards[1].text()).not.toContain('Run now')
		expect(cards[2].text()).not.toContain('Run now')
		wrapper.unmount()
	})

	it('says deleted files come back before running the first pass again', async () => {
		const confirm = vi.fn()
		const { wrapper } = await open({ getTasks: answer([{ ...base, needs_first_pass: true }]) }, { dialog: { confirm } })
		await wrapper.findAll('button').find(b => b.text() === 'Run the first pass again').trigger('click')
		expect(confirm.mock.calls[0][0].message).toContain('Files deleted on one side since the last pass will come back.')
		wrapper.unmount()
	})

	it('deletes a task by saving the list without it, after a confirmation', async () => {
		const saveTasks = vi.fn(answer([]))
		const confirm = vi.fn()
		const { wrapper } = await open({ getTasks: answer([base, second]), saveTasks }, { dialog: { confirm } })
		await wrapper.findAll('section.settings-card')[0].findAll('button').find(b => b.text() === 'Delete').trigger('click')
		expect(saveTasks).not.toHaveBeenCalled()
		await confirm.mock.calls[0][0].onConfirm()
		expect(saveTasks).toHaveBeenCalledWith([second])
		wrapper.unmount()
	})
})

describe('the settings entry', () => {
	it('hides the settings entry when the box answers 404', () => {
		expect(syncAvailable({ response: { status: 404 } })).toBe(false)
		expect(syncAvailable({ response: { status: 502 } })).toBe(true)
		expect(syncAvailable(new Error('network'))).toBe(true)
		// an older back end's request validator answers an unknown route with a 400
		expect(syncAvailable({ response: { status: 400, data: { message: 'no matching operation was found' } } })).toBe(false)
		expect(syncAvailable({ response: { status: 400, data: { message: 'tasks is required' } } })).toBe(true)
	})
})
