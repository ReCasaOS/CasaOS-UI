// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aVm } from './__fixtures__/vm'
import { mountPage } from './__fixtures__/page'
import vmApi from './api'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({
	default: Object.fromEntries(['host', 'list', 'get', 'images', 'action', 'remove', 'downloads', 'storageFolder'].map(name => [name, vi.fn()])),
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
