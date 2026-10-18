<template>
	<section v-if="visible" aria-labelledby="os-plan-title" class="os-plan mt-5">
		<h4 id="os-plan-title" class="os-plan-title has-text-weight-semibold">
			{{ $t('What would the upgrade do?') }}
		</h4>
		<p class="os-plan-readonly _has-text-gray mt-1">
			{{ $t('This plan changes nothing on the machine: apt works in a temporary folder that is removed afterwards. It downloads the package lists of the next release, which takes a few minutes.') }}
		</p>

		<div v-if="plannable" class="mt-3">
			<!-- stays focusable while it works (loading, not disabled): the focus is not lost with it -->
			<b-button ref="start" class="os-plan-start" :label="$t(asked ? 'Make the plan again' : 'See what the upgrade would do')" :loading="running" rounded @click="start" />
		</div>

		<!-- always there, so what changes in it is announced: the step, the wait, a refusal, a failure, a plan that is gone or has
			expired. The plan that is done is not in it: that result takes the focus. -->
		<div class="os-plan-live mt-2" aria-live="polite" role="status">
			<p v-if="running" class="os-plan-busy is-flex is-align-items-center _has-text-gray">
				<b-icon aria-hidden="true" class="mr-2" custom-class="mdi-spin" icon="loading" size="is-small" />
				<span class="os-plan-step">{{ stepText }}</span>
			</p>
			<p v-if="waiting" class="os-plan-lost is-size-7 _has-text-gray mt-1">
				{{ $t('The machine has not answered for a few seconds. This window keeps asking.') }}
			</p>
			<b-message v-if="callError" class="os-plan-call-failure" size="is-small" type="is-danger">
				{{ say(callError) }}
			</b-message>
			<!-- the core could not ask the machine whether a plan can be made: that is not a machine that cannot be planned, and there is no
				button to start one until it has been asked again -->
			<b-message v-if="unknown" class="os-plan-unknown mt-3" size="is-small" type="is-warning">
				<p>{{ $t('The machine could not be asked whether the upgrade can be planned. That does not mean it cannot: try again in a moment.') }}</p>
				<b-button class="os-plan-ask-again mt-2" :label="$t('Try again')" :loading="asking" rounded size="is-small" @click="askAgain" />
			</b-message>

			<!-- every value below is a text node: names, files and the lines of the sources are never HTML -->
			<b-message v-if="failure" class="os-plan-failure mt-3" size="is-small" type="is-danger">
				<h5 class="os-plan-failure-title has-text-weight-semibold">
					{{ say(failure.sentence) }}
				</h5>
				<p v-if="failure.place" class="os-plan-place mt-1">
					{{ say(failure.place) }}
				</p>
				<p v-if="failure.reason" class="os-plan-reason mt-1">
					{{ $t(failure.reason) }}
				</p>
				<!-- the proxy of the box may be in one of the files that the sandbox did not get: the network that cannot be reached is not the only cause to look at -->
				<div v-if="failure.confLeftOut.length" class="os-plan-failure-conf is-size-7 mt-2">
					<p>{{ $t('These files of apt\'s own configuration were not used by the plan, which reads only plain settings of the network and of recommended packages. If a proxy was set in one of them, the plan could not use it, and that may be why it failed.') }}</p>
					<ul class="os-plan-conf-files">
						<li v-for="(item, index) in failure.confLeftOut" :key="index">
							{{ confText(item) }}
						</li>
					</ul>
					<p v-if="failure.confCut" class="os-plan-failure-conf-cut">
						{{ $t(PLAN_LIST_CUT) }}
					</p>
				</div>
				<p v-if="failure.phase" class="os-plan-failed-step is-size-7 mt-1">
					{{ phaseText(PLAN_ERROR_STEP, failure.phase) }}
				</p>
				<p v-if="failure.finishedAt" class="os-plan-failed-on is-size-7 mt-1">
					{{ $t(PLAN_FAILED_ON, { date: failure.finishedAt }) }}
				</p>
				<details v-if="failure.detail.length" class="os-plan-said mt-2">
					<summary class="is-size-7">
						{{ $t(failure.saidKey) }}
					</summary>
					<ul class="os-plan-said-lines is-size-7">
						<li v-for="(line, index) in failure.detail" :key="index">
							{{ line }}
						</li>
					</ul>
				</details>
			</b-message>

			<b-message v-if="vanished" class="os-plan-vanished mt-3" size="is-small" type="is-warning">
				{{ $t('The plan is no longer on the machine: ReCasaOS may have restarted while it was being made. Make it again.') }}
			</b-message>
			<!-- the plan that was on the screen, and that the core no longer has: not a plan that expired (it says so itself when it does) -->
			<b-message v-else-if="withdrawn" class="os-plan-withdrawn mt-3" size="is-small" type="is-warning">
				{{ $t('The plan is no longer on the machine: ReCasaOS may have restarted since it was made. Make a new one.') }}
			</b-message>
			<b-message v-else-if="expired" class="os-plan-expired mt-3" size="is-small" type="is-warning">
				{{ $t('The last plan has expired. Make a new one.') }}
			</b-message>
			<!-- a job that is over could not remove the folder it worked in: said as it is, whatever else the job ended in -->
			<b-message v-if="leftBehind" class="os-plan-left-behind mt-3" size="is-small" type="is-warning">
				{{ $t('A temporary folder that the plan made could not be removed: {folder}. It holds only the package lists and settings that the plan made, and can take up some 200 MiB. ReCasaOS removes it when it next starts, if it is more than ten minutes old. You can also delete it yourself.', { folder: leftBehind }) }}
			</b-message>
		</div>

		<div v-if="plan" class="os-plan-report mt-3">
			<b-message class="os-plan-verdict" size="is-small" :type="plan.tone">
				<h5 ref="result" class="os-plan-result has-text-weight-semibold" tabindex="-1">
					{{ say(plan.summary) }}
				</h5>
				<p v-if="plan.shortId && plan.madeAt && plan.expiresAt" class="os-plan-meta is-size-7 mt-1">
					{{ $t('Plan {id}, made on {date}, valid until {until}.', { id: plan.shortId, date: plan.madeAt, until: plan.expiresAt }) }}
				</p>
			</b-message>

			<section v-if="plan.problems.length" class="os-plan-group is-findings mt-3">
				<h5 class="os-plan-group-title has-text-weight-semibold">
					{{ $t('Findings') }}
				</h5>
				<ul class="os-plan-items mt-1">
					<li v-for="item in plan.problems" :key="item.id" class="os-plan-item" :class="`is-${item.severity}`">
						<b-icon aria-hidden="true" class="os-plan-item-icon" :icon="ICONS[item.severity]" size="is-small" />
						<div class="os-plan-item-body">
							<p class="os-plan-item-badge is-size-7 has-text-weight-semibold">
								{{ $t(item.badge) }}
							</p>
							<p class="os-plan-item-sentence">
								{{ say(item.sentence) }}
							</p>
							<p v-if="item.details.length" class="os-plan-item-details is-size-7 _has-text-gray">
								{{ detailsText(item) }}
							</p>
						</div>
					</li>
				</ul>
			</section>

			<section class="os-plan-group is-sources mt-3">
				<h5 class="os-plan-group-title has-text-weight-semibold">
					{{ $t('Package sources') }}
				</h5>
				<p v-if="plan.sources.dockerFiles" class="os-plan-docker mt-1">
					{{ $t('Docker\'s package source ({files}) is put aside while the upgrade runs. It is put back afterwards if Docker has published the new release; otherwise it stays aside until you put it back.', { files: plan.sources.dockerFiles }) }}
				</p>
				<p v-if="plan.sources.otherPaused" class="os-plan-others mt-1">
					{{ $t('Other sources, put aside for the upgrade and left aside afterwards: {files}.', { files: plan.sources.otherPaused }) }}
				</p>
				<p v-if="plan.sources.dropped" class="os-plan-dropped mt-1">
					{{ $t('Lines of backports or proposed updates left out: {n}', { n: plan.sources.dropped }) }}
				</p>
				<p v-if="plan.sources.firmware" class="os-plan-firmware mt-1">
					{{ $t('Lines that get the firmware component non-free-firmware: {n}', { n: plan.sources.firmware }) }}
				</p>
				<details v-for="(file, index) in plan.sources.files" :key="index" class="os-plan-file mt-2" open>
					<summary class="has-text-weight-medium">
						{{ fileTitle(file) }}
					</summary>
					<ul class="os-plan-lines mt-1">
						<li v-for="(line, at) in file.lines" :key="at" class="os-plan-line">
							<span v-if="line.n" class="os-plan-lineno is-size-7 _has-text-gray">{{ $t('Line {n}', { n: line.n }) }}</span>
							<!-- the arrow is for the eye: a line that changes says in words which of its two forms is which, for the ear -->
							<span v-if="line.after" class="is-sr-only">{{ $t('Before') }}</span>
							<code class="os-plan-before">{{ line.before }}</code>
							<template v-if="line.after">
								<span aria-hidden="true"> → </span>
								<span class="is-sr-only">{{ $t('After') }}</span>
								<code class="os-plan-after">{{ line.after }}</code>
							</template>
							<span v-if="line.why.length" class="os-plan-why is-size-7 _has-text-gray"> ({{ whyText(line) }})</span>
						</li>
					</ul>
					<p v-if="file.more" class="os-plan-more is-size-7 _has-text-gray">
						{{ $t('And {n} more lines.', { n: file.more }) }}
					</p>
				</details>
			</section>

			<section class="os-plan-group is-packages mt-3">
				<h5 class="os-plan-group-title has-text-weight-semibold">
					{{ $t('Packages') }}
				</h5>
				<!-- a table scrolls sideways in its own box when a phone's width is too narrow for it, and its words are not cut -->
				<div class="os-plan-scroll mt-1">
					<table class="table is-narrow os-plan-counts">
						<thead>
							<tr>
								<th :aria-label="$t('Packages')"></th>
								<th>{{ $t('Full upgrade') }}</th>
								<th>{{ $t('First, minimal upgrade') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in countRows" :key="row.key">
								<th scope="row">
									{{ row.label }}
								</th>
								<td>{{ row.full }}</td>
								<td>{{ row.first }}</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h6 class="has-text-weight-medium mt-2">
					{{ $t('Packages that would be removed') }}
				</h6>
				<p v-if="!plan.removals.length" class="os-plan-no-removals mt-1">
					{{ $t('No package would be removed.') }}
				</p>
				<div v-else class="os-plan-scroll mt-1">
					<table class="table is-narrow os-plan-removals">
						<thead>
							<tr>
								<th>{{ $t('Name') }}</th>
								<th>{{ $t('Version') }}</th>
								<th :aria-label="$t('Notes')"></th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(removal, index) in plan.removals" :key="index" class="os-plan-removal">
								<td>{{ removal.name }}</td>
								<td>{{ removal.version }}</td>
								<td>
									<div class="tags">
										<span v-if="removal.manual" class="os-plan-badge is-manual tag is-warning is-light">{{ $t('Installed by hand') }}</span>
										<span v-if="removal.protected" class="os-plan-badge is-protected tag is-danger is-light">{{ $t('Protected') }}</span>
										<span v-if="removal.essential" class="os-plan-badge is-essential tag is-danger is-light">{{ $t('Essential') }}</span>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<details v-if="plan.added.count" class="os-plan-names is-new mt-2">
					<summary>{{ $t('New packages ({n})', { n: plan.added.count }) }}</summary>
					<p class="os-plan-names-list is-size-7 mt-1">
						{{ plan.added.names }}
					</p>
					<p v-if="plan.added.truncated" class="is-size-7 _has-text-gray">
						{{ $t('The list is cut: there are more.') }}
					</p>
				</details>
				<details v-if="plan.keptBack.count" class="os-plan-names is-kept-back mt-2">
					<summary>{{ $t('Kept back after the full upgrade ({n})', { n: plan.keptBack.count }) }}</summary>
					<p class="os-plan-names-list is-size-7 mt-1">
						{{ plan.keptBack.names }}
					</p>
					<p v-if="plan.keptBack.truncated" class="is-size-7 _has-text-gray">
						{{ $t('The list is cut: there are more.') }}
					</p>
				</details>
				<details v-if="plan.unneeded.count" class="os-plan-names is-unneeded mt-2">
					<summary>{{ $t('No longer needed afterwards ({n})', { n: plan.unneeded.count }) }}</summary>
					<p class="is-size-7 _has-text-gray mt-1">
						{{ $t('apt lists them and does not remove them: that is yours to decide afterwards.') }}
					</p>
					<p class="os-plan-names-list is-size-7 mt-1">
						{{ plan.unneeded.names }}
					</p>
					<p v-if="plan.unneeded.truncated" class="is-size-7 _has-text-gray">
						{{ $t('The list is cut: there are more.') }}
					</p>
				</details>
			</section>

			<section class="os-plan-group is-disk mt-3">
				<h5 class="os-plan-group-title has-text-weight-semibold">
					{{ $t('Disk space') }}
				</h5>
				<template v-if="plan.estimates.known">
					<p class="os-plan-download mt-1">
						{{ $t('Download: {size}', { size: plan.estimates.download }) }}
					</p>
					<p class="os-plan-extra">
						{{ $t(freed ? 'Disk space the upgrade would free: {size}' : 'Disk space the upgrade would use: {size}', { size: plan.estimates.extra }) }}
					</p>
				</template>
				<p v-if="plan.diskNote" class="os-plan-estimates-unknown mt-1">
					{{ $t(plan.diskNote) }}
				</p>
				<div v-if="plan.disk.length" class="os-plan-scroll mt-1">
					<table class="table is-narrow os-plan-disk">
						<thead>
							<tr>
								<th>{{ $t('Where') }}</th>
								<th>{{ $t('Needed') }}</th>
								<th>{{ $t('Free') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(row, index) in plan.disk" :key="index" class="os-plan-disk-row" :class="{ 'is-short': !row.ok }">
								<td>{{ row.path }}</td>
								<td>{{ row.need }}</td>
								<td>
									<template v-if="row.unknown">
										{{ $t('Could not be read') }}
									</template>
									<template v-else>
										{{ row.free }}
									</template>
									<span v-if="!row.ok" class="os-plan-short has-text-weight-semibold"> ({{ $t('Not enough') }})</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<div v-if="plan.confLeftOut.length" class="os-plan-conf is-size-7 _has-text-gray mt-3">
				<p>
					{{ $t('These files of apt\'s own configuration were not used for this plan, which reads only plain settings of the network and of recommended packages. If a proxy was set in one of them, the plan could not use it.') }}
				</p>
				<ul class="os-plan-conf-files">
					<li v-for="(item, index) in plan.confLeftOut" :key="index">
						{{ confText(item) }}
					</li>
				</ul>
				<p v-if="plan.confCut" class="os-plan-conf-cut">
					{{ $t(PLAN_LIST_CUT) }}
				</p>
			</div>

			<div class="mt-3">
				<b-button class="os-plan-copy" :label="$t('Copy the plan')" rounded @click="copyPlan" />
			</div>
			<div v-if="showPlanText" class="os-plan-text mt-2">
				<p class="is-size-7">
					{{ $t('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.') }}
				</p>
				<textarea ref="planText" :aria-label="$t('The plan, as text')" class="textarea is-small mt-1" readonly rows="8" :value="planTextValue"></textarea>
			</div>

			<p v-if="plan.verdict === 'blocked'" class="os-plan-no-runbook mt-4">
				{{ $t('A blocked plan has no runbook: the findings above say why.') }}
			</p>
			<!-- one per plan: another plan that takes the place of this one gets a runbook area of its own, closed, and not what was open in this -->
			<details v-else :key="plan.id" class="os-plan-runbook mt-4" @toggle="onRunbookToggle">
				<summary class="has-text-weight-semibold">
					{{ $t('Runbook to do it by hand') }}
				</summary>
				<p class="os-plan-runbook-honest mt-2">
					{{ $t('This text is for you to run on the machine, in a console, after taking a snapshot of the machine. ReCasaOS does not run it for you. It was written for exactly this machine and this plan: if the machine changes, make a new plan.') }}
				</p>
				<p class="os-plan-runbook-secret is-size-7 _has-text-gray mt-1">
					{{ $t('It holds the lines of your package sources as the files have them, a password in an address included: keep it to yourself.') }}
				</p>
				<p v-if="runbook.loading" class="os-plan-runbook-loading mt-2 _has-text-gray">
					{{ $t('Writing the runbook') }}
				</p>
				<b-message v-else-if="runbook.failure" class="os-plan-runbook-failure mt-2" size="is-small" type="is-danger">
					<p>{{ say(runbook.failure) }}</p>
					<!-- one button, by what can still help: the text may come when asked again, or it is not for this plan (the core is asked for the plan), or it cannot be written for this plan and only a new plan can have one -->
					<b-button v-if="runbook.failure.button === 'retry'" ref="runbookRetry" class="os-plan-runbook-retry mt-2" :label="$t('Try again')" rounded size="is-small" @click="loadRunbook" />
					<b-button v-else-if="runbook.failure.button === 'look'" ref="runbookLook" class="os-plan-runbook-look mt-2" :label="$t('Look at the plan again')" :loading="looking" rounded size="is-small" @click="lookAgain" />
				</b-message>
				<template v-else-if="runbook.view">
					<h6 ref="runbookBlocks" class="os-plan-runbook-blocks has-text-weight-medium mt-2" tabindex="-1">
						{{ $t('Blocks, in order') }}
					</h6>
					<!-- numbered as the text of the runbook numbers them, from 0 (BLOCK 0 to BLOCK 8): the point of no return reads the same here and there -->
					<ol class="os-plan-blocks mt-1">
						<li v-for="block in runbook.view.blocks" :key="block.id" class="os-plan-block">
							{{ blockTitle(block) }}
							<span v-if="block.reboot" class="os-plan-badge is-reboot tag is-info is-light">{{ $t('Restart the machine after this block') }}</span>
							<span v-if="block.pointOfNoReturn" class="os-plan-badge is-no-return tag is-danger is-light">{{ $t('Point of no return') }}</span>
						</li>
					</ol>
					<!-- wraps: three buttons do not fit in a phone's width -->
					<div class="os-plan-runbook-buttons is-flex is-flex-wrap-wrap mt-2">
						<b-button class="os-plan-runbook-copy" :label="$t('Copy the runbook')" rounded @click="copyRunbook" />
						<b-button class="os-plan-runbook-download" :label="$t('Download .sh')" rounded @click="downloadRunbook" />
						<b-button class="os-plan-runbook-show" :label="$t(shownText ? 'Hide the text' : 'Show the text')" rounded @click="toggleRunbookText" />
					</div>
					<div v-if="runbook.shown" class="os-plan-runbook-text mt-2">
						<p v-if="runbook.refused" class="is-size-7">
							{{ $t('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.') }}
						</p>
						<textarea ref="runbookText" :aria-label="$t('The runbook, as text')" class="textarea is-small mt-1" readonly rows="12" :value="runbook.view.text"></textarea>
					</div>
				</template>
			</details>
		</div>
	</section>
</template>

<script>
import copy from 'clipboard-copy'
import FileSaver from 'file-saver'
import { DETAIL_FORMAT, detailLabel } from './osReadiness'
import { PLAN_CALL_ERRORS, PLAN_ERROR_STEP, PLAN_FAILED_ON, PLAN_LIST_CUT, PLAN_PHASE_UNKNOWN, PLAN_STEP, RUNBOOK_OTHER_FAILURE, RUNBOOK_UNREADABLE_FAILURE, callFailure, planText, readStatus, runbookFailure, runbookView, startRefusal } from './osPlan'

// What each weight of a finding shows next to it: the icon is for the eye, the badge's words are for the ear.
const ICONS = {
	blocked: 'alert-circle-outline',
	needs_acceptance: 'alert-outline',
	info: 'information-outline',
}

// The states of the readiness report that are not an upgrade from here: there is no plan to ask for.
const NO_PLAN = ['unsupported', 'latest']

// One request at a time, a second after the last answer.
const POLL_MS = 1000

// How many answers in a row that did not come before the window says it is waiting for the machine.
const LOST_AFTER = 3

// The most a timer can be told to wait: 2147483647 ms, 24.8 days. A browser fires a longer one at once.
const MAX_TIMER_DELAY = 2147483647

const newRunbook = () => ({ loading: false, failure: null, view: null, shown: false, refused: false, asked: false })

export default {
	name: 'OsUpgradePlan',
	props: {
		// The language of the dates and the sizes, as the window says its own sentences.
		locale: {
			type: String,
			default: 'en_us',
		},
		// The state of the readiness report above, when it was asked: the plan is not offered for a system it says is unsupported or the latest.
		readinessState: {
			type: String,
			default: '',
		},
	},
	// `progress` is what the upgrade guide reads: whether the core has answered, whether a plan can be made, whether a job runs, whether the last ask failed.
	emits: ['plan', 'progress'],
	data() {
		return {
			ICONS,
			PLAN_ERROR_STEP,
			PLAN_FAILED_ON,
			PLAN_LIST_CUT,
			// whether the core has answered once, and whether it said a plan can be made
			ready: false,
			plannable: false,
			// the core could not ask the machine whether a plan can be made (said by the core: not a reason, and not a "no")
			unknown: false,
			asking: false,
			// the core is being asked for the plan again, because the text of the runbook is not for the plan on the screen
			looking: false,
			// the last answer of the core that could be read, or null
			status: null,
			starting: false,
			// the answers in a row that did not come, while the job is followed
			lost: 0,
			// a job of this window is being followed, and what ended it
			watching: false,
			vanished: false,
			// a plan that was on the screen, and that the core does not have any more, without a word of its own that it ran out
			withdrawn: false,
			// why the request did not start a job, as a message of the view, or a sentence of a call that failed
			refusal: null,
			callError: null,
			planTextValue: '',
			showPlanText: false,
			runbook: newRunbook(),
			// which asking of the runbook is the one that counts: a plan that is made again drops the one that is out
			runbookRun: 0,
			timer: null,
			// the plan on the screen has run out: by this machine's clock, and the core did not say otherwise
			outdated: false,
			expiryTimer: null,
			gone: false,
		}
	},
	computed: {
		visible() {
			return this.ready && (this.plannable || this.unknown) && !NO_PLAN.includes(this.readinessState)
		},
		// the folder of the sandbox that the last job could not remove, or ''
		leftBehind() {
			return this.status?.leftBehind ?? ''
		},
		running() {
			return this.starting || this.status?.state === 'running'
		},
		// the machine has not answered for a few asks in a row
		waiting() {
			return this.running && this.lost >= LOST_AFTER
		},
		plan() {
			return this.status?.state === 'done' && !this.outdated ? this.status.plan : null
		},
		// the plan that is offered on the screen, as the core sent it, for the section below that starts the upgrade from it; null when none is
		offered() {
			return this.visible && this.plan ? this.status.raw : null
		},
		// why the job failed, or why the request that would have started it was refused
		failure() {
			return this.refusal ?? (this.status?.state === 'failed' ? this.status.error : null)
		},
		expired() {
			return this.outdated || (this.status?.state === 'idle' && this.status.expired)
		},
		asked() {
			return Boolean(this.plan || this.failure || this.vanished || this.withdrawn)
		},
		// what the upgrade does with the disk, as it is said: it uses some, or it frees some
		freed() {
			return Boolean(this.plan?.estimates.freed)
		},
		shownText() {
			return this.runbook.shown
		},
		stepText() {
			// the step of a job that runs: while a new one is being asked for, the step of the job that ended before is not the one it is at
			const phase = this.status?.state === 'running' ? this.status.phase : null
			return phase ? this.phaseText(PLAN_STEP, phase) : this.$t(PLAN_PHASE_UNKNOWN)
		},
		progress() {
			return { ready: this.ready, plannable: this.plannable, running: this.running, failed: Boolean(this.failure) }
		},
		countRows() {
			const { full, first } = this.plan.counts
			const say = value => value === null ? '–' : String(value)
			return [
				['upgraded', 'Upgraded'],
				['new', 'Newly installed'],
				['removed', 'Removed'],
				['keptBack', 'Kept back'],
			].map(([key, label]) => ({ key, label: this.$t(label), full: say(full[key]), first: say(first[key]) }))
		},
	},
	watch: {
		offered(raw) {
			this.$emit('plan', raw)
		},
		progress: {
			immediate: true,
			handler(progress) {
				this.$emit('progress', progress)
			},
		},
	},
	async mounted() {
		const status = await this.refresh()
		if (this.gone)
			return
		this.ready = true
		if (status)
			this.take(status)
	},
	beforeUnmount() {
		// an answer that comes after the window closed has nobody to tell, and no request is made again
		this.gone = true
		clearTimeout(this.timer)
		clearTimeout(this.expiryTimer)
	},
	methods: {
		// a message of the view: a language-file key with its data
		say(message) {
			return this.$t(message.key, message.params || {})
		},

		// the core's other fields of a finding it does not know, as `name: value`
		detailsText(item) {
			return item.details.map((detail) => {
				const label = detailLabel(detail.name)
				return this.$t(DETAIL_FORMAT, { name: label ? this.$t(label) : detail.name, value: detail.value })
			}).join(' · ')
		},

		// the name of a file of apt's configuration that was left out, and why
		confText(item) {
			return this.$t(DETAIL_FORMAT, { name: item.file, value: this.$t(item.reasonKey) })
		},

		// the step a job is at or stopped at, in a sentence that has its number and what it does
		phaseText(key, phase) {
			return this.$t(key, { step: phase.step, total: phase.total, what: this.$t(phase.key) })
		},

		// the name of a file, and what became of it: `sources.list: Rewritten for the next release`
		fileTitle(file) {
			return this.$t(DETAIL_FORMAT, { name: file.file, value: this.$t(file.actionKey) })
		},

		whyText(line) {
			return line.why.map(word => this.$t(word)).join(', ')
		},

		// a block of the runbook, by the number the text of the runbook gives it: `Block 3: write the sources of Debian 12, ...`
		blockTitle(block) {
			// the core writes the titles in English: a language that has the sentence says it, the others keep the core's words
			const title = this.$te(block.title) ? this.$t(block.title) : block.title
			return this.$t(DETAIL_FORMAT, { name: this.$t('Block {n}', { n: String(block.number) }), value: title })
		},

		// One ask of the core: what it said, read, or null when it did not answer or said what cannot be read.
		async refresh() {
			try {
				return readStatus((await this.$api.sys.getOsPlan())?.data?.data, this.locale)
			} catch {
				return null
			}
		},

		// What the core said of the job, taken in: a job that runs is followed, one that has ended is shown.
		take(status) {
			const hadPlan = Boolean(this.plan)
			// a job that begins to be followed, or a plan that is not the one on the screen: what the screen held of the earlier plan goes
			if ((status.state === 'running' && !this.watching) || (status.state === 'done' && status.plan?.id !== this.status?.plan?.id))
				this.forget()
			this.status = status
			// a plan that was on the screen and that the core does not have, with no word that it ran out: it says so (until a job takes its place)
			this.withdrawn = status.state === 'idle' && hadPlan && !status.expired
			this.plannable = status.plannable
			this.unknown = status.unknown
			this.armExpiry()
			if (status.state === 'running') {
				this.watching = true
				this.vanished = false
				this.next()
				return
			}
			clearTimeout(this.timer)
			if (!this.watching)
				return
			this.watching = false
			// a job that was followed and is not there any more, with neither a plan nor a failure: the core was restarted
			this.vanished = status.state === 'idle'
			// a plan takes the focus; a failure is announced where it is (the live region), and the button to ask again is at hand
			this.$nextTick(() => this.$refs.result?.focus?.())
		},

		// What the screen held of a plan that is replaced: its runbook, the one that is being asked for, its text.
		forget() {
			this.runbookRun++
			this.runbook = newRunbook()
			this.showPlanText = false
			this.outdated = false
		},

		// A plan lives 24 hours in the core and a window can stay open longer: when the clock of this machine says the plan on the
		// screen has run out, it is looked at again.
		armExpiry() {
			clearTimeout(this.expiryTimer)
			const at = this.plan?.expiresMs
			// a plan that is further off than a timer can wait (the clock of this machine is more than 24.8 days behind the core's) is waited for
			// in turns: the timer that runs early finds the plan in its time, and is set again for what is left (see stillValid)
			if (typeof at === 'number')
				this.expiryTimer = setTimeout(() => this.stillValid(), Math.min(Math.max(at - Date.now(), 0), MAX_TIMER_DELAY))
		},
		// Whether the plan on the screen can still be offered. By the clock of this machine it may have run out, and that clock is
		// not the core's: the core is asked, and what it says is shown (the plan is gone, or it is another one). A core that cannot
		// be reached says nothing for the plan, and a plan that may have run out is not offered.
		async stillValid() {
			const plan = this.plan
			if (!plan)
				return false
			if (plan.expiresMs === null || Date.now() < plan.expiresMs) {
				// the timer ran before the time, by a clock that was set back since: it is set again for what is left
				this.armExpiry()
				return true
			}
			const status = await this.refresh()
			if (this.gone || this.plan !== plan)
				return false
			if (status?.state === 'done' && status.plan?.id === plan.id)
				return true
			if (status)
				this.take(status)
			else
				this.outdated = true
			return false
		},

		// A setTimeout chain, not an interval: one request at a time, and it goes on after an error.
		next() {
			clearTimeout(this.timer)
			this.timer = setTimeout(() => this.tick(), POLL_MS)
		},
		async tick() {
			const status = await this.refresh()
			if (this.gone)
				return
			if (!status) {
				this.lost += 1
				this.next()
				return
			}
			this.lost = 0
			this.take(status)
		},

		// The core said it could not ask the machine: ask it again, one request at a time. An answer that does not come leaves what was said.
		async askAgain() {
			if (this.asking)
				return
			this.asking = true
			const status = await this.refresh()
			if (this.gone)
				return
			this.asking = false
			if (status) {
				this.take(status)
				// the message that held the button is gone when the answer is good: the focus goes to the button that took its place
				this.$nextTick(() => this.focusIfLost(this.$refs.start?.$el))
			}
		},

		// The button that was pressed goes with the message it was in, and the focus with it (it falls to the page behind the window):
		// when nothing else has it by then, it goes to what took the place.
		focusIfLost(element) {
			const active = document.activeElement
			if (!active || active === document.body)
				element?.focus?.()
		},

		// One request at a time: a second click while one is out, or while the job runs, does nothing.
		async start() {
			if (this.running)
				return
			this.starting = true
			this.refusal = null
			this.callError = null
			this.vanished = false
			this.lost = 0
			// the plan on the screen, and its runbook, stay until a job takes their place (see take): a request that is refused or
			// fails leaves them as they were
			let status = null
			let key = PLAN_CALL_ERRORS.failed
			try {
				status = readStatus((await this.$api.sys.startOsPlan())?.data?.data, this.locale)
			} catch (error) {
				if (this.gone)
					return
				const refusal = startRefusal(error, this.locale)
				if (refusal) {
					this.starting = false
					this.refusal = refusal
					return
				}
				key = callFailure(error)
			}
			if (this.gone)
				return
			if (status?.state === 'running') {
				this.starting = false
				this.take(status)
				return
			}
			// the answer did not come, or could not be read: the job may have begun all the same, so ask once
			this.callError = { key, params: {} }
			const found = await this.refresh()
			if (this.gone)
				return
			this.starting = false
			if (found?.state === 'running') {
				this.callError = null
				this.take(found)
			}
		},

		// A browser may refuse the clipboard (a box served over plain http): then the text is shown selected, to copy by hand.
		async copyPlan() {
			const text = planText(this.status?.raw)
			if (!text || !await this.stillValid())
				return
			this.planTextValue = text
			this.copyOut(text, () => {
				this.showPlanText = false
			}, () => {
				this.showPlanText = true
				this.$nextTick(() => this.selectIn(this.$refs.planText))
			})
		},
		copyOut(text, done, refused) {
			Promise.resolve().then(() => copy(text)).then(
				() => {
					done()
					this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
				},
				refused,
			)
		},
		selectIn(area) {
			area?.focus?.()
			area?.select?.()
		},

		// The runbook is asked for when it is opened, and not before: it holds the files of the sources as they are.
		onRunbookToggle(event) {
			if (event?.target?.open && !this.runbook.asked)
				this.loadRunbook()
		},
		async loadRunbook() {
			if (this.runbook.loading)
				return
			this.runbook = { ...newRunbook(), asked: true, loading: true }
			const run = ++this.runbookRun
			const expected = this.plan?.id
			let view = null
			let failure = null
			try {
				view = runbookView((await this.$api.sys.getOsRunbook())?.data?.data)
				failure = view ? null : RUNBOOK_UNREADABLE_FAILURE
				// a newer plan took the place of this one: this text is not for what is on the screen
				if (view && (!expected || view.planId !== expected)) {
					view = null
					failure = RUNBOOK_OTHER_FAILURE
				}
			} catch (error) {
				failure = runbookFailure(error)
			}
			// the window closed, or the plan was made again while the text was being written: it is not the one on the screen
			if (this.gone || run !== this.runbookRun)
				return
			this.runbook = { ...newRunbook(), asked: true, view, failure }
			// the button of "Try again" went when the text began to be written, and the focus with it: it goes to the blocks that are
			// there now, or to the button of the new failure
			this.$nextTick(() => this.focusIfLost(view ? this.$refs.runbookBlocks : (this.$refs.runbookRetry ?? this.$refs.runbookLook)?.$el))
		},
		// The text is not for the plan on the screen (a newer plan was made, and asking for the text again says the same): the core is asked for
		// its plan again, and what it says is taken in, as it is when the owner asks again. A newer plan takes the place of this one, with a
		// runbook area of its own; when the core still says this plan, the text is asked for again, so that the button never does nothing.
		async lookAgain() {
			if (this.looking)
				return
			this.looking = true
			const before = this.plan?.id
			const status = await this.refresh()
			if (this.gone)
				return
			this.looking = false
			if (!status) {
				this.callError = { key: PLAN_CALL_ERRORS.failed, params: {} }
				return
			}
			this.callError = null
			this.take(status)
			if (this.plan && this.plan.id === before)
				await this.loadRunbook()
			// the button went with the failure it was in, and the focus with it: it goes to what took the place
			this.$nextTick(() => this.focusIfLost(this.$refs.result ?? this.$refs.start?.$el))
		},
		async copyRunbook() {
			const text = this.runbook.view?.text
			if (!text || !await this.stillValid())
				return
			this.copyOut(text, () => {
				this.runbook.refused = false
			}, () => {
				this.runbook.shown = true
				this.runbook.refused = true
				this.$nextTick(() => this.selectIn(this.$refs.runbookText))
			})
		},
		toggleRunbookText() {
			this.runbook.shown = !this.runbook.shown
			this.runbook.refused = false
		},
		// A file made here, from the text that is on the screen: the name has the id of the plan, which is checked to be the core's form.
		async downloadRunbook() {
			const view = this.runbook.view
			if (view && await this.stillValid())
				FileSaver.saveAs(new Blob([view.text], { type: 'text/x-shellscript;charset=utf-8' }), view.fileName)
		},
	},
}
</script>

<style lang="scss" scoped>
.os-plan {
	font-size: 0.875rem;
}

.os-plan-title {
	font-size: 1rem;
}

.os-plan-failure-title {
	font-size: 1rem;
}

.os-plan-result {
	font-size: 1rem;

	&:focus {
		outline: none;
	}
}

// the names come from the machine: a long one wraps instead of leaving the window
.os-plan-report,
.os-plan-failure {
	overflow-wrap: anywhere;
}

// a table keeps its words whole (`anywhere` would cut "Needed" in two to make the table narrower) and scrolls sideways in its own box
.os-plan-scroll {
	overflow-x: auto;
	overflow-wrap: break-word;
}

// the buttons of the runbook go on a second line when the window is narrow
.os-plan-runbook-buttons {
	gap: 0.5rem;
}

.os-plan-conf-files {
	margin: 0.25rem 0 0 1.25rem;
	list-style: disc;
}

// the blocks of the runbook carry their own numbers, from 0, as the text of the runbook does: no marker of the list, which would count from 1
.os-plan-items,
.os-plan-lines,
.os-plan-said-lines,
.os-plan-blocks {
	margin: 0;
	padding: 0;
	list-style: none;
}

.os-plan-item {
	display: flex;
	gap: 0.5rem;
	padding: 0.5rem 0;
	border-top: 1px solid var(--casa-border-hairline);

	&:first-child {
		border-top: 0;
	}

	.os-plan-item-icon {
		flex-shrink: 0;
		margin-top: 0.05rem;
		color: var(--casa-text-secondary);
	}

	&.is-blocked .os-plan-item-icon {
		color: var(--casa-text-attention);
	}

	&.is-needs_acceptance .os-plan-item-icon {
		color: var(--casa-text-warning);
	}
}

.os-plan-item-body {
	flex: 1 1 auto;
	min-width: 0;
}

.os-plan-line {
	padding: 0.15rem 0;

	.os-plan-lineno {
		margin-right: 0.5rem;
	}

	// a line of a file of sources is text to read, not a warning: the colour of Bulma's code is a red
	code {
		padding: 0.1rem 0.3rem;
		color: var(--casa-text);
		background: var(--casa-surface-sunken);
		white-space: pre-wrap;
	}
}

summary {
	cursor: pointer;
}

.os-plan-counts,
.os-plan-removals,
.os-plan-disk {
	background: transparent;
	font-size: 0.8125rem;

	th,
	td {
		padding: 0.25rem 0.75rem 0.25rem 0;
		border: 0;
	}
}

// room that is lacking is said in words as well as in colour (Bulma colours the cells, so the row's colour is not enough)
.os-plan-disk-row.is-short td {
	color: var(--casa-text-attention);
}

.os-plan-badge {
	margin-left: 0.25rem;
}

.os-plan-text .textarea,
.os-plan-runbook-text .textarea {
	font-family: monospace;
	resize: vertical;
}
</style>
