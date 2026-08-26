import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { createEmailLink, createPhoneLink } from '@/features/support/contact-links';
import { useLocale } from '@/i18n/i18n-provider';

export function ContactScreen() {
  const runtime = useRuntimeConfig();
  if (runtime.status !== 'ready') return null;
  return <ReadyContactScreen runtime={runtime} />;
}

function ReadyContactScreen({
  runtime,
}: {
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const [linkError, setLinkError] = useState(false);
  const { contact } = runtime.config;
  const phone = contact.phone;
  const website = contact.website;

  const openLink = (url: string) => {
    setLinkError(false);
    void Linking.openURL(url).catch(() => {
      setLinkError(true);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl gap-6 px-6 py-8">
        <View className="gap-2">
          <Text accessibilityRole="header" variant="title">
            {t(($) => $.mobile.contact.title)}
          </Text>
          <Text className="text-lg text-muted">{t(($) => $.mobile.contact.description)}</Text>
        </View>

        <Card className="gap-4">
          <View className="gap-1">
            <Text variant="caption">{t(($) => $.mobile.contact.address)}</Text>
            <Text>{contact.address[locale]}</Text>
          </View>
          {contact.officeHours === null ? null : (
            <View className="gap-1">
              <Text variant="caption">{t(($) => $.mobile.contact.officeHours)}</Text>
              <Text>{contact.officeHours[locale]}</Text>
            </View>
          )}
          <Button onPress={() => openLink(createEmailLink(contact.email))} variant="secondary">
            {`${t(($) => $.mobile.contact.email)}: ${contact.email}`}
          </Button>
          {phone === null ? null : (
            <Button onPress={() => openLink(createPhoneLink(phone))} variant="secondary">
              {`${t(($) => $.mobile.contact.phone)}: ${phone}`}
            </Button>
          )}
          {website === null ? null : (
            <Button onPress={() => openLink(website)} variant="secondary">
              {t(($) => $.mobile.contact.website)}
            </Button>
          )}
        </Card>

        {linkError ? (
          <Text accessibilityLiveRegion="polite" className="text-danger">
            {t(($) => $.mobile.contact.linkError)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
