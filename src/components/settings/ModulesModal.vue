<template>
	<div class="modal-card modules-modal" tabindex="-1" @keydown.tab="onTab">
		<header class="modal-card-head">
			<!-- takes the focus when the window opens, to be read; nobody types into it -->
			<h3 ref="title" class="title is-header modules-title" tabindex="-1">
				{{ $t(TEXT.heading) }}
			</h3>
		</header>

		<!-- every value below is a text node: the names, the descriptions and the lines of the log come from the core and from the module, never HTML -->
		<section class="modal-card-body">
			<!-- always there, so that what changes in it is announced: the step of the job, once per change (not once per answer) -->
			<p class="modules-live is-sr-only" aria-live="polite" role="status">
				{{ announced }}
			</p>

			<p v-if="loading && !view" class="modules-loading">
				{{ $t(TEXT.loading) }}
			</p>

			<div v-if="listError" class="modules-list-error" role="alert">
				<b-message size="is-small" type="is-danger">
					<p class="modules-list-error-sentence">
						{{ say(listError.message) }}
					</p>
					<code v-if="listError.code" class="is-size-7">{{ listError.code }}</code>
				</b-message>
				<b-button class="modules-reload"
					:disabled="loading"
					:label="$t('Try again')"
					rounded
					size="is-small"
					@click="reload" />
			</div>

			<!-- a core that does not answer while a job runs: said in words, and the page goes on by itself -->
			<b-message v-if="outage && outage.message" class="modules-outage mt-2" size="is-small" :type="outage.level === 'look' ? 'is-danger' : 'is-warning'">
				<p class="modules-outage-message has-text-weight-semibold">
					{{ say(outage.message) }}
					<code v-if="outage.code" class="is-size-7">{{ outage.code }}</code>
				</p>
				<p v-if="outage.elapsed" class="modules-outage-elapsed">
					{{ say(outage.elapsed) }}
				</p>
			</b-message>

			<p v-if="probing" class="modules-checking is-size-7 _has-text-gray" role="status">
				{{ $t(TEXT.checking) }}
			</p>

			<!-- the core says that something else is at work: the buttons stay shut until the person asks again -->
			<b-message v-if="busy" class="modules-busy mt-2" size="is-small" type="is-warning">
				<h5 class="has-text-weight-semibold">
					{{ $t(TEXT.busyHeading) }}
				</h5>
				<p class="modules-busy-sentence mt-1">
					{{ say(busyMessage) }}
				</p>
				<p v-if="busy.message" class="modules-busy-message is-size-7 mt-1">
					{{ say(busy.message) }}
				</p>
				<p v-if="busy.detail" class="modules-busy-detail is-size-7 mt-1">
					{{ fact(TEXT.reported, busy.detail) }}
				</p>
				<b-button class="modules-busy-retry mt-2"
					:disabled="loading || probing"
					:label="$t(TEXT.checkAgain)"
					rounded
					size="is-small"
					@click="clearBusy" />
			</b-message>

			<!-- the plan that was given up may still be worked out by the machine: said once, and the page does not ask again by itself -->
			<p v-if="planNote" class="modules-plan-note is-size-7 mt-2">
				{{ $t(TEXT.plan.cancelled) }}
			</p>

			<template v-if="view">
				<!-- no catalogue, or none that can be read: nothing is offered, and that is all there is to say -->
				<p v-if="!view.ok" class="modules-none">
					{{ $t(TEXT.none) }}
				</p>
				<p v-if="!view.ok && view.error && view.error !== 'none'" class="modules-catalogue-bad is-size-7 mt-1">
					{{ $t(TEXT.catalogueBad) }}
					<code>{{ view.error }}</code>
				</p>

				<p v-if="follow" class="modules-job-note is-size-7 _has-text-gray mt-2" role="status">
					{{ $t(TEXT.jobRunning) }}
				</p>

				<ul v-if="cards.length" class="modules-list">
					<li v-for="card in cards" :key="card.module.name" class="modules-card mt-3" :data-module="card.module.name">
						<div class="modules-card-head">
							<h4 class="modules-card-title has-text-weight-semibold" tabindex="-1">
								{{ card.module.title }}
							</h4>
							<code class="modules-card-name is-size-7">{{ card.module.name }}</code>
							<span v-if="card.module.tier" class="modules-tier tag is-light" :class="`is-${card.module.tier.id}`">{{ $t(card.module.tier.label) }}</span>
						</div>
						<p v-if="card.module.description" class="modules-description mt-1">
							{{ card.module.description }}
						</p>
						<p v-if="card.module.tier" class="modules-tier-sentence is-size-7 mt-1">
							{{ $t(card.module.tier.sentence) }}
							<code v-if="card.module.tier.raw">{{ card.module.tier.raw }}</code>
						</p>

						<ul class="modules-facts mt-2">
							<li v-if="card.module.installed" class="modules-installed">
								{{ card.module.installed.version ? fact(TEXT.installed, card.module.installed.version) : $t(TEXT.installedUnknown) }}
							</li>
							<li v-else-if="card.module.tag" class="modules-offered">
								{{ fact(TEXT.offered, card.module.tag) }}
							</li>
							<!-- a later version is offered: a word on a tag, beside the installed version above -->
							<li v-if="card.module.canUpdate" class="modules-update">
								<span class="modules-update-badge tag is-info is-light">{{ $t(TEXT.update.badge, { latest: card.module.update.latest }) }}</span>
							</li>
							<li v-if="card.module.broken" class="modules-broken">
								{{ $t(TEXT.broken) }}
								<code class="is-size-7">{{ card.module.broken }}</code>
							</li>
							<li v-if="!card.module.inCatalogue" class="modules-gone">
								{{ $t(TEXT.gone) }}
							</li>
							<li v-if="!card.module.supported && card.module.inCatalogue" class="modules-unsupported">
								{{ $t(TEXT.unsupported) }}
								<ul class="modules-reasons">
									<li v-for="reason in card.module.reasons" :key="reason.code" class="modules-reason">
										{{ say(reason.message) }}
										<code class="is-size-7">{{ reason.code }}</code>
									</li>
								</ul>
							</li>
						</ul>

						<b-message v-if="card.job" class="modules-job mt-3" :class="card.job.stateClass" size="is-small" :type="card.job.tone">
							<h5 class="modules-job-title has-text-weight-semibold">
								{{ say(card.job.title) }}
							</h5>
							<p class="modules-job-group is-size-7 has-text-weight-semibold mt-1">
								{{ $t(card.job.group) }}
							</p>
							<p v-if="!card.job.known" class="modules-job-unknown mt-1">
								<code>{{ card.job.stateText }}</code>
							</p>
							<p v-if="card.job.startedAt" class="modules-job-since is-size-7 mt-1">
								{{ fact(TEXT.job.started, card.job.startedAt) }}
							</p>
							<progress v-if="card.job.progress"
								class="modules-progress progress is-small is-info mt-2"
								:aria-label="say(card.job.progress.label)"
								:max="card.job.progress.max"
								:value="card.job.progress.value">
								{{ card.job.progress.value }} / {{ card.job.progress.max }}
							</progress>
							<ol v-if="card.job.steps.length" class="modules-steps mt-2">
								<li v-for="step in card.job.steps"
									:key="step.id"
									class="modules-step"
									:class="`is-${step.mark}`"
									:aria-current="step.mark === 'current' ? 'step' : undefined">
									<b-icon aria-hidden="true" :icon="step.icon" size="is-small" />
									<span class="modules-step-text">{{ $t(step.text) }}</span>
									{{ ' ' }}
									<span class="modules-step-mark is-size-7 has-text-weight-semibold">{{ $t(step.markText) }}</span>
								</li>
							</ol>
							<p v-if="card.job.rollbackStep" class="modules-rollback mt-2">
								{{ say(card.job.rollbackStep) }}
							</p>
							<p v-if="card.job.stoppedAt" class="modules-stopped-at mt-2">
								{{ say(card.job.stoppedAt) }}
							</p>
							<p v-if="card.job.reason" class="modules-reason-sentence mt-1">
								{{ say(card.job.reason) }}
								<code v-if="card.job.code" class="is-size-7">{{ card.job.code }}</code>
							</p>
							<p v-if="card.job.undoText" class="modules-undo mt-1">
								{{ say(card.job.undoText) }}
							</p>
							<template v-if="card.job.folder">
								<p class="modules-folder-label is-size-7 mt-1">
									{{ $t(TEXT.job.folder) }}
								</p>
								<os-upgrade-copyable class="modules-folder mt-1" :text="card.job.folder" />
							</template>
							<template v-if="card.job.leftFiles.length">
								<p class="modules-left-label is-size-7 mt-1">
									{{ $t(TEXT.job.leftFiles) }}
								</p>
								<os-upgrade-copyable block class="modules-left mt-1" :label="$t(TEXT.job.leftFiles)" :text="card.job.leftFiles.join('\n')" />
							</template>

							<div v-if="card.job.kept" class="modules-kept mt-2">
								<p v-if="card.job.kept.known && card.job.kept.count" class="modules-kept-some">
									{{ $t(card.job.kept.count === 1 ? TEXT.job.keptOne : TEXT.job.keptSome, { names: card.job.kept.names }) }}
								</p>
								<p v-else-if="card.job.kept.known" class="modules-kept-none">
									{{ $t(TEXT.job.keptNone) }}
								</p>
								<p v-else class="modules-kept-unknown">
									{{ $t(TEXT.job.keptUnknown) }}
								</p>
								<p v-if="card.job.kept.unsafe" class="modules-kept-unsafe mt-1">
									{{ $t(TEXT.job.keptUnsafe) }}
								</p>
								<template v-if="card.job.kept.command">
									<p class="modules-kept-purge is-size-7 mt-1">
										{{ $t(card.job.kept.count === 1 ? TEXT.job.purgeOne : TEXT.job.purge) }}
									</p>
									<os-upgrade-copyable class="modules-kept-command mt-1" :text="card.job.kept.command" />
								</template>
							</div>

							<p v-if="card.job.next" class="modules-next mt-2">
								{{ say(card.job.next) }}
							</p>
							<div v-if="card.job.advice" class="modules-advice mt-2">
								<p class="modules-advice-sentence">
									{{ $t(TEXT.job.advice) }}
								</p>
								<os-upgrade-copyable class="modules-advice-command mt-1" :text="card.job.advice.command" />
							</div>

							<div v-if="card.job.logTail.length" class="modules-log mt-3">
								<h6 class="has-text-weight-semibold">
									{{ $t(TEXT.job.log) }}
								</h6>
								<os-upgrade-copyable block
									class="modules-log-text mt-1"
									:label="$t(TEXT.job.log)"
									:text="card.job.logTail.join('\n')" />
							</div>
							<p v-else-if="card.job.running" class="modules-log-empty is-size-7 mt-2">
								{{ $t(TEXT.job.noLog) }}
							</p>

							<!-- a report that was read is put away until another job begins -->
							<div v-if="card.job.dismissible" class="modules-job-buttons mt-3">
								<b-button class="modules-job-close"
									:label="$t(TEXT.job.close)"
									rounded
									size="is-small"
									@click="closeReport(card.module.name)" />
							</div>
						</b-message>

						<div v-if="card.module.canInstall || card.module.canUpdate || card.module.canRemove" class="modules-buttons is-flex is-flex-wrap-wrap mt-3">
							<b-button v-if="card.module.canInstall"
								class="modules-install"
								:disabled="disabled"
								:label="$t('Install')"
								rounded
								@click="pressInstall(card.module, $event)" />
							<b-button v-if="card.module.canUpdate"
								class="modules-update-button"
								:disabled="disabled"
								:label="$t('Update')"
								rounded
								@click="pressUpdate(card.module, $event)" />
							<b-button v-if="card.module.canRemove"
								class="modules-remove"
								:disabled="disabled"
								:label="$t('Remove')"
								rounded
								@click="pressRemove(card.module, $event)" />
						</div>
					</li>
				</ul>
			</template>

			<!-- the confirmation windows: Buefy's modal, with the focus on the heading and not on the button that acts. It has no hold on the Tab key of its own:
				the window holds it (onTab). Buefy's hold on a window inside another one moves the focus, at the same key, to the first control of the window it
				stands on, and it does not take the Shift key from the heading. -->
			<b-modal :aria-label="dialogTitle || $t(TEXT.heading)"
				aria-modal
				aria-role="dialog"
				animation="zoom-in"
				:auto-focus="false"
				:can-cancel="['outside']"
				custom-class="modules-dialog-modal"
				has-modal-card
				:model-value="Boolean(dialog)"
				scroll="clip"
				@close="requestClose">
				<div v-if="dialog" class="modal-card modules-dialog" :class="`is-${dialog.kind}`" tabindex="-1" @keydown.tab="onTab">
					<header class="modal-card-head">
						<h5 :ref="focusHeading" class="modal-card-title modules-dialog-title" tabindex="-1">
							{{ dialogTitle }}
						</h5>
					</header>
					<section class="modal-card-body">
						<!-- the plan is being made -->
						<template v-if="dialog.kind !== 'remove' && dialog.phase === 'planning'">
							<p class="modules-dialog-line">
								{{ $t(words.planning) }}
							</p>
							<progress class="modules-planning progress is-small is-info mt-2" :aria-label="$t(words.planningLabel)"></progress>
						</template>

						<!-- the plan, as the core made it -->
						<template v-else-if="dialog.kind !== 'remove' && dialog.plan">
							<p v-if="dialog.notice" class="modules-dialog-notice has-text-weight-semibold" role="status">
								{{ say(dialog.notice) }}
							</p>

							<template v-if="dialog.plan.refused">
								<h6 class="modules-refused-heading has-text-weight-semibold mt-2">
									{{ $t(TEXT.plan.refusedHeading) }}
								</h6>
								<p class="modules-refused mt-1">
									{{ say(dialog.plan.refusedMessage) }}
									<code class="is-size-7">{{ dialog.plan.refused }}</code>
								</p>
								<template v-if="dialog.plan.unhold">
									<p class="modules-unhold is-size-7 mt-1">
										{{ $t(TEXT.plan.unhold) }}
									</p>
									<os-upgrade-copyable class="modules-unhold-command mt-1" :text="dialog.plan.unhold.command" />
								</template>
							</template>
							<template v-else>
								<!-- while the install is asked for the dialog says what is happening, and not that there is something to read -->
								<template v-if="calling">
									<p class="modules-dialog-calling mt-2" role="status">
										{{ $t(words.starting) }}
									</p>
									<progress class="modules-calling progress is-small is-info mt-2" :aria-label="$t(words.startingLabel)"></progress>
								</template>
								<p v-else-if="dialog.plan.incomplete" class="modules-incomplete mt-2">
									{{ $t(TEXT.plan.incomplete) }}
								</p>
								<p v-else-if="dialog.plan.noList" class="modules-incomplete modules-no-list mt-2">
									{{ $t(TEXT.plan.noList) }}
								</p>
								<p v-else-if="dialog.plan.noId" class="modules-incomplete modules-no-id mt-2">
									{{ $t(TEXT.plan.noId) }}
								</p>
								<p v-else class="modules-dialog-line mt-2">
									{{ $t(words.intro) }}
								</p>
								<template v-if="dialog.plan.update">
									<p class="modules-dialog-installed mt-2">
										{{ fact(TEXT.installed, dialog.plan.update.installed) }}
									</p>
									<p class="modules-dialog-version mt-1">
										{{ fact(TEXT.offered, dialog.plan.update.latest) }}
									</p>
								</template>
								<p v-else-if="dialog.plan.tag" class="modules-dialog-version mt-2">
									{{ fact(TEXT.offered, dialog.plan.tag) }}
								</p>
								<p v-if="dialog.plan.tier" class="modules-dialog-tier mt-2">
									<span class="tag is-light" :class="`is-${dialog.plan.tier.id}`">{{ $t(dialog.plan.tier.label) }}</span>
									{{ $t(dialog.plan.tier.sentence) }}
								</p>

								<template v-if="dialog.description">
									<h6 class="has-text-weight-semibold mt-3">
										{{ $t(TEXT.plan.about) }}
									</h6>
									<p class="modules-dialog-about mt-1">
										{{ dialog.description }}
									</p>
								</template>

								<!-- what the update adds, and what the new version no longer names (those stay: no package is removed) -->
								<template v-if="dialog.plan.update">
									<h6 class="modules-update-added-heading has-text-weight-semibold mt-3">
										{{ $t(TEXT.update.added) }}
									</h6>
									<ul v-if="dialog.plan.update.added.length" class="modules-names modules-added mt-1">
										<li v-for="name in dialog.plan.update.added" :key="name">
											{{ name }}
										</li>
										<li v-if="dialog.plan.update.moreAdded">
											{{ $t(TEXT.plan.more, { n: dialog.plan.update.moreAdded }) }}
										</li>
									</ul>
									<p v-else class="modules-no-added mt-1">
										{{ $t(TEXT.update.addedNone) }}
									</p>
									<template v-if="dialog.plan.update.dropped.length">
										<h6 class="has-text-weight-semibold mt-2">
											{{ $t(TEXT.update.dropped) }}
										</h6>
										<p class="modules-dropped-note is-size-7 mt-1">
											{{ $t(TEXT.update.droppedNote) }}
										</p>
										<ul class="modules-names modules-dropped mt-1">
											<li v-for="name in dialog.plan.update.dropped" :key="name">
												{{ name }}
											</li>
											<li v-if="dialog.plan.update.moreDropped">
												{{ $t(TEXT.plan.more, { n: dialog.plan.update.moreDropped }) }}
											</li>
										</ul>
									</template>
								</template>

								<template v-if="dialog.plan.packages.listed">
									<h6 v-if="!dialog.plan.update" class="has-text-weight-semibold mt-3">
										{{ $t(TEXT.plan.packages) }}
									</h6>
									<!-- the packages of an update that apt installs are the list above -->
									<ul v-if="!dialog.plan.update && dialog.plan.packages.install.length" class="modules-names mt-1">
										<li v-for="name in dialog.plan.packages.install" :key="name">
											{{ name }}
										</li>
										<li v-if="dialog.plan.packages.moreInstall">
											{{ $t(TEXT.plan.more, { n: dialog.plan.packages.moreInstall }) }}
										</li>
									</ul>
									<p v-else-if="!dialog.plan.update" class="modules-no-packages mt-1">
										{{ $t(TEXT.plan.noPackages) }}
									</p>
									<template v-if="dialog.plan.packages.upgrade.length">
										<h6 class="has-text-weight-semibold mt-2">
											{{ $t(TEXT.plan.upgrades) }}
										</h6>
										<ul class="modules-names modules-upgrades mt-1">
											<li v-for="name in dialog.plan.packages.upgrade" :key="name">
												{{ name }}
											</li>
											<li v-if="dialog.plan.packages.moreUpgrade">
												{{ $t(TEXT.plan.more, { n: dialog.plan.packages.moreUpgrade }) }}
											</li>
										</ul>
									</template>
								</template>

								<ul class="modules-sizes mt-3">
									<li v-if="dialog.plan.packages.downloadText" class="modules-size-download">
										{{ fact(TEXT.plan.download, dialog.plan.packages.downloadText) }}
									</li>
									<li v-if="dialog.plan.archive.bytesText" class="modules-size-archive">
										{{ fact(TEXT.plan.archive, dialog.plan.archive.bytesText) }}
									</li>
									<li v-if="dialog.plan.packages.extraText" class="modules-size-extra">
										{{ fact(TEXT.plan.extra, dialog.plan.packages.extraText) }}
									</li>
									<li v-if="!dialog.plan.packages.known && !(dialog.plan.update && !dialog.plan.packages.install.length)" class="modules-size-unknown">
										{{ $t(TEXT.plan.unknownSize) }}
									</li>
									<li v-if="dialog.plan.archive.url" class="modules-archive-url">
										{{ fact(TEXT.plan.from, dialog.plan.archive.url) }}
									</li>
								</ul>

								<!-- what the install or the update does to the machine: said before it is confirmed -->
								<template v-if="dialog.plan.update">
									<h6 class="has-text-weight-semibold mt-3">
										{{ $t(TEXT.update.consequences) }}
									</h6>
									<ul class="modules-consequences modules-update-consequences mt-1">
										<li>{{ $t(TEXT.update.stops) }}</li>
										<li>{{ $t(TEXT.update.machines) }}</li>
										<li>{{ $t(TEXT.update.config) }}</li>
										<li>{{ $t(TEXT.update.back) }}</li>
										<li>{{ $t(TEXT.update.keepOn) }}</li>
									</ul>
								</template>
								<template v-else>
									<h6 class="has-text-weight-semibold mt-3">
										{{ $t(TEXT.plan.consequences) }}
									</h6>
									<p class="modules-consequences mt-1">
										{{ $t(TEXT.plan.consequencesText) }}
									</p>
									<p v-if="dialog.plan.installable" class="modules-stay is-size-7 mt-2">
										{{ $t(TEXT.plan.stay) }}
									</p>
								</template>
							</template>

							<h6 class="has-text-weight-semibold mt-3">
								{{ $t(TEXT.plan.checks) }}
							</h6>
							<ul class="modules-checks mt-1">
								<li v-for="check in dialog.plan.checks" :key="check.code" class="modules-check" :class="`is-${check.mark}`">
									<span class="modules-check-mark is-size-7 has-text-weight-semibold">{{ $t(check.markText) }}</span>
									{{ ' ' }}
									<span class="modules-check-label">{{ say(check.label) }}</span>
									{{ ' ' }}
									<span v-if="check.message" class="modules-check-sentence">{{ say(check.message) }}</span>
									{{ ' ' }}
									<span v-if="check.detailMessage" class="modules-check-detail is-size-7">{{ say(check.detailMessage) }}</span>
									<span v-else-if="check.detail" class="modules-check-detail is-size-7">{{ check.detail }}</span>
									{{ ' ' }}
									<code class="is-size-7">{{ check.code }}</code>
								</li>
							</ul>
						</template>

						<!-- the remove -->
						<template v-else-if="dialog.kind === 'remove'">
							<template v-if="calling">
								<p class="modules-dialog-calling" role="status">
									{{ $t(TEXT.remove.starting) }}
								</p>
								<progress class="modules-calling progress is-small is-info mt-2" :aria-label="$t(TEXT.remove.startingLabel)"></progress>
							</template>
							<p class="modules-dialog-line" :class="{ 'mt-3': calling }">
								{{ $t(TEXT.remove.stops) }}
							</p>
							<p class="modules-dialog-line modules-stays mt-2">
								{{ $t(TEXT.remove.stays) }}
							</p>
							<template v-if="dialog.description">
								<h6 class="has-text-weight-semibold mt-3">
									{{ $t(TEXT.remove.about) }}
								</h6>
								<p class="modules-dialog-about mt-1">
									{{ dialog.description }}
								</p>
							</template>
						</template>

						<div v-if="callError" class="modules-call mt-3" role="alert">
							<b-message class="modules-call-failure" size="is-small" type="is-danger">
								<p class="modules-call-sentence">
									{{ say(callError.message) }}
								</p>
								<ul v-if="callError.items.length" class="modules-call-items">
									<li v-for="(item, index) in callError.items" :key="index">
										{{ item.message ? say(item.message) : '' }}
										<code class="is-size-7">{{ item.code }}</code>
									</li>
								</ul>
								<p v-if="callError.busy" class="modules-call-busy is-size-7">
									{{ say(callError.busy) }}
								</p>
								<p v-if="callError.detail" class="modules-call-detail is-size-7">
									{{ fact(TEXT.reported, callError.detail) }}
								</p>
								<template v-if="callError.unhold">
									<p class="modules-unhold is-size-7">
										{{ $t(TEXT.plan.unhold) }}
									</p>
									<os-upgrade-copyable class="modules-unhold-command mt-1" :text="callError.unhold.command" />
								</template>
								<code v-if="callError.code" class="modules-call-code is-size-7">{{ callError.code }}</code>
							</b-message>
						</div>
					</section>
					<footer class="modal-card-foot modules-dialog-foot">
						<b-button class="modules-dialog-cancel"
							:disabled="Boolean(acting) && acting !== 'plan'"
							:label="$t(cancelLabel)"
							rounded
							@click="requestClose" />
						<b-button v-if="dialog.phase === 'failed'"
							class="modules-dialog-retry"
							:disabled="Boolean(acting)"
							:label="$t('Try again')"
							rounded
							@click="requestPlan(false)" />
						<b-button v-if="dialogOk"
							class="modules-dialog-ok"
							:disabled="Boolean(acting)"
							:label="dialogOk"
							:loading="acting === dialog.key"
							rounded
							:type="dialog.kind === 'remove' ? 'is-danger' : 'is-primary'"
							@click="confirmDialog" />
					</footer>
				</div>
			</b-modal>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import OsUpgradeCopyable from './OsUpgradeCopyable.vue'
import { DETAIL_FORMAT } from './osReadiness'
import {
	TEXT,
	installBody,
	jobAnnouncement,
	jobView,
	listView,
	moduleFailure,
	moduleOutage,
	modulePlanView,
	moduleStatusFailure,
	nextJobPoll,
	reasonMessage,
} from './osModules'
import events from '@/events/events'

// How many modules are asked about a job when the window opens, how many at the same time, and how long the whole look may take: a status that hangs
// does not shut the buttons for longer than that, and the core refuses a job while another runs whatever the page knew.
const MAX_PROBES = 16
const PROBES_AT_ONCE = 4
const DISCOVERY_MS = 15000
// the wait before the list is read once more, when it could not be read at the end of a job
const RELOAD_RETRY_MS = 5000
// how long the machine may still be working out a plan that was given up (the core makes it for up to a minute)
const PLAN_NOTE_MS = 60000
// the jobs whose result is told although this window did not start them: what is worth knowing when the window is opened later
const REMEMBERED = new Set(['running', 'failed', 'interrupted'])
// the refusals that say that the list the page shows is not what the machine has
const STALE = new Set(['not_installed', 'already_installed', 'up_to_date'])
// the words of the window of an install and of an update, which are those of a plan
const wordsOf = kind => kind === 'update' ? TEXT.update : TEXT.plan
// what the Tab key goes through (the same list as Buefy's hold on a window)
const TABBABLE = 'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

export default {
	name: 'ModulesModal',
	components: { OsUpgradeCopyable },
	emits: ['close'],
	data() {
		return {
			TEXT,
			// the last list that could be read, as the view of it, or null before the first
			view: null,
			loading: false,
			listError: null,
			// the jobs the window knows of, by the name of the module: { view, followed, kind, dismissedAt }. A job that this window started is told until it
			// starts another; one it only found is told when it is running or did not end well; a report that was read is put away until another job begins.
			jobs: Object.create(null),
			// the module whose job is being followed ('' when none)
			follow: '',
			probing: false,
			// whether the jobs of the modules were looked for since the window opened
			probed: false,
			// the scheduler's word for the last ask of the job: 'none', 'ok' or 'error'
			last: 'none',
			// why the job cannot be read (moduleStatusFailure), and the code the core gave
			failure: '',
			failureCode: '',
			// when the silence began (0 for none). It goes on across a tab that was hidden: the page was not asking, and the core was no more answering.
			outageSince: 0,
			elapsedMs: 0,
			lastLevel: '',
			announced: '',
			// the name of the call that is out ('' when none): one at a time
			acting: '',
			// what the machine said it is busy with: { message, detail } or null
			busy: null,
			callError: null,
			// the confirmation window that is open, or null
			dialog: null,
			// the button that opened it, and what is waiting for the window to be there
			opener: null,
			focusPending: false,
			// which plan the window waits for: another plan, or a window that was closed, drops the one that is out
			planTicket: 0,
			planAbort: null,
			// the plan that was given up may still run on the machine: said until it must have ended
			planNote: false,
			noteTimer: null,
			// the look for the jobs: its cancel, and the deadline of the whole look
			discovery: null,
			discoveryTimer: null,
			retryTimer: null,
			timer: null,
			inFlight: false,
			gone: false,
		}
	},
	computed: {
		// The language of the dates and sizes, as the other settings windows say their own: a language without these texts falls back to English.
		locale() {
			return this.$te('Modules') ? this.$i18n.locale : 'en_us'
		},
		// the buttons are shut while a call or a job is out, while the window looks for one, and while the core says it is busy
		disabled() {
			return Boolean(this.acting) || Boolean(this.follow) || this.probing || this.loading || Boolean(this.busy)
		},
		cards() {
			return (this.view?.modules ?? []).map(module => ({ module, job: this.jobOf(module.name) }))
		},
		outage() {
			return this.failure ? moduleOutage({ kind: this.failure, code: this.failureCode, elapsedMs: this.elapsedMs }) : null
		},
		busyMessage() {
			return reasonMessage('busy')
		},
		// the install or the remove is asked of the core: the window says what is happening and cannot be left
		calling() {
			return Boolean(this.dialog) && this.acting === this.dialog.key
		},
		words() {
			return wordsOf(this.dialog?.kind)
		},
		dialogTitle() {
			if (!this.dialog)
				return ''
			return this.$t(this.dialog.kind === 'remove' ? TEXT.remove.title : this.words.title, { module: this.dialog.title })
		},
		// the way out of the window: a step that can be given up is cancelled, a plan that cannot go ahead is closed
		cancelLabel() {
			return this.dialog?.phase === 'planning' || this.dialogOk ? 'Cancel' : 'Close'
		},
		// the button that acts: there is none while the plan is made, none for a plan that cannot go ahead, none for a step that the machine says is moot
		dialogOk() {
			const dialog = this.dialog
			if (!dialog || STALE.has(this.callError?.code))
				return ''
			if (dialog.kind === 'remove')
				return this.$t(TEXT.remove.ok)
			return dialog.phase === 'plan' && dialog.plan?.installable ? this.$t(wordsOf(dialog.kind).ok) : ''
		},
	},
	mounted() {
		document.addEventListener('visibilitychange', this.onVisibility)
		// The window opens with the reader on its heading. Buefy's own autoFocus is off where the window is opened: it would move the focus to the window's frame.
		this.$nextTick(() => this.$refs.title?.focus?.({ preventScroll: true }))
		this.reload()
	},
	beforeUnmount() {
		// an answer that comes after the window closed has nobody to tell, and nothing is asked again
		this.gone = true
		clearTimeout(this.timer)
		clearTimeout(this.noteTimer)
		clearTimeout(this.retryTimer)
		clearTimeout(this.discoveryTimer)
		this.discovery?.abort()
		this.planTicket++
		this.planAbort?.abort()
		document.removeEventListener('visibilitychange', this.onVisibility)
		window.removeEventListener('keyup', this.onEscape, true)
	},
	methods: {
		// a message of the view: a language-file key with its data, some of which are language-file keys themselves
		say(message) {
			const params = { ...message.params }
			for (const name of message.keys ?? [])
				params[name] = this.$t(params[name])
			return this.$t(message.key, params)
		},
		// `name: value`
		fact(nameKey, value) {
			return this.$t(DETAIL_FORMAT, { name: this.$t(nameKey), value })
		},
		// the job to tell for a module, or null
		jobOf(name) {
			const entry = this.jobs[name]
			const view = entry?.view
			if (!view || view.state === 'idle')
				return null
			// a report that was read is not told again, until the module has another job
			if (entry.dismissedAt !== undefined && entry.dismissedAt === view.startedAtRaw)
				return null
			return entry.followed || REMEMBERED.has(view.state) || !view.known ? view : null
		},
		titleOf(name) {
			return this.view?.modules.find(module => module.name === name)?.title ?? name
		},
		// Puts a report that was read away. The focus goes to the heading of its card: the button it was on is gone.
		closeReport(name) {
			const entry = this.jobs[name]
			if (!entry?.view?.dismissible)
				return
			this.jobs[name] = { ...entry, dismissedAt: entry.view.startedAtRaw }
			this.$nextTick(() => this.$el.querySelector?.(`[data-module="${name}"] .modules-card-title`)?.focus?.({ preventScroll: true }))
		},

		// ---- the list ----

		// The list, and then, once, a look for a job that is already running.
		async reload() {
			await this.loadList()
			if (this.view && !this.probed) {
				this.probed = true
				await this.probeJobs()
			}
		},
		// true when the list was read, false when it could not be, nothing when another reading was already under way
		async loadList() {
			if (this.loading || this.gone)
				return undefined
			this.loading = true
			let view = null
			let failure = null
			try {
				view = listView((await this.$api.sys.getModules())?.data?.data)
				if (!view)
					failure = moduleFailure(null, this.locale, { read: true })
			} catch (error) {
				failure = moduleFailure(error, this.locale, { read: true })
			}
			if (this.gone)
				return undefined
			this.loading = false
			if (failure) {
				this.listError = failure
				return false
			}
			this.listError = null
			this.view = view
			return true
		},
		// The list at the end of a job says what is installed now, and the buttons depend on it: when it cannot be read it is read once more, later.
		async refreshList() {
			if (await this.loadList() !== false)
				return
			clearTimeout(this.retryTimer)
			this.retryTimer = setTimeout(() => {
				this.retryTimer = null
				this.loadList()
			}, RELOAD_RETRY_MS)
		},
		// The flag said what the last call saw, and it is not known what the machine is busy with now: the list and the jobs are read again (a job that
		// runs is followed), and the next call says whether the machine is still busy.
		async clearBusy() {
			this.busy = null
			await this.loadList()
			await this.probeJobs()
		},

		// ---- the job ----

		// Asks about the job of each module, four at a time and within one deadline for them all, so that a job that is running (started before this window was
		// opened, or from another) is followed. A look that is not over at the deadline is given up: the buttons come back, and the core refuses a second job.
		async probeJobs() {
			if (this.gone || !this.view || this.probing)
				return
			this.probing = true
			const controller = typeof AbortController === 'function' ? new AbortController() : null
			this.discovery = controller
			this.discoveryTimer = setTimeout(() => controller?.abort(), DISCOVERY_MS)
			const names = this.view.modules.slice(0, MAX_PROBES).map(module => module.name)
			let index = 0
			const worker = async () => {
				while (!this.gone && !controller?.signal.aborted && !this.follow && index < names.length)
					await this.probeJob(names[index++], controller?.signal)
			}
			try {
				await Promise.all(Array.from({ length: Math.min(PROBES_AT_ONCE, names.length) }, worker))
			} finally {
				clearTimeout(this.discoveryTimer)
				this.discoveryTimer = null
				this.discovery = null
				this.probing = false
			}
		},
		// true when the job of the module was read
		async probeJob(name, signal) {
			let raw
			try {
				raw = (await this.$api.sys.getModuleStatus(name, signal))?.data?.data
			} catch {
				// a module whose job cannot be read is told nothing of: the polling says it when a job is followed
				return false
			}
			if (this.gone)
				return false
			const old = this.jobs[name]
			const view = jobView(raw, { name, title: this.titleOf(name), kind: old?.kind, locale: this.locale })
			if (!view)
				return false
			this.jobs[name] = { view, followed: Boolean(old?.followed), kind: view.kind || old?.kind || '', dismissedAt: old?.dismissedAt }
			if (view.running && !this.follow) {
				// a job that is already running when the window opens is told, once, as the steps of the one it starts are
				this.announced = this.say(view.live)
				this.startFollowing(name, view.kind, null)
			}
			return true
		},
		// What the answer of an install or a remove says is shown at once and not trusted: the job is asked for again right away.
		startFollowing(name, kind, raw) {
			const before = this.jobs[name]
			const view = raw ? jobView(raw, { name, title: this.titleOf(name), kind, locale: this.locale }) : before?.view ?? null
			for (const entry of Object.values(this.jobs))
				entry.followed = false
			this.jobs[name] = { view, followed: true, kind: view?.kind || kind || before?.kind || '' }
			const note = raw ? jobAnnouncement(before?.view, view) : null
			if (note)
				this.announced = this.say(note)
			this.follow = name
			this.last = 'none'
			this.failure = ''
			this.failureCode = ''
			this.outageSince = 0
			// a job that is followed is what keeps the machine busy now: what a call saw before is not what the page says any more
			this.busy = null
			this.schedule()
		},
		// A setTimeout chain, not an interval: one request at a time. Nothing while the document is hidden: it asks at once when shown again.
		schedule() {
			clearTimeout(this.timer)
			this.timer = null
			if (this.gone || this.inFlight)
				return
			const delay = nextJobPoll(this.last, { hidden: document.hidden, running: Boolean(this.follow) })
			if (delay !== null)
				this.timer = setTimeout(() => this.poll(), delay)
		},
		onVisibility() {
			if (document.hidden) {
				clearTimeout(this.timer)
				this.timer = null
				return
			}
			// Asks at once. A silence that began before the page was hidden is the same silence: it is not counted again from here.
			this.last = 'none'
			this.schedule()
		},
		async poll() {
			if (this.gone || this.inFlight || !this.follow)
				return
			clearTimeout(this.timer)
			this.inFlight = true
			try {
				await this.readJob()
			} catch {
				// whatever the page could not make sense of: it says that it could not read, and asks again
				if (!this.gone)
					this.fail({ kind: 'failed', code: '' })
			} finally {
				this.inFlight = false
				this.schedule()
			}
		},
		async readJob() {
			const name = this.follow
			let raw
			try {
				raw = (await this.$api.sys.getModuleStatus(name))?.data?.data
			} catch (error) {
				if (!this.gone)
					this.fail(moduleStatusFailure(error))
				return
			}
			// the window closed, or the job is not the one that is followed any more
			if (this.gone || name !== this.follow)
				return
			const view = jobView(raw, { name, title: this.titleOf(name), kind: this.jobs[name]?.kind, locale: this.locale })
			if (view)
				this.take(name, view)
			else
				this.fail({ kind: 'failed', code: '' })
		},
		take(name, view) {
			const entry = this.jobs[name] ?? { followed: true, kind: '' }
			const note = jobAnnouncement(entry.view, view)
			if (note)
				this.announced = this.say(note)
			this.jobs[name] = { ...entry, view, kind: view.kind || entry.kind }
			this.last = 'ok'
			this.failure = ''
			this.failureCode = ''
			this.lastLevel = ''
			this.outageSince = 0
			// a job that is not running any more is over: the list says what is installed now
			if (!view.running) {
				this.follow = ''
				this.refreshList()
				// the dashboard shows the cards of the modules that are there now; an update brings none and takes none away
				if (view.kind !== 'update')
					this.$EventBus?.$emit(events.MODULES_CHANGED)
			}
		},
		fail({ kind, code }) {
			this.last = 'error'
			// a core that has no such route while a job runs is a core that is away (a gateway without its route), not one that lacks the feature
			this.failure = kind === 'unavailable' ? 'down' : kind
			this.failureCode = code
			// the silence is counted from the first ask that failed after an answer
			const now = Date.now()
			this.outageSince = this.outageSince || now
			this.elapsedMs = now - this.outageSince
			const outage = this.outage
			if (outage?.message && outage.level !== this.lastLevel) {
				this.lastLevel = outage.level
				this.announced = this.say(outage.message)
			}
		},

		// ---- the calls ----

		pressInstall(module, event) {
			if (this.disabled || !module.canInstall)
				return undefined
			this.openDialog({ kind: 'install', key: 'install', name: module.name, title: module.title, description: module.description, phase: 'planning', plan: null, notice: null }, event)
			return this.requestPlan(false)
		},
		pressUpdate(module, event) {
			if (this.disabled || !module.canUpdate)
				return undefined
			this.openDialog({ kind: 'update', key: 'update', name: module.name, title: module.title, description: module.description, phase: 'planning', plan: null, notice: null }, event)
			return this.requestPlan(false)
		},
		pressRemove(module, event) {
			if (this.disabled || !module.canRemove)
				return
			this.openDialog({ kind: 'remove', key: 'remove', name: module.name, title: module.title, description: module.description, phase: 'ask' }, event)
		},
		// The plan of the install, asked for again whenever the window shows a new one. Cancelling the window, or asking again, drops the one that is out.
		async requestPlan(changed) {
			const dialog = this.dialog
			if (!dialog || dialog.kind === 'remove')
				return
			const ticket = ++this.planTicket
			this.planAbort?.abort()
			const controller = typeof AbortController === 'function' ? new AbortController() : null
			this.planAbort = controller
			this.acting = 'plan'
			this.callError = null
			// whoever asks again has been told: the note about the plan that was given up goes
			this.planNote = false
			clearTimeout(this.noteTimer)
			dialog.phase = 'planning'
			dialog.plan = null
			dialog.notice = null
			let raw
			let failure = null
			try {
				// the plan of an update is asked for with its mode; the plan of an install is asked for as it always was
				const args = dialog.kind === 'update' ? [dialog.name, controller?.signal, 'update'] : [dialog.name, controller?.signal]
				raw = (await this.$api.sys.planModule(...args))?.data?.data
			} catch (error) {
				// the plan changes nothing: a plan that got no answer is one to ask for again
				failure = moduleFailure(error, this.locale, { read: true })
			}
			// the window was closed, or another plan was asked for: this one is for nobody
			if (this.gone || ticket !== this.planTicket)
				return
			this.acting = ''
			this.planAbort = null
			const plan = failure ? null : modulePlanView(raw, { name: dialog.name, locale: this.locale, mode: dialog.kind === 'update' ? 'update' : 'install' })
			if (!plan) {
				dialog.phase = 'failed'
				this.callError = failure ?? moduleFailure(null, this.locale, { read: true })
				return
			}
			dialog.plan = plan
			dialog.phase = 'plan'
			dialog.notice = changed ? reasonMessage('plan_changed') : null
			// the plan is announced when it is there: whether it can be confirmed, or why it cannot
			this.announced = this.say(plan.refused ? plan.refusedMessage : { key: wordsOf(dialog.kind).ready, params: { module: dialog.title } })
			if (plan.refused === 'busy') {
				const check = plan.checks.find(item => item.code === 'busy' && item.mark === 'failed')
				this.busy = { message: check?.detailMessage ?? null, detail: check?.detailMessage ? '' : check?.detail ?? '' }
			}
			// a module that the machine has already (or has no more, or has already updated) is a list that is out of date
			if (STALE.has(plan.refused))
				this.loadList()
		},
		// The call a window was opened for: the install of the plan on the screen, or the remove.
		async confirmDialog() {
			const dialog = this.dialog
			if (!dialog || this.acting)
				return
			if (dialog.kind === 'remove')
				return this.callModule(dialog, 'removeModule', [dialog.name])
			// the id that is sent is the one of the plan that is shown
			const body = dialog.phase === 'plan' ? installBody(dialog.plan) : null
			if (body)
				return this.callModule(dialog, 'installModule', [dialog.name, body])
		},
		// One call at a time. A call that was answered starts the follow of the job; one that was refused says why in the window; one that got no answer
		// may have been carried out, and the job is asked for before anything is said.
		async callModule(dialog, call, args) {
			this.acting = dialog.key
			this.callError = null
			this.announced = this.say({ key: dialog.kind === 'remove' ? TEXT.remove.starting : wordsOf(dialog.kind).starting, params: {} })
			// the job the module had before the call: a job that is found afterwards and is not that one is the job of this call
			const before = this.jobs[dialog.name]?.view?.startedAtRaw ?? ''
			let raw = null
			let failure = null
			try {
				raw = (await this.$api.sys[call](...args))?.data?.data
			} catch (error) {
				failure = moduleFailure(error, this.locale, { mutating: true, mode: dialog.kind === 'update' ? 'update' : 'install' })
			}
			if (this.gone)
				return
			if (!failure) {
				this.acting = ''
				if (this.dialog === dialog)
					this.closeDialog()
				this.startFollowing(dialog.name, dialog.kind, raw)
				return
			}
			if (failure.kind === 'timeout') {
				// (the kind of the job that may be there is the kind of the call)
				const old = this.jobs[dialog.name]
				this.jobs[dialog.name] = { ...old, view: old?.view ?? null, followed: Boolean(old?.followed), kind: dialog.kind }
				await this.probeJob(dialog.name)
				if (this.gone)
					return
				const found = this.jobs[dialog.name]?.view
				// a job that is there, and that is not the one the module had, is the job of the call, whatever state it is in by now
				if (found && found.state !== 'idle' && found.startedAtRaw !== before) {
					this.jobs[dialog.name].followed = true
					const note = jobAnnouncement(old?.view, found)
					if (note)
						this.announced = this.say(note)
					this.acting = ''
					if (this.dialog === dialog)
						this.closeDialog()
					if (!found.running)
						this.refreshList()
					return
				}
			}
			this.acting = ''
			if (failure.code === 'busy')
				this.busy = { message: failure.busy, detail: failure.detail }
			// a refusal that says the list is out of date: the list is read again
			if (STALE.has(failure.code))
				this.loadList()
			if (failure.code === 'plan_changed' && dialog.kind !== 'remove' && this.dialog === dialog) {
				await this.requestPlan(true)
				return
			}
			this.callError = failure
		},

		// ---- the confirmation window ----

		openDialog(spec, event) {
			this.opener = event?.currentTarget ?? document.activeElement
			this.callError = null
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
			// a refusal said in the window goes with it: it was for the step that was asked
			this.callError = null
			// the plan that was being made is for nobody now, but the machine does not know it: it may work on it for up to a minute
			if (this.acting === 'plan') {
				this.planTicket++
				this.planAbort?.abort()
				this.planAbort = null
				this.acting = ''
				this.planCancelled()
			}
			window.removeEventListener('keyup', this.onEscape, true)
			// the focus goes back to the button that opened the window, or to the heading when that button is shut or gone
			this.$nextTick(() => {
				opener?.focus?.({ preventScroll: true })
				if (!opener?.isConnected || document.activeElement !== opener)
					this.$refs.title?.focus?.({ preventScroll: true })
			})
		},
		// Said once, and not asked again by the page: the core's plan holds its place for as long as it works, and nothing here frees it.
		planCancelled() {
			this.planNote = true
			this.announced = this.say({ key: TEXT.plan.cancelled, params: {} })
			clearTimeout(this.noteTimer)
			this.noteTimer = setTimeout(() => {
				this.noteTimer = null
				this.planNote = false
			}, PLAN_NOTE_MS)
		},
		// What the person does to close the window: not while its call is out, or the step would go on with no window to say how it went. The plan can
		// be given up: it changes nothing.
		requestClose() {
			if (!this.acting || this.acting === 'plan')
				this.closeDialog()
		},
		// Escape closes the window that is on top, and nothing under it: the window this one stands on would close at the same key.
		onEscape(event) {
			if (!this.dialog || (event.key !== 'Escape' && event.key !== 'Esc'))
				return
			event.stopPropagation()
			this.requestClose()
		},
		// The Tab key goes round inside the window it is pressed in, in both directions, and from its heading (which takes the focus when the window opens
		// and is not a stop of the Tab key). It is stopped here, so that no window under this one hears it: Buefy's hold on each window moves the focus to the
		// first control of the window it stands on, and the one it holds for the window on top does not take the Shift key from the heading.
		onTab(event) {
			event.stopPropagation()
			const box = event.currentTarget
			const ring = Array.from(box.querySelectorAll(TABBABLE)).filter(element => box !== this.$el || !element.closest('.modules-dialog'))
			const inside = ring.includes(event.target)
			if (!ring.length) {
				event.preventDefault()
				return
			}
			const edge = ring[event.shiftKey ? 0 : ring.length - 1]
			if (inside && event.target !== edge)
				return
			const target = ring[event.shiftKey ? ring.length - 1 : 0]
			event.preventDefault()
			target.focus({ preventScroll: true })
		},
		// the heading of the window takes the focus when it opens, and only then (a function ref runs at every render)
		focusHeading(element) {
			if (element && this.focusPending) {
				this.focusPending = false
				// the element is not in the page yet: the parts of a window are put together before the window is
				this.$nextTick(() => element.focus?.({ preventScroll: true }))
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.modules-title:focus,
.modules-card-title:focus,
.modules-modal:focus,
.modules-dialog:focus {
	outline: none;
}

// the names come from the core and from the modules: a long one wraps instead of leaving the window
.modules-modal .modal-card-body {
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.modules-list,
.modules-facts,
.modules-reasons,
.modules-steps,
.modules-checks,
.modules-sizes,
.modules-call-items {
	margin: 0;
	padding: 0;
	list-style: none;
}

.modules-card {
	padding: 0.75rem;
	border: 1px solid var(--casa-border-hairline);
	border-radius: 6px;
}

.modules-card-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.25rem 0.5rem;
}

.modules-card-title {
	font-size: 1rem;
}

// the kind of module is a word on a tag, and a sentence under it: the tag is not the only thing that says it
.modules-tier {
	color: var(--casa-text);
	background: var(--casa-surface-sunken);
}

.modules-reasons {
	margin-left: 1rem;
}

// The report of a job holds a log that is as wide as its longest line: the message it stands in is a flex box, whose item would grow to that width
// and push the card out of the window, and the log scrolls in its own box instead.
.modules-job :deep(.media),
.modules-job :deep(.media-content) {
	min-width: 0;
}

.modules-steps .modules-step {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.25rem 0.5rem;
	padding: 0.2rem 0;

	// the state of a step is said in a word beside its sentence, and in an icon beside the word
	&.is-current {
		font-weight: 600;
	}

	&.is-failed .modules-step-mark,
	&.is-stopped .modules-step-mark {
		color: var(--casa-text-attention);
	}
}

.modules-check {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.25rem 0.5rem;
	padding: 0.3rem 0;
	border-top: 1px solid var(--casa-border-hairline);

	&:first-child {
		border-top: 0;
	}

	&.is-failed .modules-check-mark {
		color: var(--casa-text-attention);
	}

	&.is-notChecked .modules-check-mark {
		color: var(--casa-text-warning);
	}
}

.modules-names {
	margin: 0 0 0 1.25rem;
	padding: 0;
	list-style: disc;
	columns: 12rem;
}

.modules-buttons,
.modules-job-buttons {
	gap: 0.5rem;
}

// Bulma keeps the label of a button on one line: a long one (in French) wraps in a narrow window instead of leaving it
.modules-modal :deep(.button) {
	max-width: 100%;
	line-height: 1.3;
	white-space: normal;
}

// a window on a phone: one column, the buttons go on a second line
.modules-dialog {
	.modal-card-body {
		overflow-wrap: anywhere;
	}
}

.modules-dialog-foot {
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.5rem;
}
</style>
