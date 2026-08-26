import { type PropsWithChildren } from 'react';

import { Text } from './text';

export function Label({ children }: PropsWithChildren) {
  return <Text className="font-semibold">{children}</Text>;
}
