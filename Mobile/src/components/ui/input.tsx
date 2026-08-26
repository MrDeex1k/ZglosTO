import { forwardRef, type ComponentProps } from 'react';
import { TextInput } from 'react-native';

import { cn } from '@/lib/cn';
import { mobileTokens } from '@/theme/tokens';

export interface InputProps extends ComponentProps<typeof TextInput> {
  className?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    accessibilityState,
    className,
    editable = true,
    placeholderTextColor = mobileTokens.colors.muted,
    ...props
  },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      accessibilityState={{ ...accessibilityState, disabled: editable === false }}
      className={cn(
        'min-h-12 rounded-xl border border-border bg-white px-4 py-3 text-base leading-6 text-ink',
        className,
      )}
      editable={editable}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  );
});
