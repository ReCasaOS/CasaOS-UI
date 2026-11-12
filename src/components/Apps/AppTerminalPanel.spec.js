// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppTerminalPanel from './AppTerminalPanel.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }))
vi.mock('@/service/logs', () => ({ logsApi: {} }))
vi.mock('@/service/service.js', () => ({ instance: {} }))
let logsThere = true
vi.mock('@/components/Logs/entry', () => ({ hasLogs: () => Promise.resolve(logsThere) }))

const FileSaver = (await import('file-saver')).default

// The two cards open a websocket and a fullscreen teleport; neither is under test here.
const CardStub = { template: '<div/>', props: ['data', 'initWsUrl'], methods: { active() {} } }
const LogsCardStub = { ...CardStub, template: '<div class="logs-card-stub"/>' }
const download = vi.fn()
const StreamStub = { name: 'LogStream', template: '<div class="log-stream"/>', props: { apps: Array, services: Array, embedded: Boolean }, methods: { download } }

function setup(props = {}) {
	const composeAppLogs = vi.fn().mockResolvedValue({ status: 200, data: { data: 'line one\nline two' } })
	const wrapper = mount(AppTerminalPanel, {
		props: { appid: 'c1', appName: 'jellyfin', initialTab: 'logs', ...props },
		global: {
			plugins: [Buefy, i18n],
			stubs: { 'terminal-card': CardStub, 'logs-card': LogsCardStub, 'LogStream': StreamStub },
			mocks: {
				$openAPI: { appManagement: { compose: { composeAppLogs } } },
				$store: { state: { access_token: 't', device: 'desktop' } },
				$wsProtocol: 'ws:',
				$baseURL: 'localhost',
			},
		},
	})
	return { wrapper, composeAppLogs }
}

describe('appTerminalPanel logs', () => {
	beforeEach(() => {
		logsThere = true
		vi.useFakeTimers()
	})
	afterEach(() => vi.useRealTimers())

	it('streams the logs of the app instead of polling them', async () => {
		const { wrapper, composeAppLogs } = setup()
		await flushPromises()
		const stream = wrapper.findComponent(StreamStub)
		expect(stream.exists()).toBe(true)
		expect(stream.props('apps')).toEqual(['jellyfin'])
		expect(stream.props('services')).toBeNull()
		expect(stream.props('embedded')).toBe(true)

		vi.advanceTimersByTime(10000)
		expect(composeAppLogs).not.toHaveBeenCalled()
		expect(wrapper.find('select').exists()).toBe(false)
		expect(wrapper.find('.logs-card-stub').exists()).toBe(false)
		wrapper.unmount()
	})

	it('streams the one service it was opened on, and downloads through the stream', async () => {
		const { wrapper, composeAppLogs } = setup({ serviceName: 'gluetun' })
		await flushPromises()
		expect(wrapper.findComponent(StreamStub).props('services')).toEqual(['gluetun'])

		await wrapper.findAll('button').find(b => b.text().includes('Download')).trigger('click')
		expect(download).toHaveBeenCalled()
		vi.advanceTimersByTime(10000)
		expect(composeAppLogs).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})

// An AppManagement older than the Logs feature has no stream: the tab keeps the polled log.
describe('appTerminalPanel logs against an older AppManagement', () => {
	beforeEach(() => {
		logsThere = false
		vi.useFakeTimers()
	})
	afterEach(() => vi.useRealTimers())

	it('shows the polled log, not the stream', async () => {
		const { wrapper } = setup()
		await flushPromises()
		expect(wrapper.findComponent(StreamStub).exists()).toBe(false)
		expect(wrapper.find('.logs-card-stub').exists()).toBe(true)
		expect(wrapper.find('select').exists()).toBe(true)
		wrapper.unmount()
	})

	it('asks for the chosen number of lines, and keeps polling for a bounded log', async () => {
		const { wrapper, composeAppLogs } = setup()
		await flushPromises()
		expect(composeAppLogs).toHaveBeenLastCalledWith('jellyfin', 1000, undefined)

		await wrapper.find('select').setValue('100')
		await flushPromises()
		expect(composeAppLogs).toHaveBeenLastCalledWith('jellyfin', 100, undefined)

		const calls = composeAppLogs.mock.calls.length
		vi.advanceTimersByTime(5000)
		expect(composeAppLogs.mock.calls.length).toBe(calls + 1)
		wrapper.unmount()
	})

	it('stops polling on the whole log, and says so, instead of re-fetching it every five seconds', async () => {
		const { wrapper, composeAppLogs } = setup()
		await flushPromises()

		await wrapper.find('select').setValue('-1')
		await flushPromises()
		expect(composeAppLogs).toHaveBeenLastCalledWith('jellyfin', -1, undefined)
		expect(wrapper.text()).toContain('The whole log does not refresh on its own.')

		const calls = composeAppLogs.mock.calls.length
		vi.advanceTimersByTime(30000)
		expect(composeAppLogs.mock.calls.length).toBe(calls)

		// and going back to a bounded log starts it again
		await wrapper.find('select').setValue('1000')
		await flushPromises()
		vi.advanceTimersByTime(5000)
		expect(composeAppLogs.mock.calls.length).toBeGreaterThan(calls + 1)
		wrapper.unmount()
	})

	it('downloads what is on screen as a text file named after the whole app it shows', async () => {
		const { wrapper } = setup()
		await flushPromises()

		await wrapper.findAll('button').find(b => b.text().includes('Download')).trigger('click')
		expect(FileSaver.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'jellyfin-logs.txt')
		expect(await FileSaver.saveAs.mock.calls[0][0].text()).toBe('line one\nline two')
		wrapper.unmount()
	})

	// The Containers tab opens the panel on ONE row of a stack. Without the service name
	// the endpoint answers for the whole project, so the panel would show every service
	// interleaved under this one's title -- and save it under this one's filename.
	it('asks for the one service it was opened on, and names the download after it', async () => {
		const { wrapper, composeAppLogs } = setup({ serviceName: 'gluetun' })
		await flushPromises()
		expect(composeAppLogs).toHaveBeenLastCalledWith('jellyfin', 1000, 'gluetun')
		expect(wrapper.find('h3').text()).toBe('gluetun')

		await wrapper.findAll('button').find(b => b.text().includes('Download')).trigger('click')
		expect(FileSaver.saveAs).toHaveBeenLastCalledWith(expect.any(Blob), 'gluetun-logs.txt')
		wrapper.unmount()
	})
})
