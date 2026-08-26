import { forwardRef, type ComponentProps } from 'react';
import { Text as NativeText } from 'react-native';

import { cn } from '@/lib/cn';

type NativeTextProps = ComponentProps<typeof NativeText>;

export interface TextProps extends NativeTextProps {
  className?: string;
  variant?: 'body' | 'caption' | 'heading' | 'title';
}

const variantClasses: Record<NonNullable<TextProps['variant']>, string> = {
  body: 'text-base leading-6 text-ink',
  caption: 'text-sm leading-5 text-muted',
  heading: 'text-xl font-bold leading-7 text-ink',
  title: 'text-4xl font-extrabold tracking-tight text-ink',
};

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { className, selectable = true, variant = 'body', ...props },
  ref,
) {
  return (
    <NativeText
      ref={ref}
      className={cn(variantClasses[variant], className)}
      selectable={selectable}
      {...props}
    />
  );
});
