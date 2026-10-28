import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { APP_NAME, asWritten, composeInfo, withInstallEnv } from './installEnv'

const stack = `x-php: &php
  image: vecto-php:latest
services:
  app:
    <<: *php
  queue:
    <<: *php
`

describe('a compose installed with its .env', () => {
	it('carries the .env as a top-level string, and leaves the rest of the text as written', () => {
		const env = 'DB_PASSWORD="p@ss: #1"\nKEY=a\\nb\n'
		const text = withInstallEnv(stack, env)
		expect(text.startsWith(stack.trimEnd())).toBe(true)
		expect(parse(text, { merge: true })['x-casaos-env']).toBe(env)
	})

	it('sends nothing more without a .env', () => {
		expect(withInstallEnv(stack, '')).toBe(stack)
		expect(withInstallEnv(stack, '  \n')).toBe(stack)
		expect(withInstallEnv(stack, undefined)).toBe(stack)
	})
})

describe('a compose installed as written', () => {
	it('gets the name typed when it has none, and a title for the dashboard', () => {
		const text = asWritten(stack, 'vecto')
		const doc = parse(text, { merge: true })
		expect(doc.name).toBe('vecto')
		expect(doc['x-casaos'].title.custom).toBe('vecto')
		expect(text).toContain('<<: *php') // the anchors stay
	})

	it('keeps its own name and its own x-casaos', () => {
		const own = `name: mine\nservices:\n  web:\n    image: nginx\nx-casaos:\n  title:\n    custom: Mine\n`
		expect(asWritten(own, 'other')).toBe(own)
		expect(composeInfo(own)).toEqual({ name: 'mine', hasCasaOS: true })
	})

	it('refuses text that is not compose', () => {
		expect(() => composeInfo('hello')).toThrow('no services')
		expect(() => composeInfo('a: [')).toThrow()
	})

	it('takes the names docker compose takes', () => {
		expect(['vecto', 'byepixel-prod', 'app_2'].every(n => APP_NAME.test(n))).toBe(true)
		expect(['', 'Vecto', '-x', 'a b', 'é'].some(n => APP_NAME.test(n))).toBe(false)
	})
})
