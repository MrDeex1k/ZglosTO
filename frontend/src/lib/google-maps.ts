export function createGoogleMapsDirectionsUrl(address: string, city: string): string {
  const normalizedAddress = address.trim();
  const normalizedCity = city.trim();
  const destination = normalizedAddress
    .toLocaleLowerCase('pl-PL')
    .includes(normalizedCity.toLocaleLowerCase('pl-PL'))
    ? normalizedAddress
    : `${normalizedAddress}, ${normalizedCity}`;
  const parameters = new URLSearchParams({
    api: '1',
    destination,
  });

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
