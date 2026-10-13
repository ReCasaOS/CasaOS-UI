// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST, aVm } from './__fixtures__/vm'
import { isOpen, mountPage } from './__fixtures__/page'
import vmApi from './api'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({
	default: Object.fromEntries(['host', 'list', 'get', 'images', 'action', 'remove', 'create', 'downloads', 'storageFolder'].map(name => [name, vi.fn()])),
}))

// Buefy renders the message of a toast as HTML.
const HOSTILE = '<img src=x onerror="window.pwned = 1">'

const toasts = () => [...document.querySelectorAll('.toast')]

describe('the toasts of the virtual machine page', () => {
	let page

	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})
	afterEach(() => {
		page?.wrapper.unmount()
		page = null
	})

	it('shows the title and the error of a failed creation as text', async () => {
		page = await mountPage()
		page.fire('vm:create-error', { 'vm:id': 'vm-2', 'vm:title': HOSTILE, 'message': `no such file ${HOSTILE}` })
		await flushPromises()

		expect(toasts()).toHaveLength(1)
		expect(toasts()[0].querySelector('img')).toBeNull()
		expect(toasts()[0].textContent).toContain(`${HOSTILE} could not be created: no such file ${HOSTILE}`)
	})

	it('shows an error of the service as text', async () => {
		page = await mountPage()
		vmApi.action.mockRejectedValue({ response: { data: { message: HOSTILE } } })
		const shutdown = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Shut down'))
		shutdown.click()
		await flushPromises()

		expect(toasts()).toHaveLength(1)
		expect(toasts()[0].querySelector('img')).toBeNull()
		expect(toasts()[0].textContent).toContain(HOSTILE)
	})

	it('shows the title of a VM in the list as text', async () => {
		page = await mountPage({ vms: [aVm({ title: HOSTILE })] })
		expect(document.querySelector('.vm-item img')).toBeNull()
		expect(document.querySelector('.vm-item-title').textContent).toBe(HOSTILE)
	})
})

describe('creating a virtual machine', () => {
	let page

	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})
	afterEach(() => {
		page?.wrapper.unmount()
		page = null
	})

	// the form of the real modal, named and sent
	const createFromTheForm = async () => {
		document.querySelector('[title="New virtual machine"]').click()
		await flushPromises()
		const name = document.querySelector('.vm-create input[maxlength="128"]')
		name.value = 'Debian'
		name.dispatchEvent(new Event('input', { bubbles: true }))
		await flushPromises()
		;[...document.querySelectorAll('.vm-create button')].find(b => b.textContent.trim() === 'Create').click()
		await flushPromises()
	}

	it('reads the list again, and says why, when the VM was made and did not start', async () => {
		page = await mountPage({ vms: [] })
		vmApi.create.mockRejectedValue({ response: { status: 409, data: { message: `cannot start ${HOSTILE}` } } })
		expect(vmApi.list).toHaveBeenCalledTimes(1)
		await createFromTheForm()

		expect(vmApi.create).toHaveBeenCalledTimes(1)
		expect(vmApi.list).toHaveBeenCalledTimes(2)
		expect(isOpen('.vm-create')).toBe(false)
		const toast = document.querySelector('.toast')
		expect(toast.querySelector('img')).toBeNull()
		expect(toast.textContent).toContain(`Debian was created but could not be started: cannot start ${HOSTILE}`)
	})
})

// an answer the test gives when it likes
function deferred() {
	let resolve
	const promise = new Promise((res) => {
		resolve = res
	})
	return { promise, resolve }
}
const answer = vm => ({ data: { data: vm } })
const states = () => [...document.querySelectorAll('.vm-item-state')].map(el => el.textContent.trim())

describe('keeping the state of the VMs true', () => {
	let page

	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})
	afterEach(() => {
		page?.wrapper.unmount()
		page = null
	})

	it('reads the VMs again when the message bus connects again', async () => {
		page = await mountPage()
		expect(states()).toEqual(['Running'])

		// the guest went off while the browser was away, and the bus does not replay
		vmApi.list.mockResolvedValue({ data: { data: [aVm({ state: 'shut-off' })] } })
		page.socket.receive('connect')
		await flushPromises()

		expect(vmApi.list).toHaveBeenCalledTimes(2)
		expect(states()).toEqual(['Off'])
	})

	it('does not read them twice while the page is still loading', async () => {
		const first = deferred()
		page = await mountPage({ list: first.promise })
		page.socket.receive('connect')
		await flushPromises()
		expect(vmApi.list).toHaveBeenCalledTimes(1)

		first.resolve({ data: { data: [aVm()] } })
		await flushPromises()
		expect(states()).toEqual(['Running'])
	})

	it('does not read them when there is no libvirt to ask', async () => {
		page = await mountPage({ host: { ...HOST, libvirt: 'unavailable' } })
		page.socket.receive('connect')
		await flushPromises()
		expect(vmApi.list).not.toHaveBeenCalled()
	})

	it('does not bring a VM back when the answer about it comes after it was removed', async () => {
		page = await mountPage()
		const late = deferred()
		vmApi.get.mockReturnValue(late.promise)
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'stopped' })
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'undefined' })
		await flushPromises()
		expect(states()).toEqual([])

		late.resolve(answer(aVm()))
		await flushPromises()
		expect(states()).toEqual([])
	})

	it('does not take an older answer for the VM', async () => {
		page = await mountPage()
		const older = deferred()
		vmApi.get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(answer(aVm({ state: 'shut-off' })))
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'started' })
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'stopped' })
		await flushPromises()
		expect(states()).toEqual(['Off'])

		older.resolve(answer(aVm({ state: 'running' })))
		await flushPromises()
		expect(states()).toEqual(['Off'])
	})

	it('does not take an older "no such VM" for the VM either', async () => {
		page = await mountPage()
		const older = deferred()
		vmApi.get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(answer(aVm({ state: 'shut-off' })))
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'started' })
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'stopped' })
		await flushPromises()

		older.resolve(Promise.reject(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })))
		await flushPromises()
		expect(states()).toEqual(['Off'])
	})

	it('does not bring a VM back after it was deleted from the page, whatever answer was on its way', async () => {
		page = await mountPage()
		const late = deferred()
		vmApi.get.mockReturnValue(late.promise)
		vmApi.action.mockResolvedValue(answer(aVm({ state: 'shut-off' })))
		vmApi.remove.mockResolvedValue({ data: { data: {} } })
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'stopped' })

		document.querySelector('.vm-detail [title="Delete"]').click()
		await flushPromises()
		;[...document.querySelectorAll('.vm-delete button')].find(b => b.textContent.trim() === 'Delete').click()
		await flushPromises()
		expect(vmApi.remove).toHaveBeenCalledWith('vm-1', false)
		expect(states()).toEqual([])

		late.resolve(answer(aVm()))
		await flushPromises()
		expect(states()).toEqual([])
	})

	it('drops a VM the service no longer knows', async () => {
		page = await mountPage()
		vmApi.get.mockRejectedValue({ response: { status: 404 } })
		page.fire('vm:state-changed', { 'vm:id': 'vm-1', 'vm:event': 'stopped' })
		await flushPromises()
		expect(states()).toEqual([])
	})
})

// Buefy shows the message of a toast, a snackbar, a notification and a dialog as
// HTML, and the title of a VM, an error from the service or a file name must
// not reach it as is. This reads the sources: any new call has to say here that
// its message is text of ours or escaped.
describe('the messages Buefy shows as HTML', () => {
	const folder = import.meta.dirname
	const sources = Object.fromEntries(readdirSync(folder).filter(f => f.endsWith('.vue')).map(f => [f, readFileSync(join(folder, f), 'utf8')]))
	const calls = /\b(?:toast\.open|snackbar\.open|notification\.open|dialog\.(?:alert|confirm|prompt))\(\{/g

	it('are escaped, or a fixed text', () => {
		const found = []
		for (const [file, source] of Object.entries(sources)) {
			for (const call of source.matchAll(calls)) {
				// up to the closing brace of the options
				let depth = 1
				let end = call.index + call[0].length
				while (depth && end < source.length) {
					depth += source[end] === '{' ? 1 : source[end] === '}' ? -1 : 0
					end++
				}
				const message = source.slice(call.index, end).match(/\bmessage: (.+?)(?:, (?:type|title|duration|confirmText)\b|,?\r?\n)/)?.[1] ?? ''
				found.push({ file, message })
				expect(message, file).toMatch(/^(escape\(|this\.\$t\('[^']*'\))/)
			}
		}
		// the toasts of the page and the console, the dialogs of the snapshots
		expect(found.length).toBeGreaterThanOrEqual(7)
	})

	it('are never written with v-html or innerHTML in the VM files', () => {
		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
		}
	})
})
