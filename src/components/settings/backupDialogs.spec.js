// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BackupDestinations from './BackupDestinations.vue'
import BackupSchedules from './BackupSchedules.vue'
import RestoreFilesModal from './RestoreFilesModal.vue'
import RestoreFromDestinationModal from './RestoreFromDestinationModal.vue'
import i18n from '@/plugins/i18n'
import BackupAppModal from '@/components/Apps/BackupAppModal.vue'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const fail = () => Promise.reject(Object.assign(new Error('boom'), { response: { data: { message: 'permission denied' } } }))
const pending = () => new Promise(() => {})
const answer = data => () => Promise.resolve({ data: { data } })

async function open(component, backup, props = {}) {
	const wrapper = mount(component, {
		props,
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				// the schedules read the run log too: empty unless a test says otherwise
				$api: { backup: { getRuns: answer([]), ...backup } },
				$openAPI: { appGrid: { getAppGrid: answer([]) } },
				$buefy: { toast: { open() {} }, dialog: { confirm() {} }, modal: { open() {} } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('a list that did not load', () => {
	// the error said the list could not be read, and the empty state below it said
	// there was nothing: two answers, one of them wrong
	it('is not also called empty, in the destinations', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: fail })
		expect(wrapper.text()).toContain('Destinations could not be loaded')
		expect(wrapper.text()).not.toContain('No destination yet')
		wrapper.unmount()
	})

	it('is not also called empty, in the schedules', async () => {
		const wrapper = await open(BackupSchedules, { getSchedules: fail, getDestinations: answer([]) })
		expect(wrapper.text()).toContain('Schedules could not be loaded')
		expect(wrapper.text()).not.toContain('Nothing is scheduled')
		wrapper.unmount()
	})

	it('offers neither a form nor a backup, in the app backup dialog', async () => {
		const wrapper = await open(BackupAppModal, { getDestinations: fail }, { appId: 'nextcloud', appName: 'Nextcloud' })
		expect(wrapper.text()).toContain('Destinations could not be loaded')
		expect(wrapper.text()).not.toContain('No destination is configured')
		expect(wrapper.find('select').exists()).toBe(false)
		const buttons = wrapper.findAll('.modal-card-foot .button')
		expect(buttons.map(button => button.text())).toEqual(['Close'])
		wrapper.unmount()
	})
})

describe('the restore dialog', () => {
	it('shows that it is loading', async () => {
		// `:active` is ignored by Buefy 3: the dialog sat blank until the list came
		const wrapper = await open(RestoreFromDestinationModal, { getDestinationRuns: pending }, { destination: 'nas' })
		expect(wrapper.find('.loading-overlay').exists()).toBe(true)
		wrapper.unmount()
	})

	it('names the button that deletes a backup', async () => {
		const held = [{ app: 'nextcloud', installed: true, stamps: ['2026-09-24T03-00-12Z'] }]
		const wrapper = await open(RestoreFromDestinationModal, { getDestinationRuns: answer(held) }, { destination: 'nas' })
		expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(true)
		wrapper.unmount()
	})
})

describe('the destination form', () => {
	it('is never filled with the dashboard password', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]) })
		wrapper.vm.draft.encrypt = true
		await flushPromises()
		// every password field: the encryption password and s3's secret_access_key
		const passwords = wrapper.findAll('input[type=password]')
		expect(passwords.length).toBeGreaterThanOrEqual(2)
		for (const input of passwords)
			expect(input.attributes('autocomplete')).toBe('new-password')
		wrapper.unmount()
	})
})

describe('the root of a destination', () => {
	const save = async (backend, root) => {
		const saveDestination = vi.fn(() => Promise.resolve({}))
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer([]),
			saveDestination,
			checkDestination: answer({}),
		})
		wrapper.vm.draft.name = 'offsite'
		wrapper.vm.draft.backend = backend
		wrapper.vm.draft.root = root
		await wrapper.vm.save()
		wrapper.unmount()
		return saveDestination.mock.calls[0]
	}

	it('is asked for as the bucket of an s3 destination, and sent', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]) })
		expect(wrapper.text()).toContain('Bucket')
		wrapper.unmount()

		const [name, backend, , , , root] = await save('s3', ' my-bucket ')
		expect([name, backend, root]).toEqual(['offsite', 's3', ' my-bucket '])
	})

	it('is a folder, optional, on any other backend', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]) })
		wrapper.vm.draft.backend = 'sftp'
		await flushPromises()
		expect(wrapper.text()).toContain('Folder (optional)')
		expect(wrapper.text()).not.toContain('The bucket you made')
		wrapper.unmount()
	})
})

describe('the check of a restic repository', () => {
	const state = states => name => Promise.resolve({ data: { data: states[name] } })

	it('says how the last one went, and in red when it found a fault', async () => {
		// the sentence is a key with holes in it, and a key that no language file has is not filled
		i18n.global.mergeLocaleMessage(i18n.global.locale.value || i18n.global.locale, {
			'Repository check failed {when}: {error}': 'Repository check failed {when}: {error}',
		})
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas', 'offsite']),
			getResticState: state({
				nas: { available: true, enabled: true, last_check: { at: '2026-11-01T04:00:00Z', ok: true } },
				offsite: { available: true, enabled: true, last_check: { at: '2026-11-01T04:00:00Z', ok: false, error: 'pack 1a2b: does not exist' } },
			}),
		})
		const rows = wrapper.findAll('.destination')
		expect(rows[0].text()).toContain('sound.')
		expect(rows[0].find('.has-text-danger').exists()).toBe(false)
		expect(rows[1].text()).toContain('pack 1a2b: does not exist')
		expect(rows[1].find('.has-text-danger').exists()).toBe(true)
		wrapper.unmount()
	})

	it('is offered only where the destination is kept with restic', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas', 'old']),
			getResticState: state({ nas: { available: true, enabled: true }, old: { available: true, enabled: false } }),
		})
		const rows = wrapper.findAll('.destination')
		expect(rows[0].text()).toContain('Check repository')
		expect(rows[1].text()).not.toContain('Check repository')
		wrapper.unmount()
	})

	it('waits for a new result after it starts one', async () => {
		vi.useFakeTimers()
		try {
			const answers = [
				{ available: true, enabled: true, last_check: { at: '2026-10-25T04:00:00Z', ok: true } },
				{ available: true, enabled: true, last_check: { at: '2026-10-25T04:00:00Z', ok: true } },
				{ available: true, enabled: true, last_check: { at: '2026-11-01T04:00:00Z', ok: false, error: 'boom' } },
			]
			let asked = 0
			const checkRestic = vi.fn(() => Promise.resolve({}))
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas']),
				getResticState: () => Promise.resolve({ data: { data: answers[Math.min(asked++, answers.length - 1)] } }),
				checkRestic,
			})

			const done = wrapper.vm.checkRestic('nas')
			await vi.advanceTimersByTimeAsync(3000)
			expect(wrapper.vm.busy).toBe('resticcheck:nas')
			await vi.advanceTimersByTimeAsync(3000)
			await done

			expect(checkRestic).toHaveBeenCalledWith('nas')
			expect(wrapper.vm.restic.nas.last_check.ok).toBe(false)
			expect(wrapper.vm.busy).toBe('')
			wrapper.unmount()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('a destination kept with restic', () => {
	const state = states => name => Promise.resolve({ data: { data: states[name] } })
	const buttons = wrapper => wrapper.findAll('.destination .button').map(button => button.text())

	it('offers the switch only where this box has restic and the destination is not switched', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas', 'offsite', 'old']),
			getResticState: state({ nas: { available: true, enabled: false }, offsite: { available: true, enabled: true }, old: { available: false, enabled: false } }),
		})
		const rows = wrapper.findAll('.destination')
		expect(rows[0].text()).toContain('Keep with restic')
		expect(rows[1].text()).not.toContain('Keep with restic')
		expect(rows[1].text()).toContain('Kept with restic')
		expect(rows[2].text()).not.toContain('restic')
		wrapper.unmount()
	})

	it('is no button and no error where the box does not know the call', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer(['nas']) })
		expect(buttons(wrapper).join(' ')).not.toContain('restic')
		expect(wrapper.text()).not.toContain('Destinations could not be loaded')
		wrapper.unmount()
	})

	it('shows the password it is given back once, and not one the person typed', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas']),
			getResticState: state({ nas: { available: true, enabled: false } }),
			enableRestic: vi.fn(() => Promise.resolve({ data: { data: { password: 'Zm9vYmFy-_' } } })),
		})
		// the password dialog is a confirm: Download or Close
		const alert = vi.fn()
		wrapper.vm.$buefy.dialog.confirm = alert
		const toast = vi.fn()
		wrapper.vm.$buefy.toast.open = toast

		await wrapper.vm.enableRestic('nas', '')
		expect(alert).toHaveBeenCalledOnce()
		expect(alert.mock.calls[0][0].message).toContain('<code>Zm9vYmFy-_</code>')

		alert.mockClear()
		await wrapper.vm.enableRestic('nas', 'from-the-old-box')
		expect(alert).not.toHaveBeenCalled()
		expect(toast).toHaveBeenCalled()
		wrapper.unmount()
	})

	it('puts nothing a destination can be called into the markup of the password dialog', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer([]),
			enableRestic: () => Promise.resolve({ data: { data: { password: 'abc' } } }),
			getResticState: state({}),
		})
		// the password dialog is a confirm: Download or Close
		const alert = vi.fn()
		wrapper.vm.$buefy.dialog.confirm = alert

		await wrapper.vm.enableRestic('<img src=x onerror=alert(1)>', '')
		expect(alert.mock.calls[0][0].message).not.toContain('<img')
		wrapper.unmount()
	})

	describe('on the way back to rclone', () => {
		it('offers the way back where it is enabled, and says what it does before doing it', async () => {
			const disableRestic = vi.fn(() => Promise.resolve({}))
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas']),
				getResticState: state({ nas: { available: true, enabled: true, kept: true } }),
				disableRestic,
			})
			expect(buttons(wrapper)).toContain('Switch back to rclone…')

			const confirm = vi.fn()
			wrapper.vm.$buefy.dialog.confirm = confirm
			wrapper.vm.confirmSwitchBack('nas')
			expect(confirm).toHaveBeenCalledOnce()
			// nothing is deleted, and it is said so before anything is done
			expect(confirm.mock.calls[0][0].message).toContain('Nothing is deleted')
			expect(disableRestic).not.toHaveBeenCalled()

			confirm.mock.calls[0][0].onConfirm()
			await flushPromises()
			expect(disableRestic).toHaveBeenCalledWith('nas')
			wrapper.unmount()
		})

		it('keeps the repository in view after it: checked, resumed, and not offered as new', async () => {
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas']),
				getResticState: state({ nas: { available: true, enabled: false, kept: true } }),
			})
			const row = wrapper.find('.destination')
			expect(row.text()).toContain('the restic repository is still read')
			expect(row.text()).not.toContain('Kept with restic')
			expect(buttons(wrapper)).toEqual(expect.arrayContaining(['Resume restic', 'Check repository']))
			expect(buttons(wrapper).join(' ')).not.toContain('Keep with restic')
			expect(buttons(wrapper).join(' ')).not.toContain('Switch back')
			wrapper.unmount()
		})

		it('resumes without a password, so the repository is taken up and not remade', async () => {
			const enableRestic = vi.fn(() => Promise.resolve({ data: { data: { password: '' } } }))
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas']),
				getResticState: state({ nas: { available: true, enabled: false, kept: true } }),
				enableRestic,
			})
			const alert = vi.fn()
			wrapper.vm.$buefy.dialog.alert = alert

			await wrapper.findAll('.destination .button').find(button => button.text() === 'Resume restic').trigger('click')
			await flushPromises()
			expect(enableRestic).toHaveBeenCalledWith('nas', '')
			// the password is not new: there is nothing to write down
			expect(alert).not.toHaveBeenCalled()
			wrapper.unmount()
		})

		it('treats a box that does not say `kept` as kept where it is enabled', async () => {
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas', 'new']),
				getResticState: state({ nas: { available: true, enabled: true }, new: { available: true, enabled: false } }),
			})
			const rows = wrapper.findAll('.destination')
			expect(rows[0].text()).toContain('Check repository')
			expect(rows[1].text()).toContain('Keep with restic')
			expect(rows[1].text()).not.toContain('Resume restic')
			wrapper.unmount()
		})

		it('shows why it could not, and stops loading', async () => {
			const wrapper = await open(BackupDestinations, {
				getDestinations: answer(['nas']),
				getResticState: state({ nas: { available: true, enabled: true, kept: true } }),
				disableRestic: fail,
			})
			await wrapper.vm.disableRestic('nas')
			expect(wrapper.text()).toContain('permission denied')
			expect(wrapper.vm.busy).toBe('')
			wrapper.unmount()
		})
	})
})

describe('choosing files of a backup', () => {
	const stamp = '2026-09-13T02-29-56Z'
	const props = { destination: 'nas', app: 'blog', stamp }
	const file = (name, directory = false, size = 0) => ({ name, directory, size })
	const tree = {
		'': [file('volumes', true), file('binds', true)],
		'volumes': [file('data', true)],
		'volumes/data': [file('docs', true), file('a.txt', false, 2048)],
	}
	const browse = vi.fn((_n, _a, _s, path = '') => Promise.resolve({ data: { data: tree[path] || [] } }))

	it('lists the top of the backup, folders opening on a click and files with their size', async () => {
		browse.mockClear()
		const wrapper = await open(RestoreFilesModal, { browse }, props)
		expect(browse).toHaveBeenCalledWith('nas', 'blog', stamp, '')
		expect(wrapper.text()).toContain('volumes/')
		expect(wrapper.text()).toContain('binds/')

		await wrapper.vm.open(tree[''][0])
		await wrapper.vm.open(tree.volumes[0])
		await flushPromises()
		expect(browse).toHaveBeenLastCalledWith('nas', 'blog', stamp, 'volumes/data')
		expect(wrapper.text()).toContain('a.txt')
		expect(wrapper.text()).toContain('2 KB')

		await wrapper.vm.goTo(-1)
		await flushPromises()
		expect(browse).toHaveBeenLastCalledWith('nas', 'blog', stamp, '')
		wrapper.unmount()
	})

	it('keeps what was ticked from folder to folder, and puts back those paths and no others', async () => {
		browse.mockClear()
		const restore = vi.fn(() => Promise.resolve({}))
		const wrapper = await open(RestoreFilesModal, { browse, restore }, props)
		const confirm = vi.fn()
		wrapper.vm.$buefy.dialog.confirm = confirm

		wrapper.vm.toggle(file('binds', true))
		await wrapper.vm.open(file('volumes', true))
		await wrapper.vm.open(file('data', true))
		wrapper.vm.toggle(file('a.txt'))
		await flushPromises()
		expect(wrapper.vm.chosen).toEqual(['binds', 'volumes/data/a.txt'])

		// asked before it is done, and said what it does
		wrapper.vm.confirmRestore()
		expect(confirm.mock.calls[0][0].message).toContain('Nothing else is deleted')
		expect(restore).not.toHaveBeenCalled()

		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(restore).toHaveBeenCalledWith('nas', 'blog', stamp, ['binds', 'volumes/data/a.txt'])
		wrapper.unmount()
	})

	it('cannot put back nothing', async () => {
		const wrapper = await open(RestoreFilesModal, { browse }, props)
		const button = wrapper.findAll('.modal-card-foot .button').find(candidate => candidate.text().startsWith('Put back'))
		expect(button.attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})

	it('says why a backup could not be read, and lists nothing', async () => {
		// the sentence is a key with a hole in it, and a key that no language file has is not filled
		i18n.global.mergeLocaleMessage(i18n.global.locale.value || i18n.global.locale, {
			'The backup could not be read: {error}': 'The backup could not be read: {error}',
		})
		const wrapper = await open(RestoreFilesModal, { browse: fail }, props)
		expect(wrapper.text()).toContain('The backup could not be read')
		expect(wrapper.text()).toContain('permission denied')
		wrapper.unmount()
	})

	it('is offered, in the list of a destination, only for an app that is installed here', async () => {
		const wrapper = await open(RestoreFromDestinationModal, {
			getDestinationRuns: answer([
				{ app: 'blog', installed: true, stamps: [stamp] },
				{ app: 'wiki', installed: false, stamps: [stamp] },
				{ app: 'casaos-system', installed: true, stamps: [stamp] },
			]),
		}, { destination: 'nas' })
		const rows = wrapper.findAll('.held')
		expect(rows[0].text()).toContain('Choose files')
		expect(rows[1].text()).not.toContain('Choose files')
		expect(rows[2].text()).not.toContain('Choose files')

		const opened = vi.fn()
		wrapper.vm.$buefy.modal.open = opened
		wrapper.vm.chooseFiles({ app: 'blog' })
		expect(opened.mock.calls[0][0].props).toEqual({ destination: 'nas', app: 'blog', stamp })
		wrapper.unmount()
	})
})

describe('the schedules', () => {
	const nightly = { destination: 'nas', every: 'daily', at: '03:00', weekday: 1, keep: 7, hold_still: true, enabled: true }

	it('shows the apps that share their settings as one schedule, with this box, and saves one per app', async () => {
		const saveSchedules = vi.fn(() => Promise.resolve())
		const wrapper = await open(BackupSchedules, {
			getSchedules: answer([{ app: 'blog', ...nightly }, { app: 'casaos-system', ...nightly }]),
			getDestinations: answer(['nas']),
			saveSchedules,
		})

		expect(wrapper.findAll('.schedule')).toHaveLength(1)
		const checked = wrapper.findAll('.b-checkbox input').filter(box => box.element.checked)
		expect(checked).toHaveLength(2)
		expect(wrapper.text()).toContain('This box')

		await wrapper.vm.save()
		expect(saveSchedules).toHaveBeenCalledWith([{ app: 'blog', ...nightly }, { app: 'casaos-system', ...nightly }])
		wrapper.unmount()
	})

	it('saves nothing while a schedule covers no app', async () => {
		const saveSchedules = vi.fn(() => Promise.resolve())
		const wrapper = await open(BackupSchedules, { getSchedules: answer([]), getDestinations: answer(['nas']), saveSchedules })

		wrapper.vm.add()
		await wrapper.vm.save()
		await flushPromises()
		expect(saveSchedules).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('Each schedule needs at least one app, or this box.')
		wrapper.unmount()
	})
})

describe('the password of a restic repository', () => {
	const state = states => name => Promise.resolve({ data: { data: states[name] } })

	it('is offered wherever this box keeps the key, shown, and downloaded as a text file', async () => {
		const getResticPassword = vi.fn(() => Promise.resolve({ data: { data: { password: 's3cr<et' } } }))
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas', 'old', 'plain']),
			getResticState: state({ nas: { available: true, enabled: true, kept: true }, old: { available: true, enabled: false, kept: true }, plain: { available: true } }),
			getResticPassword,
		})
		const rows = wrapper.findAll('.destination')
		expect(rows.map(row => row.text().includes('Restic password'))).toEqual([true, true, false])

		const confirm = vi.fn()
		wrapper.vm.$buefy.dialog.confirm = confirm
		await wrapper.vm.readResticPassword('old')
		expect(getResticPassword).toHaveBeenCalledWith('old')
		const dialog = confirm.mock.calls[0][0]
		expect(dialog.message).toContain('<code>s3cr&#60;et</code>')

		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
			expect(this.download).toBe('restic-password-old.txt')
		})
		dialog.onConfirm()
		expect(click).toHaveBeenCalled()
		click.mockRestore()
		wrapper.unmount()
	})
})

describe('the running tab of the backups dialog', () => {
	const running = { backups: [{ id: 'b7', app: 'happy_rik', destination: 'GDrive', origin: 'scheduled', started_at: '2026-11-08T17:55:18+01:00', operation: 1, operations: 2, source: '/DATA/x' }], passes: [] }
	const getRunning = () => Promise.resolve({ data: running })
	const activeTab = wrapper => wrapper.find('.tabs li.is-active').text()

	it('opens on what runs when asked to', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]), getRunning }, { initialTab: 'running' })
		expect(activeTab(wrapper)).toBe('Running')
		expect(wrapper.text()).toContain('GDrive')
		wrapper.unmount()
	})

	it('has no running tab on a box that cannot say what runs', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]), getRunning: fail }, { initialTab: 'running' })
		expect(wrapper.findAll('.tabs li').map(tab => tab.text())).not.toContain('Running')
		expect(activeTab(wrapper)).toBe('Destinations')
		wrapper.unmount()
	})

	it('stops asking once closed', async () => {
		vi.useFakeTimers()
		try {
			const ask = vi.fn(getRunning)
			const wrapper = await open(BackupDestinations, { getDestinations: answer([]), getRunning: ask })
			const asked = ask.mock.calls.length
			await vi.advanceTimersByTimeAsync(3000)
			expect(ask.mock.calls.length).toBe(asked + 1)

			wrapper.unmount()
			await vi.advanceTimersByTimeAsync(9000)
			expect(ask.mock.calls.length).toBe(asked + 1)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('the running tab after a passing error', () => {
	// the box's own backup stops the gateway for a few seconds: one failed read must not freeze the tab
	it('keeps asking', async () => {
		vi.useFakeTimers()
		try {
			const running = { backups: [{ id: 'b7', app: 'happy_rik', destination: 'GDrive', origin: 'scheduled', started_at: '2026-11-08T17:55:18+01:00', operation: 1, operations: 2, source: '/DATA/x' }], passes: [] }
			const ask = vi.fn(() => Promise.resolve({ data: running }))
			const wrapper = await open(BackupDestinations, { getDestinations: answer([]), getRunning: ask })

			ask.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('Bad Gateway'), { response: { status: 502 } })))
			await vi.advanceTimersByTimeAsync(3000)
			const asked = ask.mock.calls.length
			await vi.advanceTimersByTimeAsync(3000)
			expect(ask.mock.calls.length).toBe(asked + 1)
			wrapper.unmount()
		} finally {
			vi.useRealTimers()
		}
	})
})
