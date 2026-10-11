<template>
	<!-- The page's frame, the terminal panel's header. The list and the details
	of the virtual machines come with the module's page. -->
	<div class="modal-card vm-page">
		<header class="modal-card-head">
			<div class="is-flex is-align-items-center is-flex-grow-1">
				<h3 class="title is-header mb-0">{{ $t('Virtual Machines') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<section class="modal-card-body"></section>
	</div>
</template>

<script>
export default {
	name: 'VmPage',
	emits: ['close'],
}
</script>
