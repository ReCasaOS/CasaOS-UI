// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareAppModal from './ShareAppModal.vue'
import i18n from '@/plugins/i18n'
import { apply, publicShare, publicShareApi, refresh } from '@/service/publicShare'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))
vi.mock('@/components/settings/RemoteAccessModal.vue', () => ({ default: { name: 'RemoteAccessModal', render: () => null } }))
// apply puts the answer of the write in the store, as the real one does
vi.mock('@/service/publicShare', async () => {
	const { reactive } = await import('vue')
	const store = reactive({ status: null, ok: false })
	return {
		publicShare: store,
		publicShareApi: { share: vi.fn(), unshare: vi.fn() },
		refresh: vi.fn(() => Promise.resolve()),
		apply: vi.fn(async (call) => {
			const status = await call
			store.status = status
			return status
		}),
	}
})

const base = { supported: true, reason: '', name: 'mybox', host: 'mybox.relay.test', domain: 'relay.test', tos_url: 'https://le.test/tos', apps: [], cert: { not_after: null, pending: false, error: '' }, tunnel: { connected: false, error: '' } }
const JELLY = { name: 'jellyfin', label: 'Jellyfin', shared: false, url: '', port: 8096, scheme: 'http', error: '' }
const withApp = (app, extra = {}) => ({ ...base, apps: [app], ...extra })
function show(status, ok = true) {
	publicShare.status = status
	publicShare.ok = ok
}

let wrapper
async function mountIt() {
	wrapper = mount(ShareAppModal, { props: { appName: 'jellyfin', appTitle: 'Jellyfin' }, attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
}
const sw = () => wrapper.find('.switch input')
const WARNING = 'This app will be reachable by anyone who knows the address. Only its own login page protects it.'

describe('the share window of an app', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		show(null, false)
	})
	afterEach(() => wrapper?.unmount())

	it('says when the status cannot be read', async () => {
		await mountIt()
		expect(refresh).toHaveBeenCalledWith({ force: true })
		expect(wrapper.text()).toContain('Could not be read')
	})

	it('remote access off', async () => {
		show(withApp(JELLY, { supported: false, reason: 'remote-access' }))
		await mountIt()
		expect(wrapper.text()).toContain('Public sharing goes through remote access: turn it on first.')
		const open = wrapper.findAll('button').find(b => b.text() === 'Open Remote access')
		expect(open).toBeTruthy()
		const spy = vi.spyOn(wrapper.vm.$buefy.modal, 'open').mockImplementation(() => {})
		await open.trigger('click')
		await flushPromises()
		expect(wrapper.emitted('close')).toHaveLength(1)
		expect(spy).toHaveBeenCalledWith(expect.objectContaining({ hasModalCard: true, trapFocus: true, scroll: 'keep', animation: 'zoom-in' }))
		expect(publicShareApi.share).not.toHaveBeenCalled()
		expect(sw().exists()).toBe(false)
	})

	it('says why for the other reasons, without a button', async () => {
		show(withApp(JELLY, { supported: false, reason: 'relay' }))
		await mountIt()
		expect(wrapper.text()).toContain('This relay does not support public sharing yet.')
		expect(wrapper.text()).not.toContain('Open Remote access')
	})

	it('asks for the name first', async () => {
		show({ ...base, name: '' })
		await mountIt()
		expect(wrapper.find('input[name=share-name]').exists()).toBe(true)
		expect(sw().exists()).toBe(false)
	})

	it('warns before sharing, then shares', async () => {
		show(withApp(JELLY))
		let settle
		refresh.mockReturnValueOnce(new Promise((resolve) => {
			settle = resolve
		}))
		await mountIt()
		expect(sw().attributes('disabled')).toBeDefined()
		settle()
		await flushPromises()
		expect(sw().attributes('disabled')).toBeUndefined()
		expect(wrapper.text()).toContain(WARNING)
		expect(wrapper.text()).toContain('Some apps must know their public address')
		expect(wrapper.find('a[href="https://le.test/tos"]').exists()).toBe(true)
		publicShareApi.share.mockResolvedValue(withApp({ ...JELLY, shared: true, url: 'https://jellyfin.mybox.relay.test' }, { cert: { not_after: null, pending: true, error: '' } }))
		await sw().setValue(true)
		await flushPromises()
		expect(publicShareApi.share).toHaveBeenCalledWith('jellyfin')
		expect(wrapper.find('a[href="https://jellyfin.mybox.relay.test"]').exists()).toBe(true)
		expect(wrapper.findAll('button').some(b => b.text() === 'Copy')).toBe(true)
		expect(wrapper.text()).toContain('Certificate: being obtained')
		expect(wrapper.text()).not.toContain(WARNING)
		expect(sw().element.checked).toBe(true)
	})

	it('stops sharing', async () => {
		show(withApp({ ...JELLY, shared: true, url: 'https://jellyfin.mybox.relay.test' }))
		await mountIt()
		expect(sw().element.checked).toBe(true)
		expect(wrapper.text()).not.toContain(WARNING)
		publicShareApi.unshare.mockResolvedValue(withApp(JELLY))
		await sw().setValue(false)
		await flushPromises()
		expect(publicShareApi.unshare).toHaveBeenCalledWith('jellyfin')
		expect(wrapper.text()).toContain(WARNING)
		expect(wrapper.text()).toContain('By turning it on, you accept')
	})

	it('an app with an error', async () => {
		show(withApp({ ...JELLY, error: 'nextcloud is already shared at the same address' }))
		await mountIt()
		expect(sw().attributes('disabled')).toBeDefined()
		expect(wrapper.text()).toContain('nextcloud is already shared at the same address')
	})

	it('a refused share leaves the switch off', async () => {
		show(withApp(JELLY))
		await mountIt()
		publicShareApi.share.mockRejectedValue({ response: { status: 503, data: { message: 'x', data: { reason: 'relay' } } } })
		await sw().setValue(true)
		await flushPromises()
		expect(wrapper.text()).toContain('This relay does not support public sharing yet.')
		expect(sw().element.checked).toBe(false)
		expect(apply).toHaveBeenCalledTimes(1)
	})
})
