<template>
	<div class="modal-card cloud-sync-task touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ task ? $t('Edit sync task') : $t('New sync task') }}</h3>
		</header>
		<section class="modal-card-body"></section>
		<footer class="modal-card-foot">
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
// Stub: the create/edit dialog is written in its own task.
export default {
	name: 'cloud-sync-task-modal',
	props: {
		task: { type: Object, default: null },
		tasks: { type: Array, default: () => [] },
	},
	emits: ['saved', 'close'],
}
</script>
