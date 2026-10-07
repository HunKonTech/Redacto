import {
  chunkText,
  deviceText,
  heapText,
  rawItemCount,
  rawOutputJson,
  sourceSummary,
  spansJson,
  timingText,
} from '../../src/ui/dev/format-dev-diagnostics';
import type { DevDiagnostics } from '../../src/shared/message-types';

const diagnostics: DevDiagnostics = {
  nerEnabled: true,
  regexEnabled: true,
  model: { key: 'bardsai', label: 'BardsAI EU multilingual', device: 'webgpu', dtype: 'q4f16', threads: 1 },
  timings: { totalMs: 250, loadMs: 1840, inferenceMs: 212, chunkCount: 2, wasCold: true },
  memory: { usedBytes: 86 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, limitBytes: 4096 * 1024 * 1024 },
  rawNerOutput: [
    { offset: 0, length: 10, aggregation: 'none', items: [{ word: '▁Anna', score: 0.99, entity: 'B-PER' }] },
    { offset: 10, length: 10, aggregation: 'none', items: [{ word: '@', score: 0.9, entity: 'B-EMAIL' }, { word: 'x', score: 0.8, entity: 'I-EMAIL' }] },
  ],
  spanCountsBySource: { regex: 2, ner: 3 },
};

describe('developer mode formatting', () => {
  test('summarizes spans by source in a fixed order', () => {
    expect(sourceSummary(diagnostics.spanCountsBySource)).toBe('3 ner · 2 regex');
    expect(sourceSummary({})).toBe('0');
  });

  test('formats runtime figures', () => {
    expect(rawItemCount(diagnostics)).toBe(3);
    expect(heapText(diagnostics.memory)).toBe('86 / 4096 MB');
    expect(heapText(undefined)).toBeNull();
    expect(deviceText(diagnostics.model)).toBe('webgpu · q4f16');
    expect(deviceText(undefined)).toBeNull();
    expect(timingText(diagnostics.timings)).toBe('1840 · 212 ms');
    expect(timingText({ totalMs: 90 })).toBe('– · 90 ms');
    expect(chunkText(diagnostics)).toBe('2 · 1');
  });

  test('raw output JSON carries the model and every chunk', () => {
    const parsed = JSON.parse(rawOutputJson(diagnostics));
    expect(parsed).toEqual({
      model: 'bardsai',
      device: 'webgpu',
      dtype: 'q4f16',
      chunks: diagnostics.rawNerOutput,
    });
    expect(JSON.parse(rawOutputJson({ ...diagnostics, nerInputView: 'identifier-split' })).inputView).toBe('identifier-split');
  });

  test('spans JSON rounds scores and keeps the raw label', () => {
    const parsed = JSON.parse(spansJson([
      { start: 0, end: 4, entity_type: 'PERSON', score: 0.98765, text: 'Anna', source: 'ner', nerRawLabel: 'B-PER' },
    ]));
    expect(parsed).toEqual([{ text: 'Anna', type: 'PERSON', source: 'ner', score: 0.988, rawLabel: 'B-PER', start: 0, end: 4 }]);
  });
});
