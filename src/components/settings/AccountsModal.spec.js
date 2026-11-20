// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountsModal from './AccountsModal.vue'
import getters from '@/store/getters'
import i18n from '@/plugins/i18n'

const api = vi.hoisted(() => ({ listAccounts: vi.fn(), createAccount: vi.fn(), deleteAccount: vi.fn(), setRights: vi.fn(), setFolders: vi.fn() }))
vi.mock('@/components/VirtualMachines/PathPicker.vue', () => ({ default: { render: () => null } }))
vi.mock('@/service/accounts', () => api)
const visibility = vi.hoisted(() => ({ listOrphans: vi.fn(), forgetApp: vi.fn() }))
vi.mock('@/service/visibility', () => visibility)

const ok = data => Promise.resolve({ data: { success: 200, data } })
const accounts = [
	{ id: 1, username: 'root', role: 'admin', totp_enabled: false },
	{ id: 2, username: 'ann', role: 'user', totp_enabled: false },
]

// the share accounts of Samba: ann has one
const samba = { getUsers: vi.fn(), createUser: vi.fn(), setUserPassword: vi.fn(), deleteUser: vi.fn() }
let prompted = null
let wrapper
let store
// the folder the picker answers, null for a picker closed without one
let picked = null
function open(role, roleConfirmed = true) {
	const state = reactive({ user: { role }, roleConfirmed })
	store = state
	wrapper = mount(AccountsModal, {
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$store: { state, getters: { get isAdmin() { return getters.isAdmin(state) } } },
				$api: { samba },
				$buefy: { dialog: { confirm: opts => opts.onConfirm(), prompt: opts => opts.onConfirm(prompted) }, modal: { open: (opts) => {
					if (picked !== null)
						Promise.resolve().then(() => opts.events.select(picked))
					return { close() {} }
				} } },
			},
		},
	})
	return flushPromises()
}

describe('the Accounts screen', () => {
	beforeEach(() => {
		visibility.listOrphans.mockReset().mockImplementation(() => ok([]))
		visibility.forgetApp.mockReset().mockImplementation(() => ok({}))
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts))
		api.createAccount.mockReset().mockImplementation(() => ok({}))
		api.deleteAccount.mockReset().mockImplementation(() => ok({}))
	})
	afterEach(() => wrapper?.unmount())

	it('lists accounts and shows a delete button except for the admin', async () => {
		await open('admin')

		expect(wrapper.text()).toContain('root')
		expect(wrapper.text()).toContain('ann')
		expect(wrapper.findAll('button.delete-account')).toHaveLength(1)

		await wrapper.find('button.delete-account').trigger('click')
		await flushPromises()
		expect(api.deleteAccount).toHaveBeenCalledWith(2)
		expect(api.listAccounts).toHaveBeenCalledTimes(2)
	})

	it('creating an account calls createAccount and refreshes the list', async () => {
		await open('admin')

		await wrapper.find('input[name="new-account-name"]').setValue('bob')
		await wrapper.find('input[name="new-account-password"]').setValue('secret1')
		await wrapper.find('form').trigger('submit')
		await flushPromises()

		expect(api.createAccount).toHaveBeenCalledWith('bob', 'secret1')
		expect(api.listAccounts).toHaveBeenCalledTimes(2)
	})

	it('says why the box refused', async () => {
		api.deleteAccount.mockImplementation(() => Promise.reject(Object.assign(new Error('409'), { response: { status: 409, data: { message: 'the admin cannot be deleted' } } })))
		await open('admin')
		await wrapper.find('button.delete-account').trigger('click')
		await flushPromises()

		expect(wrapper.text()).toContain('the admin cannot be deleted')
	})

	it('waits for the server to confirm the role of the stored account before it asks for the accounts', async () => {
		await open('admin', false)
		expect(api.listAccounts).not.toHaveBeenCalled()
		expect(wrapper.find('form').exists()).toBe(false)

		store.roleConfirmed = true
		await flushPromises()
		expect(api.listAccounts).toHaveBeenCalledTimes(1)
		expect(wrapper.find('form').exists()).toBe(true)
	})

	it('lists the visibility entries of apps no longer installed, and removes one once confirmed', async () => {
		visibility.listOrphans.mockImplementation(() => ok(['immich', 'jellyfin']))
		await open('admin')

		expect(wrapper.text()).toContain('immich')
		expect(wrapper.text()).toContain('jellyfin')
		const buttons = wrapper.findAll('button.remove-orphan')
		expect(buttons).toHaveLength(2)

		visibility.listOrphans.mockImplementation(() => ok(['jellyfin']))
		await buttons[0].trigger('click')
		await flushPromises()
		expect(visibility.forgetApp).toHaveBeenCalledWith('immich')
		expect(wrapper.findAll('button.remove-orphan')).toHaveLength(1)
	})

	it('removes no entry the owner did not confirm', async () => {
		visibility.listOrphans.mockImplementation(() => ok(['immich']))
		await open('admin')
		wrapper.vm.$buefy.dialog.confirm = () => {}
		await wrapper.find('button.remove-orphan').trigger('click')
		await flushPromises()

		expect(visibility.forgetApp).not.toHaveBeenCalled()
	})

	it('stops waiting and says so when the server could not confirm the role', async () => {
		await open('admin', false)
		store.roleFailed = true
		await flushPromises()

		expect(wrapper.find('.loading-overlay.is-active').exists()).toBe(false)
		expect(wrapper.text()).toContain('Your account could not be confirmed with the box. Reload the page to try again.')
		expect(api.listAccounts).not.toHaveBeenCalled()
	})

	it.each(['user', '', undefined, 'owner'])('the screen is not reachable when the role is %j', async (role) => {
		await open(role)

		expect(visibility.listOrphans).not.toHaveBeenCalled()
		expect(api.listAccounts).not.toHaveBeenCalled()
		expect(wrapper.find('form').exists()).toBe(false)
		expect(getters.isAdmin({ user: { role } })).toBe(false)
	})
})

describe('the Accounts screen, creating and deleting', () => {
	beforeEach(() => {
		i18n.global.locale = 'en_us'
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts))
		api.createAccount.mockReset().mockImplementation(() => ok({}))
		api.deleteAccount.mockReset().mockImplementation(() => ok({}))
	})
	afterEach(() => wrapper?.unmount())

	async function fill(name, password) {
		await wrapper.find('input[name="new-account-name"]').setValue(name)
		await wrapper.find('input[name="new-account-password"]').setValue(password)
	}

	it('sends one creation when Enter is pressed twice', async () => {
		let done
		api.createAccount.mockImplementation(() => new Promise((resolve) => {
			done = resolve
		}))
		await open('admin')
		await fill('bob', 'secret1')

		await wrapper.find('form').trigger('submit')
		await wrapper.find('form').trigger('submit')
		done({ data: { success: 200 } })
		await flushPromises()

		expect(api.createAccount).toHaveBeenCalledTimes(1)
	})

	it('asks for 6 characters at least, before the box is asked', async () => {
		await open('admin')
		await fill('bob', '12345')
		await wrapper.find('form').trigger('submit')
		await flushPromises()

		expect(api.createAccount).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The password must have at least 6 characters.')

		await fill('bob', '123456')
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(api.createAccount).toHaveBeenCalledWith('bob', '123456')
	})

	it('keeps Create disabled for a username of spaces only', async () => {
		await open('admin')
		await fill('   ', 'secret1')

		expect(wrapper.find('button.create-account').attributes('disabled')).toBeDefined()
		await fill('bob', 'secret1')
		expect(wrapper.find('button.create-account').attributes('disabled')).toBeUndefined()
	})

	it('shows a loading indicator while the stored role is not yet confirmed, and none once it is', async () => {
		await open('admin', false)
		expect(wrapper.find('.loading-overlay').exists()).toBe(true)
		wrapper.unmount()

		await open('admin', true)
		expect(wrapper.find('.loading-overlay').exists()).toBe(false)
	})

	it('trims the username', async () => {
		await open('admin')
		await fill('  bob  ', 'secret1')
		await wrapper.find('form').trigger('submit')
		await flushPromises()

		expect(api.createAccount).toHaveBeenCalledWith('bob', 'secret1')
	})

	it('puts the message of the box through the language files when it has the sentence, and shows it as it is when not', async () => {
		i18n.global.locale = 'fr_fr'
		api.createAccount.mockImplementation(() => Promise.reject(Object.assign(new Error('409'), { response: { data: { message: 'The account could not be created' } } })))
		await open('admin')
		await fill('bob', 'secret1')
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(wrapper.text()).toContain('Le compte n\'a pas pu être créé')

		api.createAccount.mockImplementation(() => Promise.reject(Object.assign(new Error('409'), { response: { data: { message: 'username is taken' } } })))
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(wrapper.text()).toContain('username is taken')
	})

	it.each([['en_us', 'Delete ann'], ['fr_fr', 'Supprimer ann']])('names the account on its Delete button (%s)', async (locale, label) => {
		i18n.global.locale = locale
		await open('admin')

		expect(wrapper.find('button.delete-account').text()).toBe(label)
	})

	it('ignores a reply of a list asked before the last one', async () => {
		const answers = []
		api.listAccounts.mockImplementation(() => new Promise(resolve => answers.push(resolve)))
		await open('admin')
		wrapper.vm.refresh()
		// the second asked answers first, the first one late
		answers[1]({ data: { data: [accounts[0]] } })
		await flushPromises()
		answers[0]({ data: { data: accounts } })
		await flushPromises()

		expect(wrapper.text()).not.toContain('ann')
	})
})

describe('the rights of an account', () => {
	// the box as the server keeps it: what PUT saved is what the list answers next
	let saved
	beforeEach(() => {
		i18n.global.locale = 'en_us'
		saved = { 2: ['vm'] }
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts.map(a => ({ ...a, rights: a.role === 'user' ? [...saved[a.id]] : [] }))))
		api.setRights.mockReset().mockImplementation((id, rights) => {
			saved[id] = rights
			return ok(rights)
		})
	})
	afterEach(() => wrapper?.unmount())

	const box = name => wrapper.find(`input[name="right-2-${name}"]`)

	it('has one box per module on a user row, ticked as the server says, and none on the owner row', async () => {
		await open('admin')

		expect(wrapper.findAll('input[name^="right-1-"]')).toHaveLength(0)
		for (const name of ['storage', 'vm', 'backups', 'fleet', 'system'])
			expect(box(name).exists()).toBe(true)
		expect(box('vm').element.checked).toBe(true)
		expect(box('storage').element.checked).toBe(false)
	})

	it('saves a ticked box with PUT and shows it ticked after the screen is opened again', async () => {
		await open('admin')
		await box('storage').setValue(true)
		await flushPromises()

		expect(api.setRights).toHaveBeenCalledWith(2, ['storage', 'vm'])

		wrapper.unmount()
		await open('admin')
		expect(box('storage').element.checked).toBe(true)
		expect(box('vm').element.checked).toBe(true)

		await box('vm').setValue(false)
		await flushPromises()
		expect(api.setRights).toHaveBeenLastCalledWith(2, ['storage'])
	})

	it('says why a save was refused and shows the rights the server kept', async () => {
		api.setRights.mockImplementation(() => Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { message: 'unknown right' } } })))
		await open('admin')
		await box('fleet').setValue(true)
		await flushPromises()

		expect(wrapper.text()).toContain('unknown right')
		expect(box('fleet').element.checked).toBe(false)
	})

	it('shows what was saved, or what was kept, even when the list cannot be read again', async () => {
		await open('admin')
		api.listAccounts.mockImplementation(() => Promise.reject(new Error('down')))
		await box('storage').setValue(true)
		await flushPromises()
		expect(box('storage').element.checked).toBe(true)

		api.setRights.mockImplementation(() => Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { message: 'unknown right' } } })))
		await box('fleet').setValue(true)
		await flushPromises()
		expect(box('fleet').element.checked).toBe(false)
		expect(box('storage').element.checked).toBe(true)
	})

	it('keeps the keyboard on the box that was ticked', async () => {
		await open('admin')
		box('backups').element.focus()
		await box('backups').setValue(true)
		await flushPromises()

		expect(document.activeElement?.getAttribute('name')).toBe('right-2-backups')
	})

	it('says under each box what it opens', async () => {
		await open('admin')

		const help = wrapper.findAll('.right-help').map(node => node.text())
		expect(help).toHaveLength(5)
		expect(help.join(' ')).toContain('No console')
		// each module is shown with its own right: no line sends to another box
		expect(help.filter(text => text.includes('System'))).toHaveLength(0)
		expect(help.filter(text => text.includes('new dashboard'))).toHaveLength(5)
	})
})

describe('the account getters', () => {
	it.each([
		[{ role: 'admin' }, 'storage', true],
		[{ role: 'admin' }, 'files', true],
		[{ role: 'user', rights: ['storage'] }, 'storage', true],
		[{ role: 'user', rights: ['storage'] }, 'vm', false],
		[{ role: 'user', rights: [] }, 'system', false],
		[{ role: 'user' }, 'system', false],
		[{ role: 'user', rights: 'storage' }, 'storage', false],
		[{ role: '', rights: ['vm'] }, 'vm', false],
		[{ role: 'owner', rights: ['vm'] }, 'vm', false],
		[{ rights: ['vm'] }, 'vm', false],
	])('canReadModule of %j for %j is %j', (user, name, expected) => {
		expect(getters.canReadModule({ user })(name)).toBe(expected)
	})

	it.each([['admin', true], ['user', false], ['', false], [undefined, false], ['owner', false]])('role %j: canWrite and isAdmin are %j', (role, expected) => {
		const state = { user: { role } }
		expect(getters.canWrite(state)).toBe(expected)
		expect(getters.isAdmin(state)).toBe(expected)
		expect(getters.canReadModule(state)('files')).toBe(expected)
	})

	describe('the folders of an account', () => {
		const withFolders = folders => [accounts[0], { ...accounts[1], folders }]
		beforeEach(() => {
			api.setFolders.mockReset().mockImplementation((id, folders) => ok(folders))
		})

		it('says Files is closed to an account with no folder, and gives one picked, to read', async () => {
			await open('admin')
			expect(wrapper.find('[data-folders="2"]').text()).toContain('Files stays closed')
			expect(wrapper.find('[data-folders="1"]').exists()).toBe(false) // the owner reaches everything

			picked = '/DATA/Kids'
			await wrapper.find('[data-folders="2"] button.add-folder').trigger('click')
			await flushPromises()
			expect(api.setFolders).toHaveBeenCalledWith(2, [{ path: '/DATA/Kids', write: false }])
		})

		it('lets a folder be written, and takes one away', async () => {
			api.listAccounts.mockImplementation(() => ok(withFolders([{ path: '/DATA/Kids', write: false }, { path: '/DATA/Media', write: false }])))
			await open('admin')

			await wrapper.find('[data-folder="/DATA/Kids"] select').setValue('write')
			await flushPromises()
			expect(api.setFolders).toHaveBeenLastCalledWith(2, [{ path: '/DATA/Kids', write: true }, { path: '/DATA/Media', write: false }])

			await wrapper.find('[data-folder="/DATA/Media"] button.remove-folder').trigger('click')
			await flushPromises()
			expect(api.setFolders).toHaveBeenLastCalledWith(2, [{ path: '/DATA/Kids', write: false }])
		})

		it('refuses a folder inside or around one already given, before asking the box', async () => {
			api.listAccounts.mockImplementation(() => ok(withFolders([{ path: '/DATA/Kids', write: true }])))
			await open('admin')

			for (const path of ['/DATA/Kids', '/DATA/Kids/school', '/DATA']) {
				picked = path
				await wrapper.find('[data-folders="2"] button.add-folder').trigger('click')
				await flushPromises()
			}
			expect(api.setFolders).not.toHaveBeenCalled()
			expect(wrapper.text()).toContain('inside or around')
		})
	})

	describe('the network shares of an account', () => {
		beforeEach(() => {
			samba.getUsers.mockReset().mockImplementation(() => ok([]))
			samba.createUser.mockReset().mockImplementation(() => ok({}))
			samba.setUserPassword.mockReset().mockImplementation(() => ok({}))
			samba.deleteUser.mockReset().mockImplementation(() => ok({}))
			// fresh rows: another test may have given ann folders on the shared fixture
			api.listAccounts.mockImplementation(() => ok(accounts.map(a => ({ ...a, folders: [] }))))
		})

		it('gives an account network access under its name, with a password of its own', async () => {
			await open('admin')
			expect(wrapper.find('[data-network="2"]').text()).toContain('No network access.')
			expect(wrapper.find('[data-network="1"]').exists()).toBe(false)

			prompted = 'net-pass-1'
			samba.getUsers.mockImplementation(() => ok(['ann']))
			await wrapper.find('[data-network="2"] button.give-network').trigger('click')
			await flushPromises()
			expect(samba.createUser).toHaveBeenCalledWith({ username: 'ann', password: 'net-pass-1' })
			expect(wrapper.find('[data-network="2"] button.remove-network').exists()).toBe(true)
		})

		it('changes the network password and removes the access', async () => {
			samba.getUsers.mockImplementation(() => ok(['ann']))
			await open('admin')

			prompted = 'other-pass'
			await wrapper.find('[data-network="2"] button.network-password').trigger('click')
			await flushPromises()
			expect(samba.setUserPassword).toHaveBeenCalledWith('ann', 'other-pass')

			await wrapper.find('[data-network="2"] button.remove-network').trigger('click')
			await flushPromises()
			expect(samba.deleteUser).toHaveBeenCalledWith('ann')
		})

		it('offers to open the Files folders on the network only to an account that has some', async () => {
			samba.getUsers.mockImplementation(() => ok(['ann']))
			await open('admin')
			expect(wrapper.find('[data-network="2"] button.use-folders').exists()).toBe(false)

			api.listAccounts.mockImplementation(() => ok([accounts[0], { ...accounts[1], folders: [{ path: '/DATA/Kids', write: true }] }]))
			await wrapper.vm.refresh()
			await flushPromises()
			expect(wrapper.find('[data-network="2"] button.use-folders').exists()).toBe(true)
		})

		it('says when the name of an account cannot be a network account', async () => {
			api.listAccounts.mockImplementation(() => ok([accounts[0], { id: 3, username: 'Anne Marie', role: 'user', totp_enabled: false }]))
			await open('admin')
			expect(wrapper.find('[data-network="3"]').text()).toContain('cannot be a network account')
			expect(wrapper.find('[data-network="3"] button.give-network').exists()).toBe(false)
		})
	})
})
