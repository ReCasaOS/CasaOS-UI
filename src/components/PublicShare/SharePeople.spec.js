// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SharePeople from './SharePeople.vue'
import i18n from '@/plugins/i18n'
import { publicShare } from '@/service/publicShare'
import { resetShareGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))

const CODE = 'ABCD-EFGH-JKMN'
const answer = data => ({ data: { data } })
const person = (extra = {}) => ({ id: 'p_1', name: 'Maman', apps: ['jellyfin'], created_at: '2026-11-12T10:00:00Z', ...extra })
const view = (extra = {}) => ({ supported: true, protection: true, box: {}, apps: { jellyfin: { access: 'code' }, nextcloud: { access: 'open' } }, people: [person()], ...extra })

let wrapper
async function show() {
	wrapper = mount(SharePeople, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
}
const button = label => wrapper.findAll('button').find(b => b.text() === label)
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))
async function confirm(label) {
	dialogButton(label).click()
	await flushPromises()
}

beforeEach(() => {
	document.body.innerHTML = ''
	resetShareGuard()
	shareGuard.view = view()
	shareGuard.ok = true
	publicShare.status = { apps: [{ name: 'jellyfin', label: 'Jellyfin', shared: true }] }
	publicShare.ok = true
	vi.spyOn(shareGuardApi, 'view').mockImplementation(async () => answer(shareGuard.view))
	vi.spyOn(shareGuardApi, 'addPerson').mockResolvedValue(answer({ person: person({ id: 'p_2', name: 'Papa' }), code: CODE }))
	vi.spyOn(shareGuardApi, 'newCode').mockResolvedValue(answer({ code: 'WXYZ-2345-6789' }))
	vi.spyOn(shareGuardApi, 'updatePerson').mockResolvedValue(answer(person()))
	vi.spyOn(shareGuardApi, 'deletePerson').mockResolvedValue({})
})
afterEach(() => {
	wrapper.unmount()
	vi.restoreAllMocks()
})

describe('the people with an access code', () => {
	it('lists a person with the app title and when the code was last used', async () => {
		shareGuard.view = view({ people: [person({ last_used_at: '2026-11-12T10:20:00Z' }), person({ id: 'p_2', name: 'Papa', apps: [] })] })
		await show()
		const text = wrapper.text()
		expect(text).toContain('Maman')
		expect(text).toContain('Jellyfin')
		expect(text).toContain('Last used')
		expect(text).toContain('Never used')
	})

	it('shows the new code in a dialog, then leaves it nowhere', async () => {
		await show()
		await button('Add a person').trigger('click')
		expect(wrapper.findAll('input[name=person-app]')).toHaveLength(1)
		await wrapper.find('input[name=person-name]').setValue('Papa')
		await wrapper.find('input[name=person-app]').setValue(true)
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(shareGuardApi.addPerson).toHaveBeenCalledWith('Papa', ['jellyfin'])
		expect(wrapper.find('.code-value').text()).toBe(CODE)
		expect(wrapper.text()).toContain('This code will not be shown again.')
		expect(shareGuardApi.view).toHaveBeenCalled()
		await wrapper.find('.close-code').trigger('click')
		expect(wrapper.html()).not.toContain(CODE)
		expect(JSON.stringify(shareGuard)).not.toContain(CODE)
		expect(JSON.stringify(wrapper.vm.$data)).not.toContain(CODE)
	})

	it('asks before a new code, then shows it', async () => {
		await show()
		await button('New code').trigger('click')
		expect(shareGuardApi.newCode).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('The old code stops working')
		await confirm('New code')
		expect(shareGuardApi.newCode).toHaveBeenCalledWith('p_1')
		expect(wrapper.find('.code-value').text()).toBe('WXYZ-2345-6789')
	})

	it('asks before deleting', async () => {
		await show()
		await button('Delete').trigger('click')
		expect(shareGuardApi.deletePerson).not.toHaveBeenCalled()
		await confirm('Delete')
		expect(shareGuardApi.deletePerson).toHaveBeenCalledWith('p_1')
	})

	it('edits the name and the apps', async () => {
		await show()
		await button('Edit').trigger('click')
		expect(wrapper.find('input[name=person-name]').element.value).toBe('Maman')
		await wrapper.find('input[name=person-name]').setValue('Mamie')
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(shareGuardApi.updatePerson).toHaveBeenCalledWith('p_1', 'Mamie', ['jellyfin'])
		expect(wrapper.find('.code-dialog').exists()).toBe(false)
	})

	it('says to protect an app first when none is protected by code', async () => {
		shareGuard.view = view({ apps: { jellyfin: { access: 'open' } } })
		await show()
		await button('Add a person').trigger('click')
		expect(wrapper.find('input[name=person-app]').exists()).toBe(false)
		expect(wrapper.text()).toContain('Protect an app with a code first')
	})

	it('says why a write failed', async () => {
		shareGuardApi.addPerson.mockRejectedValue({ response: { status: 400, data: { message: 'bad_name' } } })
		await show()
		await button('Add a person').trigger('click')
		await wrapper.find('input[name=person-name]').setValue('x')
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(wrapper.text()).toContain('A name is 1 to 40 characters')
		expect(wrapper.find('.code-dialog').exists()).toBe(false)
	})
})
