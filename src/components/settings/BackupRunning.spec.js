// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BackupRunning from './BackupRunning.vue'
import i18n from '@/plugins/i18n'

// the real English messages: a missing key is not interpolated, and the figures are
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

// what the owner's box said of seerr on 2026-11-09
const seerr = {
	id: 'b7',
	app: 'happy_rik',
	destination: 'GDrive',
	stamp: '2026-11-08T16-55-18Z',
	origin: 'scheduled',
	started_at: '2026-11-08T17:55:18+01:00',
	operation: 1,
	operations: 2,
	source: '/DATA/AppData/overseerr/config',
	stats: {
		bytes: 1182844747,
		total_bytes: 1926565931,
		files: 9812,
		total_files: 25488,
		speed: 219371,
		eta: 3390,
		current: 'cache/images/tmdb/a.jpg',
		updated_at: '2026-11-09T06:40:12+01:00',
	},
}

const pass = {
	origin: 'scheduled',
	started_at: '2026-11-08T17:55:18+01:00',
	items: [
		{ app: 'big-bear-dozzle', destination: 'GDrive', state: 'done', started_at: '2026-11-08T13:53:14+01:00', finished_at: '2026-11-08T13:53:42+01:00', bytes: 1820 },
		{ app: 'jarvis', destination: 'GDrive', state: 'stopped', error: 'stopped from the interface' },
		{ app: 'happy_rik', destination: 'GDrive', state: 'running' },
		{ app: 'homarr', destination: 'GDrive', state: 'waiting' },
		{ app: 'casaos-system', destination: 'GDrive', state: 'held' },
	],
}

function show(running, backup = {}, sync = { getTasks: () => Promise.resolve({ data: { data: [] } }) }) {
	const confirm = vi.fn(options => options.onConfirm())
	const stopRunning = vi.fn(() => Promise.resolve({ data: {} }))
	const wrapper = mount(BackupRunning, {
		props: { running },
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$api: { backup: { stopRunning, ...backup }, sync },
				$openAPI: { appGrid: { getAppGrid: () => Promise.resolve({ data: { data: [{ name: 'happy_rik', title: { en_us: 'seerr' }, app_type: 'v2app' }] } }) } },
				$buefy: { toast: { open() {} }, dialog: { confirm } },
			},
		},
	})

	return { wrapper, confirm, stopRunning }
}

describe('the running tab', () => {
	it('says what is copied, how fast, how much out of how much, and the percent', async () => {
		const { wrapper } = show({ backups: [seerr], passes: [] })
		await flushPromises()

		const text = wrapper.text()
		expect(text).toContain('seerr')
		expect(text).toContain('GDrive')
		expect(text).toContain('61 %')
		expect(text).toContain('1.1 GB of 1.79 GB')
		expect(text).toContain('9812 files of 25488')
		expect(text).toContain('folder 1 of 2')
		expect(text).toContain('/DATA/AppData/overseerr/config')
		expect(text).toContain('cache/images/tmdb/a.jpg')
		wrapper.unmount()
	})

	it('shows no percent while the total is still being taken stock of', async () => {
		const { total_bytes: _, total_files: __, eta: ___, ...counting } = seerr.stats
		const { wrapper } = show({ backups: [{ ...seerr, stats: counting }], passes: [] })
		await flushPromises()

		expect(wrapper.text()).toContain('Taking stock')
		expect(wrapper.text()).not.toContain('%')
		wrapper.unmount()
	})

	it('stops a backup once asked to, and asks to be read again', async () => {
		const { wrapper, confirm, stopRunning } = show({ backups: [seerr], passes: [] })
		await flushPromises()

		await wrapper.find('.live-stop').trigger('click')
		await flushPromises()

		expect(confirm).toHaveBeenCalled()
		expect(stopRunning).toHaveBeenCalledWith('b7')
		expect(wrapper.emitted('refresh')).toBeTruthy()
		wrapper.unmount()
	})

	it('lists what waits in the pass and what it has done', async () => {
		const { wrapper } = show({ backups: [seerr], passes: [pass] })
		await flushPromises()

		const next = wrapper.find('.pass-next').text()
		expect(next).toContain('Next in this pass')
		expect(next).toContain('homarr')
		expect(next).toContain('Waiting')
		expect(next).toContain('This box')
		expect(next).toContain('held by a system upgrade')
		expect(next).not.toContain('seerr')

		const done = wrapper.find('.pass-done').text()
		expect(done).toContain('Done in this pass')
		expect(done).toContain('big-bear-dozzle')
		expect(done).toContain('28 s')
		expect(done).toContain('1.78 KB')
		expect(done).toContain('jarvis')
		expect(done).toContain('stopped')
		wrapper.unmount()
	})

	it('says when nothing runs any more', async () => {
		const { wrapper } = show({ backups: [], passes: [{ ...pass, finished_at: '2026-11-09T07:00:00+01:00' }] })
		await flushPromises()

		expect(wrapper.text()).toContain('Nothing is running any more.')
		expect(wrapper.find('.pass-next').exists()).toBe(false)
		wrapper.unmount()
	})

	const syncing = { ...seerr, id: 's1', kind: 'sync', app: 'Photos', destination: 'Dropbox' }
	const tasks = direction => ({ getTasks: () => Promise.resolve({ data: { data: [{ name: 'Photos', direction }] } }) })
	const warning = 'Files deleted since the last pass may come back when it resumes.'

	it('names a running sync by its task, not by an app', async () => {
		const { wrapper } = show({ backups: [syncing], passes: [] })
		await flushPromises()

		expect(wrapper.find('.live-backup b').text()).toBe('Sync: Photos → Dropbox')
		wrapper.unmount()
	})

	it('does not count folders for a sync, which the box sends as 0 of 0', async () => {
		const { wrapper } = show({ backups: [{ ...syncing, operation: 0, operations: 0 }], passes: [] })
		await flushPromises()

		expect(wrapper.text()).not.toContain('folder 0 of 0')
		expect(wrapper.text()).toContain(syncing.source)
		wrapper.unmount()
	})

	it('warns before stopping a sync', async () => {
		const both = show({ backups: [syncing], passes: [] }, {}, tasks('both'))
		await flushPromises()
		await both.wrapper.find('.live-stop').trigger('click')
		expect(both.confirm.mock.calls[0][0].message).toContain(warning)
		both.wrapper.unmount()

		const one = show({ backups: [syncing], passes: [] }, {}, tasks('upload'))
		await flushPromises()
		await one.wrapper.find('.live-stop').trigger('click')
		expect(one.confirm.mock.calls[0][0].message).not.toContain(warning)
		one.wrapper.unmount()

		// the tasks could not be read: the warning is said for any sync
		const unknown = show({ backups: [syncing], passes: [] }, {}, { getTasks: () => Promise.reject(new Error('down')) })
		await flushPromises()
		await unknown.wrapper.find('.live-stop').trigger('click')
		expect(unknown.confirm.mock.calls[0][0].message).toContain(warning)
		unknown.wrapper.unmount()
	})

	it('still shows a backup as before when kind is missing', async () => {
		const { wrapper, confirm } = show({ backups: [seerr], passes: [] })
		await flushPromises()

		expect(wrapper.find('.live-backup b').text()).toBe('seerr → GDrive')
		await wrapper.find('.live-stop').trigger('click')
		expect(confirm.mock.calls[0][0].message).not.toContain(warning)
		wrapper.unmount()
	})
})
