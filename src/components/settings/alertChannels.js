/**
 * The Alerts dialog's guided forms, each building a Shoutrrr service URL.
 *
 * The core keeps the URL and never gives it back, since it carries tokens and
 * passwords, so this is the one place the dashboard puts one together. Each part
 * is URL-encoded: a password with an @ or a topic with a / must not move the URL's
 * own separators. Labels and help are language-file keys.
 */
export const ALERT_KINDS = [
	{
		id: 'ntfy',
		label: 'ntfy',
		help: 'Install the ntfy app on your phone and subscribe to the same topic. Anyone who knows the topic can read the alerts: pick one that is hard to guess.',
		fields: [
			{ key: 'server', label: 'Server', value: 'https://ntfy.sh' },
			{ key: 'topic', label: 'Topic', placeholder: 'my-box-3f9a2c' },
		],
	},
	{
		id: 'telegram',
		label: 'Telegram',
		help: 'BotFather gives the token when you create a bot. Send your bot a message first: a bot cannot write to someone who never wrote to it.',
		fields: [
			{ key: 'token', label: 'Bot token', placeholder: '123456:ABC-DEF', secret: true },
			{ key: 'chat', label: 'Chat ID', placeholder: '123456789' },
		],
	},
	{
		id: 'email',
		label: 'E-mail',
		help: 'The SMTP server of your mail provider. Separate several recipients with commas.',
		fields: [
			{ key: 'host', label: 'SMTP server', placeholder: 'smtp.example.com' },
			{ key: 'port', label: 'SMTP port', value: '587' },
			{ key: 'user', label: 'User', optional: true },
			{ key: 'password', label: 'Password', secret: true, optional: true },
			{ key: 'from', label: 'From', placeholder: 'box@example.com' },
			{ key: 'to', label: 'To', placeholder: 'me@example.com' },
		],
	},
	{
		id: 'url',
		label: 'Advanced URL',
		help: 'Any service Shoutrrr knows (Discord, Gotify, Pushover, Matrix…), as its Shoutrrr URL.',
		fields: [
			{ key: 'url', label: 'URL', placeholder: 'discord://token@webhookid' },
		],
	},
]

/**
 * @param {string} kind one of ALERT_KINDS' ids
 * @returns {object} that kind's form, each field at its default or blank
 */
export function blankValues(kind) {
	const found = ALERT_KINDS.find(candidate => candidate.id === kind)
	return Object.fromEntries((found ? found.fields : []).map(field => [field.key, field.value || '']))
}

/**
 * @param {string} kind one of ALERT_KINDS' ids
 * @param {object} values the form, as blankValues gives it
 * @returns {string} the Shoutrrr URL, or '' while a required field is empty or the
 *   ntfy server is not a URL
 */
export function channelURL(kind, values) {
	const found = ALERT_KINDS.find(candidate => candidate.id === kind)
	if (!found)
		return ''

	const v = Object.fromEntries(found.fields.map(field => [field.key, String(values[field.key] ?? '').trim()]))
	if (found.fields.some(field => !field.optional && v[field.key] === ''))
		return ''

	const e = encodeURIComponent
	switch (kind) {
		case 'ntfy': {
			// a server typed without its scheme is taken as https, ntfy's own default
			let server
			try {
				server = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v.server) ? v.server : `https://${v.server}`)
			} catch {
				return ''
			}
			return `ntfy://${server.host}/${e(v.topic)}${server.protocol === 'http:' ? '?scheme=http' : ''}`
		}
		case 'telegram':
			// Shoutrrr reads the token as user:password and joins the two back with a
			// colon, so each side is encoded and the colon is kept.
			return `telegram://${v.token.split(':').map(e).join(':')}@telegram?chats=${e(v.chat)}`
		case 'email': {
			const credentials = v.user ? `${e(v.user)}:${e(v.password)}@` : ''
			return `smtp://${credentials}${e(v.host)}:${e(v.port)}/?from=${e(v.from)}&to=${e(v.to)}`
		}
		default:
			return v.url
	}
}
