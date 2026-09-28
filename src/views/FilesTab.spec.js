// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilesTab from './FilesTab.vue'

// The whole file browser comes in with FilePanel; the tab only reads its uploader.
vi.mock('@/components/filebrowser/FilePanel.vue', () => ({
	default: { name: 'FilePanel', data: () => ({ uploaderInstance: {} }), render: () => null },
}))

function tab() {
	const upload = { running: false }
	const $router = { push: vi.fn() }
	const wrapper = shallowMount(FilesTab, {
		global: { mocks: { $t: key => key, $EventBus: { $emit: () => {} }, $router } },
	})
	wrapper.vm.$refs.panel.uploaderInstance = { isUploading: () => upload.running }
	return { wrapper, upload, $router }
}

// true when the page asked the browser to prompt before it unloads
function unload() {
	const event = new Event('beforeunload', { cancelable: true })
	window.dispatchEvent(event)
	return event.defaultPrevented
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('files in a tab of their own', () => {
	it('asks before the page unloads while an upload runs, and only then', () => {
		const { wrapper, upload } = tab()
		expect(unload()).toBe(false)

		upload.running = true
		expect(unload()).toBe(true)

		wrapper.unmount()
		expect(unload()).toBe(false)
	})

	it('stays when the user keeps the tab at the prompt, and goes to the dashboard when it cannot close', () => {
		const { wrapper, upload, $router } = tab()
		// what browsers do on window.close(): the prompt first, and the user stays
		vi.spyOn(window, 'close').mockImplementation(() => unload())

		upload.running = true
		wrapper.vm.close()
		expect($router.push).not.toHaveBeenCalled()

		upload.running = false
		wrapper.vm.close()
		expect($router.push).toHaveBeenCalledWith('/')
		wrapper.unmount()
	})
})
