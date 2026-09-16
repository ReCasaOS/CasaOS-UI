// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import AppSection from '@/components/Apps/AppSection.vue'
import GitAppModal from '@/components/Apps/GitAppModal.vue'

// The section pulls in the app panel, which imports lottie-web: it paints into a
// canvas the moment it is imported and happy-dom has no 2d context, so the import
// itself throws. Nothing here renders a template.
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

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
