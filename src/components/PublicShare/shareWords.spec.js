import { describe, expect, it } from 'vitest'
import { BOX_NAME, appEntry, certText, leaveWarning, reasonText, shareErrorText, sharedApps, tunnelText } from './shareWords.js'

// a translator that shows the key and fills the {placeholders}
const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, k) => values[k])
const refusal = (status, message, data) => ({ response: { status, data: { message, data } } })

describe('the wording of the public sharing', () => {
	it('checks a box name as the relay does', () => {
		for (const ok of ['mybox', 'a1b', 'x'.repeat(32), 'my-box']) {
			expect(BOX_NAME.test(ok)).toBe(true)
		}
		for (const bad of ['ab', '-ab', 'ab-', 'MyBox', 'x'.repeat(33), 'a_b', '']) {
			expect(BOX_NAME.test(bad)).toBe(false)
		}
	})

	it('finds an app and the shared ones', () => {
		const status = { apps: [{ name: 'a', label: 'a1', shared: true, url: 'https://a1.x', error: '' }, { name: 'b', shared: false }] }
		expect(appEntry(status, 'a')).toMatchObject({ label: 'a1', url: 'https://a1.x' })
		expect(appEntry(status, 'zz')).toBeNull()
		expect(appEntry(null, 'a')).toBeNull()
		expect(sharedApps(status).map(a => a.name)).toEqual(['a'])
		expect(sharedApps(null)).toEqual([])
	})

	it('says why sharing is not available', () => {
		expect(reasonText('remote-access', t)).toBe('Public sharing goes through remote access: turn it on first.')
		expect(reasonText('relay', t)).toBe('This relay does not support public sharing yet.')
		expect(reasonText('gateway', t)).toBe('This box\'s gateway is too old for public sharing: update ReCasaOS.')
		expect(reasonText('master', t)).toBe('Waiting for the master to register this box at the relay. Update the master if this lasts.')
		expect(reasonText('other', t)).toBe('Public sharing is not available on this box.')
		expect(reasonText('', t)).toBe('')
	})

	it('describes the certificate', () => {
		expect(certText({ pending: true }, 'fr-FR', t)).toBe('Certificate: being obtained')
		expect(certText({ error: 'Let\'s Encrypt refused: its limit of new certificates is reached, try again in a few days' }, 'fr-FR', t))
			.toBe('Let\'s Encrypt gives no new certificate for now: it is tried again by itself, which can take a few days.')
		expect(certText({ error: 'ACME: boom' }, 'fr-FR', t)).toBe('Certificate: ACME: boom')
		expect(certText({ not_after: '2027-01-05T00:00:00Z' }, 'fr-FR', t)).toBe(`Certificate valid until ${new Date('2027-01-05T00:00:00Z').toLocaleDateString('fr-FR')}`)
		expect(certText({ not_after: null }, 'fr-FR', t)).toBe('No certificate yet')
		expect(certText(undefined, 'fr-FR', t)).toBe('No certificate yet')
	})

	it('says nothing of a tunnel nobody needs', () => {
		expect(tunnelText({ apps: [{ shared: false }], tunnel: { connected: false } }, t)).toBe('')
		expect(tunnelText(null, t)).toBe('')
	})

	it('describes the tunnel', () => {
		const apps = [{ shared: true }]
		expect(tunnelText({ apps, tunnel: { connected: true } }, t)).toBe('Connected to the relay')
		expect(tunnelText({ apps, tunnel: { connected: false } }, t)).toBe('Connecting to the relay…')
		expect(tunnelText({ apps, tunnel: { error: 'dial failed' } }, t)).toBe('Not connected to the relay: dial failed')
	})

	it('names a withdrawn name', () => {
		const error = 'the tunnel was revoked by the relay operator: share an app again once the operator has restored it'
		expect(tunnelText({ apps: [], tunnel: { error } }, t)).toBe('This name was withdrawn by the relay operator.')
	})

	it('translates the refusals', () => {
		expect(shareErrorText(refusal(409, 'this name is already taken'), t)).toBe('This name is already taken')
		expect(shareErrorText(refusal(409, 'nextcloud is already shared at the same address'), t)).toBe('nextcloud is already shared at the same address')
		expect(shareErrorText(refusal(400, 'a box name is 3 to 32 lowercase letters, digits or dashes'), t)).toBe('A box name is 3 to 32 lowercase letters, digits or dashes, with no dash at either end')
		expect(shareErrorText(refusal(404, 'this app is not installed'), t)).toBe('This app is not installed')
		expect(shareErrorText(refusal(429, 'slow down'), t)).toBe('The relay is busy, try again later')
		expect(shareErrorText(refusal(502, 'bad gateway'), t)).toBe('Relay unreachable')
		expect(shareErrorText(refusal(503, 'unavailable', { reason: 'relay' }), t)).toBe('This relay does not support public sharing yet.')
		expect(shareErrorText(refusal(409, 'something new'), t)).toBe('something new')
		expect(shareErrorText(new Error('Network Error'), t)).toBe('Network Error')
		expect(shareErrorText({ response: { status: 503, data: null } }, t)).toBe('')
		for (const [message, sentence] of [
			['waiting for the master to register this box at the relay', 'Waiting for the master to register this box at the relay. Update the master if this lasts.'],
			['this relay does not support public sharing', 'This relay does not support public sharing yet.'],
			['remote access is off: public sharing goes through its relay', 'Public sharing goes through remote access: turn it on first.'],
			['this box already has a public name', 'This box already has a public name'],
			['this name was released recently and is not available yet', 'This name was released recently and is not available yet'],
			['the app\'s name cannot be made into a DNS label', 'The app\'s name cannot be made into a DNS label'],
		]) {
			expect(shareErrorText(refusal(409, message), t)).toBe(sentence)
		}
	})

	it('warns before the name goes', () => {
		expect(leaveWarning({ name: 'mybox', apps: [{ shared: true }] }, t)).toBe('The public addresses of your shared apps stop answering, and the name mybox is released.')
		expect(leaveWarning({ name: 'mybox', apps: [{ shared: false }] }, t)).toBe('The public name mybox is released.')
		expect(leaveWarning({ name: '', apps: [] }, t)).toBe('')
		expect(leaveWarning(null, t)).toBe('')
	})
})
