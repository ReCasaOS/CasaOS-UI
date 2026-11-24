// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FileBreadcrumb from './components/FileBreadcrumb.vue'
import TrashEntryButton from './trash/TrashEntryButton.vue'
import FilePanel from './FilePanel.vue'
import IconContainerMixin from '@/mixins/IconContainerMixin'

vi.mock('clipboard-copy', () => ({ default: vi.fn() }))
// FilePanel brings the dashboard's animations along; only its methods are read here
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))
vi.mock('lottie-web', () => ({ default: {} }))
const copy = (await import('clipboard-copy')).default

const t = (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key)

afterEach(() => {
	document.body.innerHTML = ''
	vi.clearAllMocks()
})

describe('the path bar (CasaOS#184)', () => {
	function bar(path = '/DATA/Media') {
		const filePanel = { getFileList: vi.fn() }
		const holder = document.createElement('div')
		holder.id = 'bread-container'
		document.body.appendChild(holder)
		const wrapper = mount(FileBreadcrumb, {
			global: { plugins: [Buefy], provide: { filePanel }, mocks: { $t: t, $store: { state: { currentPath: path } } } },
			attachTo: holder,
		})
		return { wrapper, filePanel }
	}

	it('opens a path typed in it, read from the folder shown when relative', async () => {
		const { wrapper, filePanel } = bar()
		await wrapper.find('[data-path-edit]').trigger('click')
		const input = wrapper.find('.path-bar input')
		expect(input.element.value).toBe('/DATA/Media')

		await input.setValue('../Downloads/')
		await input.trigger('keydown', { key: 'Enter' })

		expect(filePanel.getFileList).toHaveBeenCalledWith('/DATA/Downloads')
		expect(wrapper.find('.path-bar input').exists()).toBe(false)
		wrapper.unmount()
	})

	it('gives the breadcrumb back on Escape, opening nothing', async () => {
		const { wrapper, filePanel } = bar()
		await wrapper.find('[data-path-edit]').trigger('click')
		await wrapper.find('.path-bar input').trigger('keydown', { key: 'Escape' })

		expect(filePanel.getFileList).not.toHaveBeenCalled()
		expect(wrapper.find('.path-bar input').exists()).toBe(false)
		wrapper.unmount()
	})

	it('copies the folder shown', async () => {
		const { wrapper } = bar('/DATA/Gallery')
		await wrapper.find('[data-path-copy]').trigger('click')
		expect(copy).toHaveBeenCalledWith('/DATA/Gallery')
		wrapper.unmount()
	})
})

describe('the trash entry (CasaOS#184)', () => {
	function entry(trash) {
		const bus = {
			handlers: {},
			$on(name, fn) {
				this.handlers[name] = fn
			},
			$off(name) {
				delete this.handlers[name]
			},
		}
		const wrapper = mount(TrashEntryButton, { props: { active: false }, global: { plugins: [Buefy], mocks: { $t: t, $api: { file: { trash } }, $EventBus: bus } } })
		return { wrapper, bus }
	}

	it('says the room the trash takes, and nothing when it is empty or cannot be read', async () => {
		let { wrapper } = entry(vi.fn(() => Promise.resolve({ data: { data: { items: [], size: 3 * 1024 * 1024, retention_days: 30 } } })))
		await flushPromises()
		expect(wrapper.find('[data-trash-size]').text()).toBe('3 MB')
		wrapper.unmount()

		for (const trash of [vi.fn(() => Promise.resolve({ data: { data: { items: [], size: 0 } } })), vi.fn(() => Promise.reject(new Error('403')))]) {
			({ wrapper } = entry(trash))
			await flushPromises()
			expect(wrapper.find('[data-trash-size]').exists()).toBe(false)
			wrapper.unmount()
		}
	})

	it('reads it again after a reload and when the trash is left', async () => {
		const trash = vi.fn(() => Promise.resolve({ data: { data: { size: 1 } } }))
		const { wrapper, bus } = entry(trash)
		await flushPromises()
		bus.handlers.reloadFileList()
		await wrapper.setProps({ active: true })
		await wrapper.setProps({ active: false })
		await flushPromises()
		expect(trash).toHaveBeenCalledTimes(3)
		wrapper.unmount()
	})
})

describe('the room left where the folder is (CasaOS#184)', () => {
	const { readSpace } = FilePanel.methods
	function panel(size, isAccount = false) {
		return { spaceRead: 0, space: null, isAccount, $t: t, renderSize: bytes => `${bytes}B`, $api: { disks: { size } } }
	}

	it('says the free and the total space of the file system', async () => {
		const vm = panel(vi.fn(() => Promise.resolve({ data: { data: { path: '/DATA', free: 30, used: 70 } } })))
		readSpace.call(vm, '/DATA')
		await flushPromises()
		expect(vm.$api.disks.size).toHaveBeenCalledWith('/DATA')
		expect(vm.space).toEqual({ text: '30B free of 100B', title: '70B used' })
	})

	it('says nothing for an account, nor when the read fails, nor from a read overtaken by another', async () => {
		const account = panel(vi.fn(), true)
		readSpace.call(account, '/DATA')
		expect(account.$api.disks.size).not.toHaveBeenCalled()
		expect(account.space).toBeNull()

		const failing = panel(vi.fn(() => Promise.reject(new Error('403'))))
		readSpace.call(failing, '/DATA')
		await flushPromises()
		expect(failing.space).toBeNull()

		let first
		const slow = panel(vi.fn()
			.mockReturnValueOnce(new Promise((resolve) => { first = resolve }))
			.mockResolvedValueOnce({ data: { data: { free: 1, used: 1 } } }))
		readSpace.call(slow, '/DATA/a')
		readSpace.call(slow, '/DATA/b')
		await flushPromises()
		first({ data: { data: { free: 999, used: 999 } } })
		await flushPromises()
		expect(slow.space.text).toBe('1B free of 2B')
	})
})

describe('a file icon\'s badge (CasaOS#184)', () => {
	const badge = (item, showThumb = false) => IconContainerMixin.computed.badge.call({ item, showThumb })

	it('says the type of a file, not over a thumbnail nor on a folder', () => {
		expect(badge({ name: 'a.pdf', is_dir: false })).toBe('PDF')
		expect(badge({ name: 'a.png', is_dir: false }, true)).toBe('')
		expect(badge({ name: 'Media', is_dir: true })).toBe('')
	})
})

describe('the search of Files (CasaOS#184)', () => {
	const { runSearch, clearSearch, onSearchKey } = FilePanel.methods
	function panel(search) {
		const vm = {
			searchText: '',
			search: null,
			allListData: [],
			listData: [],
			isLoading: false,
			pageType: 'file',
			$t: t,
			$store: { state: { currentPath: '/DATA/Media' } },
			$api: { file: { search } },
			$buefy: { toast: { open: vi.fn() } },
			$refs: { searchInput: { focus: vi.fn() } },
			updateVisibleList: vi.fn(),
			handelListChange: vi.fn(),
			getFileList: vi.fn(),
		}
		vm.getFileList.mockImplementation(() => {
			vm.search = null
		})
		return vm
	}
	const hits = { data: { data: { content: [{ name: 'Holiday.mkv', path: '/DATA/Media/Movies/Holiday.mkv', is_dir: false, size: 5 }], truncated: false } } }

	it('searches the folder shown, its hits taking the list\'s place', async () => {
		const vm = panel(vi.fn(() => Promise.resolve(hits)))
		vm.searchText = ' holi '
		await runSearch.call(vm, false)

		expect(vm.$api.file.search).toHaveBeenCalledWith('/DATA/Media', 'holi')
		expect(vm.allListData.map(i => i.path)).toEqual(['/DATA/Media/Movies/Holiday.mkv'])
		expect(vm.search).toEqual({ query: 'holi', path: '/DATA/Media', count: 1, truncated: false })
		expect(vm.isLoading).toBe(false)
	})

	it('searches every root when asked everywhere, and nothing under two characters', async () => {
		const vm = panel(vi.fn(() => Promise.resolve(hits)))
		vm.searchText = 'h'
		await runSearch.call(vm, false)
		expect(vm.$api.file.search).not.toHaveBeenCalled()

		vm.searchText = 'holiday'
		await runSearch.call(vm, true)
		expect(vm.$api.file.search).toHaveBeenCalledWith('/', 'holiday')
	})

	it('says a failure, and leaves the list as it was', async () => {
		const vm = panel(vi.fn(() => Promise.reject(Object.assign(new Error('x'), { response: { data: { message: 'the search needs 2 to 200 characters' } } }))))
		vm.allListData = [{ name: 'kept' }]
		vm.searchText = 'holiday'
		await runSearch.call(vm, false)
		expect(vm.$buefy.toast.open).toHaveBeenCalledTimes(1)
		expect(vm.allListData).toEqual([{ name: 'kept' }])
		expect(vm.search).toBeNull()
	})

	it('goes back to the folder when closed, and Ctrl+K comes to the field', () => {
		const vm = panel(vi.fn())
		vm.search = { query: 'x' }
		vm.searchText = 'x'
		clearSearch.call(vm)
		expect(vm.getFileList).toHaveBeenCalledWith('/DATA/Media')
		expect(vm.searchText).toBe('')

		const event = { ctrlKey: true, key: 'k', preventDefault: vi.fn() }
		onSearchKey.call(vm, event)
		expect(vm.$refs.searchInput.focus).toHaveBeenCalled()
		expect(event.preventDefault).toHaveBeenCalled()
		onSearchKey.call({ ...vm, pageType: 'trash' }, { ctrlKey: true, key: 'k', preventDefault: vi.fn() })
		expect(vm.$refs.searchInput.focus).toHaveBeenCalledTimes(1)
	})
})
