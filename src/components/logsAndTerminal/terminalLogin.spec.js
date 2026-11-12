import { describe, expect, it } from 'vitest'
import { opensFullScreen, parseLogin, setOpensFullScreen } from './terminalLogin'

describe('the terminal login', () => {
	it('takes a user, and a port after a colon', () => {
		expect(parseLogin('vince')).toEqual({ user: 'vince', port: 22 })
		expect(parseLogin(' vince:2222 ')).toEqual({ user: 'vince', port: 2222 })
		expect(parseLogin('vince', '2200')).toEqual({ user: 'vince', port: 2200 })
		expect(parseLogin('vince:99999')).toEqual({ user: 'vince', port: 22 })
		expect(parseLogin('')).toEqual({ user: '', port: 22 })
	})
})

describe('the full screen choice', () => {
	it('is kept, and is off when nothing is kept', () => {
		const store = {}
		const storage = {
			getItem: k => store[k] ?? null,
			setItem: (k, v) => {
				store[k] = v
			},
		}
		expect(opensFullScreen(storage)).toBe(false)
		setOpensFullScreen(true, storage)
		expect(opensFullScreen(storage)).toBe(true)
		const blocked = {
			getItem: () => {
				throw new Error('blocked')
			},
		}
		expect(opensFullScreen(blocked)).toBe(false)
	})
})
