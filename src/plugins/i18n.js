import { createI18n } from 'vue-i18n'
import messages from '@/assets/lang'

// legacy: true keeps $t / $i18n injected on every component, so none of the
// 710 call sites change. silentFallbackWarn is new and necessary: 86 keys
// exist only in en_US, and v9 warns on the fallback separately from the
// missing key. warnHtmlInMessage silences a dev-only warning on the 94
// messages that carry HTML on purpose (AppCard.vue injects the uninstall
// dialog's checkbox that way) — do not "fix" those by escaping them.
export default createI18n({
	legacy: true,
	locale: (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'en_us',
	fallbackLocale: 'en_us',
	silentTranslationWarn: true,
	silentFallbackWarn: true,
	warnHtmlInMessage: 'off',
	messages,
})
