/**
 * Privacy Guardrail — IDE setting defaults
 *
 * What is selected in an IDE is mostly code, so the IDE panel renames the
 * identifiers the code declares by default (`codeAnonymization: 'full'`, the
 * browser's "Rename code identifiers"). Applied to the host's snapshot before
 * the shim loads it, and only where the user has not chosen a mode yet; the
 * Settings tab changes it.
 */

import type { StorageSnapshot } from './protocol';

const SETTINGS_KEY = 'pg_settings';

export function withIdeDefaults(local: StorageSnapshot | undefined): StorageSnapshot {
  const snapshot = { ...(local ?? {}) };
  const stored = snapshot[SETTINGS_KEY];
  const settings = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  if (settings.codeAnonymization === undefined) {
    snapshot[SETTINGS_KEY] = { ...settings, codeAnonymization: 'full' };
  }
  return snapshot;
}
