import { buildDebugLog, debugLogFileName, DEBUG_LOG_WARNING } from '../../src/ui/dev/debug-log';
import type { DevDiagnostics, PiiSpan } from '../../src/shared/message-types';

const diagnostics: DevDiagnostics = {
  nerEnabled: true,
  regexEnabled: true,
  model: { key: 'bardsai', label: 'BardsAI EU multilingual', device: 'wasm' },
  timings: { totalMs: 250, loadMs: 1840, inferenceMs: 212, wasCold: true },
  rawNerOutput: [{ offset: 0, length: 4, aggregation: 'none', items: [{ word: 'Anna', score: 0.99, entity: 'B-PER' }] }],
  spanCountsBySource: { ner: 1, regex: 1 },
  stageTimings: { nerMs: 2100, pipelineMs: 3, totalMs: 2110 },
};

const spans = [
  { text: 'Anna', entity_type: 'PERSON', source: 'ner', score: 0.987654, start: 0, end: 4, nerRawLabel: 'PER' },
  { text: 'a@b.hu', entity_type: 'EMAIL', source: 'regex', score: 1, start: 5, end: 11 },
] as PiiSpan[];

describe('developer debug log', () => {
  test('holds the texts, spans, model run and stage timings', () => {
    const log = JSON.parse(
      buildDebugLog(
        { surface: 'sidepanel', originalText: 'Anna a@b.hu', anonymizedText: '[PERSON_1] [EMAIL_1]', spans, diagnostics },
        new Date('2026-10-07T10:20:30.456Z'),
      ),
    );
    expect(log.warning).toBe(DEBUG_LOG_WARNING);
    expect(log.createdAt).toBe('2026-10-07T10:20:30.456Z');
    expect(log.text).toEqual({ original: 'Anna a@b.hu', anonymized: '[PERSON_1] [EMAIL_1]', originalLength: 11 });
    expect(log.timingsMs).toMatchObject({ total: 2110, localAiModel: 2100, modelLoad: 1840, modelInference: 212, regexPipeline: 3 });
    expect(log.localAiModel.model.label).toBe('BardsAI EU multilingual');
    expect(log.localAiModel.rawOutput).toHaveLength(1);
    expect(log.spans[0]).toEqual({ text: 'Anna', type: 'PERSON', source: 'ner', score: 0.9877, start: 0, end: 4, rawLabel: 'PER' });
    expect(log.settings).toBeNull();
  });

  test('marks what the surface did not provide as null', () => {
    const log = JSON.parse(
      buildDebugLog({ surface: 'options', originalText: 'x', spans: [], diagnostics: { nerEnabled: false, regexEnabled: true, spanCountsBySource: {} } }),
    );
    expect(log.text.anonymized).toBeNull();
    expect(log.timingsMs.regexPipeline).toBeNull();
    expect(log.localAiModel.rawOutput).toBeNull();
  });

  test('names the file with a filesystem-safe timestamp', () => {
    expect(debugLogFileName(new Date('2026-10-07T10:20:30.456Z'))).toBe('redacto-debug-2026-10-07T10-20-30Z.json');
  });
});
