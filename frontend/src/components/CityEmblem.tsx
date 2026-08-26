import { getCityIdentity } from '../config/white-label';
import { getCurrentLocale } from '../i18n';

export function CityEmblem({ className }: { className: string }) {
  const city = getCityIdentity(getCurrentLocale());

  return <img src={city.logoPath} alt={city.emblemAlt} className={className} />;
}
