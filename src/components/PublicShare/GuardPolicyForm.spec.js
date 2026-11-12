// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GuardPolicyForm from './GuardPolicyForm.vue'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

function base() {
	return {
		waf: 'off',
		rules_off: [],
		allow: [],
		block: [],
		countries: { mode: 'none', list: [] },
		rate_per_min: 600,
		ban: { waf_hits: 10, waf_window_s: 600, scan_404: 100, scan_window_s: 60, rate_strikes: 3, rate_window_s: 600, code_fails: 5, code_window_s: 600 },
	}
}

let wrapper
const form = props => (wrapper = mount(GuardPolicyForm, { props: { policy: base(), ...props }, global: { plugins: [Buefy, i18n] } }))
const save = () => wrapper.find('form').trigger('submit')
const emitted = () => wrapper.emitted('save')

describe('the protection policy form', () => {
	afterEach(() => wrapper.unmount())

	it('emits a full policy for the box', async () => {
		form()
		await wrapper.find('select[name=waf]').setValue('block')
		await wrapper.find('textarea[name=allow]').setValue('192.0.2.0/24')
		await save()
		expect(emitted()[0][0]).toEqual({ ...base(), waf: 'block', allow: ['192.0.2.0/24'] })
	})

	it('says once what the OWASP rules cost when they are turned on', async () => {
		form()
		expect(wrapper.text()).not.toContain('about 50 MB')
		await wrapper.find('select[name=waf]').setValue('observe')
		expect(wrapper.text()).toContain('The OWASP rules use about 50 MB of memory on the box.')
		await wrapper.find('select[name=waf]').setValue('off')
		expect(wrapper.text()).not.toContain('about 50 MB')
	})

	it('adds and removes disabled rule ids', async () => {
		form()
		await wrapper.find('input[name=rule-id]').setValue('942100')
		await wrapper.find('button[name=rule-add]').trigger('click')
		await save()
		expect(emitted()[0][0].rules_off).toEqual([942100])
		await wrapper.find('button[aria-label="Remove 942100"]').trigger('click')
		await save()
		expect(emitted()[1][0].rules_off).toEqual([])
	})

	it('converts the ban windows between minutes and seconds', async () => {
		form()
		expect(wrapper.find('input[name=ban-scan_window_s]').element.value).toBe('1')
		await wrapper.find('input[name=ban-scan_404]').setValue('50')
		await wrapper.find('input[name=ban-waf_window_s]').setValue('5')
		await save()
		expect(emitted()[0][0].ban).toMatchObject({ scan_404: 50, waf_window_s: 300, scan_window_s: 60 })
	})

	it('emits an override with only the block that left "Same as the box"', async () => {
		form({ box: base(), override: null })
		await wrapper.find('input[name=same-countries]').setValue(false)
		await wrapper.find('input[value=block][type=radio]').setValue()
		await wrapper.find('select[name=country-add]').setValue('FR')
		await save()
		expect(emitted()[0][0]).toEqual({
			waf: null,
			rules_off: null,
			allow: null,
			block: null,
			countries: { mode: 'block', list: ['FR'] },
			rate_per_min: null,
			ban: null,
		})
	})

	it('shows the box entries above the app additions and emits only the additions', async () => {
		form({ box: { ...base(), allow: ['198.51.100.1'] }, override: { allow: ['192.0.2.7'], block: [] } })
		expect(wrapper.find('.guard-box-entries').text()).toContain('198.51.100.1')
		expect(wrapper.find('textarea[name=allow]').element.value).toBe('192.0.2.7')
		await save()
		expect(emitted()[0][0]).toMatchObject({ allow: ['192.0.2.7'], block: [], waf: null, countries: null })
	})

	it('refuses an invalid address inline and does not save', async () => {
		form()
		await wrapper.find('textarea[name=allow]').setValue('192.0.2.1\n300.1.1.1')
		await save()
		expect(wrapper.find('.guard-lines-error').text()).toContain('300.1.1.1')
		expect(emitted()).toBeUndefined()
	})

	it('highlights the field a core refusal names', async () => {
		form({ error: 'bad_policy:ban.scan_404' })
		expect(wrapper.find('input[name=ban-scan_404]').classes()).toContain('is-danger')
		expect(wrapper.find('input[name=ban-waf_hits]').classes()).not.toContain('is-danger')
		expect(wrapper.text()).toContain('Invalid value in the ban thresholds')
	})

	it('shows a long Gateway path as a message only', () => {
		form({ error: 'bad_policy:apps["x.box.test"].policy.waf' })
		expect(wrapper.text()).toContain('The settings were refused')
		expect(wrapper.find('.is-danger[name]').exists()).toBe(false)
	})

	it('disables the save while busy', () => {
		form({ busy: true })
		expect(wrapper.findAll('button').find(b => b.text() === 'Save').attributes('disabled')).toBeDefined()
	})
})
