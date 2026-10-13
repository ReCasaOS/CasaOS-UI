// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aVm } from './__fixtures__/vm'
import { isOpen, openPage, pressEscape } from './__fixtures__/page'
import vmApi from './api'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({
	default: Object.fromEntries(['host', 'list', 'get', 'images', 'action', 'remove', 'downloads', 'storageFolder'].map(name => [name, vi.fn()])),
}))

// Buefy has no stack of modals: every one that is open and lets Escape cancel it
// hears the key, so one press closed the picker, the form under it and the page
// under that. Escape belongs to the one on top: the modals that open others do
// not take it, the ones that open nothing do.
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

	it('leaves the page and the forms to their own buttons', async () => {
		await openPage()
		await click('[title="New virtual machine"]')
		await press()
		expect(stillOpen('.vm-create', '.vm-page')).toEqual([['.vm-create', true], ['.vm-page', true]])

		await click('.vm-create button', 'Cancel')
		expect(isOpen('.vm-create')).toBe(false)
		await press()
		expect(isOpen('.vm-page')).toBe(true)
	})
})
