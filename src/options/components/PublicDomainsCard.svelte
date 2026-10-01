<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		error,
		addDomain,
		removeDomain,
		clearError,
	}: {
		settings: Writable<Settings | null>;
		error: Writable<string | null>;
		addDomain: (raw: string) => Promise<boolean>;
		removeDomain: (domain: string) => Promise<void>;
		clearError: () => void;
	} = $props();

	let inputValue = $state('');
	let domains = $derived($settings?.publicDomains ?? []);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const ok = await addDomain(inputValue);
		if (ok) inputValue = '';
	}
</script>

<article class="card" id="public-domains-section">
	<CardHeading title={t('domains.title')} hint={t('domains.hint')} />

	<div class="body">
		<p class="note">
			{t('domains.note')}
		</p>

		<form class="add-form" autocomplete="off" onsubmit={handleSubmit}>
			<input
				type="text"
				class="input"
				placeholder={t('domains.placeholder')}
				aria-label={t('domains.inputAria')}
				aria-invalid={$error !== null}
				bind:value={inputValue}
				oninput={clearError}
			/>
			<button type="submit" class="add-btn">{t('common.add')}</button>
		</form>

		{#if $error}
			<p class="error" role="alert">{$error}</p>
		{/if}

		{#if domains.length === 0}
			<p class="empty">{t('domains.empty')}</p>
		{:else}
			<ul class="list" aria-label={t('domains.title')}>
				{#each domains as domain (domain)}
					<li>
						<span class="domain">{domain}</span>
						<button
							type="button"
							class="delete-btn"
							aria-label={t('common.removeItem', { item: domain })}
							onclick={() => removeDomain(domain)}
						>×</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { display: flex; flex-direction: column; gap: 10px; padding: 14px; }
	.note { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.add-form { display: flex; gap: 8px; }
	.input {
		flex: 1;
		padding: 8px 12px;
		border: var(--border-hairline);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-ink);
		font-size: 13px;
		outline: none;
		transition: border-color 120ms ease;
	}
	.input:focus { border-color: var(--color-accent); }
	.input[aria-invalid="true"] { border-color: var(--color-danger); }
	.input::placeholder { color: var(--color-subtle); }
	.add-btn {
		padding: 8px 16px;
		border: 0;
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.add-btn:hover { background: var(--color-accent-hover); }
	.error { margin: 0; color: var(--color-danger); font-size: 12px; }
	.empty { margin: 0; color: var(--color-subtle); font-size: 13px; font-style: italic; }

	.list { margin: 0; padding: 0; list-style: none; }
	.list li { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--color-border); }
	.list li:last-child { border-bottom: none; }
	.domain { color: var(--color-ink); font-family: var(--font-mono); font-size: 12px; overflow-wrap: anywhere; }
	.delete-btn {
		padding: 2px 6px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--color-subtle);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease;
	}
	.delete-btn:hover { color: var(--color-danger); background: var(--color-danger-soft); }
</style>
