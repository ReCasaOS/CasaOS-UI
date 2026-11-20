// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContainerFiles from './ContainerFiles.vue'
import containerFiles from '@/service/containerFiles'

vi.mock('@/service/containerFiles', () => ({ default: { list: vi.fn(), content: vi.fn(), mkdir: vi.fn(), write: vi.fn(), upload: vi.fn(), remove: vi.fn(), downloadUrl: vi.fn((id, path, token) => `/dl/${id}${path}?token=${token}`) } }))

const entry = (name, type, extra = {}) => ({ name, type, size: 11, mode: 'rw-r--r--', octal: '644', uid: 0, gid: 0, user: 'root', group: 'root', modified: '2026-11-20T10:00:00Z', ...extra })

const FOLDERS = {
	'/': { path: '/', entries: [entry('config', 'dir', { volume: true }), entry('app', 'dir'), entry('.cache', 'dir'), entry('etc-link', 'symlink', { link: '/etc' }), entry('run.sh', 'file')], truncated: false, volumes: ['/config'] },
	'/config': { path: '/config', entries: [entry('app.yml', 'file')], truncated: false, in_volume: '/config', volumes: ['/config'] },
	'/etc-link': { path: '/etc-link', entries: [], truncated: false, volumes: ['/config'] },
}

const toast = vi.fn()
// the dialogs answer at once: a prompt with promptAnswer, a confirm with confirmAnswer
let promptAnswer = 'new'
let confirmAnswer = true
const dialog = {
	prompt: vi.fn(options => options.onConfirm(promptAnswer)),
	confirm: vi.fn(options => (confirmAnswer ? options.onConfirm() : options.onCancel?.())),
}

async function open() {
	const wrapper = mount(ContainerFiles, {
		props: { containerId: 'c1' },
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$buefy: { toast: { open: toast }, dialog },
				$store: { state: { access_token: 'tok' } },
			},
			stubs: { 'b-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }, 'b-icon': true, 'b-tag': { template: '<span><slot /></span>' }, 'b-loading': true, 'b-checkbox': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">' } },
		},
	})
	await flushPromises()
	return wrapper
}

describe('the files of a container', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		promptAnswer = 'new'
		confirmAnswer = true
		containerFiles.list.mockImplementation((id, path) => FOLDERS[path]
			? Promise.resolve({ data: { data: FOLDERS[path] } })
			: Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { message: 'not a directory' } } })))
	})

	it('lists the top folder, hidden names left out, and says what an update loses', async () => {
		const wrapper = await open()

		expect(containerFiles.list).toHaveBeenCalledWith('c1', '/')
		expect(wrapper.findAll('[data-entry]').map(row => row.attributes('data-entry'))).toEqual(['config', 'app', 'etc-link', 'run.sh'])
		expect(wrapper.find('[data-lost]').exists()).toBe(true)
		expect(wrapper.find('[data-entry="config"] [data-volume]').exists()).toBe(true)
		expect(wrapper.find('[data-entry="run.sh"]').text()).toContain('644 rw-r--r--')

		await wrapper.find('[data-hidden]').setValue(true)
		expect(wrapper.find('[data-entry=".cache"]').exists()).toBe(true)
	})

	it('opens a folder on a volume, and comes back by the crumbs', async () => {
		const wrapper = await open()

		await wrapper.find('[data-entry="config"] a').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-kept]').text()).toContain('/config')
		expect(wrapper.findAll('[data-crumb]').map(c => c.attributes('data-crumb'))).toEqual(['/', '/config'])

		await wrapper.find('[data-crumb="/"]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-entry="app"]').exists()).toBe(true)
	})

	it('reads a text file, and a link to a folder opens the folder', async () => {
		containerFiles.content.mockResolvedValue({ data: { data: { path: '/run.sh', content: 'echo hi', size: 7 } } })
		const wrapper = await open()

		await wrapper.find('[data-entry="run.sh"] a').trigger('click')
		await flushPromises()
		expect(containerFiles.content).toHaveBeenCalledWith('c1', '/run.sh')
		expect(wrapper.find('[data-text]').text()).toBe('echo hi')

		await wrapper.find('[data-back]').trigger('click')
		await wrapper.find('[data-entry="etc-link"] a').trigger('click')
		await flushPromises()
		expect(wrapper.findAll('[data-crumb]').map(c => c.attributes('data-crumb'))).toEqual(['/', '/etc-link'])
	})

	it('says to start a stopped app, and what the box refused', async () => {
		containerFiles.list.mockRejectedValue({ response: { status: 409, data: { message: 'the app is not running' } } })
		const wrapper = await open()
		expect(wrapper.find('[data-error]').text()).toBe('Start the app to see its files.')

		containerFiles.content.mockRejectedValue({ response: { status: 415, data: { message: 'the file is not text: download it instead' } } })
		containerFiles.list.mockImplementation((id, path) => Promise.resolve({ data: { data: FOLDERS[path] } }))
		await wrapper.find('[data-refresh]').trigger('click')
		await flushPromises()
		await wrapper.find('[data-entry="run.sh"] a').trigger('click')
		await flushPromises()
		expect(toast).toHaveBeenCalledWith({ message: 'the file is not text: download it instead', type: 'is-warning' })
	})

	it('downloads through a frame, so the file goes to the disk as it comes', async () => {
		const wrapper = await open()

		await wrapper.find('[data-entry="run.sh"] button').trigger('click')
		expect(document.getElementById('container-files-download').getAttribute('src')).toBe('/dl/c1/run.sh?token=tok')
		// a link can be downloaded too: it may point at a file
		expect(wrapper.find('[data-entry="etc-link"] button').exists()).toBe(true)
	})

	it('keeps the last folder asked for, whatever answer comes back last', async () => {
		let slow
		containerFiles.list.mockImplementation((id, path) => path === '/app'
			? new Promise((resolve) => { slow = () => resolve({ data: { data: { path: '/app', entries: [], truncated: false, volumes: [] } } }) })
			: Promise.resolve({ data: { data: FOLDERS[path] } }))
		const wrapper = await open()

		await wrapper.find('[data-entry="app"] a').trigger('click')
		await wrapper.find('[data-entry="config"] a').trigger('click')
		await flushPromises()
		slow()
		await flushPromises()
		expect(wrapper.find('[data-kept]').text()).toContain('/config')
	})

	it('opens a link to a folder with one call, and says a folder holds only hidden files', async () => {
		const wrapper = await open()
		containerFiles.list.mockClear()

		await wrapper.find('[data-entry="etc-link"] a').trigger('click')
		await flushPromises()
		expect(containerFiles.list).toHaveBeenCalledTimes(1)

		FOLDERS['/etc-link'].entries = [entry('.env', 'file')]
		await wrapper.find('[data-refresh]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-empty]').text()).toBe('Only hidden files here.')
		FOLDERS['/etc-link'].entries = []
	})

	it('edits a text and saves it over the file', async () => {
		containerFiles.content.mockResolvedValue({ data: { data: { path: '/run.sh', content: 'echo hi', size: 7 } } })
		containerFiles.write.mockResolvedValue({})
		const wrapper = await open()

		await wrapper.find('[data-entry="run.sh"] a').trigger('click')
		await flushPromises()
		await wrapper.find('[data-edit]').trigger('click')
		await wrapper.find('[data-draft]').setValue('echo bye')
		await wrapper.find('[data-save]').trigger('click')
		await flushPromises()
		expect(containerFiles.write).toHaveBeenCalledWith('c1', '/run.sh', 'echo bye', true)
		expect(wrapper.find('[data-text]').text()).toBe('echo bye')
	})

	it('makes a folder in the folder shown, and refuses a name with a slash', async () => {
		containerFiles.mkdir.mockResolvedValue({})
		const wrapper = await open()

		await wrapper.find('[data-new-folder]').trigger('click')
		await flushPromises()
		expect(containerFiles.mkdir).toHaveBeenCalledWith('c1', '/new')

		promptAnswer = 'a/b'
		await wrapper.find('[data-new-folder]').trigger('click')
		await flushPromises()
		expect(containerFiles.mkdir).toHaveBeenCalledTimes(1)
		expect(toast).toHaveBeenCalled()
	})

	it('sends files, and asks before sending one whose name is taken', async () => {
		const taken = new File(['x'], 'run.sh')
		const fresh = new File(['y'], 'new.txt')
		containerFiles.upload.mockResolvedValue({})
		const wrapper = await open()
		const picker = wrapper.find('[data-picker]')
		Object.defineProperty(picker.element, 'files', { value: [taken, fresh], configurable: true })

		confirmAnswer = false
		await picker.trigger('change')
		await flushPromises()
		// the taken name is skipped without being sent, the other goes
		expect(containerFiles.upload).toHaveBeenCalledTimes(1)
		expect(containerFiles.upload).toHaveBeenCalledWith('c1', '/new.txt', fresh, false, expect.any(Function))

		confirmAnswer = true
		await picker.trigger('change')
		await flushPromises()
		expect(containerFiles.upload).toHaveBeenCalledWith('c1', '/run.sh', taken, true, expect.any(Function))
	})

	it('deletes after a confirmation, and offers no delete on a volume', async () => {
		containerFiles.remove.mockResolvedValue({})
		const wrapper = await open()

		expect(wrapper.find('[data-entry="config"] [data-delete]').exists()).toBe(false)
		await wrapper.find('[data-entry="app"] [data-delete]').trigger('click')
		await flushPromises()
		expect(dialog.confirm.mock.calls[0][0].message).toContain('and all it holds')
		expect(containerFiles.remove).toHaveBeenCalledWith('c1', '/app')
	})

	it('says what the box refused on a change, a busy app included', async () => {
		containerFiles.remove.mockRejectedValue(Object.assign(new Error('409'), { response: { status: 409, data: { message: '`jellyfin` is busy: update in progress' } } }))
		const wrapper = await open()

		await wrapper.find('[data-entry="run.sh"] [data-delete]').trigger('click')
		await flushPromises()
		expect(toast).toHaveBeenCalledWith({ message: '`jellyfin` is busy: update in progress', type: 'is-warning' })
	})
})
