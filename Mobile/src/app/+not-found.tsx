import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function NotFoundRoute() {
  const { t } = useTranslation();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="flex-grow justify-center p-6"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Card className="gap-4">
        <Text accessibilityRole="header" variant="heading">
          {t(($) => $.mobile.routes.notFoundTitle)}
        </Text>
        <Link asChild href="/">
          <Button>{t(($) => $.mobile.routes.backHome)}</Button>
        </Link>
      </Card>
    </ScrollView>
  );
}
