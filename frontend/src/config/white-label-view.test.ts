import { createPublicWhiteLabelConfig } from '@zglosto/contracts';
import { loadWhiteLabelConfigFile } from '@zglosto/white-label-config';
import { describe, expect, it } from 'vitest';

import { createWhiteLabelView, localizeCityIdentity } from './white-label-view';

const configDirectory = decodeURIComponent(
  new URL('../../../config/white-label/', import.meta.url).pathname,
);

function loadView(fileName: string) {
  const loaded = loadWhiteLabelConfigFile(`${configDirectory}${fileName}`);
  return createWhiteLabelView(createPublicWhiteLabelConfig(loaded.config));
}

describe('frontend White-Label view', () => {
  it('integrates the active city, logo and sorted services', () => {
    const view = loadView('zglosto.yaml');

    expect(localizeCityIdentity(view, 'pl-PL')).toEqual({
      key: 'zglosto',
      displayName: 'Warszawa',
      logoPath: '/assets/city-logo.svg',
      emblemAlt: 'Herb miasta Warszawy',
    });
    expect(view.services.map(({ key }) => key)).toEqual([
      'district_heating',
      'public_transit',
      'municipal_services',
      'sewer_emergency',
      'roads',
      'other',
    ]);
  });

  it('loads another city profile without exposing removed map settings', () => {
    const view = loadView('test-wroclaw.yaml');

    expect(localizeCityIdentity(view, 'en').displayName).toBe('Test Wroclaw');
    expect(view.services.map(({ key }) => key)).toEqual(['street_lighting', 'civic_support']);
    expect(view).not.toHaveProperty('map');
  });
});
