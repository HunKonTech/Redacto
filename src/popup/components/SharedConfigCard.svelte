<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
</script>

<article class="card">
	<div class="card-head"><span>{t('popup.shared.title')}</span><span>{t('popup.shared.hint')}</span></div>
	<p>{t('popup.shared.body')}</p>
</article>

<style>
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.card-head { display: flex; justify-content: space-between; padding: 11px 12px; border-bottom: 1px solid var(--color-border); }
	.card-head span:first-child { font-size: 12px; font-weight: 600; }
	.card-head span:last-child { color: var(--color-subtle); font-size: 10px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
	p { margin: 0; padding: 10px 12px 12px; color: var(--color-muted); font-size: 12px; line-height: 1.4; }
</style>
