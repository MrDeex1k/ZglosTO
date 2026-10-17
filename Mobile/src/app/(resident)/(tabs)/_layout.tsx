import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useMobileTheme } from '@/theme/theme-provider';
import { mobileTokens } from '@/theme/tokens';

export default function ResidentTabsLayout() {
  const { t } = useTranslation();
  const theme = useMobileTheme();
  return (
    <NativeTabs tintColor={theme.primary} backgroundColor={mobileTokens.colors.background}>
      <NativeTabs.Trigger name="resident" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="tray.full.fill" md="list_alt" />
        <NativeTabs.Trigger.Label>
          {t(($) => $.mobile.resident.routeTitle)}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
        <NativeTabs.Trigger.Label>{t(($) => $.mobile.account.routeTitle)}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
