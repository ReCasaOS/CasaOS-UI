<template>
	<div class="modal-card container-detail">
		<header class="modal-card-head b-line">
			<div class="is-flex-grow-1">
				<h3 class="title is-5 has-text-black mb-1">{{ detail.name || containerId.slice(0, 12) }}</h3>
				<p class="has-text-full-03 is-size-7 _mono">{{ detail.image }}</p>
			</div>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">{{ error }}</b-message>

			<b-loading :active="isLoading" :is-full-page="false" />

			<template v-if="!isLoading && detail.id">
				<!-- A container somebody did not create is identified by what it runs and
					how long it has been there, not by the name Docker invented for it. -->
				<dl class="facts mb-4">
					<div><dt>{{ $t('State') }}</dt><dd>{{ detail.status || detail.state }}</dd></div>
					<div v-if="detail.command"><dt>{{ $t('Command') }}</dt><dd class="_mono">{{ detail.command }}</dd></div>
					<div v-if="detail.restart_policy"><dt>{{ $t('Restart') }}</dt><dd>{{ detail.restart_policy }}</dd></div>
					<div v-if="networks"><dt>{{ $t('Networks') }}</dt><dd>{{ networks }}</dd></div>
					<div v-if="detail.compose_project">
						<dt>{{ $t('Compose project') }}</dt>
						<dd>{{ detail.compose_project }}</dd>
					</div>
				</dl>

				<!-- Why this stack is not an app here. The loader names the file and the field,
					which is what the owner needs to fix it. -->
				<b-message v-if="composeLoadError" class="mb-4" size="is-small" type="is-warning">
					<p class="mb-1">{{ $t('CasaOS cannot load the compose file of this project, so it does not manage it.') }}</p>
					<p class="_mono _wrap">{{ composeLoadError }}</p>
				</b-message>

				<h4 class="_heading">{{ $t('Published ports') }}</h4>
				<p v-if="!ports.length" class="has-text-full-03 is-size-7 mb-3">{{ $t('None') }}</p>
				<p v-for="port in ports" :key="port" class="_mono is-size-7">{{ port }}</p>

				<h4 class="_heading mt-3">{{ $t('Volumes') }}</h4>
				<p v-if="!volumes.length" class="has-text-full-03 is-size-7 mb-3">{{ $t('None') }}</p>
				<div v-for="volume in volumes" :key="volume.name" class="is-size-7 mb-1">
					<span class="_mono">{{ volume.name }}</span>
					<span class="has-text-full-03"> → {{ volume.target }}</span>
					<span v-if="volume.size >= 0" class="has-text-full-03"> · {{ renderSize(volume.size) }}</span>
					<span v-if="!volume.removable" class="has-text-warning"> · {{ volume.reason }}</span>
				</div>

				<h4 class="_heading mt-3">{{ $t('Host paths') }}</h4>
				<p v-if="!binds.length" class="has-text-full-03 is-size-7 mb-3">{{ $t('None') }}</p>
				<div v-for="bind in binds" :key="bind.target" class="is-size-7 _mono mb-1">
					{{ bind.source }} → {{ bind.target }}{{ bind.read_only ? ' (ro)' : '' }}
				</div>

				<h4 class="_heading mt-3">
					{{ $t('Environment') }}
					<b-button class="ml-2" rounded size="is-small" @click="showEnv = !showEnv">
						{{ showEnv ? $t('Hide') : $t('Show') }}
					</b-button>
				</h4>
				<!-- Hidden until asked for: these routinely carry passwords, and a panel
					somebody opens to find out what a container is should not put them on
					screen by default. -->
				<div v-if="showEnv">
					<div v-for="line in detail.env || []" :key="line" class="is-size-7 _mono _wrap">{{ line }}</div>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<b-button :disabled="!detail.id || !!detail.compose_project" :loading="isRemoving" type="is-danger"
				rounded @click="confirmRemove">
				{{ $t('Remove') }}
			</b-button>
			<span v-if="detail.compose_project" class="has-text-full-03 is-size-7 ml-2">
				{{ $t('Part of a compose project — remove the app instead.') }}
			</span>
			<div class="is-flex-grow-1"></div>
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'container-detail-panel',
	props: {
		containerId: { type: String, required: true },
		// why the compose list could not load this container's project, as the app grid says
		composeLoadError: { type: String, default: '' },
	},
	emits: ['close', 'removed'],
	data() {
		return { detail: {}, isLoading: false, isRemoving: false, error: '', showEnv: false }
	},
	computed: {
		networks() {
			return (this.detail.networks || []).join(', ')
		},
		ports() {
			return (this.detail.ports || []).map(p => `${p.host} → ${p.container}/${p.protocol}`)
		},
		volumes() {
			return this.detail.volumes || []
		},
		binds() {
			return this.detail.binds || []
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		renderSize,

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.container.getDetail(this.containerId)
				this.detail = res.data.data || {}
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.isLoading = false
			}
		},

		// The volumes are shown BEFORE anything is deleted, with their size, and the
		// ones that cannot go are shown saying why. A container comes back from its
		// image; a volume does not.
		confirmRemove() {
			const removable = this.volumes.filter(volume => volume.removable)
			const lines = removable.map(volume =>
				`${volume.name}${volume.size >= 0 ? ` (${renderSize(volume.size)})` : ''}`)

			this.$buefy.dialog.confirm({
				title: this.$t('Remove this container?'),
				message: removable.length
					? `${this.$t('The container goes. It also uses these volumes, which nothing else is using:')}<br><br><b>${lines.join('<br>')}</b><br><br>${this.$t('Delete those too? Cancel removes nothing.')}`
					: this.$t('The container goes. None of its volumes can be deleted with it, so nothing else is touched.'),
				confirmText: removable.length ? this.$t('Remove container and volumes') : this.$t('Remove container'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.remove(removable.map(volume => volume.name)),
			})
		},

		async remove(volumes) {
			this.isRemoving = true
			try {
				const res = await this.$api.container.remove(this.containerId, volumes)
				const refused = (res.data.data && res.data.data.refused) || {}
				const names = Object.keys(refused)

				this.$buefy.toast.open({
					// A green tick over a disk that did not shrink is a lie.
					message: names.length
						? this.$t('Container removed. These volumes were kept: {names}', { names: names.join(', ') })
						: res.data.message,
					type: names.length ? 'is-warning' : 'is-success',
					duration: 6000,
				})

				this.$emit('removed')
				this.$emit('close')
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.isRemoving = false
			}
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>

<style lang="scss" scoped>
.container-detail {
  ._mono {
    font-family: 'Monaco', 'Consolas', monospace;
  }

  ._wrap {
    word-break: break-all;
  }

  ._heading {
    font-size: 0.8125rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .facts {
    div {
      display: flex;
      font-size: 0.8125rem;
      margin-bottom: 0.25rem;
    }

    dt {
      width: 9rem;
      flex: none;
      color: var(--casa-text-icon);
    }

    dd {
      word-break: break-word;
    }
  }
}
</style>

<style lang="scss">
// Not scoped: .animation-content is Buefy's wrapper, outside this component.
//
// The customClass these panels were given, `account-modal`, has no rule anywhere
// in the tree -- so every one of them fell back to Buefy's default width, around
// 640px. This panel holds host paths and environment variables, which are long
// strings that then wrapped one word per line.
@media screen and (min-width: 769px) {
  .container-detail-modal {
    .animation-content {
      max-width: 94% !important;
    }

    .modal-card {
      width: min(94vw, 64rem) !important;
    }
  }
}
</style>
