<template>
	<div class="modal-card alerts-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Alerts') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="is-size-7 mb-3">
				{{ $t('Be told on your phone or by e-mail when something needs you: a backup that failed, a disk failing or full, an app that stopped, an update that paused.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<template v-if="view">
				<b-message v-if="view.last_failure" class="mb-3" size="is-small" type="is-warning">
					{{ $t('The last alert to {channel} could not be sent ({date}): {error}', {
						channel: channelName(view.last_failure.channel),
						date: new Date(view.last_failure.at).toLocaleString(),
						error: view.last_failure.error,
					}) }}
				</b-message>

				<h4 class="has-text-weight-bold mb-2">
					{{ $t('Channels') }}
				</h4>
				<p v-if="!view.channels.length" class="is-size-7 mb-3">
					{{ $t('No channel yet: nothing is sent. Add one below.') }}
				</p>
				<div v-for="channel in view.channels" :key="channel.id" class="channel is-flex is-align-items-center mb-2">
					<div class="is-flex-grow-1">
						<div class="has-text-weight-medium">
							{{ channel.name }}
						</div>
						<div class="is-size-7 has-text-full-03">
							{{ [channel.service, channel.host].filter(Boolean).join(' · ') }}
						</div>
					</div>
					<span v-if="tested[channel.id]" class="is-size-7 mr-3">{{ tested[channel.id] }}</span>
					<b-button :loading="busy === channel.id" class="mr-1" rounded size="is-small" @click="test(channel)">
						{{ $t('Test') }}
					</b-button>
					<b-button :disabled="saving" class="mr-1" rounded size="is-small" @click="rename(channel)">
						{{ $t('Rename') }}
					</b-button>
					<b-button :disabled="saving" rounded size="is-small" type="is-danger" @click="remove(channel)">
						{{ $t('Remove') }}
					</b-button>
				</div>
				<p class="is-size-7 has-text-full-03 mb-3">
					{{ $t('A channel\'s address and its secrets stay on this box and are never shown again: to change them, remove the channel and add it again.') }}
				</p>

				<hr>

				<h4 class="has-text-weight-bold mb-3">
					{{ $t('Add a channel') }}
				</h4>
				<b-field :label="$t('Name')" label-position="on-border">
					<b-input v-model="draft.name" :placeholder="$t('Phone')" expanded size="is-small" />
				</b-field>
				<b-field :label="$t('Service')" label-position="on-border">
					<b-select :model-value="draft.kind" expanded size="is-small" @update:model-value="pick">
						<option v-for="kind in kinds" :key="kind.id" :value="kind.id">
							{{ $t(kind.label) }}
						</option>
					</b-select>
				</b-field>
				<p class="is-size-7 has-text-full-03 mb-3">
					{{ $t(kind.help) }}
				</p>
				<b-field v-for="field in kind.fields" :key="field.key" :label="$t(field.label)" label-position="on-border">
					<b-input v-model="draft.values[field.key]"
						:password-reveal="field.secret"
						:placeholder="field.placeholder"
						:type="field.secret ? 'password' : 'text'"
						expanded
						size="is-small" />
				</b-field>
				<div class="is-flex is-justify-content-flex-end">
					<b-button :disabled="!draft.name.trim() || !draftURL || saving"
						rounded
						size="is-small"
						type="is-primary"
						@click="add">
						{{ $t('Add channel') }}
					</b-button>
				</div>

				<hr>

				<h4 class="has-text-weight-bold mb-3">
					{{ $t('What to send') }}
				</h4>
				<b-field v-for="category in categories" :key="category.key" class="mb-2">
					<b-checkbox :disabled="saving"
						:model-value="view.categories[category.key]"
						size="is-small"
						@update:model-value="save({ categories: { ...view.categories, [category.key]: $event } })">
						{{ $t(category.label) }}
					</b-checkbox>
				</b-field>
				<div class="is-flex is-align-items-center is-size-7">
					{{ $t('A disk counts as full above') }}
					<b-select :disabled="saving"
						:model-value="view.disk_threshold"
						class="ml-2"
						size="is-small"
						@update:model-value="save({ disk_threshold: $event })">
						<option v-for="percent in thresholds" :key="percent" :value="percent">
							{{ percent }} %
						</option>
					</b-select>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import { ALERT_KINDS, blankValues, channelURL } from './alertChannels'

const blankDraft = kind => ({ name: '', kind, values: blankValues(kind) })

export default {
	name: 'AlertsModal',
	emits: ['close'],
	data() {
		return {
			// GET /v1/sys/alerts: { channels: [{ id, name, service, host }], categories,
			// disk_threshold, last_failure }. null until the core answers.
			view: null,
			error: '',
			saving: false,
			// the channel id a test is running for
			busy: '',
			// channel id -> what its last test said
			tested: {},
			kinds: ALERT_KINDS,
			draft: blankDraft('ntfy'),
			categories: [
				{ key: 'backups', label: 'A backup or a restore fails' },
				{ key: 'disks', label: 'A disk is failing, missing or full' },
				{ key: 'updates', label: 'An update fails or pauses, or a new release is out' },
				{ key: 'apps', label: 'An app operation fails, or an app stops or keeps restarting' },
			],
			// the core's bounds
			thresholds: Array.from({ length: 50 }, (_, i) => 50 + i),
		}
	},
	computed: {
		kind() {
			return ALERT_KINDS.find(kind => kind.id === this.draft.kind)
		},
		draftURL() {
			return channelURL(this.draft.kind, this.draft.values)
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			try {
				const res = await this.$api.sys.getAlerts()
				// Go writes an empty list as null
				this.view = { ...res.data.data, channels: res.data.data.channels || [] }
			} catch (error) {
				this.error = this.messageOf(error)
			}
		},

		// change: any of { channels, categories, disk_threshold }. The dialog moves at
		// once and ends where the core says it is: a refused PUT puts it back. Channels
		// are sent as PUT reads them: an id keeps its stored URL, a new one brings its url.
		async save(change) {
			const before = this.view
			this.view = { ...before, ...change }
			this.saving = true
			this.error = ''
			try {
				const body = change.channels
					? { ...change, channels: change.channels.map(({ id, name, url }) => ({ id, name, url })) }
					: change
				await this.$api.sys.setAlerts(body)
			} catch (error) {
				this.view = before
				this.error = this.messageOf(error)
				return false
			} finally {
				this.saving = false
			}
			await this.load()
			return true
		},

		pick(kind) {
			this.draft = { ...blankDraft(kind), name: this.draft.name }
		},

		// The URL goes to the core and is not kept here once it has it.
		async add() {
			const channels = [...this.view.channels, { name: this.draft.name.trim(), url: this.draftURL }]
			if (await this.save({ channels }))
				this.draft = blankDraft(this.draft.kind)
		},

		rename(channel) {
			this.$buefy.dialog.prompt({
				message: this.$t('New name for {name}', { name: channel.name }),
				inputAttrs: { value: channel.name, required: true },
				confirmText: this.$t('Save'),
				cancelText: this.$t('Cancel'),
				trapFocus: true,
				onConfirm: name => this.save({
					channels: this.view.channels.map(other => (other.id === channel.id ? { ...other, name: name.trim() } : other)),
				}),
			})
		},

		remove(channel) {
			this.$buefy.dialog.confirm({
				message: this.$t('Remove {name}? Alerts are no longer sent there.', { name: channel.name }),
				confirmText: this.$t('Remove'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.save({ channels: this.view.channels.filter(other => other.id !== channel.id) }),
			})
		},

		async test(channel) {
			this.busy = channel.id
			let said
			try {
				const res = await this.$api.sys.testAlerts({ channel_id: channel.id })
				const result = (res.data.data || []).find(one => one.id === channel.id) || {}
				said = result.ok ? this.$t('Sent') : this.$t('Not sent: {error}', { error: result.error })
			} catch (error) {
				said = this.$t('Not sent: {error}', { error: this.messageOf(error) })
			} finally {
				this.busy = ''
			}
			this.tested = { ...this.tested, [channel.id]: said }
		},

		// the last failure names its channel by id; one removed since is named as is
		channelName(id) {
			const channel = this.view.channels.find(one => one.id === id)
			return channel ? channel.name : id
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>
