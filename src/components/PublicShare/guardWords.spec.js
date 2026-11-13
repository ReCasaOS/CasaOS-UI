import { describe, expect, it } from 'vitest'
import { actionText, countryName, guardErrorText, reasonText, relayReasonText } from './guardWords.js'
import { shareErrorText } from './shareWords.js'

const t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, k) => params[k])
const err = (message, status = 400) => ({ response: { status, data: { message } } })

describe('the words of the protection', () => {
	it('says why a request was refused', () => {
		expect(reasonText({ reason: 'waf', rule: 942100, detail: 'SQL Injection' }, t)).toBe('OWASP rule 942100: SQL Injection')
		expect(reasonText({ reason: 'country', country: 'FR' }, t, 'en_US')).toBe('Country blocked: France')
		expect(reasonText({ reason: 'country', country: 'ZZZ' }, t, 'en_US')).toBe('Country blocked: ZZZ')
		expect(reasonText({ reason: 'scan' }, t)).toBe('Scan: many missing pages')
		expect(reasonText({ reason: 'rate' }, t)).toBe('Request limit exceeded')
		expect(reasonText({ reason: 'code' }, t)).toBe('Access code wrong too often')
		expect(reasonText({ reason: 'blocklist' }, t)).toBe('Address blocked')
		expect(reasonText({ reason: 'banned' }, t)).toBe('Banned address')
		expect(reasonText({ reason: 'other' }, t)).toBe('')
	})

	it('says why the relay cut an address', () => {
		expect(relayReasonText({ reason: 'manual' }, t)).toBe('Blocked by the relay operator')
		expect(relayReasonText({ reason: 'suspended' }, t)).toBe('Shared name suspended')
		expect(relayReasonText({ reason: 'external', source: 'FireHOL level 1' }, t)).toBe('On the list FireHOL level 1')
		expect(relayReasonText({ reason: 'community' }, t)).toBe('Community list')
		expect(relayReasonText({ reason: 'cap' }, t)).toBe('Too many connections')
		expect(relayReasonText({ reason: 'other' }, t)).toBe('')
	})

	it('says what was done', () => {
		expect(actionText('blocked', t)).toBe('Blocked')
		expect(actionText('banned', t)).toBe('Banned')
		expect(actionText('observed', t)).toBe('Observed, not blocked')
		expect(actionText('', t)).toBe('')
	})

	it('names countries', () => {
		expect(countryName('FR', 'en_US')).toBe('France')
		expect(countryName('DE', 'fr_FR')).toBe('Allemagne')
		expect(countryName('', 'en_US')).toBe('')
	})

	describe('the refusal of a write', () => {
		it('tells the relay push failure from the gateway one', () => {
			expect(guardErrorText(err('the change is saved, but the relay has not taken it yet: x', 500), t)).toBe('Saved; it will reach the relay in a moment.')
			expect(guardErrorText(err('the change is saved, but the gateway failed: x', 500), t)).toBe('Saved; it will reach the box\'s gateway in a moment.')
		})
		it('names the field of the core\'s short path', () => {
			expect(guardErrorText(err('bad_policy:allow[0]'), t)).toContain('the allowed addresses')
			expect(guardErrorText(err('bad_policy:ban.scan_404'), t)).toContain('the ban thresholds')
			expect(guardErrorText(err('bad_policy:rate_per_min'), t)).toContain('the request limit')
			expect(guardErrorText(err('bad_policy:countries.list[0]'), t)).toContain('the countries')
		})

		it('keeps the generic sentence for the Gateway\'s long path and a bad request', () => {
			const generic = 'The settings were refused. Try again, or update ReCasaOS.'
			expect(guardErrorText(err('bad_policy:apps["host"].policy.waf'), t)).toBe(generic)
			expect(guardErrorText(err('bad_request'), t)).toBe(generic)
		})

		it('maps the other codes', () => {
			expect(guardErrorText(err('bad_name'), t)).toBe('A name is 1 to 40 characters, with no control character')
			expect(guardErrorText(err('unknown_app:cloud'), t)).toBe('cloud is not shared')
			expect(guardErrorText(err('not_shared'), t)).toBe('This app is not shared')
			expect(guardErrorText(err('not_found', 404), t)).toBe('This person no longer exists')
		})

		it('says the same for an old gateway when sharing an app', () => {
			const sentence = 'This box\'s gateway is too old to protect shared apps: update ReCasaOS.'
			expect(guardErrorText(err('gateway_unsupported'), t)).toBe(sentence)
			expect(shareErrorText(err('gateway_unsupported'), t)).toBe(sentence)
		})

		it('says a change the core saved but could not push yet is saved', () => {
			expect(guardErrorText(err('the change is saved, but the Gateway has not taken it yet: it will be sent again', 500), t)).toBe('Saved; it will reach the box\'s gateway in a moment.')
		})

		it('never shows a raw string', () => {
			expect(guardErrorText(err('', 429), t)).toBe('Something went wrong. Try again in a moment.')
			expect(guardErrorText(err('the relay is busy', 503), t)).toBe('Something went wrong. Try again in a moment.')
			expect(guardErrorText(new Error('offline'), t)).toBe('Something went wrong. Try again in a moment.')
			expect(guardErrorText(err('some server text', 500), t)).toBe('Something went wrong. Try again in a moment.')
			expect(guardErrorText(err('unknown_app'), t)).toBe('This app is not shared')
		})
	})
})
