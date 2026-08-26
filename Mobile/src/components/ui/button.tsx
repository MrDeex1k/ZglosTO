import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Pressable, type View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

type PressableProps = ComponentProps<typeof Pressable>;

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'subtle';
}

const containerClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ink active:opacity-80',
  secondary: 'border border-border bg-white active:bg-gray-100',
  subtle: 'bg-transparent active:bg-gray-100',
};

const labelClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  subtle: 'text-muted',
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    accessibilityRole = 'button',
    accessibilityState,
    children,
    className,
    disabled,
    variant = 'primary',
    ...props
  },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: disabled === true }}
      className={cn(
        'min-h-14 items-center justify-center rounded-xl px-5 py-3',
        containerClasses[variant],
        disabled && 'opacity-50',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      <Text className={cn('text-center font-semibold', labelClasses[variant])}>{children}</Text>
    </Pressable>
  );
});
