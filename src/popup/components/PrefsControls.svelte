<script lang="ts">
	import { LOCALE_NAMES, SUPPORTED_LOCALES, type LocalePreference } from '../../shared/i18n';
	import { t, uiPrefs } from '../../shared/i18n/reactive';
	import { saveUiPrefs, type ThemePreference } from '../../shared/ui-prefs';

	/** Theme switch and language picker, shown in every header. */
	let { showTheme = true }: { showTheme?: boolean } = $props();

	const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
	const prefs = $derived(uiPrefs());
	const themeLabel = $derived(
		prefs.theme === 'light' ? t('prefs.theme.light') : prefs.theme === 'dark' ? t('prefs.theme.dark') : t('prefs.theme.system'),
	);

	function cycleTheme(): void {
		const next = THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length];
		void saveUiPrefs({ theme: next });
	}
</script>

<div class="prefs">
	{#if showTheme}
		<button
			type="button"
			class="icon-btn"
			title={t('prefs.theme.title', { theme: themeLabel })}
			aria-label={t('prefs.theme.title', { theme: themeLabel })}
			onclick={cycleTheme}
		>
			{#if prefs.theme === 'light'}
				<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
					<circle cx="10" cy="10" r="3.4" />
					<path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
				</svg>
			{:else if prefs.theme === 'dark'}
				<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
					<path d="M16.2 12.4A6.6 6.6 0 0 1 7.6 3.8a6.6 6.6 0 1 0 8.6 8.6Z" />
				</svg>
			{:else}
				<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
					<rect x="2.8" y="3.8" width="14.4" height="9.6" rx="1.8" />
					<path d="M7 16.4h6M10 13.4v3" />
				</svg>
			{/if}
		</button>
	{/if}
	<label class="lang" title={t('prefs.language')}>
		<span class="sr-only">{t('prefs.language')}</span>
		<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
			<circle cx="10" cy="10" r="7.2" />
			<path d="M2.8 10h14.4M10 2.8c2 2.1 2.9 4.5 2.9 7.2s-.9 5.1-2.9 7.2c-2-2.1-2.9-4.5-2.9-7.2s.9-5.1 2.9-7.2Z" />
		</svg>
		<select
			value={prefs.locale}
			onchange={(event) => void saveUiPrefs({ locale: event.currentTarget.value as LocalePreference })}
		>
			<option value="auto">{t('prefs.language.auto')}</option>
			{#each SUPPORTED_LOCALES as code (code)}
				<option value={code}>{LOCALE_NAMES[code]}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.prefs {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.icon-btn,
	.lang {
		display: inline-flex;
		align-items: center;
		height: 30px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-elevated);
		color: var(--color-muted);
		transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
	}
	.icon-btn {
		justify-content: center;
		width: 30px;
		padding: 0;
		cursor: pointer;
	}
	.icon-btn:hover,
	.lang:hover {
		border-color: var(--color-border-strong);
		color: var(--color-ink);
	}
	.icon-btn:focus-visible,
	.lang:focus-within {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus);
	}
	svg {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}
	.lang {
		gap: 4px;
		padding: 0 4px 0 9px;
		cursor: pointer;
	}
	.lang select {
		appearance: none;
		max-width: 92px;
		padding: 0 6px 0 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}
	.lang select option {
		background: var(--color-card);
		color: var(--color-ink);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
