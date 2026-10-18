<template>
	<div class="os-wizard">
		<!-- always there, so that a change of step is announced: once per change, not once per answer -->
		<p class="os-wizard-live is-sr-only" aria-live="polite" role="status">
			{{ announced }}
		</p>

		<!-- every sentence below is a language-file key: nothing of the core is put in them -->
		<section v-if="canCheck || usable" aria-labelledby="os-wizard-title" class="os-wizard-guide mt-5">
			<h4 id="os-wizard-title" class="os-wizard-title has-text-weight-semibold">
				{{ $t(TEXT.heading) }}
			</h4>

			<!-- the steps and what to do next need the state of the machine: a core that does not say it leaves the report and the plan, as they were -->
			<nav v-if="usable" :aria-label="$t(TEXT.stepsLabel)" class="mt-2">
				<ol class="os-wizard-steps">
					<li v-for="(step, index) in view.steps"
						:key="step.id"
						:aria-current="step.id === view.current ? 'step' : null"
						class="os-wizard-step"
						:class="[`is-${step.state}`, { 'is-current': step.id === view.current }]">
						<b-icon aria-hidden="true" class="os-wizard-mark" :icon="ICONS[step.state]" size="is-small" />
						<span class="os-wizard-step-text">
							<span class="os-wizard-step-title has-text-weight-semibold">{{ index + 1 }}. {{ $t(TEXT.steps[step.id].title) }}</span>
							<span class="os-wizard-step-state is-size-7">{{ $t(TEXT.states[step.state]) }}</span>
							<span v-if="step.reason" class="os-wizard-step-reason is-size-7 _has-text-gray">{{ $t(step.reason) }}</span>
						</span>
					</li>
				</ol>
			</nav>

			<p v-if="usable && position" class="os-wizard-position has-text-weight-semibold mt-3">
				{{ position }}
			</p>
			<p v-if="usable" id="os-wizard-next" ref="next" class="os-wizard-next mt-1" tabindex="-1">
				{{ $t(view.next.key, view.next.params) }}
			</p>

			<div v-if="usable && (view.primary || view.secondary)" class="os-wizard-actions is-flex is-flex-wrap-wrap mt-3">
				<b-button v-if="view.primary"
					aria-describedby="os-wizard-next"
					class="os-wizard-primary"
					:class="`is-${view.primary.action}`"
					:disabled="disabled"
					:label="$t(view.primary.label)"
					rounded
					type="is-primary"
					@click="go(view.primary.action, $event)" />
				<b-button v-if="view.secondary"
					class="os-wizard-secondary"
					:class="`is-${view.secondary.action}`"
					:disabled="disabled"
					:label="$t(view.secondary.label)"
					rounded
					@click="go(view.secondary.action, $event)" />
			</div>

			<!-- the sections that exist, under the step they belong to: the step that is current is open -->
			<details v-for="id in shownSteps"
				:key="id"
				class="os-wizard-body mt-3"
				:class="`is-${id}`"
				:open="opened[id]"
				@toggle="opened[id] = $event.target.open">
				<summary class="has-text-weight-semibold">
					{{ STEP_IDS.indexOf(id) + 1 }}. {{ $t(TEXT.steps[id].title) }}
				</summary>
				<p class="os-wizard-what mt-2">
					{{ $t(TEXT.steps[id].what) }}
				</p>
				<!-- a read-only report: it asks the core, and changes nothing on the machine -->
				<os-upgrade-readiness v-if="id === 'check' && canCheck" ref="readiness" :locale="locale" @report="readiness = $event" @state="readinessState = $event" />
				<!-- what apt would do and the text to do it by hand: it asks the core, and changes nothing on the machine -->
				<os-upgrade-plan v-if="id === 'plan' && canCheck" ref="plan" :locale="locale" :readiness-state="readinessState" @plan="livePlan = $event" @progress="progress = $event" />
			</details>
		</section>

		<!-- the operation itself: its state, its buttons, the beta switch, the dialogs -->
		<os-upgrade-run ref="run"
			:can-check="canCheck"
			:locale="locale"
			:plan="plan"
			wizard
			@refused="onRefused"
			@status="onStatus"
			@usable="onUsable" />
	</div>
</template>

<script>
import OsUpgradePlan from './OsUpgradePlan.vue'
import OsUpgradeReadiness from './OsUpgradeReadiness.vue'
import OsUpgradeRun from './OsUpgradeRun.vue'
import { startNeeds } from './osUpgrade'
import { STEP_IDS, TEXT, autoAction, forgetPlan, newMemory, notePlan, remember, wizardView } from './osWizard'

const ICONS = {
	done: 'check-circle-outline',
	current: 'arrow-right-circle-outline',
	todo: 'circle-outline',
	blocked: 'alert-circle-outline',
	stopped: 'close-octagon-outline',
	skipped: 'help-circle-outline',
}

export default {
	name: 'OsUpgradeWizard',
	components: { OsUpgradePlan, OsUpgradeReadiness, OsUpgradeRun },
	props: {
		// The language of the dates, as the window says its own sentences.
		locale: {
			type: String,
			default: 'en_us',
		},
		// Whether the machine can be checked (the readiness report and the plan are there).
		canCheck: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['usable'],
	data() {
		return {
			TEXT,
			ICONS,
			STEP_IDS,
			// what the operation says: its status as a view, whether that is an old one, whether a call is out
			report: { view: null, stale: false, acting: '' },
			usable: false,
			readiness: { asked: false, busy: false, failed: false, state: '' },
			readinessState: '',
			progress: { ready: false, plannable: false, running: false, failed: false },
			livePlan: null,
			memory: newMemory(),
			opened: {},
			announced: '',
			// a click is being carried out: a second one does nothing
			locked: false,
			// the plan was asked for by itself on arriving at its step: once per arrival
			autoAsked: false,
		}
	},
	computed: {
		plan() {
			return this.canCheck ? this.livePlan : null
		},
		view() {
			return wizardView({
				status: this.report.view,
				stale: this.report.stale,
				readiness: this.readiness,
				plan: { ...this.progress, raw: this.plan },
				memory: this.memory,
				canCheck: this.canCheck,
			})
		},
		planId() {
			return startNeeds(this.plan, false)?.planId ?? ''
		},
		// every step when the state is read; the report and the plan, as before, when it is not
		shownSteps() {
			return this.usable ? STEP_IDS : STEP_IDS.filter(id => id === 'check' || id === 'plan')
		},
		position() {
			const at = this.view.current ? STEP_IDS.indexOf(this.view.current) : -1
			return at < 0 ? '' : this.$t(TEXT.stepOf, { n: at + 1, total: STEP_IDS.length, title: this.$t(TEXT.steps[this.view.current].title) })
		},
		disabled() {
			return this.locked || Boolean(this.report.acting) || this.readiness.busy || this.progress.running
		},
	},
	watch: {
		// a plan that is alive: the refresh is behind
		'planId': {
			immediate: true,
			handler(id) {
				this.memory = notePlan(this.memory, id)
			},
		},
		// the step that is current is open, and the others are shut until the person opens them
		'view.current': {
			immediate: true,
			handler(current, before) {
				this.opened = current ? { [current]: true } : {}
				if (current !== 'plan')
					this.autoAsked = false
				if (current && before) {
					const n = STEP_IDS.indexOf(current) + 1
					this.announced = this.$t(TEXT.changed, { n, total: STEP_IDS.length, title: this.$t(TEXT.steps[current].title) })
				} else if (!current && before && this.view.mode === 'finished') {
					this.announced = this.$t(TEXT.finished)
				}
				// a button that went with its step takes the focus with it: the sentence that says what is next gets it
				this.$nextTick(() => {
					const active = document.activeElement
					if (before && (!active || active === document.body))
						this.$refs.next?.focus?.({ preventScroll: true })
				})
			},
		},
		'view.auto': {
			immediate: true,
			handler(auto) {
				if (auto !== 'plan' || this.autoAsked)
					return
				// the plan reads and changes nothing on the machine: it is asked for on arriving, once (it is there once it said it can be made)
				this.$nextTick(() => {
					const plan = this.child('plan')
					if (!plan || this.autoAsked || this.view.auto !== 'plan')
						return
					this.autoAsked = true
					plan.start()
				})
			},
		},
	},
	methods: {
		onUsable(usable) {
			this.usable = usable
			this.$emit('usable', usable)
		},
		onStatus(report) {
			const before = this.report.view
			this.report = report
			if (report.view !== before)
				this.memory = remember(this.memory, before, report.view, this.planId)
			this.autoClose()
		},
		// After a rehearsal was put back, the operation that ended is closed by itself, once.
		autoClose() {
			if (autoAction(this.report.view, this.memory) !== 'close' || this.report.acting || this.locked)
				return
			this.memory = { ...this.memory, closeRehearsal: false }
			this.go('close')
		},
		// the core refused a start because a refresh came after the plan: the plan is made again
		onRefused(code) {
			if (code === 'plan_older_than_refresh')
				this.memory = forgetPlan(this.memory, this.planId)
		},
		child(name) {
			const ref = this.$refs[name]
			return Array.isArray(ref) ? ref[0] : ref
		},
		button(action) {
			return this.report.view?.buttons.find(button => button.action === action) ?? null
		},
		// The one action of the guide. A click while one is being carried out does nothing; the calls themselves are the operation's.
		async go(action, event) {
			if (this.locked)
				return
			this.locked = true
			const run = this.child('run')
			try {
				switch (action) {
					case 'check':
						this.child('readiness')?.check()
						break
					case 'beta':
						run.pressBeta(event)
						break
					case 'refresh':
						run.pressRefresh(event)
						break
					case 'plan':
						await this.child('plan')?.start()
						break
					case 'rehearse':
						run.pressStart(true, event)
						break
					case 'start':
						run.pressStart(false, event)
						break
					case 'reboot':
						await this.press('reboot', event)
						break
					case 'close':
						await this.press('acknowledge', event)
						break
					case 'discard':
						// put back, and then the operation that ended is closed by itself
						this.memory = { ...this.memory, closeRehearsal: true }
						if (await this.press('discard', event) === false)
							this.memory = { ...this.memory, closeRehearsal: false }
						break
					case 'already':
						this.memory = { ...this.memory, refreshSkipped: true }
						break
					case 'skip':
						this.memory = { ...this.memory, rehearseSkipped: true }
						break
				}
			} finally {
				this.locked = false
			}
			this.autoClose()
		},
		// One of the server's buttons; nothing is called when the server does not offer it.
		press(action, event) {
			const button = this.button(action)
			return button ? this.child('run').press(button, event) : undefined
		},
	},
}
</script>

<style lang="scss" scoped>
.os-wizard-title {
	font-size: 1rem;
}

.os-wizard-guide {
	font-size: 0.875rem;
}

.os-wizard-steps {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	gap: 0.5rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.os-wizard-step {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
	padding: 0.5rem;
	border: 1px solid var(--casa-border-hairline);
	border-radius: 0.5rem;
	overflow-wrap: anywhere;

	// the current step is told in words and by the frame; the colour is only a help
	&.is-current {
		border-width: 2px;
		border-color: var(--casa-text);
	}

	&.is-blocked .os-wizard-mark,
	&.is-stopped .os-wizard-mark {
		color: var(--casa-text-attention);
	}

	&.is-skipped .os-wizard-mark {
		color: var(--casa-text-warning);
	}
}

.os-wizard-mark {
	flex-shrink: 0;
	margin-top: 0.1rem;
}

.os-wizard-step-text {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.os-wizard-next {
	&:focus {
		outline: none;
	}
}

.os-wizard-actions {
	gap: 0.5rem;
}

.os-wizard-body summary {
	cursor: pointer;
}

// a long label (in French) wraps in a narrow window instead of leaving it
.os-wizard :deep(.button) {
	max-width: 100%;
	line-height: 1.3;
	white-space: normal;
}

// a window on a phone: one column
@media (max-width: 768px) {
	.os-wizard-steps {
		grid-template-columns: 1fr;
	}
}
</style>
