<template>
	<div class="os-run-root">
		<!-- always there, so that what changes in it is announced: the state, once per change (not once per answer) -->
		<p class="os-run-live is-sr-only" aria-live="polite" role="status">
			{{ announced }}
		</p>

		<!-- every value below is a text node: the lines, the names and the codes come from the machine and from the core, never HTML -->
		<section v-if="visible" aria-labelledby="os-run-title" class="os-run mt-5">
			<h4 id="os-run-title" class="os-run-title has-text-weight-semibold">
				{{ $t(TEXT.heading) }}
			</h4>

			<!-- a core that does not answer: said in words, with the last state that was read below it -->
			<b-message v-if="outage && outage.message" class="os-run-outage mt-2" size="is-small" :type="outage.level === 'look' ? 'is-danger' : 'is-warning'">
				<p class="os-run-outage-message has-text-weight-semibold">
					{{ say(outage.message) }}
				</p>
				<p v-if="outage.elapsed" class="os-run-outage-elapsed">
					{{ say(outage.elapsed) }}
				</p>
				<div v-if="outage.hint" class="os-run-after mt-2">
					<h5 class="has-text-weight-semibold">
						{{ $t(TEXT.outage.hintHeading) }}
					</h5>
					<p v-if="outage.hint.backupFolder" class="os-run-after-folder mt-1">
						{{ fact(TEXT.outage.bkPath, outage.hint.backupFolder) }}
					</p>
					<p v-if="outage.hint.log" class="os-run-after-log mt-1">
						{{ fact(TEXT.outage.log, outage.hint.log) }}
					</p>
					<template v-if="outage.hint.commands.length">
						<p class="mt-2 has-text-weight-semibold">
							{{ $t(TEXT.outage.commands) }}
						</p>
						<ul class="os-run-commands">
							<li v-for="command in outage.hint.commands" :key="command" class="os-run-command">
								<os-upgrade-copyable :text="command" />
							</li>
						</ul>
					</template>
					<template v-if="outage.hint.block8">
						<p class="mt-2 has-text-weight-semibold">
							{{ $t(TEXT.outage.block8) }}
						</p>
						<os-upgrade-copyable block :text="outage.hint.block8" />
					</template>
				</div>
			</b-message>
			<p v-if="stale" class="os-run-stale is-size-7 _has-text-gray mt-1">
				{{ $t(TEXT.stale) }}
			</p>

			<div v-if="callError && !dialog" class="os-run-call mt-3" role="alert">
				<b-message class="os-run-call-failure" size="is-small" type="is-danger">
					<p class="os-run-call-sentence">
						{{ say(callError.message) }}
					</p>
					<ul v-if="callError.items.length" class="os-run-call-items">
						<li v-for="(item, index) in callError.items" :key="index">
							<template v-if="item.message">
								{{ say(item.message) }}
							</template>
							<code class="is-size-7">{{ item.code }}</code>
						</li>
					</ul>
					<code v-if="callError.code" class="os-run-call-code is-size-7">{{ callError.code }}</code>
				</b-message>
			</div>

			<template v-if="view">
				<b-message v-for="banner in view.banners" :key="banner.id" class="os-run-banner mt-3" :class="`is-${banner.id}`" size="is-small" :type="banner.tone">
					{{ $t(banner.key) }}
				</b-message>

				<b-message class="os-run-state mt-3" :class="`is-group-${view.group}`" size="is-small" :type="view.tone">
					<h5 ref="stateTitle" class="os-run-state-title has-text-weight-semibold" tabindex="-1">
						{{ $t(view.title) }}
					</h5>
					<p class="os-run-group is-size-7 has-text-weight-semibold mt-1">
						{{ $t(view.groupLabel) }}
					</p>
					<p class="os-run-what mt-1">
						{{ $t(view.what) }}
					</p>
					<!-- a state that this page does not know: the core's word for it, as text, and no button -->
					<p v-if="!view.known" class="os-run-unknown mt-1">
						<code>{{ view.state }}</code>
					</p>
					<p v-if="view.cause" class="os-run-cause mt-1">
						{{ say(view.cause) }}
					</p>
					<p v-if="view.next" class="os-run-next mt-1">
						{{ fact(TEXT.failure.todo, $t(view.next)) }}
					</p>

					<ul class="os-run-facts mt-2">
						<li v-for="row in facts" :key="row.id" class="os-run-fact" :class="`is-${row.id}`">
							{{ row.text }}
						</li>
					</ul>
					<progress v-if="view.progress"
						class="os-run-progress progress is-small is-info mt-2"
						:aria-label="say(view.progress.label)"
						:max="view.progress.max"
						:value="view.progress.value">
						{{ view.progress.value }} / {{ view.progress.max }}
					</progress>

					<!-- the codes of the core, small, for support -->
					<p v-if="view.codes.length" class="os-run-codes is-size-7 mt-2">
						<span>{{ $t(TEXT.summary.codes) }}</span>
						<code v-for="code in view.codes" :key="code" class="ml-1">{{ code }}</code>
					</p>
				</b-message>

				<b-message v-if="view.failure" class="os-run-failure mt-3" size="is-small" type="is-danger">
					<h5 class="os-run-failure-title has-text-weight-semibold">
						{{ $t(TEXT.failure.heading) }}
					</h5>
					<p class="os-run-failure-what mt-1">
						{{ say(view.failure.what) }}
					</p>
					<p v-if="view.failure.next" class="os-run-failure-next mt-1">
						{{ fact(TEXT.failure.todo, say(view.failure.next)) }}
					</p>
					<p v-if="view.failure.hint" class="os-run-failure-hint mt-1">
						{{ say(view.failure.hint) }}
					</p>
					<p v-if="view.failure.stage" class="os-run-failure-stage is-size-7 mt-1">
						{{ fact(TEXT.failure.stage, view.failure.stage) }}
					</p>
					<p v-if="view.failure.rc !== null" class="os-run-failure-rc is-size-7">
						{{ fact(TEXT.failure.rc, String(view.failure.rc)) }}
					</p>
					<p v-if="view.failure.detail" class="os-run-failure-detail is-size-7 mt-1">
						{{ fact(TEXT.failure.detail, view.failure.detail) }}
					</p>
				</b-message>

				<b-message v-if="view.hint" class="os-run-hint mt-3" size="is-small" type="is-info">
					<p class="os-run-hint-message">
						{{ say(view.hint.message) }}
					</p>
					<template v-if="view.hint.commands.length">
						<p class="mt-2 has-text-weight-semibold">
							{{ $t(TEXT.hints.commands) }}
						</p>
						<ul class="os-run-commands">
							<li v-for="command in view.hint.commands" :key="command" class="os-run-command">
								<os-upgrade-copyable :text="command" />
							</li>
						</ul>
						<p class="os-run-hint-note is-size-7 mt-1">
							{{ $t(TEXT.hints.note) }}
						</p>
					</template>
				</b-message>

				<section v-if="barrierItems.length || (view.barrier && view.barrier.blocked)" class="os-run-barrier mt-3">
					<h5 class="os-run-list-title has-text-weight-semibold">
						{{ $t(TEXT.lists.barrier) }}
					</h5>
					<ul class="os-run-items mt-1">
						<li v-for="(item, index) in barrierItems" :key="index" class="os-run-item" :class="item.tone">
							<span class="os-run-badge is-size-7 has-text-weight-semibold">{{ $t(item.ok ? TEXT.severities.warn : TEXT.severities.error) }}</span>
							<span class="os-run-item-sentence">{{ say(item.message) }}</span>
							<span v-if="item.arg" class="os-run-item-arg is-size-7">{{ item.arg }}</span>
							<code class="is-size-7">{{ item.code }}</code>
						</li>
					</ul>
					<p v-if="view.barrier.blocked" class="os-run-barrier-blocked has-text-weight-semibold mt-1">
						{{ $t(TEXT.lists.barrierBlocked) }}
					</p>
				</section>

				<section v-if="view.findings.length" class="os-run-findings mt-3">
					<h5 class="os-run-list-title has-text-weight-semibold">
						{{ $t(TEXT.lists.findings) }}
					</h5>
					<ul class="os-run-items mt-1">
						<li v-for="(item, index) in view.findings" :key="index" class="os-run-item" :class="item.tone">
							<span class="os-run-badge is-size-7 has-text-weight-semibold">{{ $t(item.severityLabel) }}</span>
							<span class="os-run-item-sentence">{{ say(item.message) }}</span>
							<span v-if="item.arg" class="os-run-item-arg is-size-7">{{ item.arg }}</span>
							<span v-if="item.apps.length" class="os-run-item-apps is-size-7">{{ fact(TEXT.lists.apps, item.apps.join(', ')) }}</span>
							<code class="is-size-7">{{ item.code }}</code>
						</li>
					</ul>
				</section>

				<section v-if="view.notJudged.length" class="os-run-not-judged mt-3">
					<h5 class="os-run-list-title has-text-weight-semibold">
						{{ $t(TEXT.lists.notJudged) }}
					</h5>
					<ul class="os-run-items mt-1">
						<li v-for="(item, index) in view.notJudged" :key="index" class="os-run-item">
							<span class="os-run-item-sentence">{{ say(item.message) }}</span>
							<span v-if="item.arg" class="os-run-item-arg is-size-7">{{ item.arg }}</span>
						</li>
					</ul>
				</section>

				<section v-if="view.notReturned.length" class="os-run-not-returned mt-3">
					<h5 class="os-run-list-title has-text-weight-semibold">
						{{ $t(TEXT.lists.notReturned) }}
					</h5>
					<ul class="os-run-items mt-1">
						<li v-for="(item, index) in view.notReturned" :key="index" class="os-run-item">
							<span class="os-run-item-sentence">{{ say(item.message) }}</span>
						</li>
					</ul>
				</section>

				<section v-if="view.group === 'manual' && view.manual" class="os-run-manual mt-3">
					<h5 class="os-run-list-title has-text-weight-semibold">
						{{ $t(TEXT.lists.manual) }}
					</h5>
					<ul class="os-run-facts mt-1">
						<li class="os-run-manual-done">
							{{ fact(TEXT.lists.blocksDone, blocksText(view.manual.done)) }}
						</li>
						<li class="os-run-manual-next">
							{{ fact(TEXT.lists.nextBlock, blocksText(view.manual.next ? [view.manual.next] : [])) }}
						</li>
						<li class="os-run-manual-pnr">
							{{ $t(view.manual.pnr ? TEXT.lists.pnrBehind : TEXT.lists.pnrAhead) }}
						</li>
						<li v-if="view.manual.backupFolder" class="os-run-manual-folder">
							{{ fact(TEXT.lists.backupFolder, view.manual.backupFolder) }}
						</li>
					</ul>
				</section>

				<details v-if="view.logTail.length || view.group === 'working'" class="os-run-log mt-3">
					<summary class="has-text-weight-medium">
						{{ $t(TEXT.lists.logTail) }}
					</summary>
					<pre v-if="view.logTail.length" class="os-run-log-text mt-1" tabindex="0" :aria-label="$t(TEXT.lists.logTail)">{{ view.logTail.join('\n') }}</pre>
					<p v-else class="os-run-log-empty mt-1">
						{{ $t(TEXT.lists.noLog) }}
					</p>
				</details>

				<!-- the word that closes a run that is half upgraded or needs attention: the button stays shut until it is typed -->
				<div v-if="wordButton" class="os-run-word mt-3">
					<label class="label" for="os-run-word-input">{{ $t(TEXT.word.label) }}</label>
					<p id="os-run-word-help" class="os-run-word-help is-size-7">
						{{ $t(TEXT.word.help) }}
						<code v-if="view.ackWord" class="os-run-word-text">{{ view.ackWord }}</code>
					</p>
					<input id="os-run-word-input"
						v-model="typed"
						aria-describedby="os-run-word-help"
						autocapitalize="off"
						autocomplete="off"
						class="os-run-word-input input is-small mt-1"
						:disabled="Boolean(acting)"
						:placeholder="$t(TEXT.word.input)"
						spellcheck="false"
						type="text">
				</div>

				<!-- exactly the server's buttons, in its order -->
				<div v-if="view.buttons.length" class="os-run-buttons is-flex is-flex-wrap-wrap mt-3">
					<b-button v-for="button in view.buttons"
						:key="button.action"
						class="os-run-button"
						:class="`is-${button.action}`"
						:disabled="disabledFor(button)"
						:label="$t(button.label)"
						:loading="acting === button.action"
						rounded
						@click="press(button, $event)" />
				</div>

				<div v-if="view.launch.switch" class="os-run-beta mt-4">
					<p class="os-run-beta-label has-text-weight-semibold">
						{{ $t(TEXT.beta.label) }}
					</p>
					<p class="os-run-beta-state">
						{{ $t(view.launch.betaEnabled ? TEXT.beta.on : TEXT.beta.off) }}
					</p>
					<p v-if="!view.launch.betaEnabled" class="os-run-beta-note is-size-7 _has-text-gray">
						{{ $t(TEXT.beta.offNote) }}
					</p>
					<b-button class="os-run-beta-switch mt-2"
						:disabled="Boolean(acting) || stale"
						:label="$t(view.launch.betaEnabled ? TEXT.beta.switchOff : TEXT.beta.switchOn)"
						:loading="acting === 'beta'"
						rounded
						@click="pressBeta" />
				</div>

				<div v-if="view.launch.refresh" class="os-run-refresh mt-4">
					<p v-if="!view.open" class="os-run-refresh-about">
						{{ $t(TEXT.refresh.about) }}
					</p>
					<div class="os-run-buttons is-flex is-flex-wrap-wrap mt-2">
						<b-button v-if="!view.open"
							class="os-run-refresh-button"
							:disabled="Boolean(acting) || stale"
							:label="$t(TEXT.refresh.button)"
							:loading="acting === 'refresh'"
							rounded
							@click="callAction('startOsRefresh', false, 'refresh')" />
						<b-button v-if="view.launch.acceptChange"
							class="os-run-refresh-accept"
							:disabled="Boolean(acting) || stale"
							:label="$t(TEXT.refresh.accept)"
							rounded
							@click="pressAccept" />
					</div>
				</div>

				<div v-if="view.launch.start" class="os-run-start mt-4">
					<div class="os-run-buttons is-flex is-flex-wrap-wrap">
						<b-button class="os-run-rehearsal"
							:disabled="Boolean(acting) || stale || !startable"
							:label="$t(TEXT.start.rehearsalButton)"
							rounded
							@click="pressStart(true, $event)" />
						<b-button class="os-run-hop"
							:disabled="Boolean(acting) || stale || !startable"
							:label="$t(TEXT.start.hopButton)"
							rounded
							@click="pressStart(false, $event)" />
					</div>
					<p v-if="startHint" class="os-run-start-hint is-size-7 _has-text-gray mt-1">
						{{ say(startHint) }}
					</p>
				</div>

				<!-- the text of the run: read when it is taken over, or when the owner asks for it -->
				<details v-if="view.runbook.available" :key="view.runId" class="os-run-runbook mt-4" :open="view.runbook.auto" @toggle="onRunbookToggle">
					<summary class="has-text-weight-semibold">
						{{ $t(TEXT.runbook.show) }}
					</summary>
					<p class="os-run-runbook-about mt-2">
						{{ $t(TEXT.runbook.about) }}
					</p>
					<p v-if="runbook.loading" class="os-run-runbook-loading mt-2 _has-text-gray">
						{{ $t(TEXT.runbook.loading) }}
					</p>
					<b-message v-else-if="runbook.failure" class="os-run-runbook-failure mt-2" size="is-small" type="is-danger">
						<p>{{ say(runbook.failure.message) }}</p>
						<b-button class="os-run-runbook-retry mt-2" :label="$t('Try again')" rounded size="is-small" @click="loadRunbook" />
					</b-message>
					<os-upgrade-copyable v-else-if="runbook.text" block class="os-run-runbook-text mt-2" :text="runbook.text" />
				</details>
			</template>
		</section>

		<!-- the confirmation windows: Buefy's modal, with the focus on the heading and not on the button that acts -->
		<b-modal :aria-label="dialogTitle || $t(TEXT.confirm.title)"
			aria-modal
			aria-role="dialog"
			animation="zoom-in"
			:auto-focus="false"
			:can-cancel="['outside']"
			custom-class="os-run-modal"
			has-modal-card
			:model-value="Boolean(dialog)"
			scroll="keep"
			trap-focus
			@close="closeDialog">
			<div v-if="dialog" class="modal-card os-run-dialog" :class="`is-${dialog.kind}`">
				<header class="modal-card-head">
					<h5 :ref="focusHeading" class="modal-card-title os-run-dialog-title" tabindex="-1">
						{{ dialogTitle }}
					</h5>
				</header>
				<section class="modal-card-body">
					<p v-for="(line, index) in dialogBody" :key="index" class="os-run-dialog-line" :class="{ 'mt-2': index }">
						{{ line }}
					</p>

					<template v-if="needs">
						<fieldset v-if="needs.safetyNet" class="os-run-field mt-3">
							<legend class="has-text-weight-semibold">
								{{ $t(TEXT.start.safetyNet) }}
							</legend>
							<label v-for="net in SAFETY_NETS" :key="net" class="radio os-run-radio" :class="`is-${net}`">
								<input v-model="form.safetyNet" name="os-run-safety-net" type="radio" :value="net">
								<span>{{ $t(SAFETY_NET_TEXTS[net]) }}</span>
							</label>
						</fieldset>

						<div class="os-run-field mt-3">
							<label class="label" for="os-run-hostname">{{ $t(TEXT.start.hostname) }}</label>
							<input id="os-run-hostname"
								v-model="form.hostname"
								aria-describedby="os-run-hostname-help"
								autocapitalize="off"
								autocomplete="off"
								class="os-run-hostname input"
								spellcheck="false"
								type="text">
							<p id="os-run-hostname-help" class="help">
								{{ $t(TEXT.start.hostnameHelp) }}
							</p>
						</div>

						<fieldset class="os-run-field mt-3">
							<legend class="is-sr-only">
								{{ dialogTitle }}
							</legend>
							<div v-for="ack in needs.acks" :key="ack" class="os-run-ack-row">
								<label class="checkbox os-run-ack" :class="`is-${ack}`">
									<input v-model="form.acks" type="checkbox" :value="ack">
									<span>{{ $t(ACK_TEXTS[ack]) }}</span>
								</label>
								<div v-if="ack === 'sources_paused' && needs.paused.length" class="os-run-paused mt-1">
									<p class="has-text-weight-semibold">
										{{ $t(TEXT.start.paused) }}
									</p>
									<ul class="os-run-names">
										<li v-for="name in needs.paused" :key="name">
											{{ shown(name) }}
										</li>
									</ul>
								</div>
								<div v-if="ack === 'removals_read' && needs.removals.length" class="os-run-removals mt-1">
									<p class="has-text-weight-semibold">
										{{ $t(TEXT.start.removals) }}
									</p>
									<ul class="os-run-names">
										<li v-for="name in needs.removals" :key="name">
											{{ shown(name) }}
										</li>
									</ul>
								</div>
							</div>
						</fieldset>

						<p v-if="!startResult.ok" class="os-run-dialog-missing is-size-7 _has-text-gray mt-2">
							{{ $t(TEXT.start.missing) }}
						</p>
					</template>

					<div v-if="callError" class="os-run-call mt-3" role="alert">
						<b-message class="os-run-call-failure" size="is-small" type="is-danger">
							<p class="os-run-call-sentence">
								{{ say(callError.message) }}
							</p>
							<ul v-if="callError.items.length" class="os-run-call-items">
								<li v-for="(item, index) in callError.items" :key="index">
									<template v-if="item.message">
										{{ say(item.message) }}
									</template>
									<code class="is-size-7">{{ item.code }}</code>
								</li>
							</ul>
							<code v-if="callError.code" class="os-run-call-code is-size-7">{{ callError.code }}</code>
						</b-message>
					</div>
				</section>
				<footer class="modal-card-foot os-run-dialog-foot">
					<b-button class="os-run-dialog-cancel" :label="$t('Cancel')" rounded @click="closeDialog" />
					<b-button class="os-run-dialog-ok"
						:disabled="!dialogReady || Boolean(acting)"
						:label="dialogOk"
						:loading="acting === dialog.key"
						rounded
						:type="dialog.danger ? 'is-danger' : 'is-primary'"
						@click="confirmDialog" />
				</footer>
			</div>
		</b-modal>
	</div>
</template>

<script>
import OsUpgradeCopyable from './OsUpgradeCopyable.vue'
import { clean, runbookView } from './osPlan'
import { DETAIL_FORMAT } from './osReadiness'
import {
	ACK_TEXTS,
	REFUSALS,
	SAFETY_NETS,
	SAFETY_NET_TEXTS,
	TEXT,
	announcement,
	buttonBody,
	failureOf,
	nextPoll,
	outageView,
	startBody,
	startNeeds,
	statusFailure,
	statusView,
	wordOk,
} from './osUpgrade'

const newRunbook = () => ({ asked: false, loading: false, failure: null, text: '' })
const newForm = () => ({ safetyNet: '', hostname: '', acks: [] })
const sentence = key => ({ key, params: {} })

export default {
	name: 'OsUpgradeRun',
	components: { OsUpgradeCopyable },
	props: {
		// The language of the dates, as the window says its own sentences.
		locale: {
			type: String,
			default: 'en_us',
		},
		// Whether the machine can be checked (the readiness and the plan sections are there): the section is shown for it, whatever the state.
		canCheck: {
			type: Boolean,
			default: false,
		},
		// The plan that is on the screen, as the core sent it (the plan section hands it over), or null: a start is made from it.
		plan: {
			type: Object,
			default: null,
		},
	},
	data() {
		return {
			TEXT,
			ACK_TEXTS,
			SAFETY_NETS,
			SAFETY_NET_TEXTS,
			// the last status that could be read, as the view of it, or null before the first
			view: null,
			// the scheduler's word for the last ask: 'none', 'ok' or 'error'
			last: 'none',
			// why the last ask failed ('' when it did not), and when the last good answer came
			failure: '',
			lastGoodAt: 0,
			elapsedMs: 0,
			lastLevel: '',
			announced: '',
			// the name of the call that is out ('' when none): one at a time
			acting: '',
			callError: null,
			// the confirmation window that is open, or null; the heading takes the focus when it opens
			dialog: null,
			form: newForm(),
			// the word typed to close a run
			typed: '',
			runId: '',
			runbook: newRunbook(),
			// which asking of the text of the run is the one that counts: another run drops the one that is out
			runbookRun: 0,
			// the button that opened the window, and what is waiting for the window to be there
			opener: null,
			focusPending: false,
			refocus: false,
			timer: null,
			inFlight: false,
			again: false,
			gone: false,
		}
	},
	computed: {
		// said when a run is open, or when the machine can be checked; nothing when the core does not have the feature
		visible() {
			if (this.failure === 'unavailable')
				return false
			if (this.view)
				return this.view.open || this.canCheck
			return Boolean(this.failure) && this.canCheck
		},
		// what is on the screen is the last good answer, and the last ask failed
		stale() {
			return Boolean(this.failure) && Boolean(this.view)
		},
		outage() {
			return this.failure ? outageView({ kind: this.failure, elapsedMs: this.elapsedMs, last: this.view }) : null
		},
		facts() {
			const view = this.view
			if (!view)
				return []
			const rows = []
			if (view.kind.label)
				rows.push({ id: 'kind', text: this.fact(TEXT.summary.kind, this.$t(view.kind.label)) })
			if (view.hop)
				rows.push({ id: 'hop', text: this.fact(TEXT.summary.hop, view.hop) })
			if (view.block)
				rows.push({ id: 'block', text: this.blockText(view) })
			if (view.attempt > 0)
				rows.push({ id: 'attempt', text: this.$t(TEXT.summary.attempt, { n: view.attempt }) })
			if (view.since)
				rows.push({ id: 'since', text: this.fact(TEXT.summary.since, view.since) })
			if (view.lastActivity)
				rows.push({ id: 'last-activity', text: this.fact(TEXT.summary.lastActivity, view.lastActivity) })
			if (view.expiresAt)
				rows.push({ id: 'expires', text: this.fact(TEXT.summary.expires, view.expiresAt) })
			return rows
		},
		// the checks that stand before the restart and are not well, then the warnings of the last block
		barrierItems() {
			const barrier = this.view?.barrier
			return barrier ? [...barrier.red, ...barrier.warnings] : []
		},
		wordButton() {
			return this.view?.buttons.find(button => button.needsWord) ?? null
		},
		wordReady() {
			return wordOk(this.typed, this.view?.ackWord)
		},
		// what a start asks of the plan that is on the screen
		planNeeds() {
			return startNeeds(this.plan, false)
		},
		startable() {
			return Boolean(this.planNeeds) && !this.planNeeds.blocked
		},
		startHint() {
			if (!this.planNeeds)
				return sentence(REFUSALS.no_plan.text[0])
			return this.planNeeds.blocked ? sentence(REFUSALS.plan_blocked[0]) : null
		},
		needs() {
			return this.dialog?.kind === 'start' ? startNeeds(this.plan, this.dialog.rehearsal) : null
		},
		startResult() {
			return this.needs ? startBody(this.plan, { rehearsal: this.dialog.rehearsal, safetyNet: this.form.safetyNet, hostname: this.form.hostname, acks: this.form.acks }) : null
		},
		dialogTitle() {
			return this.dialog ? this.$t(this.dialog.title) : ''
		},
		dialogBody() {
			return this.dialog ? this.dialog.body.map(key => this.$t(key)) : []
		},
		dialogOk() {
			return this.dialog ? this.$t(this.dialog.ok) : ''
		},
		dialogReady() {
			if (!this.dialog)
				return false
			return this.dialog.kind === 'start' ? Boolean(this.startResult?.ok) : true
		},
		planId() {
			return this.planNeeds?.planId ?? ''
		},
	},
	watch: {
		// the plan that was read is not the one on the screen any more: the window that was to start it is closed, and says so
		planId(id) {
			if (this.dialog?.kind !== 'start' || id === this.dialog.planId)
				return
			this.closeDialog()
			this.callError = { kind: 'refusal', code: '', message: sentence(id ? REFUSALS.plan_changed[0] : REFUSALS.no_plan.text[0]), items: [] }
		},
	},
	mounted() {
		document.addEventListener('visibilitychange', this.onVisibility)
		this.schedule()
	},
	beforeUnmount() {
		// an answer that comes after the window closed has nobody to tell, and nothing is asked again
		this.gone = true
		clearTimeout(this.timer)
		document.removeEventListener('visibilitychange', this.onVisibility)
		window.removeEventListener('keyup', this.onEscape, true)
	},
	methods: {
		// a message of the view: a language-file key with its data
		say(message) {
			return this.$t(message.key, message.params || {})
		},
		// `name: value`
		fact(nameKey, value) {
			return this.$t(DETAIL_FORMAT, { name: this.$t(nameKey), value })
		},
		// a name from the plan, as it is shown (what is sent is the plan's own word)
		shown(name) {
			return clean(name, 120)
		},
		// the block that runs: its place in the list, and what it does (the core writes the title in English; a language that has it says it)
		blockText(view) {
			const { block, step } = view
			const title = block.titleKey ? this.$t(block.titleKey) : block.title
			const place = step ? this.say(step) : (block.index ? this.$t(TEXT.lists.block, { n: block.index }) : '')
			return title && place ? this.$t(DETAIL_FORMAT, { name: place, value: title }) : (title || place)
		},
		blocksText(blocks) {
			if (!blocks.length)
				return this.$t(TEXT.lists.noneYet)
			return blocks.map(block => block.number === null ? block.id : this.$t(TEXT.lists.block, { n: block.number })).join(', ')
		},

		// ---- the status ----

		// A setTimeout chain, not an interval: one request at a time. Nothing while the document is hidden: it asks at once when shown again.
		schedule() {
			clearTimeout(this.timer)
			this.timer = null
			if (this.gone || this.inFlight)
				return
			const delay = nextPoll(this.last, { hidden: document.hidden, runOpen: Boolean(this.view?.open) })
			if (delay !== null)
				this.timer = setTimeout(() => this.poll(), delay)
		},
		onVisibility() {
			if (document.hidden) {
				clearTimeout(this.timer)
				this.timer = null
				return
			}
			this.last = 'none'
			this.schedule()
		},
		// One ask of the core. An ask that comes while one is out is made once that one is done, so that a call that changed something is
		// followed by an answer that came after it.
		async poll() {
			if (this.gone)
				return
			if (this.inFlight) {
				this.again = true
				return
			}
			clearTimeout(this.timer)
			this.inFlight = true
			try {
				do {
					this.again = false
					await this.readStatus()
				} while (this.again && !this.gone)
			} finally {
				this.inFlight = false
			}
			this.schedule()
		},
		async readStatus() {
			let raw
			try {
				raw = (await this.$api.sys.getOsUpgradeStatus())?.data?.data
			} catch (error) {
				if (!this.gone)
					this.fail(statusFailure(error))
				return
			}
			if (this.gone)
				return
			const view = statusView(raw, this.locale)
			if (view)
				this.take(view)
			else
				this.fail('failed')
		},
		take(view) {
			const before = this.view
			const note = announcement(before, view)
			if (note)
				this.announced = this.$t(note.key, note.params)
			// the word that was typed is for the state it was typed in
			if (before && before.changeKey !== view.changeKey)
				this.typed = ''
			if (view.runId !== this.runId) {
				this.runId = view.runId
				this.resetRunbook()
			}
			this.view = view
			this.last = 'ok'
			this.failure = ''
			this.lastLevel = ''
			this.lastGoodAt = Date.now()
			// a window for a step that is not offered any more is closed
			if (this.dialog && !this.dialogOffered(view))
				this.closeDialog()
			if (view.runbook.auto && !this.runbook.asked)
				this.loadRunbook()
			this.$nextTick(this.focusIfLost)
		},
		fail(kind) {
			this.last = 'error'
			// a core that has no such route while a run is open is a core that is away (a gateway without its route), not one that lacks the feature
			this.failure = kind === 'unavailable' && this.view?.open ? 'down' : kind
			this.elapsedMs = this.lastGoodAt ? Date.now() - this.lastGoodAt : 0
			const outage = this.outage
			if (outage?.message && outage.level !== this.lastLevel) {
				this.lastLevel = outage.level
				this.announced = this.say(outage.message)
			}
		},
		dialogOffered(view) {
			const dialog = this.dialog
			switch (dialog.kind) {
				case 'button': return view.buttons.some(button => button.action === dialog.button.action)
				case 'beta': return view.launch.switch
				case 'accept': return view.launch.acceptChange
				default: return view.launch.start
			}
		},
		disabledFor(button) {
			return Boolean(this.acting) || this.stale || (button.needsWord && !this.wordReady)
		},

		// ---- the calls ----

		// A click on one of the server's buttons: a step that asks for confirmation opens its window, the others go.
		press(button, event) {
			if (this.acting || this.disabledFor(button))
				return
			if (button.confirm) {
				this.openDialog({
					kind: 'button',
					key: button.action,
					button,
					title: button.confirm.title,
					body: button.confirm.body,
					ok: button.confirm.ok,
					danger: button.confirm.danger,
				}, event)
				return
			}
			this.callAction(button.call, buttonBody(button, this.typed), button.action)
		},
		pressBeta(event) {
			if (this.acting)
				return
			if (this.view.launch.betaEnabled) {
				this.callAction('setOsUpgradeBeta', false, 'beta')
				return
			}
			this.openDialog({ kind: 'beta', key: 'beta', title: TEXT.beta.confirmTitle, body: TEXT.beta.confirmBody, ok: TEXT.beta.confirmOk, danger: false }, event)
		},
		pressAccept(event) {
			if (this.acting)
				return
			this.openDialog({ kind: 'accept', key: 'refresh', title: TEXT.refresh.acceptTitle, body: TEXT.refresh.acceptBody, ok: TEXT.refresh.acceptOk, danger: false }, event)
		},
		pressStart(rehearsal, event) {
			if (this.acting || !this.planNeeds || this.planNeeds.blocked)
				return
			this.openDialog({
				kind: 'start',
				key: 'start',
				rehearsal,
				planId: this.planNeeds.planId,
				title: rehearsal ? TEXT.start.rehearsalTitle : TEXT.start.hopTitle,
				body: rehearsal ? [TEXT.start.rehearsalIntro] : [TEXT.start.hopIntro, TEXT.start.console],
				ok: rehearsal ? TEXT.start.rehearsalOk : TEXT.start.hopOk,
				danger: !rehearsal,
			}, event)
		},
		// The call a window was opened for.
		async confirmDialog() {
			const dialog = this.dialog
			if (this.acting || !this.dialogReady)
				return
			let done
			switch (dialog.kind) {
				case 'button':
					done = await this.callAction(dialog.button.call, buttonBody(dialog.button, this.typed), dialog.key)
					break
				case 'beta':
					done = await this.callAction('setOsUpgradeBeta', true, 'beta')
					break
				case 'accept':
					done = await this.callAction('startOsRefresh', true, 'refresh')
					break
				default:
					done = await this.callAction('startOsUpgrade', this.startResult.body, 'start')
			}
			if (done && this.dialog === dialog)
				this.closeDialog()
		},
		// One call at a time. Whatever came of it, the core is asked for the status at once: the page does not trust its own guess, and a
		// call that timed out may have been carried out.
		async callAction(name, body, key) {
			if (this.acting)
				return false
			this.acting = key
			this.callError = null
			let failure = null
			try {
				await this.$api.sys[name](body)
			} catch (error) {
				failure = failureOf(error, this.locale)
			}
			if (this.gone)
				return false
			this.acting = ''
			if (failure)
				this.callError = failure
			else
				this.typed = ''
			this.refocus = true
			this.poll()
			return !failure
		},

		// ---- the confirmation window ----

		openDialog(spec, event) {
			this.opener = event?.currentTarget ?? document.activeElement
			this.callError = null
			this.form = newForm()
			this.focusPending = true
			this.dialog = spec
			window.addEventListener('keyup', this.onEscape, true)
		},
		closeDialog() {
			if (!this.dialog)
				return
			const opener = this.opener
			this.dialog = null
			this.opener = null
			window.removeEventListener('keyup', this.onEscape, true)
			// the focus goes back to the button that opened the window, or to the state when that button is gone
			this.$nextTick(() => {
				if (opener?.isConnected)
					opener.focus?.({ preventScroll: true })
				else
					this.focusState()
			})
		},
		// Escape closes the window that is on top, and nothing under it: the window this one stands on would close at the same key.
		onEscape(event) {
			if (!this.dialog || (event.key !== 'Escape' && event.key !== 'Esc'))
				return
			event.stopPropagation()
			this.closeDialog()
		},
		// the heading of the window takes the focus when it opens, and only then (a function ref runs at every render)
		focusHeading(element) {
			if (element && this.focusPending) {
				this.focusPending = false
				// the element is not in the page yet: the parts of a window are put together before the window is
				this.$nextTick(() => element.focus?.({ preventScroll: true }))
			}
		},
		focusState() {
			this.$refs.stateTitle?.focus?.({ preventScroll: true })
		},
		// A button that was pressed goes with the state it was for, and the focus with it: it goes to the state that took its place.
		focusIfLost() {
			if (!this.refocus || this.dialog)
				return
			this.refocus = false
			const active = document.activeElement
			if (!active || active === document.body)
				this.focusState()
		},

		// ---- the text of the run ----

		resetRunbook() {
			this.runbookRun++
			this.runbook = newRunbook()
		},
		onRunbookToggle(event) {
			if (event?.target?.open && !this.runbook.asked)
				this.loadRunbook()
		},
		async loadRunbook() {
			if (this.runbook.loading)
				return
			const run = ++this.runbookRun
			this.runbook = { asked: true, loading: true, failure: null, text: '' }
			let text = ''
			let failure = null
			try {
				const view = runbookView((await this.$api.sys.getOsUpgradeRunbook())?.data?.data)
				if (view)
					text = view.text
				else
					failure = failureOf(null, this.locale)
			} catch (error) {
				failure = failureOf(error, this.locale)
			}
			// the window closed, or the run is another one: this text is not for what is on the screen
			if (this.gone || run !== this.runbookRun)
				return
			this.runbook = { asked: true, loading: false, failure, text }
		},
	},
}
</script>

<style lang="scss" scoped>
.os-run {
	font-size: 0.875rem;
}

.os-run-title {
	font-size: 1rem;
}

.os-run-state-title,
.os-run-failure-title {
	font-size: 1rem;

	&:focus {
		outline: none;
	}
}

// the names come from the machine and from the core: a long one wraps instead of leaving the window
.os-run {
	overflow-wrap: anywhere;
}

.os-run-facts,
.os-run-items,
.os-run-commands,
.os-run-names,
.os-run-call-items {
	margin: 0;
	padding: 0;
	list-style: none;
}

.os-run-names {
	margin-left: 1.25rem;
	list-style: disc;
}

.os-run-commands > li + li {
	margin-top: 0.25rem;
}

.os-run-item {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.25rem 0.5rem;
	padding: 0.35rem 0;
	border-top: 1px solid var(--casa-border-hairline);

	&:first-child {
		border-top: 0;
	}

	// the weight is said in a word beside the sentence, and in a colour beside the word
	&.is-danger .os-run-badge {
		color: var(--casa-text-attention);
	}

	&.is-warning .os-run-badge {
		color: var(--casa-text-warning);
	}
}

.os-run-buttons {
	gap: 0.5rem;
}

// the text of the log scrolls in its own box
.os-run-log-text {
	max-height: 14rem;
	padding: 0.5rem;
	overflow: auto;
	color: var(--casa-text);
	background: var(--casa-surface-sunken);
	font-size: 0.8125rem;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

summary {
	cursor: pointer;
}

.os-run-word-text {
	color: var(--casa-text);
	background: var(--casa-surface-sunken);
}

// a window on a phone: one column, the buttons go on a second line
.os-run-dialog {
	.radio,
	.checkbox {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0 0 0.5rem;

		input {
			flex-shrink: 0;
			margin-top: 0.25rem;
		}
	}

	.modal-card-body {
		overflow-wrap: anywhere;
	}
}

.os-run-dialog-foot {
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.5rem;
}
</style>
