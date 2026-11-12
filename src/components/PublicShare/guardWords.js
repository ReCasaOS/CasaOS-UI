// The words of the protection of shared apps, from what the core and the Gateway send. Pure: `t` is this.$t, and every
// key is a literal call of t so that shareKeys.spec.js finds it.
import { gatewayUnsupportedText, shareErrorText } from '@/components/PublicShare/shareWords'

export function reasonText(event, t) {
	switch (event?.reason) {
		case 'waf': return t('OWASP rule {rule}: {detail}', { rule: event.rule, detail: event.detail })
		case 'country': return t('Country blocked: {country}', { country: event.country })
		case 'scan': return t('Scan: many missing pages')
		case 'rate': return t('Request limit exceeded')
		case 'code': return t('Access code wrong too often')
		case 'blocklist': return t('Address blocked')
		case 'banned': return t('Banned address')
		default: return ''
	}
}

export function actionText(action, t) {
	switch (action) {
		case 'blocked': return t('Blocked')
		case 'banned': return t('Banned')
		case 'observed': return t('Observed, not blocked')
		default: return ''
	}
}

// regional-indicator letters make the flag emoji; '' when there is no two-letter code
export function flag(cc) {
	return /^[a-z]{2}$/i.test(cc || '') ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : ''
}

export function countryName(cc, locale) {
	if (!cc) {
		return ''
	}
	try {
		return new Intl.DisplayNames([String(locale || 'en').replace('_', '-')], { type: 'region' }).of(cc.toUpperCase()) || cc
	} catch {
		return cc
	}
}

// the core's short field names of a refused policy; the Gateway's long paths (apps["host"].policy.waf) match none
const FIELD = /^(allow|block|countries|rate_per_min|ban|waf|rules_off)\b/

function fieldText(name, t) {
	switch (name) {
		case 'allow': return t('the allowed addresses')
		case 'block': return t('the blocked addresses')
		case 'countries': return t('the countries')
		case 'rate_per_min': return t('the request limit')
		case 'ban': return t('the ban thresholds')
		case 'waf': return t('the OWASP rules')
		default: return t('the disabled OWASP rules')
	}
}

export function guardErrorText(e, t) {
	const message = e?.response?.data?.message
	const text = typeof message === 'string' ? message : ''
	const [code, arg = ''] = [text.split(':')[0], text.slice(text.indexOf(':') + 1)]
	switch (code) {
		case 'bad_policy': {
			const m = arg.match(FIELD)
			return m ? t('Invalid value in {field}: {path}', { field: fieldText(m[1], t), path: arg }) : t('The settings were refused. Try again, or update ReCasaOS.')
		}
		case 'bad_request': return t('The settings were refused. Try again, or update ReCasaOS.')
		case 'bad_name': return t('A name is 1 to 40 characters, with no control character')
		case 'unknown_app': return t('{app} is not shared', { app: arg })
		case 'not_shared': return t('This app is not shared')
		case 'not_found': return t('This person no longer exists')
		case 'gateway_unsupported': return gatewayUnsupportedText(t)
		default: return shareErrorText(e, t)
	}
}
