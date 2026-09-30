import { onAnonymizeRequest, requestAnonymize } from '../../src/sidepanel/external-input';

describe('side panel external input', () => {
  it('keeps a request made before the panel listens, then delivers new ones in order', () => {
    requestAnonymize('early', { label: 'VS Code · editor' });
    const received: Array<{ text: string; seq: number }> = [];
    const off = onAnonymizeRequest((request) => received.push(request));
    requestAnonymize('same', { label: 'VS Code · terminal' });
    requestAnonymize('same', { label: 'VS Code · terminal' });
    off();
    requestAnonymize('after', { label: 'x' });

    expect(received.map((r) => r.text)).toEqual(['early', 'same', 'same']);
    expect(received[2].seq).toBeGreaterThan(received[1].seq);
  });
});
