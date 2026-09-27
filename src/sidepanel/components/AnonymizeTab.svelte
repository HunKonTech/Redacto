<script lang="ts">
	import { EntityMap } from '../../shared/entity-map';
	import type { IdentityVaultData } from '../../shared/identity-vault';
	import type { PiiSpan, Settings } from '../../shared/message-types';
	import { resolveText } from '../../shared/placeholder-resolver';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import { copyText } from '../clipboard';
	import {
		commitPanelAnonymization,
		detectForPanel,
		previewForPanel,
		type PanelDetection,
	} from '../panel-anonymizer';
	import type { ExternalAnonymizeRequest } from '../external-input';
	import { segmentsOf, toneFor } from '../segments';
	import MarkedText from './MarkedText.svelte';

	let {
		settings,
		vault,
		external = null,
		onsaved,
	}: {
		settings: Settings | null;
		vault: IdentityVaultData;
		/** A selection handed over by an IDE plugin: shown, anonymized and saved at once. */
		external?: ExternalAnonymizeRequest | null;
		/** Called with the history entry a copy wrote. */
		onsaved: (entryId: string) => void;
	} = $props();

	type Item = { key: string; type: PiiSpan['entity_type']; text: string; count: number };

	let input = $state('');
	let running = $state(false);
	let error = $state('');
	/** The text the current detection belongs to. */
	let detectedFor = $state<string | null>(null);
	let detection = $state.raw<PanelDetection | null>(null);
	let disabled = $state.raw<Set<string>>(new Set());
	/** The history entry written by the last copy of this detection. */
	let committedId = $state<string | null>(null);
	/** The last handed-over selection; its origin labels History while the text is unchanged. */
	let handedOver = $state.raw<ExternalAnonymizeRequest | null>(null);
	let handledSeq = 0;
	let note = $state('');
	let noteTimer: ReturnType<typeof setTimeout> | null = null;

	const keyOf = (span: PiiSpan): string => `${span.entity_type}|${span.text}`;

	const stale = $derived(detectedFor !== null && detectedFor !== input);
	const items = $derived.by((): Item[] => {
		if (!detection) return [];
		const byKey = new Map<string, Item>();
		for (const span of detection.spans) {
			const key = keyOf(span);
			const item = byKey.get(key);
			if (item) item.count += 1;
			else byKey.set(key, { key, type: span.entity_type, text: span.text, count: 1 });
		}
		return [...byKey.values()];
	});
	const approved = $derived(detection ? detection.spans.filter((span) => !disabled.has(keyOf(span))) : []);
	const preview = $derived(
		detection && settings && detectedFor !== null
			? previewForPanel(detectedFor, approved, settings, vault, detection.classifications)
			: null,
	);
	const previewSegments = $derived(
		preview ? segmentsOf(preview.text, resolveText(preview.text, new EntityMap(preview.mappings)), 'token') : [],
	);
	const changed = $derived(preview !== null && detectedFor !== null && preview.text !== detectedFor);

	function flash(message: string): void {
		note = message;
		if (noteTimer) clearTimeout(noteTimer);
		noteTimer = setTimeout(() => (note = ''), 2200);
	}

	async function run(): Promise<void> {
		const text = input;
		if (!text.trim() || running || !settings) return;
		running = true;
		error = '';
		try {
			const result = await detectForPanel(text, settings);
			detection = result;
			detectedFor = text;
			committedId = null;
			// Like the review on a chat page: items inside code blocks start off.
			disabled = new Set(result.spans.filter((span) => span.inCodeBlock).map(keyOf));
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			running = false;
		}
	}

	/** Anonymize a handed-over selection and save it to History right away. */
	async function runExternal(request: ExternalAnonymizeRequest): Promise<void> {
		input = request.text;
		handedOver = request;
		await run();
		if (detectedFor !== request.text || error) return;
		try {
			const saved = await commit();
			if (saved !== null) flash('Saved to History');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	$effect(() => {
		// Wait for settings: `run` needs them.
		if (!external || !settings || external.seq === handledSeq) return;
		handledSeq = external.seq;
		void runExternal(external);
	});

	function toggle(key: string, on: boolean): void {
		const next = new Set(disabled);
		if (on) next.delete(key);
		else next.add(key);
		disabled = next;
	}

	/** Save to the vault and history; returns the text that was saved. */
	async function commit(): Promise<string | null> {
		if (!detection || detectedFor === null) return null;
		const { result, entry } = await commitPanelAnonymization(
			detectedFor,
			approved,
			detection.classifications,
			committedId ?? undefined,
			handedOver && handedOver.text === detectedFor ? handedOver.origin : undefined,
		);
		if (entry) {
			committedId = entry.id;
			onsaved(entry.id);
		}
		return result.text;
	}

	async function copy(): Promise<void> {
		if (!preview) return;
		error = '';
		try {
			// Copy first, while the click still counts as the reason for it.
			await copyText(preview.text);
			const saved = await commit();
			// The vault may have changed since the preview; copy what was saved.
			if (saved !== null && saved !== preview.text) await copyText(saved);
			flash(changed ? 'Copied · saved to History' : 'Copied');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	function onManualCopy(): void {
		void commit().catch((err) => (error = err instanceof Error ? err.message : String(err)));
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void run();
		}
	}

	function onPaste(): void {
		// The textarea's value updates after the paste event.
		setTimeout(() => void run(), 0);
	}
</script>

<div class="stack">
	<article class="card">
		<CardHeading title="Anonymize text" hint="stays on this device" />
		<div class="body">
			<textarea
				bind:value={input}
				onkeydown={onKeydown}
				onpaste={onPaste}
				aria-label="Text to anonymize"
				placeholder="Paste text or code to anonymize…"
			></textarea>
			<button type="button" class="primary" disabled={running || !input.trim() || !settings} onclick={run}>
				{running ? 'Detecting…' : stale ? 'Text changed — anonymize again' : 'Anonymize'}
			</button>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
		</div>
	</article>

	{#if detection && !stale}
		{#if items.length > 0}
			<article class="card">
				<CardHeading title="Detected" badge={`${approved.length}/${detection.spans.length}`} />
				<ul class="items" aria-label="Detected items">
					{#each items as item (item.key)}
						<li>
							<label>
								<input
									type="checkbox"
									checked={!disabled.has(item.key)}
									onchange={(event) => toggle(item.key, event.currentTarget.checked)}
								/>
								<span class={`pill tone-${toneFor(item.type.toLowerCase())}`}>{item.type}</span>
								<span class="value">{item.text}</span>
								{#if item.count > 1}<span class="times">×{item.count}</span>{/if}
							</label>
						</li>
					{/each}
				</ul>
			</article>
		{/if}

		<article class="card">
			<CardHeading
				title="Anonymized"
				hint={preview && preview.renamedIdentifiers > 0 ? `${preview.renamedIdentifiers} identifiers renamed` : undefined}
			/>
			<div class="body">
				{#if preview && changed}
					<MarkedText segments={previewSegments} label="Anonymized text" oncopy={onManualCopy} />
					<button type="button" class="primary" onclick={copy}>Copy anonymized text</button>
					<p class="hint">Copying saves the replacements to History, so you can restore the AI's reply there.</p>
				{:else}
					<p class="hint">No personal data found — nothing to replace.</p>
				{/if}
			</div>
		</article>
	{/if}

	{#if note}
		<div class="toast" role="status">{note}</div>
	{/if}
</div>

<style>
	.stack { display: flex; flex-direction: column; gap: 8px; }
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: white; }
	.body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
	textarea {
		box-sizing: border-box; width: 100%; min-height: 150px; padding: 10px; resize: vertical;
		border: 1px solid var(--color-border-strong); border-radius: 6px; outline: none;
		background: #f8fafc; color: var(--color-ink); font: 11px/1.5 var(--font-mono);
	}
	textarea:focus { border-color: var(--color-accent); }
	.primary {
		width: 100%; padding: 9px; border: 0; border-radius: 6px; background: var(--color-accent);
		color: white; font-size: 12px; font-weight: 600; cursor: pointer;
	}
	.primary:disabled { cursor: not-allowed; opacity: 0.55; }
	.error { margin: 0; color: var(--color-danger); font-size: 11px; line-height: 1.45; }
	.hint { margin: 0; color: var(--color-muted); font-size: 11px; line-height: 1.45; }

	.items { max-height: 30vh; margin: 0; padding: 4px 0; overflow-y: auto; list-style: none; }
	.items label { display: flex; align-items: center; gap: 8px; padding: 5px 12px; cursor: pointer; }
	.items label:hover { background: #f8fafc; }
	.items input { margin: 0; accent-color: var(--color-accent); }
	.pill {
		flex-shrink: 0; padding: 1px 6px; border-radius: 4px; font: 600 9.5px/1.5 var(--font-mono);
		letter-spacing: 0.2px; background: var(--color-group-low-signal-bg); color: var(--color-group-low-signal-fg);
	}
	.pill.tone-identity { background: var(--color-group-identity-bg); color: var(--color-group-identity-fg); }
	.pill.tone-contact { background: var(--color-group-contact-bg); color: var(--color-group-contact-fg); }
	.pill.tone-financial { background: var(--color-group-financial-bg); color: var(--color-group-financial-fg); }
	.pill.tone-network { background: var(--color-group-network-bg); color: var(--color-group-network-fg); }
	.pill.tone-location { background: var(--color-group-location-bg); color: var(--color-group-location-fg); }
	.pill.tone-password { background: var(--color-group-password-bg); color: var(--color-group-password-fg); }
	.pill.tone-organization { background: var(--color-group-organization-bg); color: var(--color-group-organization-fg); }
	.value {
		flex: 1; min-width: 0; overflow: hidden; color: var(--color-ink); font: 12px var(--font-mono);
		text-overflow: ellipsis; white-space: nowrap;
	}
	.times { color: var(--color-subtle); font: 600 11px var(--font-mono); }

	.toast {
		position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
		padding: 7px 12px; border-radius: var(--radius-pill); background: var(--color-header);
		color: white; font-size: 12px; box-shadow: 0 4px 14px rgb(0 0 0 / 18%);
	}
</style>
