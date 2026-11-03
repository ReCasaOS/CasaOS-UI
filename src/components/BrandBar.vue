<template>
	<div class="brand-bar is-flex is-align-items-flex-end has-text-white">
		<figure class="image _is-136x26 mb-3">
			<img alt="ReCasaOS" srcset="../assets/img/logo/logo.svg 2x, ../assets/img/logo/logo.png 1x">
		</figure>
		<!-- Two lines, because they answer two different questions: who publishes this
			build, and whose work it stands on. The README says the same thing in more
			words; a footer reading "Made by IceWhale" on a fork says the opposite. -->
		<div class="brand-text ml-4">
			<span class="intro-text">Made with ❤️ by ReCasaOS and YOU!</span>
			<span class="upstream-text">Built on CasaOS by IceWhale</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'brand-bar',
}
</script>

<style lang="scss" scoped>
.brand-bar {
	position: fixed;
	left: 2rem;
	bottom: 0;
	//z-index: 10;

	// the 7px used to sit on the span itself; it belongs on whatever the bar's last
	// flex item is, which is now the column rather than a single line of text
	.brand-text {
		display: flex;
		flex-direction: column;
		margin-bottom: 7px;
		min-width: 0;
	}

	.intro-text {
		font-weight: 400;
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: var(--casa-on-glass-dim);

		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.upstream-text {
		font-weight: 400;
		font-size: 0.75rem;
		line-height: 1rem;
		color: var(--casa-on-glass-dim);
		opacity: 0.7;

		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

@media screen and (max-width: 480px) {
	.brand-bar {
		left: 0;
		bottom: 3rem;
		display: flex;
		width: 100%;
		justify-content: center;
		font-size: 0.875rem;

		.image.is-32x32 {
			height: 24px;
			width: 24px;
		}

		.is-size-4 {
			font-size: 1.25rem !important;
		}
	}
}

._is-136x26 {
	width: 11.25rem;
	height: 1.625rem;
}
</style>
