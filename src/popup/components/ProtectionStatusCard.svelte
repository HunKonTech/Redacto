<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Readable, Writable } from 'svelte/store';
	import type { StatusPill } from '../popup-model.svelte';
	import type { ComposerMatchState } from '../../shared/message-types';
	import type { ResourceSummary } from '../../shared/popup-resource-summary';

	let { enabled, wasmStatus, nerStatus, cpuFallback, resourceSummary, composerMatch }: {
		enabled: Writable<boolean>;
		wasmStatus: Writable<StatusPill>;
		nerStatus: Writable<StatusPill>;
		cpuFallback: Writable<boolean>;
		resourceSummary: Readable<ResourceSummary | null>;
		composerMatch: Writable<ComposerMatchState | null>;
	} = $props();
</script>

<div class="pill-row" aria-label={t('popup.status.aria')}>
	<span class="pill">
		<span class={['dot', !$enabled && 'off']}></span>
		<span class="key">{t('popup.status.protection')}</span>
		<span class="value">{$enabled ? t('popup.status.on') : t('popup.status.off')}</span>
	</span>
	<span class="pill" title={$nerStatus.title}>
		<span class={['dot', $nerStatus.tone]}></span>
		<span class="key">{t('popup.status.localAi')}</span>
		<span class="value">{$nerStatus.label}</span>
	</span>
	<span class="pill" title={$wasmStatus.title}>
		<span class={['dot', $wasmStatus.tone]}></span>
		<span class="key">{t('popup.status.wasm')}</span>
		<span class="value">{$wasmStatus.label}</span>
	</span>
</div>

<p class="ai-notice" role="note">{t('popup.aiNotice')}</p>

{#if $composerMatch === 'generic'}
	<!-- Quiet on purpose. Pastes on this page are still reviewed; what has
	     changed is that the extension is working from a generic match of the
	     page rather than from what it knows about the site. The strongest
	     warning is reserved for pastes that were genuinely not reviewed. -->
	<p class="generic-match" role="note">
		{t('popup.genericMatch')}
	</p>
{/if}

{#if $resourceSummary}
	<div class="resource-summary" data-tone={$resourceSummary.tone} role="status" aria-label={t('popup.resource.aria')}>
		<strong>{$resourceSummary.title}</strong>
		<span>{$resourceSummary.detail}</span>
	</div>
{:else if $cpuFallback}
	<div class="resource-summary" data-tone="warning" role="status">
		<strong>{t('popup.cpuFallback.title')}</strong>
		<span>{t('popup.cpuFallback.body')}</span>
	</div>
{/if}

<style>
	.pill-row { display: flex; flex-wrap: wrap; gap: 6px; }
	.ai-notice { margin: 8px 2px 0; color: var(--color-muted); font-size: 11px; line-height: 1.45; }
	.generic-match { margin: 6px 2px 0; color: var(--color-muted); font-size: 11px; line-height: 1.45; }
	.pill { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 5px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-card); color: var(--color-ink); font-size: 11px; box-shadow: var(--shadow-sm); }
	.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
	.dot.off, .dot.muted { background: var(--color-toggle-off); }
	.dot.danger { background: var(--color-danger); }
	.dot.ok { background: var(--color-success); }
	.key { color: var(--color-muted); }
	.value { overflow: hidden; font-family: var(--font-mono); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
	.resource-summary { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; padding: 10px 12px; border: 1px solid var(--tone-warning-border); border-radius: var(--radius-md); background: var(--tone-warning-bg); color: var(--tone-warning-fg); font-size: 12px; line-height: 1.4; }
	.resource-summary strong { color: var(--tone-warning-strong); font-size: 12px; }
	.resource-summary[data-tone='critical'] { border-color: var(--tone-critical-border); background: var(--tone-critical-bg); color: var(--tone-critical-fg); }
	.resource-summary[data-tone='critical'] strong { color: var(--tone-critical-strong); }
	.resource-summary[data-tone='info'] { border-color: var(--tone-info-border); background: var(--tone-info-bg); color: var(--tone-info-fg); }
	.resource-summary[data-tone='info'] strong { color: var(--tone-info-strong); }
	.resource-summary[data-tone='ok'] { border-color: var(--tone-ok-border); background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
	.resource-summary[data-tone='ok'] strong { color: var(--tone-ok-strong); }
	.resource-summary[data-tone='muted'] { border-color: var(--tone-muted-border); background: var(--tone-muted-bg); color: var(--tone-muted-fg); }
	.resource-summary[data-tone='muted'] strong { color: var(--tone-muted-strong); }
</style>
