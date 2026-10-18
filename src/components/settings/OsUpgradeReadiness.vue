<template>
	<section aria-labelledby="os-readiness-title" class="os-readiness mt-5">
		<h4 id="os-readiness-title" class="os-readiness-title has-text-weight-semibold">
			{{ $t('Can this machine be upgraded?') }}
		</h4>
		<p class="os-readonly _has-text-gray mt-1">
			{{ $t('This check changes nothing on the machine.') }}
		</p>

		<div class="mt-3">
			<!-- stays focusable while it works (loading, not disabled): the focus is not lost with it -->
			<b-button class="os-readiness-check" :label="$t(asked ? 'Check again' : 'Check whether this machine can be upgraded')" :loading="busy" rounded @click="check" />
		</div>

		<!-- always there, so what changes in it is announced: the wait and a failure. The result takes the focus. -->
		<div class="os-readiness-live mt-2" aria-live="polite" role="status">
			<p v-if="busy" class="os-readiness-busy is-flex is-align-items-center _has-text-gray">
				<b-icon aria-hidden="true" class="mr-2" custom-class="mdi-spin" icon="loading" size="is-small" />
				<span>{{ $t('This takes up to 20 seconds') }}</span>
			</p>
			<b-message v-else-if="error" class="os-readiness-error" size="is-small" type="is-danger">
				{{ $t(error) }}
			</b-message>
		</div>

		<!-- every value below is a text node: names, files and the core's own words are never HTML -->
		<div v-if="view" class="os-readiness-report mt-3">
			<b-message class="os-readiness-state" size="is-small" :type="view.tone">
				<h5 ref="result" class="os-readiness-result has-text-weight-semibold" tabindex="-1">
					{{ say(view.summary) }}
				</h5>
				<p v-if="view.hop" class="os-readiness-hop mt-1">
					{{ $t('Checked for the upgrade from {from} to {to}.', view.hop) }}
				</p>
			</b-message>

			<component :is="section.collapsed ? 'details' : 'section'" v-for="section in sections" :key="section.id" class="os-readiness-group mt-3" :class="`is-${section.id}`">
				<component :is="section.collapsed ? 'summary' : 'h5'" class="os-readiness-group-title has-text-weight-semibold">
					{{ section.title }}
				</component>
				<ul class="os-checks mt-1">
					<li v-for="row in section.rows" :key="row.id" class="os-check" :class="`is-${row.severity}`">
						<b-icon aria-hidden="true" class="os-check-icon" :icon="ICONS[row.severity]" size="is-small" />
						<div class="os-check-body">
							<p class="os-check-title has-text-weight-semibold">
								<span v-if="row.severity === 'ok'" class="is-sr-only">{{ $t('Passed') }}</span> {{ say(row.title) }}
							</p>
							<p v-if="row.sentence" class="os-check-sentence">
								{{ say(row.sentence) }}
							</p>
							<p v-if="row.reason" class="os-check-reason is-size-7 _has-text-gray">
								{{ say(row.reason) }}
							</p>
							<p v-if="row.details.length" class="os-check-details is-size-7 _has-text-gray">
								{{ detailsText(row) }}
							</p>
							<p v-if="row.action" class="os-check-action has-text-weight-medium">
								{{ $t(row.action) }}
							</p>
						</div>
					</li>
				</ul>
			</component>

			<p v-if="view.checkedAt" class="os-readiness-when is-size-7 _has-text-gray mt-3">
				{{ $t('Checked on {date}', { date: view.checkedAt }) }}
			</p>

			<!-- the core's own text of the report: the window never builds it -->
			<div v-if="view.text" class="mt-2">
				<b-button class="os-readiness-copy" :label="$t('Copy the report')" rounded @click="copyReport" />
			</div>
			<div v-if="showText" class="os-readiness-text mt-2">
				<p class="is-size-7">
					{{ $t('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.') }}
				</p>
				<textarea ref="reportText" :aria-label="$t('The report, as text')" class="textarea is-small mt-1" readonly rows="8" :value="view.text"></textarea>
			</div>
		</div>
	</section>
</template>

<script>
import copy from 'clipboard-copy'
import { DETAIL_FORMAT, detailLabel, readinessView } from './osReadiness'

// What each kind of row shows next to it: the icon is for the eye, the group's heading and
// the word "Passed" are for the ear.
const ICONS = {
	refuse: 'alert-circle-outline',
	warn: 'alert-outline',
	info: 'information-outline',
	ok: 'check-circle-outline',
}

// Why the answer did not come, by what the call said (never by the core's English words).
const ERRORS = {
	unavailable: 'This version of ReCasaOS cannot run this check yet. Update ReCasaOS, then try again.',
	timeout: 'The check took too long. Try again.',
	failed: 'The check could not be completed. Try again.',
}

function failureOf(error) {
	if (error?.response?.status === 404)
		return ERRORS.unavailable
	if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT')
		return ERRORS.timeout
	return ERRORS.failed
}

export default {
	name: 'OsUpgradeReadiness',
	props: {
		// The language of the dates and the sizes, as the window says its own sentences.
		locale: {
			type: String,
			default: 'en_us',
		},
	},
	// state: the state of the report that was read ('' when there is none): the plan below it is not offered for a system that is unsupported or the latest
	// `report` is what the upgrade guide reads: whether the report was asked, is being made, or could not be made, and its state.
	emits: ['state', 'report'],
	data() {
		return {
			ICONS,
			busy: false,
			// the view of the last answer, or null. Nothing is kept across openings of the window.
			view: null,
			// the language-file key of why the last call failed, or ''
			error: '',
			showText: false,
			gone: false,
		}
	},
	computed: {
		asked() {
			return Boolean(this.view || this.error)
		},
		report() {
			return { asked: Boolean(this.view), busy: this.busy, failed: Boolean(this.error), state: this.view?.state ?? '' }
		},
		sections() {
			if (!this.view)
				return []
			const { blockers, warnings, notes, passed } = this.view
			const others = [...notes, ...passed]
			return [
				{ id: 'blockers', title: this.$t('Blockers'), rows: blockers },
				{ id: 'warnings', title: this.$t('Things to look at'), rows: warnings },
				{ id: 'others', title: this.$t('Other checks (passed: {ok}, notes: {info})', { ok: passed.length, info: notes.length }), rows: others, collapsed: true },
			].filter(section => section.rows.length)
		},
	},
	watch: {
		report: {
			immediate: true,
			handler(report) {
				this.$emit('report', report)
			},
		},
	},
	beforeUnmount() {
		// an answer that comes after the window closed has nobody to tell
		this.gone = true
	},
	methods: {
		// the core's other fields of a check, as `name: value · name: value`, each name in the owner's words
		// (the field's own name for one this window has no word for)
		detailsText(row) {
			return row.details.map((detail) => {
				const label = detailLabel(detail.name)
				return this.$t(DETAIL_FORMAT, { name: label ? this.$t(label) : detail.name, value: detail.value })
			}).join(' · ')
		},

		// a message of the view: a language-file key with its data, or the core's own text
		say(message) {
			return message.key ? this.$t(message.key, message.params || {}) : message.text
		},

		// One request at a time: a second click while one is out does nothing.
		check() {
			if (this.busy)
				return
			this.busy = true
			this.error = ''
			this.view = null
			this.$emit('state', '')
			this.showText = false
			this.$api.sys.getOsReadiness().then((res) => {
				if (this.gone)
					return
				const view = readinessView(res?.data?.data, this.locale)
				this.busy = false
				if (!view) {
					this.error = ERRORS.failed
					return
				}
				this.view = view
				this.$emit('state', view.state)
				// the result is long and sits under the button: reading starts at its heading
				this.$nextTick(() => this.$refs.result?.focus?.())
			}).catch((error) => {
				if (this.gone)
					return
				this.busy = false
				this.error = failureOf(error)
			})
		},

		// A browser may refuse the clipboard (a box served over plain http): then the text is
		// shown selected, to copy by hand.
		copyReport() {
			const text = this.view?.text
			if (!text)
				return
			Promise.resolve().then(() => copy(text)).then(
				() => {
					this.showText = false
					this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
				},
				() => {
					this.showText = true
					this.$nextTick(() => {
						const area = this.$refs.reportText
						area?.focus?.()
						area?.select?.()
					})
				},
			)
		},
	},
}
</script>

<style lang="scss" scoped>
.os-readiness {
	font-size: 0.875rem;
}

.os-readiness-title {
	font-size: 1rem;
}

.os-readiness-result {
	font-size: 1rem;

	&:focus {
		outline: none;
	}
}

// the names come from the machine and the core: a long one wraps instead of leaving the window
.os-checks {
	margin: 0;
	padding: 0;
	list-style: none;
}

.os-check {
	display: flex;
	gap: 0.5rem;
	padding: 0.5rem 0;
	border-top: 1px solid var(--casa-border-hairline);
	overflow-wrap: anywhere;

	&:first-child {
		border-top: 0;
	}

	.os-check-icon {
		flex-shrink: 0;
		margin-top: 0.05rem;
		color: var(--casa-text-secondary);
	}

	&.is-refuse .os-check-icon {
		color: var(--casa-text-attention);
	}

	&.is-warn .os-check-icon {
		color: var(--casa-text-warning);
	}
}

.os-check-body {
	flex: 1 1 auto;
	min-width: 0;
}

.os-readiness-group-title {
	cursor: default;
}

summary.os-readiness-group-title {
	cursor: pointer;
}

.os-readiness-text .textarea {
	font-family: monospace;
	resize: vertical;
}
</style>
