import { describe, expect, test } from 'vitest';
import { incidentSubmissionNotice } from './incident-submission.js';

describe.each(['pl-PL', 'en'] as const)('submission notice (%s)', (locale) => {
  test('unavailable analysis has the same acceptance notice as a municipal report', () => {
    const notice = incidentSubmissionNotice('unknown', 'Roads / Drogi', locale);
    expect(notice).toEqual(incidentSubmissionNotice('municipal', 'Roads / Drogi', locale));
    expect(notice.type).toBe('success');
    expect(notice.message).toContain('Roads / Drogi');
    expect(notice.message).not.toContain('112');
  });
  test('emergency advice retains acceptance, names the service and explains the next action', () => {
    const notice = incidentSubmissionNotice('emergency', 'Roads / Drogi', locale);
    expect(notice.type).toBe('emergency');
    expect(notice.message).toContain('112');
    expect(notice.message).toContain('Roads / Drogi');
    expect(notice.message).toContain(
      locale === 'pl-PL' ? 'nie oznacza wezwania' : 'does not dispatch',
    );
  });
});
