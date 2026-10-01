<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	let { restoreDefaults, clearMappings }: { restoreDefaults: () => void; clearMappings: () => void } = $props();
</script>

<div class="maint-row">
	<button type="button" onclick={restoreDefaults}>{t('popup.maintenance.restoreDefaults')}</button>
	<button type="button" onclick={clearMappings}>{t('popup.maintenance.clearMappings')}</button>
</div>

<style>
	.maint-row { display: flex; gap: 8px; }
	button { flex: 1; padding: 9px; border: 1px solid var(--color-border-strong); border-radius: 8px; background: var(--color-card); color: var(--color-muted); font-size: 11px; font-weight: 500; cursor: pointer; }
</style>
