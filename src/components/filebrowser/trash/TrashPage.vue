<template>
	<div class="content is-flex-grow-1 is-flex is-flex-direction-column">
		<!-- Header Start -->
		<header class="modal-card-head">
			<sidebar-menu-button></sidebar-menu-button>
			<div class="is-flex-grow-1 is-flex breadcrumb-container">
				<h3 class="title is-header mb-0">{{ $t('Trash') }}</h3>
			</div>
			<b-button :disabled="items.length === 0" class="mr-2" icon-left="delete-forever-outline" rounded
				size="is-small" type="is-danger" @click="confirmEmpty">{{ $t('Empty the trash') }}</b-button>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<!-- Header End -->

		<div class="trash-body scrollbars-light px-4 py-3">
			<p class="is-size-7 has-text-grey mb-3">
				{{ $t('{size} in the trash. Items are deleted for good after {days} days.', { size: renderSize(size), days }) }}
			</p>

			<b-message v-if="error" size="is-small" type="is-danger">{{ error }}</b-message>

			<b-table v-else :data="items" :loading="isLoading" :mobile-cards="false" class="is-size-7" scrollable>
				<b-table-column v-slot="{ row }" :label="$t('Name')" field="path">
					<span class="is-flex is-align-items-center">
						<b-icon :icon="row.is_dir ? 'folder-outline' : 'file-outline'" class="mr-1" size="is-small"></b-icon>
						<span class="trash-name">{{ baseName(row.path) }}</span>
					</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Deleted from')" field="path">
					<span class="trash-name">{{ folderOf(row.path) }}</span>
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Deleted on')" field="deleted_at">
					{{ deletedOn(row) }}
				</b-table-column>

				<b-table-column v-slot="{ row }" :label="$t('Size')" field="size" numeric>
					{{ renderSize(row.size) }}
				</b-table-column>

				<b-table-column v-slot="{ row }" field="actions">
					<div class="buttons is-flex-wrap-nowrap is-justify-content-flex-end">
						<b-button :loading="busy === row" rounded size="is-small" @click="restore(row)">{{ $t('Restore') }}</b-button>
						<b-button :disabled="busy === row" :title="$t('Delete permanently')" icon-left="delete-forever-outline"
							rounded size="is-small" type="is-danger" @click="confirmDelete(row)"></b-button>
					</div>
				</b-table-column>

				<template #empty>
					<p class="has-text-centered has-text-grey py-6">{{ $t('The trash is empty.') }}</p>
				</template>
			</b-table>
		</div>
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import escape from 'lodash/escape'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'trash-page',
	components: {
		SidebarMenuButton: defineAsyncComponent(() => import('../components/SidebarMenuButton.vue')),
	},
	data() {
		return {
			items: [],
			size: 0,
			days: 30,
			isLoading: true,
			error: '',
			busy: null,
		}
	},
	mounted() {
		this.load()
	},
	methods: {
		renderSize,
		baseName(path) {
			return path.slice(path.lastIndexOf('/') + 1)
		},
		folderOf(path) {
			return path.slice(0, path.lastIndexOf('/')) || '/'
		},
		deletedOn(row) {
			const when = new Date(row.deleted_at)
			// an item whose deletion date cannot be read comes with Go's zero time
			return when.getFullYear() > 1 ? when.toLocaleString() : '—'
		},
		ref(row) {
			return [{ trash: row.trash, name: row.name }]
		},
		// Buefy shows toasts and dialogs as HTML, and a file name can hold markup
		failed(e) {
			this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
		},
		async load() {
			this.isLoading = true
			try {
				const res = await this.$api.file.trash()
				const data = res.data.data
				this.items = data.items || []
				this.size = data.size || 0
				this.days = data.retention_days || this.days
				this.error = ''
			} catch (e) {
				this.items = []
				this.error = e?.response?.data?.message || String(e)
			} finally {
				this.isLoading = false
			}
		},
		async restore(row) {
			this.busy = row
			try {
				const res = await this.$api.file.restoreTrash(this.ref(row))
				this.$buefy.toast.open({ message: this.$t('Restored to {path}', { path: escape(res.data.data[0]) }), type: 'is-success' })
			} catch (e) {
				this.failed(e)
			} finally {
				this.busy = null
				await this.load()
			}
		},
		confirmDelete(row) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete permanently'),
				message: this.$t('Delete {name} permanently? This cannot be undone.', { name: escape(this.baseName(row.path)) }),
				confirmText: this.$t('Delete permanently'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.remove(row),
			})
		},
		async remove(row) {
			this.busy = row
			try {
				await this.$api.file.deleteTrash(this.ref(row))
			} catch (e) {
				this.failed(e)
			} finally {
				this.busy = null
				await this.load()
			}
		},
		confirmEmpty() {
			this.$buefy.dialog.confirm({
				title: this.$t('Empty the trash'),
				message: this.$t('Empty the trash? Everything in it is deleted for good.'),
				confirmText: this.$t('Empty the trash'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.empty(),
			})
		},
		async empty() {
			this.isLoading = true
			try {
				await this.$api.file.emptyTrash()
			} catch (e) {
				this.failed(e)
			} finally {
				await this.load()
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.trash-body {
	flex: 1 1 auto;
	overflow-y: auto;
}

.trash-name {
	overflow-wrap: anywhere;
}
</style>
