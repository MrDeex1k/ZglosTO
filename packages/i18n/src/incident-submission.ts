import type { LlmClassification, SupportedLocale } from '@zglosto/contracts';
import { enTranslation, plPLTranslation } from './resources.js';

export function incidentSubmissionNotice(
  classification: LlmClassification,
  serviceLabel: string,
  locale: SupportedLocale,
): { type: 'success' | 'emergency'; title: string; message: string } {
  const copy = (locale === 'pl-PL' ? plPLTranslation : enTranslation).incidents.submission;
  const emergency = classification === 'emergency';
  return {
    type: emergency ? 'emergency' : 'success',
    title: emergency ? copy.emergencyTitle : copy.acceptedTitle,
    message: (emergency ? copy.emergencyMessage : copy.acceptedMessage).replace(
      '{{service}}',
      () => serviceLabel,
    ),
  };
}
