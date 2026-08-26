import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

interface StatePanelProps {
  actionLabel?: string | undefined;
  description: string;
  icon?: ReactNode;
  onAction?: (() => void) | undefined;
  title: string;
}

export function StatePanel({ actionLabel, description, icon, onAction, title }: StatePanelProps) {
  return (
    <Card accessibilityLiveRegion="polite" className="gap-3">
      {icon}
      <Text accessibilityRole="header" variant="heading">
        {title}
      </Text>
      <Text className="text-muted">{description}</Text>
      {actionLabel && onAction ? (
        <View className="pt-1">
          <Button onPress={onAction}>{actionLabel}</Button>
        </View>
      ) : null}
    </Card>
  );
}
