import type { ReactNode } from 'react';

import { Text } from '@/components/ui/text';

export function FormFieldError({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityLiveRegion="polite" accessibilityRole="alert" className="text-danger">
      {children}
    </Text>
  );
}
