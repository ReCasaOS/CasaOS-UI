// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import AppCard from '@/components/Apps/AppCard.vue'
import cTooltip from '@/components/basicComponents/tooltip/tooltip.vue'

// require.context has no Vite equivalent; a near-empty table makes $t return its key.
// The one entry is the message the update failure needs: $t leaves a MISSING key
// uninterpolated, which would hide whether the backend's reason reaches the toast.
// It maps to itself, exactly as en_US.json does.
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: {
			'Updating {name} failed: {reason}': 'Updating {name} failed: {reason}',
			'{name} now runs the image that was just pulled.': '{name} now runs the image that was just pulled.',
			'{name} already runs the newest image, so it was left as it is.': '{name} already runs the newest image, so it was left as it is.',
			'Could not check whether a newer image exists for {name}. It keeps the image it has.': 'Could not check whether a newer image exists for {name}. It keeps the image it has.',
		},
	},
}))

async function card(item, mocks = {}) {
	// mount, not shallowMount: the badge sits in a Buefy tooltip's default slot,
	// and a stub does not render its slots
	const wrapper = mount(AppCard, {
		props: { item: { name: 'syncthing', app_type: 'v2app', status: 'running', title: { en_us: 'Syncthing' }, ...item } },
		global: {
			plugins: [Buefy, i18n],
			provide: { homeShowFiles: () => {}, openAppStore: () => {} },
			mocks: { $baseIp: 'localhost', ...mocks },
		},
		// the card's menu is rendered with append-to-body, so it lands outside
		// the wrapper and has to be looked for in the document
		attachTo: document.body,
	})
	// the NEW marker is read from sessionStorage in mounted(), one tick after
	// the first render
	await nextTick()

	return wrapper
}

// A failed assertion skips the unmount that follows it, and the button tests below
// look at the whole document, so one broken card left behind would make them pass
// on someone else's markup.
afterEach(() => {
	document.body.innerHTML = ''
})

function badges(wrapper) {
	return wrapper.findAllComponents(cTooltip).map(c => c.props('content'))
}

describe('app card update badge', () => {
	it('marks an app the last image check found something newer for', async () => {
		const wrapper = await card({ update_available: true })
		expect(badges(wrapper)).toEqual(['Update available'])
		wrapper.unmount()
	})

	it('says nothing about an app that has not been checked', async () => {
		// absent is not false: nobody has looked, and a badge either way would be a
		// claim this app cannot back up
		const wrapper = await card({})
		expect(badges(wrapper)).toEqual([])
		wrapper.unmount()
	})

	it('says nothing about an app that is up to date', async () => {
		const wrapper = await card({ update_available: false })
		expect(badges(wrapper)).toEqual([])
		wrapper.unmount()
	})

	it('does not stack the update badge on top of the NEW marker', async () => {
		// both are absolutely positioned over the icon, so only one may render
		sessionStorage.setItem('newAppTag', JSON.stringify(['syncthing']))
		const wrapper = await card({ update_available: true })
		expect(badges(wrapper)).toEqual(['NEW'])
		sessionStorage.removeItem('newAppTag')
		wrapper.unmount()
	})
})

describe('app card git badge', () => {
	// the grid's item for a git app no deployment has given a container
	const withoutContainer = { name: 'jarvis', app_type: 'v2app', status: '', title: { en_us: 'jarvis' }, git: { new_commits: false, state: 'build_failed', deployed: false } }

	it('shows the state of a git app, in red when it failed', async () => {
		const wrapper = await card({ git: { state: 'build_failed', new_commits: true } })
		expect(badges(wrapper)).toEqual(['Build failed'])
		expect(wrapper.findComponent(cTooltip).props('modal')).toBe('is-danger')
		wrapper.unmount()
	})

	it('says new commits wait on an idle git app', async () => {
		const wrapper = await card({ git: { state: 'idle', new_commits: true } })
		expect(badges(wrapper)).toEqual(['New commits'])
		expect(wrapper.findComponent(cTooltip).props('modal')).toBe('is-success')
		wrapper.unmount()
	})

	it('says nothing of an idle git app with nothing new', async () => {
		const wrapper = await card({ git: { state: 'idle', new_commits: false } })
		expect(badges(wrapper)).toEqual([])
		wrapper.unmount()
	})

	it('offers a git app with no container only its panel and its deletion', async () => {
		const wrapper = await card(withoutContainer)
		expect([...document.body.querySelectorAll('button')].map(b => b.textContent.trim())).toEqual(['Setting', 'Delete'])
		wrapper.unmount()
	})

	it('opens the panel of a git app with no container, which has nothing to start', async () => {
		const wrapper = await card(withoutContainer, { $messageBus: () => {} })
		wrapper.vm.openApp(wrapper.props('item'))
		expect(wrapper.emitted('configApp')).toEqual([[wrapper.props('item'), true]])
		wrapper.unmount()
	})

	it('deletes a git app with no container through its own route, once confirmed', async () => {
		const confirm = vi.fn()
		const remove = vi.fn().mockResolvedValue({ data: {} })
		const wrapper = await card(withoutContainer, { $buefy: { dialog: { confirm } }, $api: { gitApps: { remove } } })
		document.body.querySelectorAll('button').forEach((b) => {
			if (b.textContent.trim() === 'Delete')
				b.click()
		})
		expect(remove).not.toHaveBeenCalled()

		await confirm.mock.calls[0][0].onConfirm()
		expect(remove).toHaveBeenCalledWith('jarvis')
		expect(wrapper.emitted('updateState')).toHaveLength(1)
		wrapper.unmount()
	})

	it('keeps the whole menu of a git app whose first deployment left containers', async () => {
		const wrapper = await card({ ...withoutContainer, status: 'exited' })
		const labels = [...document.body.querySelectorAll('button')].map(b => b.textContent.trim())
		expect(labels).toContain('Uninstall')
		expect(labels).not.toContain('Delete')
		wrapper.unmount()
	})

	it('puts a git state before the image badge, and the NEW marker before both', async () => {
		const building = await card({ git: { state: 'building', new_commits: false }, update_available: true })
		expect(badges(building)).toEqual(['Building'])
		building.unmount()

		sessionStorage.setItem('newAppTag', JSON.stringify(['syncthing']))
		const fresh = await card({ git: { state: 'building', new_commits: false } })
		expect(badges(fresh)).toEqual(['NEW'])
		sessionStorage.removeItem('newAppTag')
		fresh.unmount()
	})
})

describe('app card update button', () => {
	function offersUpdate() {
		return [...document.body.querySelectorAll('button')]
			.some(b => b.textContent.includes('Check then update'))
	}

	it('offers the update to an app installed from a store', async () => {
		const wrapper = await card({ is_uncontrolled: false })
		expect(offersUpdate()).toBe(true)
		wrapper.unmount()
	})

	it('offers it to an imported app too', async () => {
		// for those the update is a pull of the tags they already name, which is the
		// only kind of update they can have; before this they had no update path at all
		const wrapper = await card({ is_uncontrolled: true })
		expect(offersUpdate()).toBe(true)
		wrapper.unmount()
	})
})

describe('imported container', () => {
	// an adopted container is keyed by its Docker ID, and carries its Docker name
	// as the only title the grid has for it
	const imported = { name: 'ab12cd34ef56', app_type: 'container', title: { en_us: 'plex' } }

	function labels() {
		return [...document.body.querySelectorAll('button')].map(b => b.textContent.trim())
	}

	function offersRecreate() {
		return labels().some(l => l.includes('Pull image and recreate'))
	}

	// the card's menu and the confirmation dialog are both appended to the body
	function click(label) {
		document.body.querySelectorAll('button').forEach((b) => {
			if (b.textContent.trim() === label)
				b.click()
		})
	}

	async function recreateSpy(item) {
		const recreateContainerByID = vi.fn(() => Promise.resolve({}))
		const wrapper = await card(item, {
			$openAPI: { appManagement: { container: { recreateContainerByID } } },
		})
		return { wrapper, recreateContainerByID }
	}

	it('offers to pull and recreate a container CasaOS did not install', async () => {
		const wrapper = await card(imported)
		expect(offersRecreate()).toBe(true)
		wrapper.unmount()
	})

	it('offers it to no other kind of app', async () => {
		// the endpoint takes a raw container ID and is not compose-aware: run on a
		// container of a compose app it would leave the project's own state behind
		for (const app_type of ['v2app', 'v1app', 'LinkApp']) {
			const wrapper = await card({ app_type })
			expect(offersRecreate(), app_type).toBe(false)
			wrapper.unmount()
		}
	})

	it('does not offer it for a container a compose project owns', async () => {
		// app_type is 'container' for anything the backend's compose list did not
		// claim, and that list skips a project whose config file it cannot read -- a
		// Portainer or Dockge stack lands here with app_type 'container'. Recreating
		// one of its containers clones it out of the project and leaves the project's
		// state behind, so the project label the container carries has to win.
		const wrapper = await card({ ...imported, compose_project: 'immich' })
		expect(offersRecreate()).toBe(false)
		wrapper.unmount()
	})

	it('offers a compose-owned container the one thing it can do', async () => {
		// It used to have no menu at all: with the recreate refused, every remaining
		// entry was for an app CasaOS installed. That left these cards with no way to
		// find out what they even were, which is what the details panel is for --
		// and it is still the only entry, because everything else would act on a
		// project this dashboard does not manage.
		const wrapper = await card({ ...imported, compose_project: 'immich' })
		expect(wrapper.find('.action-btn').exists()).toBe(true)
		expect(labels()).toEqual(['Details'])
		wrapper.unmount()
	})

	it('offers an imported container nothing it cannot do', async () => {
		// Open, Uninstall and the start/stop pair all route through code that only
		// handles v1 and v2 apps
		const wrapper = await card(imported)
		expect(labels()).toEqual(['Details', 'Pull image and recreate'])
		wrapper.unmount()
	})

	it('recreates nothing until the dialog is confirmed', async () => {
		const { wrapper, recreateContainerByID } = await recreateSpy(imported)

		click('Pull image and recreate')
		await nextTick()
		expect(recreateContainerByID).not.toHaveBeenCalled()

		click('Cancel')
		await nextTick()
		expect(recreateContainerByID).not.toHaveBeenCalled()
		expect(wrapper.vm.isRecreating).toBe(false)
		wrapper.unmount()
	})

	it('asks for a pull, no force, and a tag of its own', async () => {
		const { wrapper, recreateContainerByID } = await recreateSpy(imported)

		click('Pull image and recreate')
		await nextTick()
		click('Recreate container')
		await nextTick()

		// pull on, force off: without a newer image there is nothing to gain from
		// destroying a container whose definition exists nowhere else. The tag rides
		// along as a query parameter and comes back on this recreate's events.
		expect(recreateContainerByID).toHaveBeenCalledWith('ab12cd34ef56', true, undefined, {
			params: { 'recreate:container:id': 'ab12cd34ef56' },
		})
		expect(wrapper.vm.isRecreating).toBe(true)
		wrapper.unmount()
	})

	it('words the confirmation as both halves of what a recreate does', async () => {
		// A copy check, not a guarantee: what the clone keeps is decided backend-side.
		// It is here so the dialog cannot quietly go back to promising only the good
		// half -- the writable layer does not survive, and the sentence has to say so.
		const { wrapper } = await recreateSpy(imported)

		click('Pull image and recreate')
		await nextTick()

		const dialog = document.body.textContent
		expect(dialog).toContain('volumes and bind mounts are carried over')
		expect(dialog).toContain('anything written elsewhere inside the container is lost')
		wrapper.unmount()
	})

	it('follows the recreate by the tag it sent, not by the name the events carry', async () => {
		const wrapper = await card(imported, { $EventBus: { $emit: () => {} } })
		const updateEnd = wrapper.vm.$options.sockets['app:update-end']
		wrapper.vm.isRecreating = true

		// another app finishing an update is not our recreate
		updateEnd.call(wrapper.vm, { Properties: { 'app:name': 'plex', 'recreate:container:id': '99ffee00' } })
		expect(wrapper.vm.isRecreating).toBe(true)

		// app:name is the container's `name` LABEL when it has one, and Config.Labels
		// carries what the image declared: for any UBI-derived image the event names
		// the image and never the container. The tag still identifies the recreate.
		updateEnd.call(wrapper.vm, { Properties: { 'app:name': 'ubi9/nginx-120', 'recreate:container:id': 'ab12cd34ef56' } })
		expect(wrapper.vm.isRecreating).toBe(false)
		// the recreate leaves a new container with a new ID behind, so the grid the
		// card came from has to be read again
		expect(wrapper.emitted('updateState')).toHaveLength(1)
		wrapper.unmount()
	})

	it('reports the failure whichever of the two events lands first', async () => {
		// the backend publishes update-error from a goroutine and update-end from a
		// defer, so the order is a race. Gating on isRecreating meant whichever arrived
		// first cleared the flag and the second was dropped: a recreate that pulled and
		// then failed to clone reported nothing at all, and the spinner just stopped.
		const open = vi.fn()
		const wrapper = await card(imported, { $buefy: { toast: { open } }, $EventBus: { $emit: () => {} } })
		wrapper.vm.isRecreating = true

		const fire = (event, Properties) =>
			wrapper.vm.$options.sockets[event].call(wrapper.vm, { Properties })

		// update-end first, carrying a pull that worked and so saying nothing itself
		fire('app:update-end', { 'recreate:container:id': 'ab12cd34ef56', 'docker:image:updated': 'true' })
		expect(open).not.toHaveBeenCalled()

		fire('app:update-error', { 'recreate:container:id': 'ab12cd34ef56', 'message': 'no space left on device' })
		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toContain('no space left on device')
		expect(open.mock.calls[0][0].type).toBe('is-danger')
		wrapper.unmount()
	})
	it('stops waiting when the recreate reports an error', async () => {
		const wrapper = await card(imported)
		wrapper.vm.isRecreating = true

		wrapper.vm.$options.sockets['app:update-error'].call(wrapper.vm, {
			Properties: { 'recreate:container:id': 'ab12cd34ef56', 'message': 'no space left on device' },
		})
		expect(wrapper.vm.isRecreating).toBe(false)
		wrapper.unmount()
	})
})

describe('app store update outcome', () => {
	// the App Store update returns 200 straight away and reports what happened over
	// the socket: update-error carries the reason, update-end carries nothing at all
	async function updating(item = {}) {
		const open = vi.fn()
		const wrapper = await card(item, { $buefy: { toast: { open } } })
		wrapper.vm.isUpdating = true
		const fire = (event, Properties) =>
			wrapper.vm.$options.sockets[event].call(wrapper.vm, { Properties })
		return { wrapper, open, fire }
	}

	it('shows the reason a failed update gave, and stops waiting', async () => {
		const { wrapper, open, fire } = await updating()

		fire('app:update-error', { 'app:name': 'syncthing', 'message': 'no space left on device' })

		expect(wrapper.vm.isUpdating).toBe(false)
		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].type).toBe('is-danger')
		expect(open.mock.calls[0][0].message).toBe('Updating Syncthing failed: no space left on device')
		wrapper.unmount()
	})

	it('leaves another app\'s failure to that app\'s card', async () => {
		const { wrapper, open, fire } = await updating()

		fire('app:update-error', { 'app:name': 'jellyfin', 'message': 'no space left on device' })

		expect(open).not.toHaveBeenCalled()
		expect(wrapper.vm.isUpdating).toBe(true)
		wrapper.unmount()
	})

	it('claims nothing on an update-end that says nothing', async () => {
		// a compose update publishes this whether it worked or failed; the green
		// "latest version" toast used to fire on both
		const { wrapper, open, fire } = await updating()

		fire('app:update-end', { 'app:name': 'syncthing' })

		expect(wrapper.vm.isUpdating).toBe(false)
		expect(open).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('still says an app is up to date when the event says so', async () => {
		const { wrapper, open, fire } = await updating()

		fire('app:update-end', { 'app:name': 'syncthing', 'docker:image:updated': 'false' })

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].type).toBe('is-success')
		wrapper.unmount()
	})

	it('leaves the word on a successful update to the section that reloads the grid', async () => {
		// app:updated is the only thing a compose update ends with, and the card is
		// about to be replaced by the reloaded one: two toasts for one update
		const { wrapper, open, fire } = await updating()

		fire('app:update-end', { 'app:name': 'syncthing', 'app:updated': 'true' })

		expect(open).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})

describe('what a finished recreate may claim', () => {
	const imported = { name: 'ab12cd34ef56', app_type: 'container', title: { en_us: 'plex' } }

	async function recreated(properties) {
		const open = vi.fn()
		const wrapper = await card(imported, { $buefy: { toast: { open } }, $EventBus: { $emit: () => {} } })
		wrapper.vm.isRecreating = true
		wrapper.vm.$options.sockets['app:update-end'].call(wrapper.vm, {
			Properties: { 'recreate:container:id': 'ab12cd34ef56', ...properties },
		})
		return { wrapper, open }
	}

	it('says the container runs the new image only when it was really replaced', async () => {
		const { wrapper, open } = await recreated({ 'app:updated': 'true', 'docker:image:updated': 'true' })

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe('plex now runs the image that was just pulled.')
		expect(open.mock.calls[0][0].type).toBe('is-success')
		wrapper.unmount()
	})

	it('says nothing newer exists only when the check said so', async () => {
		const { wrapper, open } = await recreated({ 'docker:image:updated': 'false' })

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe('plex already runs the newest image, so it was left as it is.')
		wrapper.unmount()
	})

	it('does not read a failed pull as proof that nothing newer exists', async () => {
		// the pull error is swallowed backend-side and the recreate is skipped, so the
		// event carries neither property: an unreachable registry arriving as green
		// "nothing newer" is how a host stops hearing about updates
		const { wrapper, open } = await recreated({})

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe('Could not check whether a newer image exists for plex. It keeps the image it has.')
		expect(open.mock.calls[0][0].type).toBe('is-warning')
		wrapper.unmount()
	})

	it('claims nothing when the image was pulled but the container was not replaced', async () => {
		// app:update-error carries the reason; a success toast beside it is the lie
		const { wrapper, open } = await recreated({ 'docker:image:updated': 'true' })

		expect(open).not.toHaveBeenCalled()
		expect(wrapper.vm.isRecreating).toBe(false)
		wrapper.unmount()
	})
})

describe('a stack CasaOS cannot load', () => {
	const reason = 'validating /opt/jarvis/docker-compose.yml: services.jarvis Additional property gpus is not allowed'
	const container = { name: 'ab12cd34ef56', app_type: 'container', title: { en_us: 'jarvis-jarvis-1' }, compose_project: 'jarvis' }

	it('says so on the card, with the reason on hover', async () => {
		const wrapper = await card({ ...container, compose_load_error: reason })
		const line = wrapper.findAll('p').find(p => p.text() === 'CasaOS cannot read its compose file.')
		expect(line).toBeTruthy()
		expect(line.attributes('title')).toBe(reason)
	})

	it('says nothing for a stack that loaded', async () => {
		const wrapper = await card(container)
		expect(wrapper.text()).not.toContain('CasaOS cannot read its compose file.')
	})
})
