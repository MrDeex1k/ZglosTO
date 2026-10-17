import { Host, Picker } from '@expo/ui';

import { useMobileTheme } from '@/theme/theme-provider';

interface NativeChoiceProps<T extends string> {
  disabled?: boolean;
  label: string;
  onSelect: (value: T) => void;
  options: readonly { label: string; value: T }[];
  selected: T;
}

/** System menus grow with Dynamic Type instead of compressing labels into segments. */
export function NativeChoice<T extends string>({
  disabled = false,
  label,
  onSelect,
  options,
  selected,
}: NativeChoiceProps<T>) {
  const theme = useMobileTheme();
  return (
    <Host
      accessibilityLabel={label}
      colorScheme="light"
      matchContents={{ vertical: true }}
      seedColor={theme.primary}
      style={{ minHeight: 48, width: '100%' }}
    >
      <Picker<T>
        appearance="menu"
        enabled={!disabled}
        onValueChange={onSelect}
        selectedValue={selected}
        testID="native-choice"
      >
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}
