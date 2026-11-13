// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareSection from './ShareSection.vue'
import i18n from '@/plugins/i18n'
import { apply, publicShare, publicShareApi, refresh } from '@/service/publicShare'
import { resetShareGuard, shareGuardApi } from '@/service/shareGuard'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))
vi.mock('@/service/publicShare', async () => {
	const { reactive } = await import('vue')
	return {
		publicShare: reactive({ status: null, ok: false }),
		publicShareApi: { setName: vi.fn(), unshare: vi.fn(), stopAll: vi.fn() },
		refresh: vi.fn(() => Promise.resolve()),
		apply: vi.fn(() => Promise.resolve()),
	}
})

const base = { supported: true, reason: '', name: 'mybox', host: 'mybox.relay.test', domain: 'relay.test', tos_url: 'https://le.test/tos', apps: [], cert: { not_after: null, pending: false, error: '' }, tunnel: { connected: false, error: '' } }
const JELLY = { name: 'jellyfin', label: 'Jellyfin', shared: true, url: 'https://jellyfin.mybox.relay.test', port: 8096, scheme: 'http', error: '' }
const OTHER = { name: 'nextcloud', label: 'Nextcloud', shared: false, url: '', port: 80, scheme: 'http', error: '' }
function show(status, ok = true) {
	publicShare.status = status
	publicShare.ok = ok
}

let wrapper
async function mountIt() {
	wrapper = mount(ShareSection, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
}
const button = label => wrapper.findAll('button').find(b => b.text() === label)
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))

describe('the public sharing section', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		show(null, false)
		resetShareGuard()
		vi.spyOn(shareGuardApi, 'view').mockResolvedValue({ data: { data: { supported: true } } })
	})
	afterEach(() => wrapper?.unmount())

	it('renders nothing on an old core', async () => {
		show(base, false)
		await mountIt()
		expect(refresh).toHaveBeenCalledWith({ force: true })
		expect(wrapper.text()).not.toContain('Public sharing')
	})

	it('renders nothing while remote access is off', async () => {
		show({ ...base, supported: false, reason: 'remote-access' })
		await mountIt()
		expect(wrapper.text()).toBe('')
	})

	it('says the relay cannot share', async () => {
		show({ ...base, supported: false, reason: 'relay', name: '' })
		await mountIt()
		expect(wrapper.text()).toContain('This relay does not support public sharing yet.')
		expect(wrapper.find('input[name=share-name]').exists()).toBe(false)
	})

	it('asks for a name first', async () => {
		show({ ...base, name: '' })
		await mountIt()
		expect(wrapper.text()).toContain('Choose the name of this box')
		expect(wrapper.text()).toContain('Your apps will answer at https://<app>.<name>.relay.test')
		expect(wrapper.find('input[name=share-name]').exists()).toBe(true)
	})

	it('lists the shared apps with their address', async () => {
		show({ ...base, apps: [JELLY, OTHER], tunnel: { connected: true, error: '' } })
		await mountIt()
		expect(wrapper.text()).toContain('Public name: mybox')
		expect(wrapper.find('a[href="https://jellyfin.mybox.relay.test"]').exists()).toBe(true)
		expect(button('Copy')).toBeTruthy()
		expect(wrapper.text()).not.toContain('Nextcloud')
	})

	it('lists a shared app that is gone', async () => {
		show({ ...base, apps: [{ ...JELLY, error: '' }] })
		await mountIt()
		expect(wrapper.text()).toContain('Jellyfin')
		expect(button('Stop sharing')).toBeTruthy()
	})

	it('says when no app is shared', async () => {
		show({ ...base, apps: [OTHER] })
		await mountIt()
		expect(wrapper.text()).toContain('No app is shared. Share one from its card on the home page.')
		expect(button('Stop all sharing')).toBeUndefined()
	})

	it('stops one app, and all after confirming', async () => {
		show({ ...base, apps: [JELLY] })
		await mountIt()
		await button('Stop sharing').trigger('click')
		await flushPromises()
		expect(publicShareApi.unshare).toHaveBeenCalledWith('jellyfin')
		expect(apply).toHaveBeenCalledTimes(1)
		await button('Stop all sharing').trigger('click')
		await flushPromises()
		expect(publicShareApi.stopAll).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('Stop sharing every app?')
		expect(document.body.textContent).toContain('The name mybox stays this box\'s.')
		dialogButton('Stop all sharing').click()
		await flushPromises()
		expect(publicShareApi.stopAll).toHaveBeenCalledTimes(1)
	})

	it('reads the protection again after a stop', async () => {
		show({ ...base, apps: [JELLY] })
		await mountIt()
		await button('Stop sharing').trigger('click')
		await flushPromises()
		expect(shareGuardApi.view).toHaveBeenCalledTimes(1)
	})

	it('shows the certificate and the tunnel', async () => {
		show({ ...base, apps: [JELLY], cert: { not_after: '2027-01-15T00:00:00Z', pending: false, error: '' }, tunnel: { connected: true, error: '' } })
		await mountIt()
		expect(wrapper.text()).toContain('Certificate valid until')
		expect(wrapper.text()).toContain('Connected to the relay')
	})
})
