import { describe, expect, it } from 'vitest';

import { createGoogleMapsDirectionsUrl } from './google-maps';

describe('Google Maps directions URL', () => {
  it('encodes the incident address and configured city as the destination', () => {
    const url = new URL(createGoogleMapsDirectionsUrl('ul. Świętojańska 1/3', 'Warszawa'));

    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('ul. Świętojańska 1/3, Warszawa');
  });

  it('trims deployment-provided values', () => {
    const url = new URL(createGoogleMapsDirectionsUrl('  Rynek 1  ', '  Test City  '));

    expect(url.searchParams.get('destination')).toBe('Rynek 1, Test City');
  });

  it('does not append the city when the address already contains it', () => {
    const url = new URL(createGoogleMapsDirectionsUrl('Rynek 1, Warszawa', 'Warszawa'));

    expect(url.searchParams.get('destination')).toBe('Rynek 1, Warszawa');
  });
});
