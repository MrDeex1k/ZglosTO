import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserSummaryCard } from './UserSummaryCard';

describe('UserSummaryCard', () => {
  it('renders the signed-in resident without a service row', () => {
    const markup = renderToStaticMarkup(
      <UserSummaryCard displayName="Jan Kowalski" serviceLabel={null} />,
    );

    expect(markup).toContain('Zalogowano jako:');
    expect(markup).toContain('Jan Kowalski');
    expect(markup).not.toContain('Służba:');
  });

  it('renders the service assigned to a service employee', () => {
    const markup = renderToStaticMarkup(
      <UserSummaryCard
        displayName="Jakub Batycki Jr"
        serviceLabel="Miejskie Przedsiębiorstwo Energetyki Cieplnej"
      />,
    );

    expect(markup).toContain('Jakub Batycki Jr');
    expect(markup).toContain('Służba:');
    expect(markup).toContain('Miejskie Przedsiębiorstwo Energetyki Cieplnej');
  });
});
