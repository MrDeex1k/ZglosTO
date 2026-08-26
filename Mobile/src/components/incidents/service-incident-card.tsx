import type { CurrentIncidentListItemDto, IncidentStatusCode } from '@zglosto/contracts';
import { type Href, Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

function statusClasses(status: IncidentStatusCode): string {
  if (status === 'reported') return 'bg-red-100 text-danger';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800';
  return 'bg-green-100 text-success';
}

export function ServiceIncidentCard({ incident }: { incident: CurrentIncidentListItemDto }) {
  const { t } = useTranslation();
  const statusLabel =
    incident.status_incydentu === 'reported'
      ? t(($) => $.incidents.status.reported)
      : incident.status_incydentu === 'in_progress'
        ? t(($) => $.incidents.status.inProgress)
        : t(($) => $.incidents.status.resolved);

  return (
    <Link asChild href={`/service/incidents/${encodeURIComponent(incident.id_zgloszenia)}` as Href}>
      <Pressable
        accessibilityHint={t(($) => $.mobile.service.openDetailsHint)}
        accessibilityLabel={`${incident.opis_zgloszenia}. ${statusLabel}. ${incident.adres_zgloszenia}`}
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
            <Text className="text-right" variant="caption">
              {incident.sprawdzenie_incydentu
                ? t(($) => $.mobile.service.verified)
                : t(($) => $.mobile.service.unverified)}
            </Text>
          </View>
          <Text numberOfLines={3} variant="heading">
            {incident.opis_zgloszenia}
          </Text>
          <Text className="text-muted" numberOfLines={2}>
            {incident.adres_zgloszenia}
          </Text>
          <View className="flex-row justify-between gap-4 border-t border-border pt-3">
            <Text variant="caption">{incident.data_godzina_zgloszenia}</Text>
            <Text className="font-semibold text-danger">{t(($) => $.mobile.service.details)}</Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
