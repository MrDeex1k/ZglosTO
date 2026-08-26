import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { FormFieldError } from '@/components/feedback/form-field-error';

import { Text } from './text';

interface CheckboxFieldProps {
  checked: boolean;
  disabled?: boolean;
  error?: ReactNode;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  testID?: string;
}

export function CheckboxField({
  checked,
  disabled = false,
  error,
  label,
  onCheckedChange,
  testID,
}: CheckboxFieldProps) {
  return (
    <View className="gap-2">
      <Pressable
        accessibilityLabel={typeof label === 'string' ? label : undefined}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        className={cn('min-h-12 flex-row items-start gap-3 py-2', disabled && 'opacity-50')}
        disabled={disabled}
        onPress={() => onCheckedChange(!checked)}
        testID={testID}
      >
        <View
          className={cn(
            'mt-0.5 size-6 items-center justify-center rounded-md border border-border bg-white',
            checked && 'border-ink bg-ink',
          )}
        >
          {checked ? <Text className="font-bold text-white">✓</Text> : null}
        </View>
        <Text className="flex-1">{label}</Text>
      </Pressable>
      {error === undefined ? null : <FormFieldError>{error}</FormFieldError>}
    </View>
  );
}
