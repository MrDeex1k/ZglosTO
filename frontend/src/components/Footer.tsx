import { useTranslation } from 'react-i18next';

import { getLocalizedText, whiteLabelConfig } from '../config/white-label';
import { getCurrentLocale } from '../i18n';

export function Footer() {
  useTranslation();
  const locale = getCurrentLocale();
  const { contact, localContent } = whiteLabelConfig;

  return (
    <footer className="mt-auto border-t bg-white">
      <div className="container mx-auto px-4 pt-5 pb-3 text-center text-sm text-gray-600 sm:py-6">
        <p>{getLocalizedText(localContent.footerText, locale)}</p>
        <address className="mt-3 not-italic">
          <span>{getLocalizedText(contact.address, locale)}</span>
          <span aria-hidden="true"> · </span>
          <a className="hover:underline" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
          {contact.phone === null ? null : (
            <>
              <span aria-hidden="true"> · </span>
              <a className="hover:underline" href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>
                {contact.phone}
              </a>
            </>
          )}
        </address>
        {contact.officeHours === null ? null : (
          <p className="mt-2">{getLocalizedText(contact.officeHours, locale)}</p>
        )}
        <p className="mt-3 text-xs">{getLocalizedText(localContent.legalNotice, locale)}</p>
      </div>
    </footer>
  );
}
