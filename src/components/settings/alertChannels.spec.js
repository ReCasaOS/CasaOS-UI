import { describe, expect, it } from 'vitest'
import { ALERT_KINDS, blankValues, channelURL } from './alertChannels'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// The form's values for a kind, its defaults filled in as the dialog does.
const form = (kind, values) => ({ ...blankValues(kind), ...values })

describe('ntfy', () => {
	it('uses ntfy.sh unless told otherwise', () => {
		expect(channelURL('ntfy', form('ntfy', { topic: 'my-box' }))).toBe('ntfy://ntfy.sh/my-box')
	})

	it('says so when the server is plain http', () => {
		expect(channelURL('ntfy', form('ntfy', { server: 'http://192.168.1.20:8080', topic: 'box' })))
			.toBe('ntfy://192.168.1.20:8080/box?scheme=http')
	})

	it('takes a server typed without its scheme as https', () => {
		expect(channelURL('ntfy', form('ntfy', { server: 'ntfy.example.org', topic: 'box' }))).toBe('ntfy://ntfy.example.org/box')
	})

	it('encodes the topic', () => {
		expect(channelURL('ntfy', form('ntfy', { topic: 'a b/c' }))).toBe('ntfy://ntfy.sh/a%20b%2Fc')
	})

	it('builds nothing from a server that is not one', () => {
		expect(channelURL('ntfy', form('ntfy', { server: 'http://', topic: 'box' }))).toBe('')
	})
})

describe('telegram', () => {
	it('puts the token before @telegram and the chat in chats', () => {
		expect(channelURL('telegram', form('telegram', { token: '123456:ABC-def_9', chat: '-1001234567890' })))
			.toBe('telegram://123456:ABC-def_9@telegram?chats=-1001234567890')
	})

	// the colon is Shoutrrr's user:password separator, which it joins back into the token
	it('encodes each side of the token, never its colon', () => {
		expect(channelURL('telegram', form('telegram', { token: '1:a/b', chat: '@my_channel' })))
			.toBe('telegram://1:a%2Fb@telegram?chats=%40my_channel')
	})
})

describe('e-mail', () => {
	it('builds an smtp URL with the sender and the recipient', () => {
		expect(channelURL('email', form('email', {
			host: 'smtp.example.com',
			user: 'box',
			password: 'secret',
			from: 'box@example.com',
			to: 'me@example.com',
		}))).toBe('smtp://box:secret@smtp.example.com:587/?from=box%40example.com&to=me%40example.com')
	})

	it('encodes every part, so a password cannot move the URL\'s separators', () => {
		expect(channelURL('email', form('email', {
			host: 'mail.example.com',
			port: '465',
			user: 'me@example.com',
			password: 'p@ss:w/rd?&#%',
			from: 'box@example.com',
			to: 'a@example.com,b@example.com',
		}))).toBe('smtp://me%40example.com:p%40ss%3Aw%2Frd%3F%26%23%25@mail.example.com:465/?from=box%40example.com&to=a%40example.com%2Cb%40example.com')
	})

	it('leaves the credentials out for a relay that takes none', () => {
		expect(channelURL('email', form('email', { host: 'relay.lan', port: '25', from: 'box@lan', to: 'me@lan' })))
			.toBe('smtp://relay.lan:25/?from=box%40lan&to=me%40lan')
	})
})

describe('any form', () => {
	it('builds nothing until the required fields are filled', () => {
		expect(channelURL('ntfy', form('ntfy', {}))).toBe('')
		expect(channelURL('telegram', form('telegram', { token: '1:a' }))).toBe('')
		expect(channelURL('email', form('email', { host: 'smtp.example.com', from: 'a@b' }))).toBe('')
		expect(channelURL('url', form('url', { url: '   ' }))).toBe('')
	})

	it('trims what was typed', () => {
		expect(channelURL('ntfy', form('ntfy', { topic: ' box ' }))).toBe('ntfy://ntfy.sh/box')
	})

	it('passes an advanced URL through as typed: the core is what checks it', () => {
		expect(channelURL('url', form('url', { url: ' discord://token@webhookid ' }))).toBe('discord://token@webhookid')
	})

	it('offers ntfy, Telegram, e-mail and an advanced URL', () => {
		expect(ALERT_KINDS.map(kind => kind.id)).toEqual(['ntfy', 'telegram', 'email', 'url'])
		expect(blankValues('ntfy')).toEqual({ server: 'https://ntfy.sh', topic: '' })
	})

	it('says every label and help in English and French', () => {
		const keys = ALERT_KINDS.flatMap(kind => [kind.label, kind.help, ...kind.fields.map(field => field.label)])
		for (const key of keys) {
			expect(en[key]).toBe(key)
			expect(fr[key]).toBeTruthy()
		}
	})
})
