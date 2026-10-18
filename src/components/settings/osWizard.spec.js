import { describe, expect, it } from 'vitest'
import { NEXT, STATE_PHASES, STEP_IDS, TEXT, WIZARD_KEYS, autoAction, forgetPlan, newMemory, notePlan, remember, wizardView } from './osWizard'
import { statusView } from './osUpgrade'
import real from './__fixtures__/os-plan-d11-12.json'
import { ACK_WORD, CASES, STATES, raw } from './__fixtures__/os-run-states'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const view = (state, extra = {}) => statusView(raw(state, { ...CASES[state].extra, actions: CASES[state].actions, ...extra }))

// the plan of the measured box, with no removal and no source put aside: nothing to accept
const PLAIN = { ...structuredClone(real), problems: [], removals: [], paused: [] }
const BLOCKED = { ...structuredClone(PLAIN), verdict: 'blocked' }
const OTHER = { ...structuredClone(PLAIN), plan_id: `p1-${'1'.repeat(32)}` }
const ID = `p1-${real.plan_id.slice(3)}`
const MADE = Date.parse(real.made_at)

const ready = { asked: true, busy: false, failed: false, state: 'ready' }
const noReport = { asked: false, busy: false, failed: false, state: '' }
const idle = (extra = {}) => statusView(raw('idle', extra))
const planOf = (changes = {}) => ({ ready: true, plannable: true, running: false, failed: false, raw: null, ...changes })
const memoryOf = (changes = {}) => ({ ...newMemory(), ...changes })

function at(input) {
	return wizardView({ status: idle(), readiness: ready, plan: planOf(), memory: newMemory(), canCheck: true, ...input })
}
const states = result => result.steps.map(step => step.state)

describe('the journey of the guide', () => {
	it('pins the list of states to the core and gives each a place', () => {
		expect(Object.keys(STATE_PHASES).sort()).toEqual([...STATES].sort())
		expect(Object.keys(CASES).sort()).toEqual([...STATES].sort())
		expect(STEP_IDS).toEqual(['check', 'refresh', 'plan', 'rehearse', 'start', 'finish'])
	})

	it.each(STATES.filter(state => state !== 'idle'))('places %s at its step with the right action', (state) => {
		const wanted = CASES[state]
		const result = wizardView({ status: view(state), readiness: noReport, plan: planOf({ raw: PLAIN }), memory: newMemory(), canCheck: true })
		expect(result.current).toBe(wanted.step)
		expect(result.primary?.action ?? null).toBe(wanted.primary ?? null)
		expect(result.blocked).toBe(wanted.phase === 'stopped')
		expect(result.busy).toBe(wanted.phase === 'working')
		// only one primary, and the step that is current is marked as such
		const mine = result.steps.find(step => step.id === wanted.step)
		expect(mine.state).toBe(wanted.phase === 'stopped' ? 'stopped' : 'current')
		expect(result.steps.filter(step => ['current', 'stopped', 'blocked'].includes(step.state))).toHaveLength(1)
		expect(result.next.key in Object.fromEntries(Object.values(NEXT).map(key => [key, 1]))).toBe(true)
	})

	it('never offers to go on past a state that needs the person, whatever else is there', () => {
		for (const state of ['reboot_stalled', 'failed', 'interrupted', 'stopped_at_waypoint', 'needs_attention', 'manual']) {
			for (const memory of [newMemory(), memoryOf({ refreshed: true, rehearsed: true })]) {
				const result = wizardView({ status: view(state), readiness: ready, plan: planOf({ raw: PLAIN }), memory, canCheck: true })
				expect(result.primary, state).toBeNull()
				expect(result.secondary, state).toBeNull()
				expect(result.blocked, state).toBe(true)
				expect(result.auto, state).toBe('')
			}
		}
	})

	it('goes on from an interrupted run before the point of no return only by waiting', () => {
		const result = wizardView({ status: view('interrupted', { pnr: false, half_upgraded: false, last_activity_at: new Date(Date.now() - 60000).toISOString() }), canCheck: true })
		expect(result.busy).toBe(true)
		expect(result.primary).toBeNull()
		expect(result.blocked).toBe(false)
	})

	it('offers a close only when the core offers it, and never when it asks for a word', () => {
		expect(wizardView({ status: view('refreshed', { actions: [] }) }).primary).toBeNull()
		expect(wizardView({ status: view('refreshed', { ack_word: ACK_WORD }) }).primary).toBeNull()
		expect(wizardView({ status: view('reboot_first', { actions: ['acknowledge'] }) }).primary).toBeNull()
		expect(wizardView({ status: view('rehearsed', { actions: [] }) }).primary).toBeNull()
		expect(wizardView({ status: view('succeeded', { actions: ['resume'] }) }).primary).toBeNull()
	})

	it('words the verdict with findings differently, and finishes with its own label', () => {
		const result = wizardView({ status: view('succeeded_with_findings') })
		expect(result.next.key).toBe(NEXT.finish_findings)
		expect(result.primary).toEqual({ action: 'close', label: TEXT.actions.finish })
		expect(wizardView({ status: view('refreshed') }).primary.label).toBe(TEXT.actions.continue)
	})

	it('keeps its place with an old answer and offers nothing', () => {
		for (const state of STATES) {
			const result = wizardView({ status: view(state), stale: true, plan: planOf({ raw: PLAIN }), canCheck: true })
			expect(result.primary, state).toBeNull()
			expect(result.secondary, state).toBeNull()
			expect(result.current, state).toBe(wizardView({ status: view(state), plan: planOf({ raw: PLAIN }), canCheck: true }).current)
			expect(result.next.key, state).toBe(NEXT.stale)
		}
	})

	it('marks the steps before the current one done only when the core said so', () => {
		const result = wizardView({ status: view('verifying'), memory: newMemory() })
		expect(states(result)).toEqual(['done', 'skipped', 'done', 'skipped', 'done', 'current'])
		const withMemory = wizardView({ status: view('verifying'), memory: memoryOf({ refreshed: true, rehearsed: true }) })
		expect(states(withMemory)).toEqual(['done', 'done', 'done', 'done', 'done', 'current'])
		expect(result.steps[1].reason).toBe(TEXT.reasons.skipped)
	})
})

describe('the journey with no run open', () => {
	it('starts with the check, then the switch, on a clean machine', () => {
		let result = at({ status: idle({ beta_enabled: false }), readiness: noReport })
		expect(result.current).toBe('check')
		expect(result.primary).toEqual({ action: 'check', label: TEXT.actions.continue })
		expect(states(result)).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo'])

		result = at({ status: idle({ beta_enabled: false }), readiness: ready })
		expect(result.primary.action).toBe('beta')
		expect(result.steps[0].state).toBe('current')

		result = at({ status: idle({ beta_enabled: false }), readiness: { ...noReport, busy: true } })
		expect(result.primary).toBeNull()
		expect(result.busy).toBe(true)

		result = at({ status: idle({ beta_enabled: false }), readiness: { ...noReport, failed: true } })
		expect(result.primary).toEqual({ action: 'check', label: TEXT.actions.checkAgain })
	})

	it.each([
		['blocked', 'check', true],
		['unsupported', null, true],
		['latest', null, true],
	])('stops at the check when the report says %s', (state, primary, blocked) => {
		for (const beta of [true, false]) {
			const result = at({ status: idle({ beta_enabled: beta }), readiness: { ...ready, state }, plan: planOf({ raw: PLAIN }) })
			expect(result.current).toBe('check')
			expect(result.blocked).toBe(blocked)
			expect(result.primary?.action ?? null).toBe(primary)
			expect(result.steps[0].state).toBe('blocked')
			expect(result.auto).toBe('')
		}
	})

	it('goes to the refresh once the switch is on, and offers the one other choice: that it was done', () => {
		const result = at({ status: idle(), readiness: ready })
		expect(result.current).toBe('refresh')
		expect(result.primary).toEqual({ action: 'refresh', label: TEXT.actions.continue })
		expect(result.secondary.action).toBe('already')
		expect(states(result)).toEqual(['done', 'current', 'todo', 'todo', 'todo', 'todo'])
		// the core's switch that says nothing can be started: no button
		expect(at({ status: idle({ beta_enabled: true }), readiness: ready, memory: newMemory() }).primary).not.toBeNull()
	})

	it('goes to the plan after the refresh, and asks for it by itself once', () => {
		for (const memory of [memoryOf({ refreshed: true }), memoryOf({ refreshSkipped: true })]) {
			const result = at({ memory })
			expect(result.current).toBe('plan')
			expect(result.mode).toBe('plan_idle')
			expect(result.auto).toBe('plan')
			expect(result.primary.action).toBe('plan')
			expect(result.steps[1].state).toBe(memory.refreshed ? 'done' : 'skipped')
		}
	})

	it.each([
		['the core has not answered', { ready: false }, 'plan_wait', false, ''],
		['the plan runs', { running: true }, 'plan_running', true, ''],
		['a plan cannot be made', { plannable: false }, 'plan_unavailable', false, ''],
		['the last plan failed', { failed: true }, 'plan_failed', false, ''],
	])('at the plan when %s', (_, plan, mode, busy, auto) => {
		const result = at({ memory: memoryOf({ refreshed: true }), plan: planOf(plan) })
		expect(result.current).toBe('plan')
		expect(result.mode).toBe(mode)
		expect(result.busy).toBe(busy)
		expect(result.auto).toBe(auto)
		if (mode === 'plan_unavailable') {
			expect(result.blocked).toBe(true)
			expect(result.primary.action).toBe('recheck')
		}
		if (mode === 'plan_failed')
			expect(result.primary.action).toBe('plan')
	})

	it('asks for the plan again when it is older than the refresh', () => {
		const result = at({ memory: memoryOf({ refreshed: true, stalePlanMades: [MADE] }), plan: planOf({ raw: PLAIN }) })
		expect(result.current).toBe('plan')
		expect(result.mode).toBe('plan_older')
		expect(result.auto).toBe('plan')
		// another plan, made after it, is good
		expect(at({ memory: memoryOf({ refreshed: true, stalePlanMades: [MADE] }), plan: planOf({ raw: { ...OTHER, made_at: '2026-10-12T09:45:00Z' } }) }).current).toBe('rehearse')
	})

	it('rehearses, or skips, then starts, on a plan that is alive', () => {
		let result = at({ plan: planOf({ raw: PLAIN }) })
		expect(result.current).toBe('rehearse')
		expect(result.primary).toEqual({ action: 'rehearse', label: TEXT.actions.continue })
		expect(result.secondary).toEqual({ action: 'skip', label: TEXT.skip })
		expect(result.steps[2].state).toBe('done')
		// a live plan is the core's word that the machine passed the check, and says nothing of the refresh
		expect(states(result).slice(0, 2)).toEqual(['done', 'skipped'])

		for (const memory of [memoryOf({ rehearsed: true }), memoryOf({ rehearseSkipped: true })]) {
			result = at({ plan: planOf({ raw: PLAIN }), memory })
			expect(result.current).toBe('start')
			expect(result.primary).toEqual({ action: 'start', label: TEXT.actions.start })
			expect(result.steps[3].state).toBe(memory.rehearsed ? 'done' : 'omitted')
		}
	})

	it('does not offer to start from a plan that nothing can accept', () => {
		const result = at({ plan: planOf({ raw: BLOCKED }) })
		expect(result.blocked).toBe(true)
		expect(result.primary).toBeNull()
		expect(result.secondary).toBeNull()
		expect(result.mode).toBe('start_blocked')
	})

	it('offers no start when the core does not (the switch is off)', () => {
		const off = at({ status: idle({ beta_enabled: false }), readiness: ready, plan: planOf({ raw: PLAIN }) })
		expect(off.current).toBe('check')
		expect(off.primary.action).toBe('beta')
	})

	it('says it is finished once the verdict was closed, with every step the core confirmed done', () => {
		const result = at({ memory: memoryOf({ finished: true, refreshed: true, rehearsed: true }) })
		expect(result.current).toBeNull()
		expect(states(result)).toEqual(Array(6).fill('done'))
		expect(result.primary).toBeNull()
		expect(result.next.key).toBe(NEXT.finished)
	})

	it('shows nothing for a machine that cannot be checked and has no run', () => {
		const result = at({ canCheck: false })
		expect(result.mode).toBe('unavailable')
		expect(result.primary).toBeNull()
		expect(result.current).toBeNull()
		// but a run that is open is still read there
		expect(wizardView({ status: view('succeeded'), canCheck: false }).primary.action).toBe('close')
	})
})

describe('hostile and unknown input', () => {
	it('blocks everything on a state it does not know, whatever the rest says', () => {
		for (const state of ['future_state', '__proto__', 'constructor', 'toString', '<b>x</b>', 'x'.repeat(100000)]) {
			const status = statusView(raw(state, { kind: 'hop', actions: ['acknowledge', 'reboot', 'resume'] }))
			const result = wizardView({ status, readiness: ready, plan: planOf({ raw: PLAIN }), memory: memoryOf({ refreshed: true, rehearsed: true }), canCheck: true })
			expect(result.primary, state).toBeNull()
			expect(result.secondary, state).toBeNull()
			expect(result.blocked, state).toBe(true)
			expect(result.current, state).toBeNull()
			expect(result.mode, state).toBe('unknown')
			expect(states(result), state).toEqual(Array(6).fill('todo'))
		}
	})

	it('reads nothing as "reading", and offers nothing', () => {
		for (const status of [null, undefined, {}, [], 'idle', 7, { state: 'idle' }, { known: true }, { known: true, state: 'idle', buttons: [], launch: {} }, statusView(null), statusView([]), statusView({ state: 5 })]) {
			const result = wizardView({ status })
			expect(result.mode, JSON.stringify(status)).toBe('reading')
			expect(result.primary).toBeNull()
			expect(result.blocked).toBe(true)
		}
	})

	it('survives input that is not an object, and parts that are not what they should be', () => {
		for (const input of [undefined, null, 5, 'x', [], { status: view('refreshed'), memory: 'x', readiness: 5, plan: [] }, { status: idle(), memory: { stalePlanMades: 'x' }, plan: { raw: 'x' } }]) {
			expect(() => wizardView(input)).not.toThrow()
			expect(wizardView(input).steps).toHaveLength(6)
		}
	})

	it('does not read a wrong type as a yes', () => {
		const result = at({ readiness: { state: 'ready', busy: 'yes', failed: 'yes' }, status: idle({ beta_enabled: 'true' }), stale: 'yes', canCheck: 'no' })
		// beta_enabled 'true' is not true: the switch is off, the check is passed
		expect(result.primary.action).toBe('beta')
	})
})

describe('invariants over every combination', () => {
	const readinesses = [noReport, { ...noReport, busy: true }, { ...noReport, failed: true }, ...['ready', 'attention', 'blocked', 'unsupported', 'latest', 'weird'].map(state => ({ ...ready, state }))]
	const plans = [planOf({ ready: false }), planOf({ running: true }), planOf({ plannable: false }), planOf({ failed: true }), planOf(), planOf({ raw: PLAIN }), planOf({ raw: OTHER }), planOf({ raw: BLOCKED })]
	const memories = [newMemory(), memoryOf({ refreshed: true }), memoryOf({ refreshSkipped: true }), memoryOf({ rehearsed: true }), memoryOf({ rehearseSkipped: true }), memoryOf({ refreshed: true, rehearsed: true, stalePlanMades: [MADE] }), memoryOf({ finished: true })]
	const statuses = [...STATES.map(state => view(state)), idle({ beta_enabled: false })]

	it('holds for every state, readiness, plan, memory and age of answer', () => {
		let seen = 0
		for (const status of statuses) {
			for (const readiness of readinesses) {
				for (const plan of plans) {
					for (const memory of memories) {
						for (const stale of [false, true]) {
							const result = wizardView({ status, readiness, plan, memory, stale, canCheck: true })
							seen++
							const label = `${status.state}/${readiness.state}/${JSON.stringify(plan)}/${JSON.stringify(memory)}/${stale}`
							expect(result.steps.map(step => step.id), label).toEqual(STEP_IDS)
							const marked = result.steps.filter(step => ['current', 'blocked', 'stopped'].includes(step.state))
							expect(marked.length, label).toBe(result.current ? 1 : 0)
							if (result.current)
								expect(marked[0].id, label).toBe(result.current)
							// a step is done only if the core said so: its word, or the memory of what it said
							const done = id => result.steps.find(step => step.id === id).state === 'done'
							// (a journey that ended well has every step done: the core gave its verdict)
							if (done('refresh') && !memory.finished)
								expect(memory.refreshed, label).toBe(true)
							if (done('rehearse') && !memory.finished)
								expect(memory.rehearsed, label).toBe(true)
							if (done('finish'))
								expect(memory.finished, label).toBe(true)
							// a plan is done when a run was started from it, or when the core holds one that is not older than the refresh
							if (done('plan') && !status.open && !memory.finished)
								expect(plan.raw !== null && !memory.stalePlanMades.includes(MADE), label).toBe(true)
							// at most one primary, never past a stop, never on an old answer
							if (result.blocked && result.primary)
								expect(['check', 'recheck'], label).toContain(result.primary.action)
							if (stale)
								expect(result.primary, label).toBeNull()
							if (result.mode === 'stopped' || result.mode === 'unknown' || result.mode === 'reading')
								expect(result.primary, label).toBeNull()
							// the action is one of the guide's own, and only one the core offers when it is the core's button
							if (result.primary?.action === 'close')
								expect(status.buttons.some(button => button.action === 'acknowledge' && !button.needsWord), label).toBe(true)
							if (result.primary?.action === 'reboot')
								expect(status.buttons.some(button => button.action === 'reboot'), label).toBe(true)
							if (result.primary?.action === 'discard')
								expect(status.buttons.some(button => button.action === 'discard'), label).toBe(true)
							if (result.auto)
								expect(result.mode === 'plan_idle' || result.mode === 'plan_older', label).toBe(true)
							for (const step of result.steps) {
								expect(TEXT.states[step.state], label).toBeTruthy()
								if (step.state === 'skipped')
									expect(step.reason, label).toBe(TEXT.reasons.skipped)
							}
							expect(NEXT[result.mode] ?? NEXT[result.next.key] ?? result.next.key, label).toBeTruthy()
						}
					}
				}
			}
		}
		expect(seen).toBeGreaterThan(10000)
	}, 120000)
})

describe('what the guide remembers', () => {
	const refreshed = view('refreshed')
	const closed = idle()

	it('remembers a refresh only when the core said it was refreshed and it was closed', () => {
		expect(remember(newMemory(), refreshed, closed).refreshed).toBe(true)
		expect(remember(newMemory(), view('refreshing'), closed).refreshed).toBe(false)
		expect(remember(newMemory(), view('reboot_first'), closed).refreshed).toBe(false)
		expect(remember(newMemory(), view('failed', { kind: 'refresh' }), closed).refreshed).toBe(false)
		expect(remember(newMemory(), refreshed, refreshed).refreshed).toBe(false)
		expect(remember(newMemory(), null, closed).refreshed).toBe(false)
		expect(remember(newMemory(), refreshed, null).refreshed).toBe(true)
	})

	it('remembers a rehearsal that was put back and closed, and a verdict that was closed', () => {
		expect(remember(newMemory(), view('rehearsal_done'), closed).rehearsed).toBe(true)
		expect(remember(newMemory(), view('rehearsed'), closed).rehearsed).toBe(true)
		expect(remember(newMemory(), view('rehearsing'), closed).rehearsed).toBe(false)
		expect(remember(memoryOf({ closeRehearsal: true }), view('rehearsal_done'), closed).closeRehearsal).toBe(false)
		for (const state of ['succeeded', 'succeeded_with_findings'])
			expect(remember(newMemory(), view(state), closed).finished, state).toBe(true)
		for (const state of ['failed', 'verifying', 'awaiting_reboot', 'needs_attention'])
			expect(remember(newMemory(), view(state), closed).finished, state).toBe(false)
	})

	it('notes the plan that is alive when a refresh is seen, once, and changes nothing in place', () => {
		const memory = newMemory()
		const next = remember(memory, closed, view('refreshing'), MADE)
		expect(next.stalePlanMades).toEqual([MADE])
		expect(memory.stalePlanMades).toEqual([])
		expect(remember(next, view('refreshing'), view('refreshed'), MADE).stalePlanMades).toEqual([MADE])
		expect(remember(memory, closed, view('refreshing'), null).stalePlanMades).toEqual([])
		expect(remember(memory, closed, view('rehearsing'), MADE).stalePlanMades).toEqual([])
		expect(forgetPlan(memory, MADE).stalePlanMades).toEqual([MADE])
		// the core's refusal is its word that the refresh was done
		expect(forgetPlan(memory, MADE).refreshed).toBe(true)
		expect(forgetPlan(forgetPlan(memory, MADE), MADE).stalePlanMades).toEqual([MADE])
		expect(forgetPlan(memory, '')).toBe(memory)
	})

	it('takes a plan that is alive as the refresh being behind, unless the plan is older than a refresh', () => {
		expect(notePlan(newMemory(), { id: ID, madeMs: MADE }).refreshSkipped).toBe(true)
		expect(notePlan(newMemory(), '').refreshSkipped).toBe(false)
		expect(notePlan(memoryOf({ stalePlanMades: [MADE] }), { id: ID, madeMs: MADE }).refreshSkipped).toBe(false)
		expect(notePlan(memoryOf({ refreshed: true }), { id: ID, madeMs: MADE }).refreshSkipped).toBe(false)
		const memory = newMemory()
		notePlan(memory, { id: ID, madeMs: MADE })
		expect(memory.refreshSkipped).toBe(false)
	})

	it('closes a rehearsal by itself only after it was put back by the guide, and only when the core offers a close', () => {
		const done = view('rehearsal_done')
		expect(autoAction(done, memoryOf({ closeRehearsal: true }))).toBe('close')
		expect(autoAction(done, newMemory())).toBeNull()
		expect(autoAction(view('rehearsed'), memoryOf({ closeRehearsal: true }))).toBeNull()
		expect(autoAction(view('refreshed'), memoryOf({ closeRehearsal: true }))).toBeNull()
		expect(autoAction(view('rehearsal_done', { actions: [] }), memoryOf({ closeRehearsal: true }))).toBeNull()
		expect(autoAction(view('rehearsal_done', { ack_word: ACK_WORD }), memoryOf({ closeRehearsal: true }))).toBeNull()
		expect(autoAction(null, memoryOf({ closeRehearsal: true }))).toBeNull()
		expect(autoAction(done, null)).toBeNull()
		expect(autoAction(done, memoryOf({ closeRehearsal: 'yes' }))).toBeNull()
	})
})

describe('the language files', () => {
	it('has each key once', () => {
		expect(new Set(WIZARD_KEYS).size).toBe(WIZARD_KEYS.length)
		expect(WIZARD_KEYS.length).toBeGreaterThan(55)
	})

	it.each(WIZARD_KEYS)('says "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(key.replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
		expect(fr[key].replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
	})

	it('says the operation, and the restart, with the words of the other texts', () => {
		for (const key of WIZARD_KEYS.filter(key => /\boperation\b/.test(key)))
			expect(fr[key], key).toMatch(/opération/)
		expect(fr[TEXT.actions.reboot]).toBe('Redémarrer maintenant')
	})
})

// ---- the core's own time of the last refresh, and the other points of the reading of the journey ------------------------------

const planAt = made => ({ ...structuredClone(PLAIN), made_at: made })
const withRefresh = (state, at, extra = {}) => statusView(raw(state, { last_refresh_at: at, ...extra }))
const idleAt = (at, extra = {}) => withRefresh('idle', at, extra)

describe('the time of the last refresh, as the status carries it', () => {
	it('reads it as a time, and ignores what is not one', () => {
		expect(idleAt('2026-10-12T09:00:00Z').lastRefreshMs).toBe(Date.parse('2026-10-12T09:00:00Z'))
		expect(statusView(raw('idle')).lastRefreshMs).toBeNull()
		for (const bad of [5, true, null, {}, [], 'garbage', '', '2999-01-01T00:00:00Z', '0001-01-01T00:00:00Z', 'x'.repeat(100000), '2026-13-45T99:00:00Z', '<b>2026</b>'])
			expect(idleAt(bad).lastRefreshMs, String(bad).slice(0, 20)).toBeNull()
	})

	it('reads the other times and the word about the boot, and ignores the same hostile values', () => {
		const view = statusView(raw('reboot_first', { kind: 'refresh', since: '2026-10-12T09:00:00Z', last_activity_at: '2026-10-12T09:10:00Z', boot_unknown: true }))
		expect(view.sinceMs).toBe(Date.parse('2026-10-12T09:00:00Z'))
		expect(view.lastActivityMs).toBe(Date.parse('2026-10-12T09:10:00Z'))
		expect(view.bootUnknown).toBe(true)
		const bad = statusView(raw('reboot_first', { since: 'soon', last_activity_at: 7, boot_unknown: 'yes' }))
		expect([bad.sinceMs, bad.lastActivityMs, bad.bootUnknown]).toEqual([null, null, false])
	})

	it('makes step 2 done when the core says when the last refresh ended', () => {
		const result = at({ status: idleAt('2026-10-12T09:00:00Z'), readiness: ready, plan: planOf() })
		expect(result.current).toBe('plan')
		expect(result.steps[1].state).toBe('done')
	})

	it('compares the time of the plan with the time of the refresh, and not their ids', () => {
		const before = planAt('2026-10-12T08:00:00Z')
		const after = planAt('2026-10-12T09:30:00Z')
		const older = at({ status: idleAt('2026-10-12T09:00:00Z'), readiness: ready, plan: planOf({ raw: before }) })
		expect(older.mode).toBe('plan_older')
		expect(older.auto).toBe('plan')
		// the same id, made again after the refresh: good
		expect(before.plan_id).toBe(after.plan_id)
		expect(at({ status: idleAt('2026-10-12T09:00:00Z'), readiness: ready, plan: planOf({ raw: after }), memory: memoryOf({ rehearsed: true }) }).current).toBe('start')
		// no time on the plan: it cannot be told to be newer
		const nameless = { ...structuredClone(PLAIN), made_at: undefined }
		expect(at({ status: idleAt('2026-10-12T09:00:00Z'), readiness: ready, plan: planOf({ raw: nameless }) }).mode).toBe('plan_older')
	})

	it('without that time, remembers an older plan by the time it was made and not by its id', () => {
		const old = planAt('2026-10-12T08:00:00Z')
		const made = Date.parse('2026-10-12T08:00:00Z')
		const memory = memoryOf({ refreshed: true, stalePlanMades: [made] })
		expect(at({ memory, plan: planOf({ raw: old }) }).mode).toBe('plan_older')
		// the plan made again has the same id and another time
		expect(at({ memory, plan: planOf({ raw: planAt('2026-10-12T09:30:00Z') }) }).current).toBe('rehearse')
		expect(forgetPlan(newMemory(), made).stalePlanMades).toEqual([made])
		expect(remember(newMemory(), idle(), view('refreshing'), made).stalePlanMades).toEqual([made])
		expect(notePlan(newMemory(), { id: ID, madeMs: made }).refreshSkipped).toBe(true)
		expect(notePlan(memoryOf({ stalePlanMades: [made] }), { id: ID, madeMs: made }).refreshSkipped).toBe(false)
	})
})

describe('what is not finished, and what is only unconfirmed', () => {
	it('does not count a run taken over and closed as an upgrade that was verified', () => {
		expect(remember(newMemory(), view('manual_done'), idle()).finished).toBe(false)
		expect(remember(newMemory(), view('succeeded'), idle()).finished).toBe(true)
	})

	it('keeps the steps nobody confirmed unconfirmed when the upgrade is finished, and says what was skipped', () => {
		const result = at({ memory: memoryOf({ finished: true, rehearseSkipped: true }) })
		expect(states(result)).toEqual(['done', 'skipped', 'done', 'omitted', 'done', 'done'])
		expect(states(at({ memory: memoryOf({ finished: true, refreshed: true, rehearsed: true }) }))).toEqual(Array(6).fill('done'))
		expect(states(at({ memory: memoryOf({ finished: true, refreshed: true, rehearsed: true, findings: true }) })).at(-1)).toBe('done_findings')
		expect(remember(newMemory(), view('succeeded_with_findings'), idle()).findings).toBe(true)
		expect(remember(newMemory(), view('succeeded'), idle()).findings).toBe(false)
	})

	it('says a step the person skipped is skipped, and one they said was done is still not confirmed', () => {
		const result = wizardView({ status: view('verifying'), memory: memoryOf({ rehearseSkipped: true, refreshSkipped: true }) })
		expect(result.steps[1].state).toBe('skipped')
		expect(result.steps[3].state).toBe('omitted')
	})
})

describe('the restart', () => {
	it('is blocked, with the red checks as the reason, when the core does not offer it', () => {
		const result = wizardView({ status: view('awaiting_reboot', { actions: ['takeover'], barrier: { ok: false, checks: [{ code: 'fstab_unresolved', ok: false, severity: 'refuse' }] } }) })
		expect(result.blocked).toBe(true)
		expect(result.primary).toBeNull()
		expect(result.mode).toBe('finish_barrier')
		expect(result.steps[5].state).toBe('blocked')
		expect(result.why).toBe(TEXT.reasons.barrier)
		expect(NEXT.finish_restart).not.toMatch(/Every step is done/)
	})

	it('waits, and does not block, while the checks before the restart are not made yet', () => {
		const result = wizardView({ status: view('awaiting_reboot', { actions: ['takeover'] }) })
		expect(result.mode).toBe('finish_barrier_wait')
		expect(result.busy).toBe(true)
		expect(result.blocked).toBe(false)
	})

	it('offers to go on when the core kept reboot_first after a restart it cannot see', () => {
		const result = wizardView({ status: view('reboot_first', { boot_unknown: true }) })
		expect(result.primary.action).toBe('reboot')
		expect(result.secondary).toEqual({ action: 'close', label: TEXT.actions.alreadyRestarted })
		expect(result.mode).toBe('refresh_restart_unknown')
		expect(wizardView({ status: view('reboot_first') }).secondary).toBeNull()
		expect(wizardView({ status: view('reboot_first', { boot_unknown: true, actions: ['reboot'] }) }).secondary).toBeNull()
		expect(wizardView({ status: view('reboot_first', { boot_unknown: true, ack_word: ACK_WORD }) }).secondary).toBeNull()
	})

	it('shows an interrupted run before the point of no return as working only while it is recent', () => {
		const now = Date.parse('2026-10-12T10:00:00Z')
		const recent = view('interrupted', { pnr: false, half_upgraded: false, last_activity_at: '2026-10-12T09:58:00Z' })
		const old = view('interrupted', { pnr: false, half_upgraded: false, last_activity_at: '2026-10-12T09:00:00Z' })
		const nameless = view('interrupted', { pnr: false, half_upgraded: false })
		expect(wizardView({ status: recent, now }).busy).toBe(true)
		for (const status of [old, nameless]) {
			const result = wizardView({ status, now })
			expect(result.busy).toBe(false)
			expect(result.blocked).toBe(true)
			expect(result.mode).toBe('stopped')
		}
	})
})

describe('the check, and the points it found', () => {
	it('keeps the check open until the person has read the points of a report that has some', () => {
		const attention = { ...ready, state: 'attention', warnings: 3 }
		const result = at({ readiness: attention })
		expect(result.mode).toBe('check_attention')
		expect(result.next.params).toEqual({ n: 3 })
		expect(result.primary.action).toBe('read')
		expect(result.alsoOpen).toEqual(['check'])
		expect(at({ readiness: attention, status: idle({ beta_enabled: false }), memory: memoryOf({ attentionRead: true }) }).mode).toBe('check_beta')
		expect(at({ readiness: attention, memory: memoryOf({ attentionRead: true }) }).mode).toBe('refresh_idle')
	})

	it('asks for the check before the refresh when the switch is on and nothing was checked', () => {
		const result = at({ status: idle({ beta_enabled: true }), readiness: noReport })
		expect(result.mode).toBe('check_idle')
		expect(result.primary.action).toBe('check')
		// a plan that is alive is the core's word enough
		expect(at({ readiness: noReport, plan: planOf({ raw: PLAIN }) }).current).toBe('rehearse')
	})

	it('says the same thing in English as the state: the check is done', () => {
		expect(NEXT.check_beta).toBe('The check is done and the machine can be upgraded. Read the report, then switch the upgrade on to go on.')
	})
})

describe('a plan that cannot be made, and every mode with no action', () => {
	it('offers to ask again when the plan was refused or not heard of, and opens the plan', () => {
		const refused = at({ memory: memoryOf({ refreshed: true }), plan: planOf({ plannable: false }) })
		expect(refused.primary).toEqual({ action: 'recheck', label: TEXT.actions.recheck })
		expect(refused.alsoOpen).toEqual(['plan'])
		const unheard = at({ memory: memoryOf({ refreshed: true }), plan: planOf({ ready: false }) })
		expect(unheard.primary.action).toBe('recheck')
		expect(unheard.busy).toBe(false)
		expect(at({ plan: planOf({ raw: BLOCKED }) }).alsoOpen).toEqual(['plan'])
	})

	it('gives a reason to every state that has no action and does not work', () => {
		const modes = new Set()
		const readinesses = [noReport, { ...ready, state: 'blocked' }, { ...ready, state: 'unsupported' }, { ...ready, state: 'latest' }, { ...ready, state: 'attention', warnings: 1 }, ready]
		const plans = [planOf({ ready: false }), planOf({ plannable: false }), planOf({ failed: true }), planOf({ raw: BLOCKED }), planOf({ raw: PLAIN })]
		const noRefresh = { ...idle(), launch: { ...idle().launch, refresh: false, start: false } }
		for (const status of [...STATES.map(state => view(state)), idle({ beta_enabled: false }), null, undefined, noRefresh, view('awaiting_reboot', { actions: [] }), view('reboot_first', { actions: [] })]) {
			for (const readiness of readinesses) {
				for (const plan of plans) {
					for (const stale of [false, true]) {
						for (const memory of [newMemory(), memoryOf({ refreshed: true, rehearsed: true }), memoryOf({ finished: true })]) {
							const result = wizardView({ status, readiness, plan, memory, stale, canCheck: true })
							modes.add(result.mode)
							if (!result.primary && !result.busy && result.mode !== 'finished')
								expect(typeof result.why === 'string' && result.why.length > 0, `${status?.state}/${result.mode}`).toBe(true)
						}
					}
				}
			}
		}
		expect(modes.size).toBeGreaterThan(20)
	})
})

describe('the words', () => {
	it('names the state of a step that stopped in the feminine, with its own key', () => {
		expect(TEXT.states.stopped).toBe('Stopped at this step')
		expect(fr['Stopped at this step']).toBe('Arrêtée à cette étape')
	})

	it('has no key that nothing says', () => {
		expect(WIZARD_KEYS).not.toContain('Details of this step')
	})

	it('tells that "I already did it" is not checked', () => {
		expect(TEXT.alreadyNote).toBe('Only if you really did: this page cannot check.')
		expect(at({ status: idle(), readiness: ready }).secondary.action).toBe('already')
	})

	it.each([
		['The rehearsal is running. Wait, and do not run apt or restart the machine.', 'ne lancez pas apt, ne redémarrez pas la machine'],
		['Restarts the machine into the new release, checks it, and gives the verdict. The machine restarts: it will be out of reach for a few minutes.', 'elle sera injoignable quelques minutes'],
		['The upgrade has run and the machine waits for its restart. Restart it when everything is ready, and be where you can see its screen.', 'quand tout est prêt'],
	])('says "%s" the way a person says it in French', (key, wanted) => {
		expect(fr[key]).toContain(wanted)
	})
})
