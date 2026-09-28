import { debugError, debugLog, debugTrace, debugWarn, setDebugEnabled } from '../../src/shared/debug-log';

describe('debug-log', () => {
  const methods = ['log', 'debug', 'warn', 'error'] as const;
  const emit = () => {
    debugLog('l');
    debugTrace('d');
    debugWarn('w');
    debugError('e');
  };

  afterEach(() => {
    jest.restoreAllMocks();
    setDebugEnabled(false);
  });

  test('writes nothing to the console while Debug mode is off', () => {
    const spies = methods.map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    setDebugEnabled(false);
    emit();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  test('writes to the console while Debug mode is on', () => {
    const spies = methods.map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    setDebugEnabled(true);
    emit();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
