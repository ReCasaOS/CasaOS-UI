import { describe, expect, it } from 'vitest'
import { describeService, runSummary } from './updateAll'

describe('what an update would do, said per service', () => {
	it('names the image the catalogue moves to', () => {
		const line = describeService({ kind: 'catalogue' }, { name: 'web', from: 'nginx:1.25', to: 'nginx:1.27' })
		expect(line.params).toEqual({ service: 'web', from: 'nginx:1.25', to: 'nginx:1.27' })
		expect(line.message).toContain('{from} → {to}')
	})

	it('says a newer build is waiting when the tag stays the same', () => {
		const line = describeService({ kind: 'image' }, { name: 'app', from: 'x:latest', to: 'x:latest' })
		expect(line.message).toContain('newer build')
		expect(line.params).toEqual({ service: 'app', image: 'x:latest' })
	})
})

describe('where a run stands', () => {
	const apps = [
		{ id: 'a', state: 'updated' },
		{ id: 'b', state: 'current', message: 'is up to date' },
		{ id: 'c', state: 'updating' },
		{ id: 'd', state: 'queued' },
	]

	it('counts what is done while it runs', () => {
		expect(runSummary({ apps })).toEqual({ message: '{done} of {total} done', params: { done: 2, total: 4 } })
	})

	it('tells updated from current from failed once it is over', () => {
		const finished = { finished_at: '2026-09-14T08:00:00Z', apps: [...apps.slice(0, 2), { id: 'c', state: 'failed', message: 'no' }, { id: 'd', state: 'updated' }] }
		expect(runSummary(finished).params).toEqual({ updated: 2, current: 1, failed: 1 })
	})

	it('survives nothing at all', () => {
		expect(runSummary(null).params).toEqual({ done: 0, total: 0 })
	})
})
