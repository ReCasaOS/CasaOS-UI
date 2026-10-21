// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aVm } from './__fixtures__/vm'
import { isOpen, openPage, pressEscape } from './__fixtures__/page'
import vmApi from './api'
import { openWithEscape } from './modalStack'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({
	default: Object.fromEntries(['host', 'list', 'get', 'images', 'action', 'remove', 'downloads', 'storageFolder', 'consoleURL', 'uploadImage'].map(name => [name, vi.fn()])),
}))
// the console of a running VM connects as soon as it opens
vi.mock('@novnc/novnc', () => ({ default: class { addEventListener() {} disconnect() {} focus() {} } }))

// Buefy has no stack of modals: every one that is open and lets Escape cancel it
// hears the key, so one press closed the picker, the form under it and the page
// under that. Escape belongs to the one on top, whichever it is: the page, the
// forms and the settings take it only while nothing is open above them.
describe('escape in the modals of the virtual machine page', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})

	const click = (selector, text) => {
		const found = [...document.querySelectorAll(selector)].filter(el => !text || el.textContent.trim() === text)
		expect(found, `${selector} ${text || ''}`).not.toHaveLength(0)
		found[0].click()
		return flushPromises()
	}
	const press = async () => {
		pressEscape()
		await flushPromises()
	}
	const stillOpen = (...selectors) => selectors.map(selector => [selector, isOpen(selector)])

	it('closes the picker over the create form, and only the picker', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await click('.vm-create button', 'Browse…')
		expect(stillOpen('.vm-path-picker', '.vm-create', '.vm-page')).toEqual([['.vm-path-picker', true], ['.vm-create', true], ['.vm-page', true]])

		await press()
		expect(stillOpen('.vm-path-picker', '.vm-create', '.vm-page')).toEqual([['.vm-path-picker', false], ['.vm-create', true], ['.vm-page', true]])
	})

	it('closes the download dialog over the create form, and only that', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await click('.vm-create button[title="Download from a URL"]')
		expect(isOpen('.vm-download')).toBe(true)

		await press()
		expect(stillOpen('.vm-download', '.vm-create', '.vm-page')).toEqual([['.vm-download', false], ['.vm-create', true], ['.vm-page', true]])
	})

	it('closes the picker over the settings, and only the picker', async () => {
		await openPage()
		await click('[title="Virtual machine settings"]')
		await click('.vm-storage-settings button', 'Browse…')
		expect(isOpen('.vm-path-picker')).toBe(true)

		await press()
		expect(stillOpen('.vm-path-picker', '.vm-storage-settings', '.vm-page')).toEqual([['.vm-path-picker', false], ['.vm-storage-settings', true], ['.vm-page', true]])
	})

	it('closes the picker and the download dialog of the CD-ROM, and not the page', async () => {
		await openPage()
		await click('.vm-detail .tabs a', 'Storage & CD')
		await click('.vm-detail button', 'Browse…')
		expect(isOpen('.vm-path-picker')).toBe(true)
		await press()
		expect(stillOpen('.vm-path-picker', '.vm-page')).toEqual([['.vm-path-picker', false], ['.vm-page', true]])

		await click('.vm-detail button[title="Download from a URL"]')
		expect(isOpen('.vm-download')).toBe(true)
		await press()
		expect(stillOpen('.vm-download', '.vm-page')).toEqual([['.vm-download', false], ['.vm-page', true]])
	})

	it('closes the delete dialog, and not the page', async () => {
		await openPage({ vms: [aVm({ state: 'shut-off' })] })
		await click('.vm-detail [title="Delete"]')
		expect(isOpen('.vm-delete')).toBe(true)

		await press()
		expect(stillOpen('.vm-delete', '.vm-page')).toEqual([['.vm-delete', false], ['.vm-page', true]])
	})

	it('closes a confirmation, and not the page', async () => {
		await openPage()
		await click('.power-bar button', 'Force off')
		expect(isOpen('.dialog')).toBe(true)

		await press()
		expect(stillOpen('.dialog', '.vm-page')).toEqual([['.dialog', false], ['.vm-page', true]])
		expect(vmApi.action).not.toHaveBeenCalled()
	})

	it('closes the page when it is alone', async () => {
		await openPage()
		await press()
		expect(isOpen('.vm-page')).toBe(false)
	})

	it('closes the create form, and not the page under it', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await press()
		expect(stillOpen('.vm-create', '.vm-page')).toEqual([['.vm-create', false], ['.vm-page', true]])
	})

	it('asks before closing the create form while an image uploads, and closes it on yes', async () => {
		vmApi.uploadImage.mockReturnValue(new Promise(() => {}))
		await openPage()
		await click('[title="New virtual machine"]')
		const input = document.querySelector('.vm-create input[type="file"]')
		Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.iso')], configurable: true })
		input.dispatchEvent(new Event('change'))
		await flushPromises()
		await click('.vm-create button', 'Upload')
		expect(vmApi.uploadImage).toHaveBeenCalledTimes(1)
		const { signal } = vmApi.uploadImage.mock.calls[0][1]

		await press()
		expect(stillOpen('.dialog', '.vm-create', '.vm-page')).toEqual([['.dialog', true], ['.vm-create', true], ['.vm-page', true]])
		expect(document.querySelector('.dialog .media-content').textContent.trim()).toBe('An image is still uploading. Close and stop the upload?')
		// Escape is the dialog's: it goes, the form stays and the upload runs on
		await press()
		expect(stillOpen('.dialog', '.vm-create')).toEqual([['.dialog', false], ['.vm-create', true]])
		expect(signal.aborted).toBe(false)

		await press()
		await click('.dialog button', 'Stop the upload')
		expect(signal.aborted).toBe(true)
		expect(stillOpen('.vm-create', '.vm-page')).toEqual([['.vm-create', false], ['.vm-page', true]])
	})

	it('closes the settings, and not the page under them', async () => {
		await openPage()
		await click('[title="Virtual machine settings"]')
		await press()
		expect(stillOpen('.vm-storage-settings', '.vm-page')).toEqual([['.vm-storage-settings', false], ['.vm-page', true]])
	})

	it('closes one dialog per press, from the picker down to the page', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await click('.vm-create button', 'Browse…')
		const open = () => stillOpen('.vm-path-picker', '.vm-create', '.vm-page').map(([, shown]) => shown)

		expect(open()).toEqual([true, true, true])
		await press()
		expect(open()).toEqual([false, true, true])
		await press()
		expect(open()).toEqual([false, false, true])
		await press()
		expect(open()).toEqual([false, false, false])
	})

	it('leaves the page alone while the console, which keeps Escape for the VM, is open over it', async () => {
		await openPage()
		await click('.vm-detail button', 'Console')
		expect(isOpen('.vm-console')).toBe(true)

		await press()
		expect(stillOpen('.vm-console', '.vm-page')).toEqual([['.vm-console', true], ['.vm-page', true]])
	})

	it('still closes the forms from their own buttons, and the page from its own', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await click('.vm-create button', 'Cancel')
		expect(stillOpen('.vm-create', '.vm-page')).toEqual([['.vm-create', false], ['.vm-page', true]])

		await click('.vm-page header button[aria-label="Close"]')
		expect(isOpen('.vm-page')).toBe(false)
	})

	it('has a close button the keyboard can reach, and a name for it', async () => {
		await openPage()
		const close = document.querySelector('.vm-page header button[aria-label="Close"]')
		expect(close).not.toBeNull()
		expect(close.tabIndex).toBe(0)
	})

	it('lets go of the key once the modal is closed', () => {
		const add = vi.spyOn(document, 'addEventListener')
		const remove = vi.spyOn(document, 'removeEventListener')
		const modal = openWithEscape({ modal: { open: given => ({ close: () => given.onClose() }) } }, {})

		const [, onKey] = add.mock.calls.find(([type]) => type === 'keyup')
		expect(remove).not.toHaveBeenCalledWith('keyup', onKey)
		modal.close()
		expect(remove).toHaveBeenCalledWith('keyup', onKey)
		add.mockRestore()
		remove.mockRestore()
	})
})
