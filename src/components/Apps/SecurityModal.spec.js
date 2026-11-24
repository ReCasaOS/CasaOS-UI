// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import SecurityModal from '@/components/Apps/SecurityModal.vue'
import { refresh, vulnScan, vulnScanApi } from '@/service/vulnScan'

vi.mock('@/service/vulnScan', async () => {
	const { reactive } = await import('vue')
	return {
		vulnScan: reactive({ apps: {}, ok: true }),
		refresh: vi.fn(() => Promise.resolve()),
		vulnScanApi: { app: vi.fn(), status: vi.fn(), scan: vi.fn() },
	}
})

// a near-empty table makes $t return its key, which is the English sentence
// (a key with a parameter must be in it: $t leaves a missing key uninterpolated)
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: {
			'Last scan: {date}': 'Last scan: {date}',
			'Vulnerability database of {date}': 'Vulnerability database of {date}',
			'The last scan stopped early: {reason}': 'The last scan stopped early: {reason}',
		},
	},
}))

const body = data => Promise.resolve({ data: { data } })
const finding = (id, severity, extra = {}) => ({ id, package: 'openssl', installed: '3.0.1', fixed: '3.0.9', severity, title: 'a flaw', url: `https://avd.aquasec.com/nvd/${id.toLowerCase()}`, ...extra })
const detail = images => ({ app: 'vaultwarden', images })
const image = (findings, extra = {}) => ({ image_id: 'sha256:aa', os_only: false, skipped: '', scanned_at: '2026-11-24T05:30:00Z', findings, ...extra })

async function open({ app = detail([image([finding('CVE-2026-1', 'CRITICAL'), finding('CVE-2026-2', 'HIGH')])]), status = { running: false, last_error: '', last_run: '2026-11-24T05:31:00Z', db_updated_at: '2026-11-23T19:02:50Z' } } = {}) {
	vulnScanApi.app.mockImplementation(() => body(app))
	vulnScanApi.status.mockImplementation(() => body(status))
	const wrapper = mount(SecurityModal, { props: { app: 'vaultwarden' }, global: { plugins: [Buefy, i18n] }, attachTo: document.body })
	await flushPromises()

	return wrapper
}

beforeEach(() => {
	vi.clearAllMocks()
	vulnScan.apps = { vaultwarden: { critical: 1, high: 1, actionable: true } }
})
afterEach(() => {
	document.body.innerHTML = ''
	vi.useRealTimers()
})

describe('the Security window of an app', () => {
	it('lists the vulnerabilities with the version that fixes each, the critical ones first as sent', async () => {
		const wrapper = await open()
		expect(vulnScanApi.app).toHaveBeenCalledWith('vaultwarden')
		const rows = wrapper.findAll('[data-finding]')
		expect(rows).toHaveLength(2)
		expect(rows[0].text()).toContain('CVE-2026-1')
		expect(rows[0].text()).toContain('openssl')
		expect(rows[0].text()).toContain('3.0.1')
		expect(rows[0].text()).toContain('3.0.9')
		expect(rows[0].text()).toContain('Critical')
		expect(rows[1].text()).toContain('High')
		wrapper.unmount()
	})

	it('says to update the app when an update is offered, and that none is when none is', async () => {
		let wrapper = await open()
		expect(wrapper.find('[data-advice]').text()).toBe('An update of this app is offered: install it to fix the critical ones.')
		wrapper.unmount()

		vulnScan.apps = { vaultwarden: { critical: 1, high: 1, actionable: false } }
		wrapper = await open()
		expect(wrapper.find('[data-advice]').text()).toBe('No update of this app is offered yet. Its publisher has to release an image with the fixes.')
		wrapper.unmount()
	})

	it('says so when nothing was found', async () => {
		vulnScan.apps = { vaultwarden: { critical: 0, high: 0, actionable: false } }
		const wrapper = await open({ app: detail([image([])]) })
		expect(wrapper.findAll('[data-finding]')).toHaveLength(0)
		expect(wrapper.find('[data-advice]').text()).toBe('No critical or high vulnerability with a fix was found.')
		wrapper.unmount()
	})

	it('says why an image was not scanned, and when Java libraries were not checked', async () => {
		const wrapper = await open({ app: detail([image([], { skipped: 'not enough room' }), image([], { image_id: 'sha256:bb', os_only: true })]) })
		const notes = wrapper.findAll('[data-note]').map(n => n.text())
		expect(notes).toEqual([
			'This image was not scanned: there is not enough room on the disk.',
			'The Java libraries of this image were not checked.',
		])
		wrapper.unmount()
	})

	it('links a vulnerability to its page only over https', async () => {
		const wrapper = await open({ app: detail([image([
			finding('CVE-2026-1', 'CRITICAL'),
			finding('CVE-2026-2', 'HIGH', { url: 'javascript:alert(1)' }),
			finding('CVE-2026-3', 'HIGH', { url: '' }),
		])]) })
		const links = wrapper.findAll('[data-finding] a')
		expect(links).toHaveLength(1)
		expect(links[0].attributes()).toMatchObject({ href: 'https://avd.aquasec.com/nvd/cve-2026-1', target: '_blank', rel: 'noopener noreferrer' })
		wrapper.unmount()
	})

	it('shows the date of the last scan and of the database', async () => {
		const wrapper = await open()
		expect(wrapper.find('[data-dates]').text()).toContain(new Date('2026-11-24T05:31:00Z').toLocaleString())
		expect(wrapper.find('[data-dates]').text()).toContain(new Date('2026-11-23T19:02:50Z').toLocaleDateString())
		wrapper.unmount()
	})

	it('starts a scan, waits for its end and reads the results again', async () => {
		const wrapper = await open()
		vi.useFakeTimers()
		vulnScanApi.scan.mockImplementation(() => body(null))
		vulnScanApi.status.mockImplementation(() => body({ running: true, last_error: '' }))

		await wrapper.find('[data-action="scan"]').trigger('click')
		await flushPromises()
		expect(vulnScanApi.scan).toHaveBeenCalledTimes(1)
		expect(wrapper.find('[data-action="scan"]').attributes('disabled')).toBeDefined()

		vulnScanApi.status.mockImplementation(() => body({ running: false, last_error: '', last_run: '2026-11-24T06:10:00Z' }))
		vulnScanApi.app.mockImplementation(() => body(detail([image([])])))
		await vi.advanceTimersByTimeAsync(5000)
		await flushPromises()

		expect(wrapper.find('[data-action="scan"]').attributes('disabled')).toBeUndefined()
		expect(wrapper.findAll('[data-finding]')).toHaveLength(0)
		expect(refresh).toHaveBeenCalledWith({ force: true })
		wrapper.unmount()
	})

	it('joins a scan that already runs instead of failing', async () => {
		const wrapper = await open()
		vulnScanApi.scan.mockImplementation(() => Promise.reject(Object.assign(new Error('conflict'), { response: { status: 409 } })))
		vulnScanApi.status.mockImplementation(() => body({ running: true, last_error: '' }))
		await wrapper.find('[data-action="scan"]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-error]').exists()).toBe(false)
		expect(wrapper.find('[data-action="scan"]').attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})

	it('shows why the last scan stopped early, and an error of its own when the module does not answer', async () => {
		let wrapper = await open({ status: { running: false, last_error: 'the box stayed busy' } })
		expect(wrapper.find('[data-last-error]').text()).toContain('the box stayed busy')
		wrapper.unmount()

		vulnScanApi.app.mockImplementation(() => Promise.reject(new Error('Network Error')))
		wrapper = mount(SecurityModal, { props: { app: 'vaultwarden' }, global: { plugins: [Buefy, i18n] }, attachTo: document.body })
		await flushPromises()
		expect(wrapper.find('[data-error]').exists()).toBe(true)
		wrapper.unmount()
	})
})
