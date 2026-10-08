<script lang="ts">
	import { date, t, time } from '../../shared/i18n/reactive';
	import { restoreFromHistory, type HistoryEntry } from '../../shared/anonymization-history';
	import { confidentLanguage, syntaxRuns, type SyntaxRun } from '../../shared/code-highlight';
	import type { IdentityVaultData } from '../../shared/identity-vault';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import { copyText } from '../clipboard';
	import { segmentsOf } from '../segments';
	import CodeTextarea from './CodeTextarea.svelte';
	import MarkedText from './MarkedText.svelte';

	let {
		entries,
		selectedId,
		vault,
		vaultEnabled,
		restoreInput,
		highlightCode = false,
		autoPicked,
		onrestoreinput,
		onauto,
		onselect,
		ondelete,
		onclear,
	}: {
		entries: HistoryEntry[];
		selectedId: string | null;
		vault: IdentityVaultData;
		vaultEnabled: boolean;
		restoreInput: string;
		/** Colour code whose language is recognised with high confidence (`Settings.highlightCodeSyntax`). */
		highlightCode?: boolean;
		/** False when the user clicked the selected entry themselves. */
		autoPicked: boolean;
		onrestoreinput: (value: string) => void;
		onauto: () => void;
		onselect: (id: string) => void;
		ondelete: (id: string) => void;
		onclear: () => void;
	} = $props();

	let expandedId = $state<string | null>(null);
	let confirmingClear = $state(false);
	let copyNote = $state('');
	let copyNoteTimer: ReturnType<typeof setTimeout> | null = null;

	const selected = $derived(entries.find((entry) => entry.id === selectedId) ?? null);
	const restored = $derived(
		selected && restoreInput ? restoreFromHistory(restoreInput, selected, vault, vaultEnabled) : null,
	);
	const restoredSegments = $derived(restored ? segmentsOf(restoreInput, restored, 'original') : []);
	const restoredText = $derived(restoredSegments.map((segment) => segment.text).join(''));

	type Coloured = { text: string; runs: SyntaxRun[] };
	let replySyntax = $state.raw<Coloured | null>(null);
	let restoredSyntax = $state.raw<Coloured | null>(null);
	// Coloured shortly after typing stops; the language the original paste
	// was recognised as also colours the reply's unsure fragments.
	$effect(() => {
		if (!highlightCode) {
			replySyntax = restoredSyntax = null;
			return;
		}
		const reply = restoreInput;
		const output = restoredText;
		const original = selected?.originalText ?? '';
		const timer = setTimeout(() => {
			const language = confidentLanguage([original, reply]);
			replySyntax = { text: reply, runs: syntaxRuns(reply, language) };
			restoredSyntax = { text: output, runs: syntaxRuns(output, language) };
		}, 150);
		return () => clearTimeout(timer);
	});

	function flash(note: string): void {
		copyNote = note;
		if (copyNoteTimer) clearTimeout(copyNoteTimer);
		copyNoteTimer = setTimeout(() => (copyNote = ''), 1800);
	}

	async function copy(text: string, note: string): Promise<void> {
		try {
			await copyText(text);
			flash(note);
		} catch {
			flash(t('history.copyFailed'));
		}
	}

	function when(timestamp: number): string {
		const clock = time(timestamp, { hour: '2-digit', minute: '2-digit' });
		return new Date(timestamp).toDateString() === new Date().toDateString()
			? clock
			: `${date(timestamp, { month: 'short', day: 'numeric' })}, ${clock}`;
	}

	function snippet(text: string): string {
		const flat = text.replace(/\s+/g, ' ').trim();
		return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
	}

	function summary(entry: HistoryEntry): string {
		const parts = [t('history.replaced', { count: entry.replacedCount })];
		if (entry.renamedIdentifiers > 0) parts.push(t('history.renamed', { count: entry.renamedIdentifiers }));
		return parts.join(' · ');
	}

	function clearAll(): void {
		if (!confirmingClear) {
			confirmingClear = true;
			setTimeout(() => (confirmingClear = false), 3000);
			return;
		}
		confirmingClear = false;
		onclear();
	}
</script>

<div class="stack">
	<article class="card">
		<CardHeading title={t('history.title')} badge={entries.length} />
		{#if entries.length === 0}
			<p class="empty">
				{t('history.empty')}
			</p>
		{:else}
			<ul class="entries" aria-label={t('history.aria')}>
				{#each entries as entry (entry.id)}
					<li class={['entry', entry.id === selectedId && 'selected']}>
						<button
							type="button"
							class="entry-main"
							aria-pressed={entry.id === selectedId}
							onclick={() => onselect(entry.id)}
						>
							<span class="entry-head">
								<span class="site">{entry.site ?? t('history.sidePanel')}</span>
								<span class="time">{when(entry.createdAt)}</span>
							</span>
							<span class="entry-text">{snippet(entry.anonymizedText)}</span>
							<span class="entry-meta">{summary(entry)}</span>
						</button>
						<div class="entry-actions">
							<button
								type="button"
								class="icon"
								aria-expanded={expandedId === entry.id}
								title={t('history.details')}
								aria-label={t('history.details')}
								onclick={() => (expandedId = expandedId === entry.id ? null : entry.id)}
							>{expandedId === entry.id ? '▾' : '▸'}</button>
							<button
								type="button"
								class="icon danger"
								title={t('history.delete')}
								aria-label={t('history.delete')}
								onclick={() => ondelete(entry.id)}
							>×</button>
						</div>
						{#if expandedId === entry.id}
							<div class="details">
								<table>
									<tbody>
										{#each Object.entries(entry.mappings) as [token, original] (token)}
											<tr><td class="token">{token}</td><td class="arrow">→</td><td class="original">{original}</td></tr>
										{/each}
									</tbody>
								</table>
								{#if entry.truncated}
									<p class="hint">{t('history.truncated')}</p>
								{/if}
								<div class="detail-buttons">
									<button type="button" class="secondary" onclick={() => copy(entry.anonymizedText, t('history.copiedAnonymized'))}>{t('history.copyAnonymized')}</button>
									<button type="button" class="secondary" onclick={() => copy(entry.originalText, t('history.copiedOriginal'))}>{t('history.copyOriginal')}</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<div class="list-foot">
				<button type="button" class="link danger" onclick={clearAll}>
					{confirmingClear ? t('history.clearConfirm') : t('history.clear')}
				</button>
			</div>
		{/if}
	</article>

	<article class="card">
		<CardHeading title={t('history.restore.title')} />
		<div class="body">
			<CodeTextarea
				value={restoreInput}
				highlighted={highlightCode ? (replySyntax ?? { text: '', runs: [] }) : null}
				oninput={(event) => onrestoreinput(event.currentTarget.value)}
				aria-label={t('history.restore.aria')}
				placeholder={entries.length > 0
					? t('history.restore.placeholder')
					: t('history.restore.placeholderEmpty')}
			/>
			{#if selected}
				<p class="source-line">
					{t('history.using')} <strong>{selected.site ?? t('history.sidePanel')} · {when(selected.createdAt)}</strong>
					{#if autoPicked}
						<span class="muted">— {t('history.pickedAuto')}</span>
					{:else}
						<span class="muted">— {t('history.pickedByYou')}</span>
						<button type="button" class="link" onclick={onauto}>{t('history.pickAuto')}</button>
					{/if}
				</p>
			{/if}
			{#if restoreInput && selected && restored}
				<div class="result-head">
					<span class="count">{t('history.restoredCount', { count: restored.matches.length })}</span>
					<button type="button" class="primary" onclick={() => copy(restored.deAnonText, t('history.copiedRestored'))}>{t('history.copyRestored')}</button>
				</div>
				<MarkedText
					segments={restoredSegments}
					label={t('history.restoredAria')}
					syntax={restoredSyntax?.text === restoredText ? restoredSyntax.runs : []}
				/>
				{#if restored.matches.length === 0}
					<p class="hint">{t('history.noMatches')}</p>
				{/if}
			{/if}
		</div>
	</article>

	{#if copyNote}
		<div class="toast" role="status">{copyNote}</div>
	{/if}
</div>

<style>
	.stack { display: flex; flex-direction: column; gap: 8px; }
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
	.empty { margin: 0; padding: 14px 12px; color: var(--color-muted); font-size: 12px; line-height: 1.5; }

	.entries { max-height: 42vh; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
	.entry { position: relative; border-bottom: 1px solid var(--color-border); border-left: 3px solid transparent; }
	.entry:last-child { border-bottom: 0; }
	.entry.selected { border-left-color: var(--color-accent); background: var(--color-accent-soft); }
	.entry-main {
		display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 9px 60px 9px 10px;
		border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer;
	}
	.entry-main:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
	.entry-head { display: flex; gap: 8px; align-items: baseline; }
	.site { color: var(--color-ink); font-size: 12px; font-weight: 600; }
	.time { color: var(--color-subtle); font-size: 11px; }
	.entry-text {
		overflow: hidden; color: var(--color-muted); font: 11px/1.45 var(--font-mono);
		display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
		overflow-wrap: anywhere;
	}
	.entry-meta { color: var(--color-subtle); font-size: 10px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; }
	.entry-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; }
	.icon {
		width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent;
		color: var(--color-muted); font-size: 14px; line-height: 24px; cursor: pointer;
	}
	.icon:hover, .icon:focus-visible { background: var(--color-hover); color: var(--color-ink); outline: none; }
	.icon.danger:hover, .icon.danger:focus-visible { color: var(--color-danger); }

	.details { padding: 0 10px 10px 10px; }
	table { width: 100%; border-collapse: collapse; font: 11px/1.4 var(--font-mono); }
	td { padding: 3px 0; vertical-align: top; overflow-wrap: anywhere; }
	.token { color: var(--color-accent); width: 45%; }
	.arrow { width: 18px; color: var(--color-subtle); text-align: center; }
	.original { color: var(--color-ink); }
	.detail-buttons { display: flex; gap: 6px; margin-top: 8px; }

	.list-foot { padding: 6px 12px; border-top: 1px solid var(--color-border); text-align: right; }
	.link { padding: 2px 0; border: 0; background: transparent; color: var(--color-muted); font-size: 11px; cursor: pointer; }
	.link.danger:hover, .link.danger:focus-visible { color: var(--color-danger); outline: none; }

	.result-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.count { color: var(--color-muted); font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
	.hint { margin: 0; color: var(--color-muted); font-size: 11px; line-height: 1.45; }
	.source-line { margin: 0; color: var(--color-ink); font-size: 11px; line-height: 1.45; }
	.source-line strong { font-weight: 600; }
	.source-line .muted { color: var(--color-muted); }
	.source-line .link { margin-left: 4px; color: var(--color-accent); text-decoration: underline; }

	.primary, .secondary {
		padding: 7px 10px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; cursor: pointer;
	}
	.primary { border: 0; background: var(--color-accent); color: var(--color-on-accent); }
	.secondary { flex: 1; border: 1px solid var(--color-border-strong); background: var(--color-card); color: var(--color-ink); }
	.secondary:hover { background: var(--color-input); }

	.toast {
		position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
		padding: 7px 12px; border-radius: var(--radius-pill); background: var(--color-toast-bg);
		color: var(--color-toast-fg); font-size: 12px; box-shadow: 0 4px 14px rgb(0 0 0 / 18%);
	}
</style>
