// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UpdateBlockedModal from './UpdateBlockedModal.vue'

// $t fills its placeholders, so the sentence checks the count it was given
const $t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name])

const vuln = (n, extra = {}) => ({ id: `CVE-2026-${n}`, package: 'openssl', fixed: '3.0.15', title: 'buffer overflow', url: `https://avd.aquasec.com/nvd/cve-2026-${n}`, ...extra })

function open(props = {}, updateComposeApp = vi.fn(() => Promise.resolve({ status: 200 }))) {
	const wrapper = mount(UpdateBlockedModal, {
		props: { name: 'jellyfin', title: 'Jellyfin', images: [], canOverride: true, ...props },
		global: {
			mocks: { $t, $openAPI: { appManagement: { compose: { updateComposeApp } } } },
			stubs: {
				'b-message': { template: '<div class="message"><slot /></div>' },
				'b-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot /></button>' },
			},
		},
	})
	return { wrapper, updateComposeApp }
}

const buttons = wrapper => wrapper.findAll('button')
const button = (wrapper, label) => buttons(wrapper).find(b => b.text() === label)

describe('the blocked update window says what was blocked', () => {
	it('names the app and counts the new critical vulnerabilities', () => {
		const { wrapper } = open({ images: [{ current: 1, candidate: 3, added: [vuln(1234), vuln(5678)] }] })

		expect(wrapper.find('h3').text()).toBe('Update of Jellyfin blocked')
		expect(wrapper.text()).toContain('The new version has 2 more critical vulnerabilities than the installed one.')
		expect(wrapper.text()).toContain('The app stays on the version it had. Nothing was changed.')
		wrapper.unmount()
	})

	it('says one, not 1', () => {
		const { wrapper } = open({ images: [{ current: 0, candidate: 1, added: [vuln(1234)] }] })

		expect(wrapper.text()).toContain('The new version has one more critical vulnerability than the installed one.')
		wrapper.unmount()
	})

	it('gives no number when it has none', () => {
		const { wrapper } = open({ images: [] })

		expect(wrapper.text()).toContain('The new version has more critical vulnerabilities than the installed one.')
		expect(wrapper.text()).not.toContain('undefined')
		wrapper.unmount()
	})
})

describe('the blocked update window lists what the new version adds', () => {
	it('gives one line per added vulnerability', () => {
		const { wrapper } = open({ images: [{ current: 1, candidate: 3, added: [vuln(1234), vuln(5678, { package: 'libxml2', fixed: '2.12.9' })] }] })
		const lines = wrapper.findAll('.vuln-line')

		expect(lines).toHaveLength(2)
		expect(lines[0].text()).toContain('CVE-2026-1234 · openssl · fixed in 3.0.15')
		expect(lines[1].text()).toContain('CVE-2026-5678 · libxml2 · fixed in 2.12.9')
		wrapper.unmount()
	})

	it('shows what the box sent as text, never as markup', () => {
		const { wrapper } = open({ images: [{ current: 0, candidate: 1, added: [vuln(1, { title: '<img src=x onerror=alert(1)>' })] }] })

		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('.vuln-line').text()).toContain('<img src=x onerror=alert(1)>')
		wrapper.unmount()
	})

	it('links an id only to an https address', () => {
		const { wrapper } = open({ images: [{ current: 0, candidate: 2, added: [vuln(1), vuln(2, { url: 'javascript:alert(1)' })] }] })
		const links = wrapper.findAll('.vuln-line a')

		expect(links).toHaveLength(1)
		expect(links[0].attributes()).toMatchObject({ href: 'https://avd.aquasec.com/nvd/cve-2026-1', target: '_blank', rel: 'noopener noreferrer' })
		expect(wrapper.findAll('.vuln-line')[1].text()).toContain('CVE-2026-2')
		wrapper.unmount()
	})

	it('still renders when an image has no list of added vulnerabilities', () => {
		const { wrapper } = open({ images: [{ current: 0, candidate: 2 }, { current: 0, candidate: 0, added: [vuln(1)] }] })

		expect(wrapper.text()).toContain('The new version has 2 more critical vulnerabilities than the installed one.')
		expect(wrapper.findAll('.vuln-line')).toHaveLength(1)
		wrapper.unmount()
	})

	it('lists 20 and counts the rest', () => {
		const added = Array.from({ length: 23 }, (_, i) => vuln(i))
		const { wrapper } = open({ images: [{ current: 0, candidate: 23, added }] })

		expect(wrapper.findAll('.vuln-line')).toHaveLength(20)
		expect(wrapper.text()).toContain('and 3 more')
		wrapper.unmount()
	})
})

describe('updating anyway', () => {
	it('is not offered to an account that may not do it', () => {
		const { wrapper } = open({ canOverride: false })

		expect(buttons(wrapper).map(b => b.text())).toEqual(['Keep the installed version'])
		wrapper.unmount()
	})

	it('updates without the scan, then closes', async () => {
		let answer
		const { wrapper, updateComposeApp } = open({}, vi.fn(() => new Promise((resolve) => {
			answer = resolve
		})))

		await button(wrapper, 'Update anyway').trigger('click')
		// both buttons wait for the box's answer
		expect(buttons(wrapper).every(b => b.attributes('disabled') !== undefined)).toBe(true)
		expect(wrapper.emitted('close')).toBeUndefined()
		answer({ status: 200 })
		await flushPromises()

		expect(updateComposeApp).toHaveBeenCalledWith('jellyfin', undefined, { params: { skip_scan: true } })
		expect(wrapper.emitted('close')).toHaveLength(1)
		wrapper.unmount()
	})

	it('stays open and says why when the box refuses', async () => {
		const refused = Object.assign(new Error('Request failed with status code 403'), { response: { data: { message: 'only the owner can skip the scan' } } })
		const { wrapper } = open({}, vi.fn(() => Promise.reject(refused)))

		await button(wrapper, 'Update anyway').trigger('click')
		await flushPromises()

		expect(wrapper.find('.message').text()).toContain('only the owner can skip the scan')
		expect(wrapper.emitted('close')).toBeUndefined()
		expect(buttons(wrapper).every(b => b.attributes('disabled') === undefined)).toBe(true)
		wrapper.unmount()
	})

	it('closes when the installed version is kept', async () => {
		const { wrapper, updateComposeApp } = open()

		await button(wrapper, 'Keep the installed version').trigger('click')

		expect(wrapper.emitted('close')).toHaveLength(1)
		expect(updateComposeApp).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})
