// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LogsPage from './LogsPage.vue'
import { fleetApi } from '@/service/fleet'
import { logsApi } from '@/service/logs'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/service.js', () => ({ instance: { request: vi.fn() } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), relay: vi.fn() } }))
vi.mock('@/service/logs', () => ({ logsApi: { apps: vi.fn(), query: vi.fn(), settings: vi.fn(), exportUrl: vi.fn(), streamUrl: vi.fn() } }))

const BOXES = [{ id: 'b1', name: 'Home', online: true }, { id: 'b2', name: 'Shop', online: false }]
const APPS = [{ app: 'plex', title: { en_us: 'Plex' }, icon: null, uninstalled: false, services: [{ service: 'plex', container: 'plex', running: true }] }]

let wrapper
async function mountPage(props = {}) {
	wrapper = mount(LogsPage, {
		attachTo: document.body,
		props,
		global: { plugins: [Buefy, i18n], stubs: { LogStream: true } },
	})
	await flushPromises()
	return wrapper
}
const boxSelect = () => wrapper.find('.logs-box select')

describe('the Logs page', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		document.body.innerHTML = ''
		logsApi.apps.mockResolvedValue({ ok: true, status: 200, data: APPS })
		logsApi.settings.mockResolvedValue({ ok: true, status: 200, data: { retention_days: 7, max_size_mb: 2048, used_mb: 10, oldest_at: null } })
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('lists this box and every box of a master, and reads the chosen box', async () => {
		fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { boxes: BOXES } } } })
		await mountPage()
		const options = boxSelect().findAll('option')
		expect(options.map(o => o.text())).toEqual(['This box', 'Home', 'Shop'])
		expect(options[2].element.disabled).toBe(true)
		expect(logsApi.apps).toHaveBeenCalledWith(null)
		await boxSelect().setValue('b1')
		await flushPromises()
		expect(logsApi.apps).toHaveBeenLastCalledWith('b1')
	})

	it('has no box selector on a box that is not a master', async () => {
		fleetApi.status.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }))
		await mountPage()
		expect(boxSelect().exists()).toBe(false)
		expect(wrapper.text()).toContain('Plex')
	})

	it('says the cap is reached, from the oldest line', async () => {
		fleetApi.status.mockRejectedValue(new Error('down'))
		logsApi.settings.mockResolvedValue({ ok: true, status: 200, data: { retention_days: 30, max_size_mb: 64, used_mb: 64, oldest_at: new Date(Date.now() - 3 * 86400000).toISOString() } })
		await mountPage()
		expect(wrapper.text()).toContain('Logs go back 3 days, cap reached')
	})

	it('says to update a box whose apps route is missing', async () => {
		fleetApi.status.mockRejectedValue(new Error('down'))
		logsApi.apps.mockResolvedValue({ ok: false, status: 404, error: 'Not Found' })
		await mountPage()
		expect(wrapper.text()).toContain('Update this box to read its logs')
	})

	it('falls back to this box for a box it does not know, keeping the app and the moment', async () => {
		fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { boxes: BOXES } } } })
		await mountPage({ initialBox: 'gone', initialApp: 'plex', initialAt: '2026-11-06T10:00:00Z' })
		const stream = wrapper.findComponent({ name: 'LogStream' })
		expect(stream.props('box')).toBe(null)
		expect(stream.props('apps')).toEqual(['plex'])
		expect(stream.props('focusAt')).toBe('2026-11-06T10:00:00Z')
		expect(logsApi.apps).toHaveBeenLastCalledWith(null)
		expect(wrapper.text()).not.toContain('Update this box')
	})

	it('keeps a deep-linked box when the fleet list is unknown, and shows its error', async () => {
		fleetApi.status.mockRejectedValue(new Error('down'))
		logsApi.apps.mockImplementation(async box => (box ? { ok: false, status: 503, error: 'box offline' } : { ok: true, status: 200, data: APPS }))
		await mountPage({ initialBox: 'b1', initialApp: 'plex' })
		const stream = wrapper.findComponent({ name: 'LogStream' })
		expect(stream.props('box')).toBe('b1')
		expect(stream.props('apps')).toEqual(['plex'])
		expect(logsApi.apps).toHaveBeenLastCalledWith('b1')
		expect(document.body.textContent).toContain('box offline')
	})

	it('offers Restart and Stop for a compose app, not for a v1 app', async () => {
		fleetApi.status.mockRejectedValue(new Error('down'))
		const v1 = { app: 'nginx', title: null, icon: null, uninstalled: false, services: [{ service: 'main', container: 'nginx', running: true }] }
		logsApi.apps.mockResolvedValue({ ok: true, status: 200, data: [...APPS, v1] })
		await mountPage({ initialApp: 'plex' })
		expect(wrapper.text()).toContain('Restart')
		wrapper.unmount()
		await mountPage({ initialApp: 'nginx' })
		expect(wrapper.text()).not.toContain('Restart')
		expect(wrapper.text()).not.toContain('Stop')
	})

	it('starts on the app and the moment it was opened for', async () => {
		fleetApi.status.mockRejectedValue(new Error('down'))
		await mountPage({ initialApp: 'plex', initialAt: '2026-11-06T10:00:00Z' })
		const stream = wrapper.findComponent({ name: 'LogStream' })
		expect(stream.props('apps')).toEqual(['plex'])
		expect(stream.props('focusAt')).toBe('2026-11-06T10:00:00Z')
	})
})
