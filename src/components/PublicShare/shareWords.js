// The words of the public sharing, from what the core sends. Pure: `t` is this.$t, and every key is a literal
// call of t with a string so that shareKeys.spec.js finds it. Nothing here builds a public URL: the core sends them.

// the rule of the relay: 3 to 32 lowercase letters, digits and dashes, no dash at either end
export const BOX_NAME = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

const REVOKED = /tunnel was revoked/i
const RATE_LIMIT = /^Let's Encrypt refused: its limit/

export const appEntry = (status, appName) => status?.apps?.find(a => a.name === appName) || null

export const sharedApps = status => (status?.apps || []).filter(a => a.shared === true)

export function reasonText(reason, t) {
	switch (reason) {
		case '': return ''
		case 'remote-access': return t('Public sharing goes through remote access: turn it on first.')
		case 'relay': return t('This relay does not support public sharing yet.')
		case 'gateway': return t('This box\'s gateway is too old for public sharing: update ReCasaOS.')
		case 'master': return t('Waiting for the master to register this box at the relay. Update the master if this lasts.')
		default: return t('Public sharing is not available on this box.')
	}
}

export function certText(cert, locale, t) {
	if (cert?.pending) {
		return t('Certificate: being obtained')
	}
	if (cert?.error) {
		return RATE_LIMIT.test(cert.error)
			? t('Let\'s Encrypt gives no new certificate for now: it is tried again by itself, which can take a few days.')
			: t('Certificate: {error}', { error: cert.error })
	}
	if (cert?.not_after) {
		return t('Certificate valid until {date}', { date: new Date(cert.not_after).toLocaleDateString(locale) })
	}
	return t('No certificate yet')
}

export function tunnelText(status, t) {
	const error = status?.tunnel?.error
	if (!sharedApps(status).length && !error) {
		return ''
	}
	if (status?.tunnel?.connected) {
		return t('Connected to the relay')
	}
	if (error) {
		return REVOKED.test(error)
			? t('This name was withdrawn by the relay operator.')
			: t('Not connected to the relay: {error}', { error })
	}
	return t('Connecting to the relay…')
}

// the core's messages, matched case-insensitively whatever the status
const KNOWN = [
	[/^a box name is 3 to 32/i, t => t('A box name is 3 to 32 lowercase letters, digits or dashes, with no dash at either end')],
	[/terms of service of let's encrypt must be accepted/i, t => t('The terms of service of Let\'s Encrypt must be accepted')],
	[/already has a public name/i, t => t('This box already has a public name')],
	[/name is already taken/i, t => t('This name is already taken')],
	[/name is reserved/i, t => t('This name is reserved')],
	[/name was revoked/i, t => t('This name was revoked and cannot be used')],
	[/released recently/i, t => t('This name was released recently and is not available yet')],
	[/no public name yet/i, t => t('This box has no public name yet')],
	[/no web port to share/i, t => t('This app has no web port to share')],
	[/app is not installed/i, t => t('This app is not installed')],
	[/cannot be made into a dns label/i, t => t('The app\'s name cannot be made into a DNS label')],
	[/^(.+) is already shared at the same address/i, (t, m) => t('{app} is already shared at the same address', { app: m[1] })],
	[/waiting for the master to register/i, t => reasonText('master', t)],
	[/relay does not support public sharing/i, t => reasonText('relay', t)],
	[/remote access is off/i, t => reasonText('remote-access', t)],
]

// the refusal of a write, in the owner's language; the result is text, to show with {{ }} or escape()
export function shareErrorText(e, t) {
	const status = e?.response?.status
	const message = e?.response?.data?.message
	const text = typeof message === 'string' ? message : ''
	if (status === 429) {
		return t('The relay is busy, try again later')
	}
	if (status === 502) {
		return t('Relay unreachable')
	}
	if (status === 503 && e.response.data?.data?.reason) {
		return reasonText(e.response.data.data.reason, t)
	}
	for (const [re, say] of KNOWN) {
		const m = text.match(re)
		if (m) {
			return say(t, m)
		}
	}
	return text || e?.message || ''
}

export function leaveWarning(status, t) {
	if (sharedApps(status).length) {
		return t('The public addresses of your shared apps stop answering, and the name {name} is released.', { name: status.name })
	}
	return status?.name ? t('The public name {name} is released.', { name: status.name }) : ''
}
