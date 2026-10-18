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

const ready = { asked: true, busy: false, failed: false, state: 'ready' }
const noReport = { asked: false, busy: false, failed: false, state: '' }
const idle = (extra = {}) => statusView(raw('idle', extra))
const planOf = (changes = {}) => ({ ready: true, plannable: true, running: false, failed: false, raw: null, ...changes })
const memoryOf = (changes = {}) => ({ ...newMemory(), ...changes })

function at(input) {
	return wizardView({ status: idle(), readiness: noReport, plan: planOf(), memory: newMemory(), canCheck: true, ...input })
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
		const result = wizardView({ status: view('interrupted', { pnr: false, half_upgraded: false }), canCheck: true })
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
		let result = at({ status: idle({ beta_enabled: false }) })
		expect(result.current).toBe('check')
		expect(result.primary).toEqual({ action: 'check', label: TEXT.actions.continue })
		expect(states(result)).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo'])

		result = at({ status: idle({ beta_enabled: false }), readiness: { ...ready, state: 'attention' } })
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
		['the core has not answered', { ready: false }, 'plan_wait', true, ''],
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
			expect(result.primary).toBeNull()
		}
		if (mode === 'plan_failed')
			expect(result.primary.action).toBe('plan')
	})

	it('asks for the plan again when it is older than the refresh', () => {
		const result = at({ memory: memoryOf({ refreshed: true, stalePlanIds: [ID] }), plan: planOf({ raw: PLAIN }) })
		expect(result.current).toBe('plan')
		expect(result.mode).toBe('plan_older')
		expect(result.auto).toBe('plan')
		// another plan, made after it, is good
		expect(at({ memory: memoryOf({ refreshed: true, stalePlanIds: [ID] }), plan: planOf({ raw: OTHER }) }).current).toBe('rehearse')
	})

	it('rehearses, or skips, then starts, on a plan that is alive', () => {
		let result = at({ plan: planOf({ raw: PLAIN }) })
		expect(result.current).toBe('rehearse')
		expect(result.primary).toEqual({ action: 'rehearse', label: TEXT.actions.continue })
		expect(result.secondary).toEqual({ action: 'skip', label: TEXT.skip })
		expect(result.steps[2].state).toBe('done')
		// a live plan is the core's word that the machine passed the check, and says nothing of the refresh
		expect(states(result).slice(0, 2)).toEqual(['skipped', 'skipped'])

		for (const memory of [memoryOf({ rehearsed: true }), memoryOf({ rehearseSkipped: true })]) {
			result = at({ plan: planOf({ raw: PLAIN }), memory })
			expect(result.current).toBe('start')
			expect(result.primary).toEqual({ action: 'start', label: TEXT.actions.start })
			expect(result.steps[3].state).toBe(memory.rehearsed ? 'done' : 'skipped')
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

	it('says it is finished once the verdict was closed, with every step done', () => {
		const result = at({ memory: memoryOf({ finished: true }) })
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
		for (const input of [undefined, null, 5, 'x', [], { status: view('refreshed'), memory: 'x', readiness: 5, plan: [] }, { status: idle(), memory: { stalePlanIds: 'x' }, plan: { raw: 'x' } }]) {
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
	const memories = [newMemory(), memoryOf({ refreshed: true }), memoryOf({ refreshSkipped: true }), memoryOf({ rehearsed: true }), memoryOf({ rehearseSkipped: true }), memoryOf({ refreshed: true, rehearsed: true, stalePlanIds: [ID] }), memoryOf({ finished: true })]
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
								expect((plan.raw !== null && !memory.stalePlanIds.includes(ID)) || plan.raw === OTHER, label).toBe(true)
							// at most one primary, never past a stop, never on an old answer
							if (result.blocked && result.primary)
								expect(result.primary.action, label).toBe('check')
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
		for (const state of ['succeeded', 'succeeded_with_findings', 'manual_done'])
			expect(remember(newMemory(), view(state), closed).finished, state).toBe(true)
		for (const state of ['failed', 'verifying', 'awaiting_reboot', 'needs_attention'])
			expect(remember(newMemory(), view(state), closed).finished, state).toBe(false)
	})

	it('notes the plan that is alive when a refresh is seen, once, and changes nothing in place', () => {
		const memory = newMemory()
		const next = remember(memory, closed, view('refreshing'), ID)
		expect(next.stalePlanIds).toEqual([ID])
		expect(memory.stalePlanIds).toEqual([])
		expect(remember(next, view('refreshing'), view('refreshed'), ID).stalePlanIds).toEqual([ID])
		expect(remember(memory, closed, view('refreshing'), '').stalePlanIds).toEqual([])
		expect(remember(memory, closed, view('rehearsing'), ID).stalePlanIds).toEqual([])
		expect(forgetPlan(memory, ID).stalePlanIds).toEqual([ID])
		// the core's refusal is its word that the refresh was done
		expect(forgetPlan(memory, ID).refreshed).toBe(true)
		expect(forgetPlan(forgetPlan(memory, ID), ID).stalePlanIds).toEqual([ID])
		expect(forgetPlan(memory, '')).toBe(memory)
	})

	it('takes a plan that is alive as the refresh being behind, unless the plan is older than a refresh', () => {
		expect(notePlan(newMemory(), ID).refreshSkipped).toBe(true)
		expect(notePlan(newMemory(), '').refreshSkipped).toBe(false)
		expect(notePlan(memoryOf({ stalePlanIds: [ID] }), ID).refreshSkipped).toBe(false)
		expect(notePlan(memoryOf({ refreshed: true }), ID).refreshSkipped).toBe(false)
		const memory = newMemory()
		notePlan(memory, ID)
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
