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

	it('keeps the box mode when an override holds only rule ids', async () => {
		form({ box: { ...base(), waf: 'block', rules_off: [920100] }, override: { rules_off: [942100], waf: null } })
		expect(wrapper.find('.guard-box-entries').text()).toContain('920100')
		await save()
		expect(emitted()[0][0]).toMatchObject({ waf: null, rules_off: [942100] })
	})

	it('refuses a cleared or fractional number and highlights it', async () => {
		form()
		await wrapper.find('input[name=rate]').setValue('')
		await save()
		expect(emitted()).toBeUndefined()
		expect(wrapper.find('input[name=rate]').classes()).toContain('is-danger')
		await wrapper.find('input[name=rate]').setValue('600')
		await wrapper.find('input[name=ban-scan_404]').setValue('1.5')
		await save()
		expect(emitted()).toBeUndefined()
		expect(wrapper.find('input[name=ban-scan_404]').classes()).toContain('is-danger')
		expect(wrapper.find('input[name=rate]').classes()).not.toContain('is-danger')
	})

	it('does not check a list left on the box', async () => {
		form({ box: base(), override: { allow: ['300.1.1.1'] } })
		await wrapper.find('input[name=same-lists]').setValue(true)
		await save()
		expect(emitted()[0][0]).toMatchObject({ allow: null, block: null })
	})

	it('says the memory cost only when the mode goes from off to on', async () => {
		form()
		await wrapper.find('select[name=waf]').setValue('observe')
		await wrapper.find('select[name=waf]').setValue('block')
		expect(wrapper.text()).toContain('about 50 MB')
		form({ box: { ...base(), waf: 'observe' }, override: { waf: 'block' } })
		await wrapper.find('select[name=waf]').setValue('observe')
		expect(wrapper.text()).not.toContain('about 50 MB')
		await wrapper.find('input[name=same-waf]').setValue(true)
		expect(wrapper.text()).not.toContain('about 50 MB')
	})

	it('follows its props while untouched, and keeps an edit in progress', async () => {
		form()
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 50 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('50')
		await wrapper.find('input[name=rate]').setValue('70')
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 90 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('70')
	})

	it('highlights the country select on a countries error', () => {
		form({ policy: { ...base(), countries: { mode: 'block', list: ['FR'] } }, error: 'bad_policy:countries.list[0]' })
		expect(wrapper.find('select[name=country-add]').element.parentElement.classList).toContain('is-danger')
	})

	it.each([
		['waf', 'select[name=waf]', 'block', { waf: 'block' }],
		['rules', 'input[name=rule-id]', '942100', { rules_off: [942100] }],
		['lists', 'textarea[name=allow]', '192.0.2.1', { allow: ['192.0.2.1'], block: [] }],
		['countries', 'input[name=rate]', null, { countries: { mode: 'block', list: ['FR'] } }],
		['limit', 'input[name=rate]', '5', { rate_per_min: 5 }],
		['ban', 'input[name=ban-scan_404]', '7', { ban: expect.objectContaining({ scan_404: 7 }) }],
	])('goes back to the box value when %s is switched on again', async (b, sel, value, set) => {
		form({ box: base(), override: null })
		const sw = () => wrapper.find(`input[name=same-${b}]`)
		await sw().setValue(false)
		if (b === 'rules') {
			await wrapper.find(sel).setValue(value)
			await wrapper.find('button[name=rule-add]').trigger('click')
		} else if (b === 'countries') {
			await wrapper.find('input[value=block][type=radio]').setValue()
			await wrapper.find('select[name=country-add]').setValue('FR')
		} else {
			await wrapper.find(sel).setValue(value)
		}
		await save()
		expect(emitted()[0][0]).toMatchObject(set)
		await sw().setValue(true)
		await sw().setValue(false)
		await save()
		expect(emitted()[1][0]).toEqual({ waf: null, rules_off: null, allow: null, block: null, countries: null, rate_per_min: null, ban: null, ...Object.fromEntries(Object.entries({ waf: base().waf, rules_off: [], allow: [], block: [], countries: base().countries, rate_per_min: 600, ban: base().ban }).filter(([k]) => k in set)) })
	})

	it('takes the parent answer as its new baseline after a save', async () => {
		form()
		await wrapper.find('input[name=rate]').setValue('70')
		await save()
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 71 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('71')
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 80 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('80')
	})

	it('keeps the edit when the parent refuses the save', async () => {
		form()
		await wrapper.find('input[name=rate]').setValue('70')
		await save()
		await wrapper.setProps({ error: 'bad_policy:rate_per_min' })
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 99 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('70')
	})

	it('mid-edit, takes a change of the props in the blocks left untouched and keeps the edited ones', async () => {
		form({ box: base(), override: null })
		await wrapper.find('input[name=same-limit]').setValue(false)
		await wrapper.find('input[name=rate]').setValue('70')
		await wrapper.setProps({ override: { waf: null, rules_off: [942100], allow: null, block: null, countries: null, rate_per_min: null, ban: null } })
		expect(wrapper.text()).toContain('942100')
		expect(wrapper.find('input[name=rate]').element.value).toBe('70')
		await save()
		expect(emitted()[0][0]).toMatchObject({ rules_off: [942100], rate_per_min: 70 })
	})

	it('stops waiting for its save once the parent is no longer busy', async () => {
		form()
		await wrapper.find('input[name=rate]').setValue('70')
		await save()
		await wrapper.setProps({ busy: true })
		await wrapper.setProps({ busy: false })
		await wrapper.setProps({ policy: { ...base(), rate_per_min: 90 } })
		expect(wrapper.find('input[name=rate]').element.value).toBe('70')
	})

	it('draws the app\'s own rule ids apart from the box ones', () => {
		form({ box: { ...base(), rules_off: [920100] }, override: { rules_off: [942100] } })
		expect(wrapper.find('.tag').classes()).toContain('is-primary')
	})

	it('names the OWASP mode off in its own words', () => {
		form()
		expect(wrapper.find('select[name=waf] option[value=off]').text()).toBe('Turned off')
	})

	it('clears a number highlight once the field is edited', async () => {
		form()
		await wrapper.find('input[name=rate]').setValue('')
		await save()
		expect(wrapper.find('input[name=rate]').classes()).toContain('is-danger')
		await wrapper.find('input[name=rate]').setValue('5')
		expect(wrapper.find('input[name=rate]').classes()).not.toContain('is-danger')
	})
})
