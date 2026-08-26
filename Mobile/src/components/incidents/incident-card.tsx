import type { CurrentResolvedIncidentDto, PublicWhiteLabelConfig } from '@zglosto/contracts';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useLocale } from '@/i18n/i18n-provider';

interface IncidentCardProps {
  config: PublicWhiteLabelConfig;
  incident: CurrentResolvedIncidentDto;
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

export function IncidentCard({ config, incident }: IncidentCardProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const label = serviceLabel(config, incident.typ_sluzby, locale);

  return (
    <Link asChild href={{ pathname: '/incidents/[id]', params: { id: incident.id_zgloszenia } }}>
      <Pressable
        accessibilityHint={t(($) => $.mobile.publicFeed.openDetailsHint)}
        accessibilityLabel={`${incident.opis_zgloszenia}. ${incident.adres_zgloszenia}. ${label}`}
        accessibilityRole="button"
        className="active:opacity-75"
      >
        <Card className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="rounded-full bg-green-100 px-3 py-1.5">
              <Text className="text-xs font-bold text-success">
                {t(($) => $.mobile.publicFeed.resolved)}
              </Text>
            </View>
            <Text className="shrink text-right" variant="caption">
              {label}
            </Text>
          </View>
          <Text numberOfLines={3} variant="heading">
            {incident.opis_zgloszenia}
          </Text>
          <Text className="text-muted" numberOfLines={2}>
            {incident.adres_zgloszenia}
          </Text>
          <View className="flex-row items-end justify-between gap-3 border-t border-border pt-3">
            <View className="shrink gap-0.5">
              <Text variant="caption">{t(($) => $.mobile.publicFeed.resolvedAt)}</Text>
              <Text className="font-semibold">{incident.data_godzina_rozwiazania}</Text>
            </View>
            <Text className="font-semibold text-danger">
              {t(($) => $.mobile.publicFeed.viewDetails)}
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
