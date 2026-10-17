import { View } from '@/components/ui/native';
import { type ComponentProps, type PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

interface CardProps extends PropsWithChildren<ComponentProps<typeof View>> {
  className?: string;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <View className={cn('rounded-card border border-border bg-white p-5', className)} {...props}>
      {children}
    </View>
  );
}
