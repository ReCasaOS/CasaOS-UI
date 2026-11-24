// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import copy from 'clipboard-copy'
import i18n from '@/plugins/i18n'
import store from '@/store'
import AIAccessOverview from '@/components/AIAccess/AIAccessOverview.vue'
import { mcpApi } from '@/service/mcp'

vi.mock('@/service/mcp', () => ({
	mcpApi: { status: vi.fn(), tokens: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))

// a near-empty table makes $t return its key, which is the English sentence
// (a key with a parameter must be in it: $t leaves a missing key uninterpolated)
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: {
			'Copied (token)': 'Copied',
			'Revoke {name}': 'Revoke {name}',
			'{read} read-only actions, {all} in all.': '{read} read-only actions, {all} in all.',
			'Revoke the token "{name}"? The assistant that uses it can no longer connect.': 'Revoke the token "{name}"? The assistant that uses it can no longer connect.',
		},
	},
}))

const SECRET = 'rcm_0123456789abcdefghijklmnopqrstuvwxyzABCDEF'
const status = { version: '0.1.0', endpoint: '/v2/mcp/server', actions: { read: 58, secret: 22, change: 61, danger: 29 }, unclassified: 0, tokens: 2 }
const laptop = { id: 'a1b2c3d4', name: 'Laptop', account: 1, level: 'read', created: '2026-11-24T10:00:00Z', last_used: '0001-01-01T00:00:00Z' }
const phone = { id: 'e5f6a7b8', name: 'Phone', account: 1, level: 'full', created: '2026-11-20T08:00:00Z', last_used: '2026-11-23T09:30:00Z' }
const answer = data => Promise.resolve({ data })
const refusal = code => Promise.reject(Object.assign(new Error(String(code)), { response: { status: code } }))

async function open({ tokens = [laptop, phone], box = status } = {}) {
	mcpApi.status.mockImplementation(() => answer(box))
	mcpApi.tokens.mockImplementation(() => answer(tokens))
	const wrapper = mount(AIAccessOverview, { global: { plugins: [Buefy, i18n] }, attachTo: document.body })
	await flushPromises()
	return wrapper
}

async function create(wrapper, name = 'Desktop') {
	await wrapper.find('[data-field="name"]').setValue(name)
	await wrapper.find('[data-form]').trigger('submit')
	await flushPromises()
}

beforeEach(() => {
	vi.clearAllMocks()
	window.happyDOM.setURL('https://box.example/')
	localStorage.clear()
	sessionStorage.clear()
})
afterEach(() => {
	document.body.innerHTML = ''
})

describe('the AI access window of the box', () => {
	it('says the limit of an assistant on the same network, and counts the actions', async () => {
		const wrapper = await open()
		expect(wrapper.text()).toContain('An assistant you choose can read and manage this box, with a token you create here.')
		expect(wrapper.text()).toContain('It works for an assistant running on a computer of the same network as this box.')
		expect(wrapper.find('[data-status]').text()).toBe('58 read-only actions, 170 in all.')
	})

	it('says the list of actions loads at the first connection while every count is zero', async () => {
		const wrapper = await open({ box: { ...status, actions: { read: 0, secret: 0, change: 0, danger: 0 } } })
		expect(wrapper.find('[data-status]').text()).toBe('The list of actions loads the first time an assistant connects.')
	})

	it('lists the tokens, a token never used saying Never', async () => {
		const wrapper = await open()
		const rows = wrapper.findAll('[data-token-row]')
		expect(rows).toHaveLength(2)
		expect(rows[0].text()).toContain('Laptop')
		expect(rows[0].text()).toContain('Read only')
		expect(rows[0].text()).toContain('Never')
		expect(rows[1].text()).toContain('Everything')
		expect(rows[1].text()).not.toContain('Never')
		expect(rows[1].text()).not.toContain('2026-11-23T09:30:00Z')
	})

	it('says so in one sentence when there is no token', async () => {
		const wrapper = await open({ tokens: [] })
		expect(wrapper.find('[data-empty]').text()).toBe('No token yet: no assistant can connect.')
		expect(wrapper.find('table').exists()).toBe(false)
	})

	it('creates a token that reads only unless the owner chooses otherwise', async () => {
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		expect(wrapper.find('[data-level="read"]').element.checked).toBe(true)
		expect(wrapper.find('[data-warning]').exists()).toBe(false)
		await create(wrapper, ' Desktop ')
		expect(mcpApi.create).toHaveBeenCalledWith('Desktop', 'read')
	})

	it('needs a name of 60 characters at most', async () => {
		const wrapper = await open()
		expect(wrapper.find('[data-field="name"]').attributes('maxlength')).toBe('60')
		expect(wrapper.find('[data-action="create"]').attributes('disabled')).toBeDefined()
		await wrapper.find('[data-field="name"]').setValue('   ')
		expect(wrapper.find('[data-action="create"]').attributes('disabled')).toBeDefined()
		await wrapper.find('[data-field="name"]').setValue('Desktop')
		expect(wrapper.find('[data-action="create"]').attributes('disabled')).toBeUndefined()
	})

	it('warns about the level Everything, tied to the level control, and sends full', async () => {
		mcpApi.create.mockImplementation(() => answer({ ...phone, token: SECRET }))
		const wrapper = await open()
		await wrapper.find('[data-level="full"]').setValue(true)
		const warning = wrapper.find('[data-warning]')
		expect(warning.text()).toBe('A token with this level can change and delete things on this box. A stolen token, or an assistant misled by a booby-trapped text, can erase data. Whether the assistant asks before acting depends on the assistant.')
		expect(wrapper.find('fieldset').attributes('aria-describedby')).toBe(warning.attributes('id'))
		await create(wrapper)
		expect(mcpApi.create).toHaveBeenCalledWith('Desktop', 'full')
	})

	it('shows the token once, with the command for the address of the page, and forgets it on Done', async () => {
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		await create(wrapper)
		expect(wrapper.find('[data-form]').exists()).toBe(false)
		expect(wrapper.text()).toContain('Copy it now: it will not be shown again.')
		expect(wrapper.find('[data-token]').element.value).toBe(SECRET)
		expect(wrapper.find('[data-token]').attributes('readonly')).toBeDefined()
		expect(wrapper.find('[data-command]').element.value).toBe(`claude mcp add --transport http recasaos https://box.example/v2/mcp/server --header "Authorization: Bearer ${SECRET}"`)
		expect(wrapper.find('[data-url]').element.value).toBe('https://box.example/v2/mcp/server')
		expect(wrapper.find('[data-header]').element.value).toBe(`Authorization: Bearer ${SECRET}`)
		expect(wrapper.find('[data-http]').exists()).toBe(false)

		await wrapper.find('[data-action="done"]').trigger('click')
		expect(wrapper.html()).not.toContain(SECRET)
		expect(wrapper.find('[data-form]').exists()).toBe(true)
	})

	it('keeps the token in the component only: not in the store, the browser storage or the console', async () => {
		const log = vi.spyOn(console, 'log')
		const error = vi.spyOn(console, 'error')
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		await create(wrapper)
		expect(JSON.stringify(store.state)).not.toContain(SECRET)
		expect(JSON.stringify({ ...localStorage })).not.toContain(SECRET)
		expect(JSON.stringify({ ...sessionStorage })).not.toContain(SECRET)
		expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain(SECRET)
		expect(window.location.href).not.toContain(SECRET)

		wrapper.unmount()
		expect(document.body.innerHTML).not.toContain(SECRET)
	})

	it('copies each value and says Copied, or says the copy failed', async () => {
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		await create(wrapper)
		await wrapper.find('[data-copy="command"]').trigger('click')
		await flushPromises()
		expect(copy).toHaveBeenCalledWith(wrapper.find('[data-command]').element.value)
		expect(wrapper.find('[data-copy="command"]').text()).toBe('Copied')
		expect(wrapper.find('[data-copy="url"]').text()).toBe('Copy')

		copy.mockRejectedValueOnce(new Error('denied'))
		await wrapper.find('[data-copy="header"]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-copy-error]').exists()).toBe(true)
	})

	it('warns that the token travels unencrypted only when the page is open over http', async () => {
		window.happyDOM.setURL('http://box.local/')
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		await create(wrapper)
		expect(wrapper.find('[data-http]').text()).toBe('On this address the token travels unencrypted on your network.')
		expect(wrapper.find('[data-url]').element.value).toBe('http://box.local/v2/mcp/server')
	})

	describe('when the box says its address on the local network', () => {
		const LAN = 'http://192.168.1.20/v2/mcp/server'
		const created = async (lan_url, page = 'https://box.example.com/') => {
			window.happyDOM.setURL(page)
			mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
			const wrapper = await open({ box: lan_url === undefined ? status : { ...status, lan_url } })
			await create(wrapper)
			return wrapper
		}

		it('uses it for the URL and the command, whatever address the page is open at', async () => {
			const wrapper = await created(LAN)
			expect(wrapper.find('[data-url]').element.value).toBe(LAN)
			expect(wrapper.find('[data-command]').element.value).toBe(`claude mcp add --transport http recasaos ${LAN} --header "Authorization: Bearer ${SECRET}"`)
			expect(wrapper.find('[data-address-note]').exists()).toBe(false)
		})

		it.each([
			['javascript:alert(1)'],
			['http://x/other'],
			['http://a b/v2/mcp/server'],
			['http://x/v2/mcp/server" ; rm -rf ~ "'],
			[42],
		])('falls back to the address of the page for %j', async (value) => {
			const wrapper = await created(value)
			expect(wrapper.find('[data-url]').element.value).toBe('https://box.example.com/v2/mcp/server')
			expect(wrapper.find('[data-command]').element.value).not.toContain('rm -rf')
		})

		it('puts nothing the shell would read in the command, whatever the box says', async () => {
			const wrapper = await created('http://x;id;b/v2/mcp/server')
			expect(wrapper.find('[data-command]').element.value).not.toContain(';')
			expect(wrapper.find('[data-url]').element.value).toBe('https://box.example.com/v2/mcp/server')
		})

		it('warns that the address may not work when it falls back on a name that is not local', async () => {
			const wrapper = await created(undefined)
			expect(wrapper.find('[data-address-note]').text()).toBe('This address may not work for an assistant: it must reach this box on your local network.')
		})

		it.each([['http://192.168.1.20/'], ['http://localhost:8080/'], ['http://casaos.local/'], ['http://nas/']])('does not warn on %s', async (page) => {
			const wrapper = await created(undefined, page)
			expect(wrapper.find('[data-address-note]').exists()).toBe(false)
		})

		it('says the token travels unencrypted by the scheme of the URL shown, not of the page', async () => {
			expect((await created(LAN)).find('[data-http]').exists()).toBe(true)
			expect((await created('https://10.0.0.5/v2/mcp/server', 'http://box.local/')).find('[data-http]').exists()).toBe(false)
		})
	})

	it('says a token could not be created, and keeps the form', async () => {
		mcpApi.create.mockImplementation(() => refusal(400))
		const wrapper = await open()
		await create(wrapper)
		expect(wrapper.find('[data-create-error]').text()).toBe('The token could not be created.')
		expect(wrapper.find('[data-form]').exists()).toBe(true)
	})

	it('asks before it revokes, naming the token, and revokes once confirmed', async () => {
		mcpApi.revoke.mockImplementation(() => Promise.resolve({ status: 204 }))
		const wrapper = await open()
		const confirm = vi.spyOn(wrapper.vm.$buefy.dialog, 'confirm').mockImplementation(() => {})
		await wrapper.find('[data-action="revoke"]').trigger('click')
		expect(mcpApi.revoke).not.toHaveBeenCalled()
		expect(confirm.mock.calls[0][0].message).toBe('Revoke the token "Laptop"? The assistant that uses it can no longer connect.')

		mcpApi.tokens.mockImplementation(() => answer([phone]))
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(mcpApi.revoke).toHaveBeenCalledWith('a1b2c3d4')
		expect(wrapper.findAll('[data-token-row]')).toHaveLength(1)
	})

	it('writes the name of a token as text in the confirmation', async () => {
		const wrapper = await open({ tokens: [{ ...laptop, name: '<img src=x onerror=1>' }] })
		const confirm = vi.spyOn(wrapper.vm.$buefy.dialog, 'confirm').mockImplementation(() => {})
		await wrapper.find('[data-action="revoke"]').trigger('click')
		expect(confirm.mock.calls[0][0].message).not.toContain('<img')
	})

	it('says the token still works when the revocation could not be saved', async () => {
		mcpApi.revoke.mockImplementation(() => refusal(500))
		const wrapper = await open()
		const confirm = vi.spyOn(wrapper.vm.$buefy.dialog, 'confirm').mockImplementation(() => {})
		await wrapper.find('[data-action="revoke"]').trigger('click')
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(wrapper.find('[data-revoke-error]').text()).toBe('The revocation could not be saved: the token still works.')
		expect(wrapper.findAll('[data-token-row]')).toHaveLength(2)
	})

	it('creates no more at 20 tokens, and says so', async () => {
		const tokens = Array.from({ length: 20 }, (_, i) => ({ ...laptop, id: `id${i}`, name: `Token ${i}` }))
		const wrapper = await open({ tokens })
		expect(wrapper.find('[data-limit]').text()).toBe('No more tokens can be created until one is revoked.')
		expect(wrapper.find('[data-action="create"]').exists()).toBe(false)
		expect(wrapper.find('[data-field="name"]').exists()).toBe(false)
	})

	it('keeps the new token on screen when the list cannot be read again, and reads it again on Retry', async () => {
		mcpApi.create.mockImplementation(() => answer({ ...laptop, token: SECRET }))
		const wrapper = await open()
		mcpApi.tokens.mockImplementation(() => refusal(503))
		await create(wrapper)
		expect(wrapper.find('[data-error]').exists()).toBe(false)
		expect(wrapper.find('[data-token]').element.value).toBe(SECRET)
		expect(wrapper.find('[data-command]').element.value).toContain(SECRET)
		expect(wrapper.find('[data-tokens-error]').text()).toContain('The tokens cannot be read for now.')

		mcpApi.tokens.mockImplementation(() => answer([laptop, phone]))
		await wrapper.find('[data-action="retry"]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-tokens-error]').exists()).toBe(false)
		expect(wrapper.findAll('[data-token-row]')).toHaveLength(2)
		expect(wrapper.find('[data-token]').element.value).toBe(SECRET)
	})

	it('says in the tokens card, not for the window, that the list cannot be read after a revoke', async () => {
		mcpApi.revoke.mockImplementation(() => Promise.resolve({ status: 204 }))
		const wrapper = await open()
		const confirm = vi.spyOn(wrapper.vm.$buefy.dialog, 'confirm').mockImplementation(() => {})
		await wrapper.find('[data-action="revoke"]').trigger('click')
		mcpApi.tokens.mockImplementation(() => refusal(503))
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(wrapper.find('[data-error]').exists()).toBe(false)
		expect(wrapper.find('[data-tokens-error]').exists()).toBe(true)
		expect(wrapper.find('[data-status]').exists()).toBe(true)
		expect(wrapper.find('[data-form]').exists()).toBe(true)
	})

	it('names the token on its Revoke button, and labels the last column', async () => {
		const wrapper = await open()
		expect(wrapper.find('[data-action="revoke"]').attributes('aria-label')).toBe('Revoke Laptop')
		expect(wrapper.find('th .is-sr-only').exists()).toBe(true)
	})

	it('says so when the module cannot be read', async () => {
		mcpApi.status.mockImplementation(() => refusal(502))
		mcpApi.tokens.mockImplementation(() => answer([]))
		const wrapper = mount(AIAccessOverview, { global: { plugins: [Buefy, i18n] }, attachTo: document.body })
		await flushPromises()
		expect(wrapper.find('[data-error]').exists()).toBe(true)
	})
})
