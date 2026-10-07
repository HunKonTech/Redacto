import { detectionOptionsFromSettings, fallbackNerStatus } from '../../src/shared/detection-config';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { minResolvedThreshold } from '../../src/shared/sensitivity-resolver';

describe('detection config from settings', () => {
  test('developer mode switches apply only while developer mode is on', () => {
    const switchedOff = { ...DEFAULT_SETTINGS, devUseNer: false, devUseRegex: false };
    const normal = detectionOptionsFromSettings(switchedOff);
    expect(normal.dev_capture).toBeUndefined();
    expect(normal.regex_enabled).toBeUndefined();
    expect(normal.ner_provider).toBe('transformers');

    const dev = detectionOptionsFromSettings({ ...switchedOff, developerMode: true });
    expect(dev).toEqual(expect.objectContaining({
      dev_capture: true,
      regex_enabled: false,
      ner_provider: 'off',
      ner_enabled: false,
    }));
  });

  test('developer mode wins over a request config that asks for the model', () => {
    const settings = { ...DEFAULT_SETTINGS, developerMode: true, devUseNer: false };
    const config = detectionOptionsFromSettings(settings, { ner_provider: 'transformers', ner_enabled: true });
    expect(config.ner_provider).toBe('off');
    expect(config.ner_enabled).toBe(false);
    expect(config.regex_enabled).toBe(true);
  });

  test('maps persisted NER provider and detector thresholds into request config', () => {
    const overrides = {
      ...DEFAULT_SETTINGS,
      minConfidence: 0.72,
      contextBoost: 0.2,
      contextWindow: 9,
      nerProvider: 'fixture' as const,
      nerModel: 'hikmaai' as const,
      nerWebGpuDtype: 'q4f16' as const,
    };
    const config = detectionOptionsFromSettings(overrides);

    expect(config).toEqual(
      expect.objectContaining({
        // min_confidence is the lowest resolved threshold across all entity types so WASM
        // never pre-filters a span that the per-entity resolver wants to keep.
        min_confidence: minResolvedThreshold(overrides),
        context_boost: 0.2,
        context_window: 9,
        ner_provider: 'fixture',
        ner_model: 'hikmaai',
        ner_webgpu_dtype: 'q4f16',
        ner_enabled: true,
      })
    );
  });

  test('passes the source-code mode through to the WASM pipeline', () => {
    expect(detectionOptionsFromSettings(DEFAULT_SETTINGS).code_mode).toBe('secrets');
    expect(
      detectionOptionsFromSettings({ ...DEFAULT_SETTINGS, codeAnonymization: 'off' }).code_mode
    ).toBe('off');
  });

  test('defaults the WebGPU dtype to the persisted low-memory preference', () => {
    const config = detectionOptionsFromSettings(DEFAULT_SETTINGS);

    expect(config.ner_webgpu_dtype).toBe('q4f16');
  });

  test('lets explicit request config override the persisted provider mode', () => {
    const config = detectionOptionsFromSettings(
      { ...DEFAULT_SETTINGS, nerProvider: 'fixture' },
      { ner_provider: 'off', ner_enabled: true }
    );

    expect(config).toEqual(
      expect.objectContaining({
        ner_provider: 'off',
        ner_enabled: false,
      })
    );
  });

  test('builds a failed fallback status for active providers', () => {
    expect(fallbackNerStatus('fixture', 'status check failed')).toEqual({
      mode: 'fixture',
      state: 'failed',
      message: 'status check failed',
    });
  });
});
