import type {
  CurrentIncidentListItemDto,
  IncidentStatusCode,
  PublicWhiteLabelConfig,
} from '@zglosto/contracts';
import { type Href, Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useLocale } from '@/i18n/i18n-provider';

interface ResidentIncidentCardProps {
  config: PublicWhiteLabelConfig;
  incident: CurrentIncidentListItemDto;
}

function serviceLabel(
  config: PublicWhiteLabelConfig,
  serviceKey: string,
  locale: 'en' | 'pl-PL',
): string {
  return (
    config.services.find((service) => service.key === serviceKey)?.shortLabel[locale] ?? serviceKey
  );
}

function statusClasses(status: IncidentStatusCode): string {
  switch (status) {
    case 'reported':
      return 'bg-red-100 text-danger';
    case 'in_progress':
      return 'bg-amber-100 text-amber-800';
    case 'resolved':
      return 'bg-green-100 text-success';
  }
}

export function ResidentIncidentCard({ config, incident }: ResidentIncidentCardProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const service = serviceLabel(config, incident.typ_sluzby, locale);
  const statusLabel =
    incident.status_incydentu === 'reported'
      ? t(($) => $.incidents.status.reported)
      : incident.status_incydentu === 'in_progress'
        ? t(($) => $.incidents.status.inProgress)
        : t(($) => $.incidents.status.resolved);

  return (
    <Link
      asChild
      href={`/resident/incidents/${encodeURIComponent(incident.id_zgloszenia)}` as Href}
    >
      <Pressable
        accessibilityHint={t(($) => $.mobile.resident.openDetailsHint)}
        accessibilityLabel={`${incident.opis_zgloszenia}. ${statusLabel}. ${incident.adres_zgloszenia}. ${service}`}
        accessibilityRole="button"
        className="active:opacity-75"
      >
        <Card className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View
              className={`rounded-full px-3 py-1.5 ${statusClasses(incident.status_incydentu)}`}
            >
              <Text className={`text-xs font-bold ${statusClasses(incident.status_incydentu)}`}>
                {statusLabel}
              </Text>
            </View>
            <Text className="shrink text-right" variant="caption">
              {service}
            </Text>
          </View>

          <Text numberOfLines={3} variant="heading">
            {incident.opis_zgloszenia}
          </Text>
          <Text className="text-muted" numberOfLines={2}>
            {incident.adres_zgloszenia}
          </Text>

          <View className="gap-2 border-t border-border pt-3">
            <View className="flex-row justify-between gap-4">
              <Text variant="caption">{t(($) => $.mobile.resident.reportedAt)}</Text>
              <Text className="shrink text-right font-semibold">
                {incident.data_godzina_zgloszenia}
              </Text>
            </View>
            {incident.data_godzina_rozwiazania === null ? null : (
              <View className="flex-row justify-between gap-4">
                <Text variant="caption">{t(($) => $.mobile.resident.resolvedAt)}</Text>
                <Text className="shrink text-right font-semibold">
                  {incident.data_godzina_rozwiazania}
                </Text>
              </View>
            )}
            <Text className="text-muted" variant="caption">
              {incident.sprawdzenie_incydentu
                ? t(($) => $.mobile.resident.verified)
                : t(($) => $.mobile.resident.awaitingVerification)}
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
