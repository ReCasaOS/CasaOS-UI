// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DownloadModal from './DownloadModal.vue'
import vmApi from './api'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { downloads: vi.fn(), startDownload: vi.fn(), deleteDownload: vi.fn() } }))

const running = { id: 'd1', name: 'debian.iso', url: 'https://example.com/debian.iso', state: 'downloading', done_bytes: 10, total_bytes: 100, path: '/DATA/VM/iso/debian.iso' }
const listOf = downloads => ({ data: { data: downloads } })

// an answer the test gives when it likes
function deferred() {
	let resolve
	const promise = new Promise((res) => {
		resolve = res
	})
	return { promise, resolve }
}

describe('the download dialog', () => {
	let wrapper

	beforeEach(() => {
		// only the timers of the dialog: the promises of the test run on real time
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		vi.clearAllMocks()
	})
	afterEach(() => {
		wrapper?.unmount()
		vi.useRealTimers()
	})

	const open = async () => {
		wrapper = mount(DownloadModal, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await flushPromises()
	}

	it('asks again every second while a download runs', async () => {
		vmApi.downloads.mockResolvedValue(listOf([running]))
		await open()
		expect(vmApi.downloads).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(3000)
		expect(vmApi.downloads).toHaveBeenCalledTimes(4)
	})

	it('stops asking when it is closed while a request is on its way', async () => {
		vmApi.downloads.mockResolvedValue(listOf([running]))
		await open()

		const late = deferred()
		vmApi.downloads.mockReturnValueOnce(late.promise)
		await vi.advanceTimersByTimeAsync(1000)
		expect(vmApi.downloads).toHaveBeenCalledTimes(2)

		wrapper.unmount()
		late.resolve(listOf([running]))
		await flushPromises()
		// nothing left to fire
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(10_000)
		expect(vmApi.downloads).toHaveBeenCalledTimes(2)
	})

	it('does not look at the downloads again when it is closed while one is started', async () => {
		vmApi.downloads.mockResolvedValue(listOf([]))
		await open()
		const started = deferred()
		vmApi.startDownload.mockReturnValue(started.promise)
		await wrapper.find('input').setValue('https://example.com/debian.iso')
		await wrapper.findAll('button').find(b => b.text() === 'Download').trigger('click')

		wrapper.unmount()
		vmApi.downloads.mockResolvedValue(listOf([running]))
		started.resolve({})
		await vi.advanceTimersByTimeAsync(10_000)
		expect(vmApi.downloads).toHaveBeenCalledTimes(1)
	})
})
