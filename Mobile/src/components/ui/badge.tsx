import { type PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Text } from './text';

export function Badge({ children }: PropsWithChildren) {
  return (
    <View className="self-start rounded-full bg-red-100 px-3 py-1.5">
      <Text className="text-xs font-bold text-danger">{children}</Text>
    </View>
  );
}
