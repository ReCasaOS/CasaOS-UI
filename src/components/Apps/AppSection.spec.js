// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetVirtualMachines, hasVirtualMachines, listVirtualMachines } from '@/components/VirtualMachines/entry'
import AppSection from '@/components/Apps/AppSection.vue'
import GitAppModal from '@/components/Apps/GitAppModal.vue'

// The section pulls in the app panel, which imports lottie-web: it paints into a
// canvas the moment it is imported and happy-dom has no 2d context, so the import
// itself throws. Nothing here renders a template.
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

// the probe is whatever each test says it answers; the card without its icon,
// which only the bundler can require
vi.mock('@/components/VirtualMachines/entry', async importOriginal => ({
	...await importOriginal(),
	hasVirtualMachines: vi.fn(),
	forgetVirtualMachines: vi.fn(),
	listVirtualMachines: vi.fn(),
	vmApplication: () => ({ name: 'Virtual Machines' }),
}))

// The grid, not the card, is what has to be read again after an update: the app that
// was updated is a different app now. Only app:updated says an update applied -- a
// compose update carries no image information at all, and docker:image:updated says
// what a pull found rather than what ended up installed.
describe('app section git entry', () => {
	it('opens the git dialog, which only its own buttons close', () => {
		const open = vi.fn()
		AppSection.methods.showGitApp.call({ $buefy: { modal: { open } } })

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].component).toBe(GitAppModal)
		// its Cancel deletes an app registered and never deployed; escape would not
		expect(open.mock.calls[0][0].canCancel).toEqual([])
	})
})

describe('app section opening a git app', () => {
	function section(myComposeApp) {
		const open = vi.fn()
		const vm = {
			$messageBus: vi.fn(),
			$api: { container: { getNetworks: () => Promise.resolve({ data: { data: [] } }) } },
			$store: { state: { hardwareInfo: { mem: { total: 1 } } } },
			$openAPI: { appManagement: { compose: { myComposeApp } } },
			$buefy: { modal: { open } },
		}
		return { vm, open }
	}

	it('opens a git app with no container on its Repository tab alone, reading no compose app', async () => {
		const myComposeApp = vi.fn()
		const { vm, open } = section(myComposeApp)
		const item = { name: 'jarvis', app_type: 'v2app', status: '', title: { en_us: 'jarvis' }, git: { new_commits: false, state: 'build_failed', deployed: false } }

		await AppSection.methods.showConfigPanel.call(vm, item, true)

		expect(myComposeApp).not.toHaveBeenCalled()
		expect(open.mock.calls[0][0].props).toMatchObject({ id: 'jarvis', state: 'update', isCasa: true, settingComposeData: '', repositoryOnly: true })
	})

	it('reads the compose app of an app that has containers, as before', async () => {
		const myComposeApp = vi.fn().mockResolvedValue({ data: 'name: jarvis\n' })
		const { vm, open } = section(myComposeApp)
		const item = { name: 'jarvis', app_type: 'v2app', status: 'running', title: { en_us: 'jarvis' }, git: { new_commits: false, state: 'idle', deployed: true } }

		await AppSection.methods.showConfigPanel.call(vm, item, true)

		expect(myComposeApp).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].props).toMatchObject({ settingComposeData: 'name: jarvis\n', repositoryOnly: false })
	})
})

describe('app section update outcome', () => {
	function section() {
		const open = vi.fn()
		const vm = {
			$buefy: { toast: { open } },
			$t: (key, params) => key.replace('{name}', params.name),
			addIdToSessionStorage: vi.fn(),
			getList: vi.fn(() => Promise.resolve()),
			scrollToNewApp: vi.fn(),
		}
		return { vm, open }
	}

	const fire = (vm, Properties) =>
		AppSection.sockets['app:update-end'].call(vm, { Properties })

	it('reloads the grid and says so once an update applied', async () => {
		const { vm, open } = section()

		fire(vm, { 'app:name': 'syncthing', 'app:updated': 'true' })
		await Promise.resolve()

		expect(vm.getList).toHaveBeenCalledTimes(1)
		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe('syncthing has been updated to the latest version!')
		expect(vm.addIdToSessionStorage).toHaveBeenCalledWith('syncthing')
	})

	it('leaves a recreate to the card that started it', () => {
		// the card knows which container was asked for, refreshes the grid and reports
		// the outcome itself. The section only has app:name, which for an imported
		// container is the image -- so this toasted `ubi9/nginx-120` next to the card's
		const { vm, open } = section()

		fire(vm, { 'app:name': 'ubi9/nginx-120', 'app:updated': 'true', 'recreate:container:id': 'ab12cd34ef56' })

		expect(open).not.toHaveBeenCalled()
		expect(vm.getList).not.toHaveBeenCalled()
	})

	it('claims nothing on an update-end that does not say it applied', () => {
		// published on failure too, and a pull that found something newer is not a
		// recreate that survived it
		const { vm, open } = section()

		fire(vm, { 'app:name': 'syncthing' })
		fire(vm, { 'app:name': 'syncthing', 'docker:image:updated': 'true' })

		expect(vm.getList).not.toHaveBeenCalled()
		expect(open).not.toHaveBeenCalled()
	})
})

// The grid does not wait for the virtual machine probe: the card joins it when
// the probe answers, at the place the saved order has for it, and an order that
// has the card is not saved without it while the probe is out.
describe('app section virtual machines card', () => {
	function section(names) {
		const vm = {
			appList: names.map(name => ({ name })),
			saveSortData: vi.fn(),
		}
		vm.sortApps = AppSection.methods.sortApps.bind(vm)
		vm.saveSortIfChanged = AppSection.methods.saveSortIfChanged.bind(vm)
		return vm
	}
	const names = vm => vm.appList.map(app => app.name)

	it('adds the card at its saved place once the module answers', async () => {
		hasVirtualMachines.mockResolvedValue(true)
		const vm = section(['App Store', 'Files', 'jellyfin'])

		await AppSection.methods.addVmCardWhenThere.call(vm, ['App Store', 'Virtual Machines', 'Files', 'jellyfin'])

		expect(names(vm)).toEqual(['App Store', 'Virtual Machines', 'Files', 'jellyfin'])
		expect(vm.saveSortData).not.toHaveBeenCalled()
	})

	it('adds it once, however many reads of the grid wait on the probe', async () => {
		hasVirtualMachines.mockResolvedValue(true)
		const vm = section(['App Store', 'Files'])

		await Promise.all([
			AppSection.methods.addVmCardWhenThere.call(vm, []),
			AppSection.methods.addVmCardWhenThere.call(vm, []),
		])

		expect(names(vm)).toEqual(['App Store', 'Files', 'Virtual Machines'])
	})

	it('drops the card from the saved order only once the probe says it is not there', async () => {
		let answer
		hasVirtualMachines.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const vm = section(['App Store', 'Files'])

		const added = AppSection.methods.addVmCardWhenThere.call(vm, ['App Store', 'Virtual Machines', 'Files'])
		expect(vm.saveSortData).not.toHaveBeenCalled()
		answer(false)
		await added

		expect(names(vm)).toEqual(['App Store', 'Files'])
		expect(vm.saveSortData).toHaveBeenCalledTimes(1)
	})
})

describe('app section when a module is installed or removed', () => {
	const grid = apps => ({ appList: apps.map(name => ({ name })), sortApps: AppSection.methods.sortApps })
	const names = vm => vm.appList.map(app => app.name)

	it('asks the gateway again, and adds the card where the module answers now', async () => {
		hasVirtualMachines.mockResolvedValue(true)
		const vm = grid(['App Store', 'Files'])

		await AppSection.methods.syncVmCard.call(vm)

		expect(forgetVirtualMachines).toHaveBeenCalled()
		expect(names(vm)).toEqual(['App Store', 'Files', 'Virtual Machines'])
	})

	it('takes the card away where the module does not answer any more', async () => {
		hasVirtualMachines.mockResolvedValue(false)
		const vm = grid(['App Store', 'Files', 'Virtual Machines'])

		await AppSection.methods.syncVmCard.call(vm)

		expect(names(vm)).toEqual(['App Store', 'Files'])
	})

	it('changes nothing when the card already says what the gateway says', async () => {
		hasVirtualMachines.mockResolvedValue(true)
		const vm = grid(['App Store', 'Virtual Machines'])

		await AppSection.methods.syncVmCard.call(vm)

		expect(names(vm)).toEqual(['App Store', 'Virtual Machines'])
	})
})

describe('app section built-in cards', () => {
	it('always carries Statistics next to Files', async () => {
		const vm = {
			$baseIp: 'localhost',
			$openAPI: { appGrid: { getAppGrid: () => Promise.resolve({ data: { data: [] } }) } },
			$api: { users: { getCustomStorage: () => Promise.resolve({ data: { data: { data: [] } } }) } },
			appList: [],
			getLinkAppList: () => Promise.resolve([]),
			sortApps: AppSection.methods.sortApps,
			saveSortIfChanged: vi.fn(),
			addVmCardWhenThere: vi.fn(),
		}
		await AppSection.methods.getList.call(vm)
		const names = vm.appList.map(app => app.name)
		expect(names).toContain('Files')
		expect(names).toContain('Statistics')
		expect(vm.appList.find(app => app.name === 'Statistics')).toMatchObject({ app_type: 'system', status: 'running' })
	})
})

// One tile per VM, right after the Virtual Machines card, by title. They are not
// apps: they never reach the saved order, whatever is dragged where.
describe('app section VM tiles', () => {
	const aVm = (id, title = id, state = 'running') => ({ id, title, state })
	function section(names, vms = []) {
		const vm = {
			appList: names.map(name => ({ name })),
			vms,
			$api: { users: { setCustomStorage: vi.fn() } },
			$buefy: { toast: { open: vi.fn() } },
		}
		Object.defineProperty(vm, 'gridList', {
			get: () => AppSection.computed.gridList.get.call(vm),
			set: list => AppSection.computed.gridList.set.call(vm, list),
		})
		vm.pollVms = AppSection.methods.pollVms.bind(vm)
		vm.saveSortData = AppSection.methods.saveSortData.bind(vm)
		return vm
	}
	const shown = vm => vm.gridList.map(item => item.vmTile ? `tile:${item.vm.title}` : item.name)
	const hide = (hidden) => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
	}

	afterEach(() => {
		vi.useRealTimers()
		hide(false)
		listVirtualMachines.mockReset()
	})

	it('(1, 4) shows a tile per VM right after the Virtual Machines card', () => {
		const vm = section(['App Store', 'Virtual Machines', 'Files'], [aVm('a', 'Alpha'), aVm('b', 'Beta')])

		expect(shown(vm)).toEqual(['App Store', 'Virtual Machines', 'tile:Alpha', 'tile:Beta', 'Files'])
	})

	it('(3) shows no tile and asks for no VM when the probe says there is no module', async () => {
		const vm = section(['App Store', 'Files'], [aVm('a')])

		await vm.pollVms()

		expect(listVirtualMachines).not.toHaveBeenCalled()
		expect(shown(vm)).toEqual(['App Store', 'Files'])
	})

	it('(3) shows no tile and no toast when the list cannot be read', async () => {
		listVirtualMachines.mockRejectedValue(new Error('502'))
		const vm = section(['Virtual Machines'], [aVm('a')])

		for (let i = 0; i < 3; i++) {
			await vm.pollVms()
			clearTimeout(vm.vmPollTimer)
		}

		expect(shown(vm)).toEqual(['Virtual Machines'])
		expect(vm.$buefy.toast.open).not.toHaveBeenCalled()
	})

	it('(4) keeps the order payload to the apps, whatever was dragged where', () => {
		const vm = section(['App Store', 'Virtual Machines', 'Files', 'jellyfin'], [aVm('a'), aVm('b')])
		const [store, vms, a, b, files, jellyfin] = vm.gridList

		// jellyfin dropped between the tiles, and a tile dragged to the front
		vm.gridList = [b, store, vms, a, jellyfin, files]
		vm.saveSortData()

		expect(vm.$api.users.setCustomStorage).toHaveBeenCalledWith('app_order', { data: ['App Store', 'Virtual Machines', 'jellyfin', 'Files'] })
		// the tiles go back after their card
		expect(shown(vm)).toEqual(['App Store', 'Virtual Machines', 'tile:a', 'tile:b', 'jellyfin', 'Files'])
	})

	it('(5) follows the states, and a VM that is deleted goes', async () => {
		vi.useFakeTimers()
		const vm = section(['Virtual Machines'])
		listVirtualMachines.mockResolvedValueOnce([aVm('a'), aVm('b')]).mockResolvedValueOnce([aVm('a', 'a', 'shut-off')])

		await vm.pollVms()
		expect(shown(vm)).toEqual(['Virtual Machines', 'tile:a', 'tile:b'])
		await vi.advanceTimersByTimeAsync(5000)

		expect(vm.vms).toEqual([aVm('a', 'a', 'shut-off')])
		AppSection.beforeUnmount.call({ ...vm, $EventBus: { $off: vi.fn() } })
	})

	it('(3) reads the VMs as soon as the card joins the grid, and drops them with it', () => {
		const pollVms = vi.fn()

		AppSection.watch.hasVmCard.call({ pollVms })

		expect(pollVms).toHaveBeenCalledTimes(1)
		expect(AppSection.computed.hasVmCard.call({ appList: [{ name: 'Virtual Machines' }] })).toBe(true)
		expect(AppSection.computed.hasVmCard.call({ appList: [{ name: 'Files' }] })).toBe(false)
	})

	it('(5) asks once at a time', async () => {
		let answer
		listVirtualMachines.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const vm = section(['Virtual Machines'])

		const first = vm.pollVms()
		vm.pollVms()
		answer([])
		await first

		expect(listVirtualMachines).toHaveBeenCalledTimes(1)
		clearTimeout(vm.vmPollTimer)
	})

	it('(5) does not ask while the tab is hidden, and asks again once it is shown', async () => {
		vi.useFakeTimers()
		listVirtualMachines.mockResolvedValue([])
		const vm = section(['Virtual Machines'])
		hide(true)

		await vm.pollVms()
		await vi.advanceTimersByTimeAsync(30000)
		expect(listVirtualMachines).not.toHaveBeenCalled()

		hide(false)
		await AppSection.methods.onVisibility.call(vm)
		expect(listVirtualMachines).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(5000)
		expect(listVirtualMachines).toHaveBeenCalledTimes(2)

		// hidden again: the timer is dropped
		hide(true)
		AppSection.methods.onVisibility.call(vm)
		await vi.advanceTimersByTimeAsync(30000)
		expect(listVirtualMachines).toHaveBeenCalledTimes(2)
	})

	it('(5) stops for good when the grid goes, timer and listener with it', async () => {
		vi.useFakeTimers()
		listVirtualMachines.mockResolvedValue([])
		const vm = section(['Virtual Machines'])
		vm.onVisibility = AppSection.methods.onVisibility.bind(vm)
		const removed = vi.spyOn(document, 'removeEventListener')
		await vm.pollVms()

		AppSection.beforeUnmount.call(Object.assign(vm, { $EventBus: { $off: vi.fn() } }))
		await vi.advanceTimersByTimeAsync(30000)

		expect(listVirtualMachines).toHaveBeenCalledTimes(1)
		expect(removed).toHaveBeenCalledWith('visibilitychange', vm.onVisibility)
		expect(vi.getTimerCount()).toBe(0)
		removed.mockRestore()
	})
})

// The tiles are not drop targets: an app is dropped among the apps only, so it
// never lands where the tiles are redrawn over it.
describe('app section VM tiles out of the drag', () => {
	const tileItem = { name: 'vm-tile:a', vmTile: true, vm: { id: 'a' } }
	const move = (vm, element, willInsertAfter = false) =>
		AppSection.methods.checkMove.call(vm, { relatedContext: { element }, willInsertAfter })

	it('(1) starts no drag on a tile, and lets its click through', () => {
		const options = AppSection.computed.dragOptions.call({})

		expect(options.filter).toBe('.vm-tile-item')
		expect(options.preventOnFilter).toBe(false)
	})

	it('(1) rejects a move over a tile', () => {
		expect(move({ vms: [{ id: 'a' }] }, tileItem)).toBe(false)
		expect(move({ vms: [{ id: 'a' }] }, tileItem, true)).toBe(false)
	})

	it('(1) rejects a drop right after the Virtual Machines card while tiles follow it', () => {
		const card = { name: 'Virtual Machines' }

		expect(move({ vms: [{ id: 'a' }] }, card, true)).toBe(false)
		expect(move({ vms: [{ id: 'a' }] }, card, false)).toBe(true)
		expect(move({ vms: [] }, card, true)).toBe(true)
	})

	it('(1) lets an app move among the apps', () => {
		expect(move({ vms: [{ id: 'a' }] }, { name: 'Files' })).toBe(true)
		expect(move({ vms: [{ id: 'a' }] }, { name: 'Files' }, true)).toBe(true)
	})
})

describe('app section VM tiles riding out a failed poll', () => {
	const aVm = (id, state = 'running') => ({ id, title: id, state })
	function section(vms = []) {
		const vm = { appList: [{ name: 'Virtual Machines' }], vms }
		vm.pollVms = AppSection.methods.pollVms.bind(vm)
		return vm
	}
	afterEach(() => {
		vi.useRealTimers()
		listVirtualMachines.mockReset()
	})
	const poll = async (vm) => {
		await vm.pollVms()
		clearTimeout(vm.vmPollTimer)
	}

	it('(2) keeps the last list through one and two failed polls, and drops it on the third', async () => {
		listVirtualMachines.mockRejectedValue(new Error('502'))
		const vm = section([aVm('a')])

		await poll(vm)
		expect(vm.vms).toEqual([aVm('a')])
		await poll(vm)
		expect(vm.vms).toEqual([aVm('a')])
		await poll(vm)
		expect(vm.vms).toEqual([])
	})

	it('(2) counts again from nothing once a poll works', async () => {
		const vm = section([aVm('a')])
		listVirtualMachines.mockRejectedValueOnce(new Error('502')).mockRejectedValueOnce(new Error('502'))
			.mockResolvedValueOnce([aVm('b')])
			.mockRejectedValueOnce(new Error('502')).mockRejectedValueOnce(new Error('502'))

		for (let i = 0; i < 5; i++) {
			await poll(vm)
		}

		expect(vm.vms).toEqual([aVm('b')])
	})

	it('(2) drops the list at once when the module is not there', async () => {
		listVirtualMachines.mockRejectedValue({ response: { status: 404 } })
		const vm = section([aVm('a')])

		await poll(vm)

		expect(vm.vms).toEqual([])
	})

	it('(2) drops the list at once when the card goes', async () => {
		const vm = section([aVm('a')])
		vm.appList = []

		await poll(vm)

		expect(vm.vms).toEqual([])
	})

	it('(4) leaves the list as it is when nothing changed', async () => {
		const vms = [aVm('a')]
		listVirtualMachines.mockResolvedValue([aVm('a')])
		const vm = section(vms)

		await poll(vm)

		expect(vm.vms).toBe(vms)
	})

	it('(4) gives up on a read that hangs after 15 s, counts it as failed and polls again', async () => {
		vi.useFakeTimers()
		listVirtualMachines.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue([aVm('b')])
		const vm = section([aVm('a')])

		vm.pollVms()
		await vi.advanceTimersByTimeAsync(15000)
		expect(vm.vms).toEqual([aVm('a')])
		expect(vm.vmPolling).toBe(false)
		expect(vm.vmFailures).toBe(1)

		await vi.advanceTimersByTimeAsync(5000)
		expect(listVirtualMachines).toHaveBeenCalledTimes(2)
		expect(vm.vms).toEqual([aVm('b')])
		clearTimeout(vm.vmPollTimer)
	})

	it('(5) declares its polling state when the grid is made', () => {
		const vm = { getList: vi.fn(), isMobile: () => false, $EventBus: { $on: vi.fn() }, pollVms: vi.fn(), onVisibility: vi.fn() }
		const added = vi.spyOn(document, 'addEventListener')

		AppSection.created.call(vm)
		clearInterval(vm.ListRefreshTimer)

		expect(vm).toMatchObject({ vmPollStopped: false, vmPolling: false, vmPollTimer: null, vmFailures: 0 })
		expect(added).toHaveBeenCalledWith('visibilitychange', vm.onVisibility)
		added.mockRestore()
	})
})
