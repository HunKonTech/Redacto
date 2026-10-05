<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import { PUBLIC_PROJECT_LINKS } from '../../shared/project-links';
	import CardHeading from './CardHeading.svelte';

	const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '';
</script>

<article class="card" id="about-section">
	<CardHeading title={t('about.title')} hint={version ? `v${version}` : t('common.beta')} />
	<div class="body">
		<p>{t('about.summary')}</p>
		<p>{t('about.local')}</p>
		<p>{t('about.fork')}</p>
	</div>
	<div class="links">
		<a href={PUBLIC_PROJECT_LINKS.repo} target="_blank" rel="noopener noreferrer">{t('about.source')}</a>
		<a href={PUBLIC_PROJECT_LINKS.sponsor} target="_blank" rel="noopener noreferrer">{t('about.sponsor')}</a>
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 4px; }
	.body p { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 10px 14px 14px; }
	a {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 34px;
		padding: 6px 8px;
		border: var(--border-hairline);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-accent);
		font-size: 12px;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
	}
	a:hover, a:focus-visible { border-color: var(--color-accent); outline: none; }
</style>
