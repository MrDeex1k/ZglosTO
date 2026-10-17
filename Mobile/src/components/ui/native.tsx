import { styled, useCssElement } from 'nativewind';
import type { ComponentProps, ComponentRef, ComponentType } from 'react';
import {
  ActivityIndicator as NativeActivityIndicator,
  FlatList as NativeFlatList,
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Pressable as NativePressable,
  ScrollView as NativeScrollView,
  Text as NativeText,
  TextInput as NativeTextInput,
  View as NativeView,
  type FlatListProps,
} from 'react-native';
import { SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context';

export type View = ComponentRef<typeof NativeView>;
export type Text = ComponentRef<typeof NativeText>;
export type TextInput = ComponentRef<typeof NativeTextInput>;

export const View = styled(NativeView);
export const Text = styled(NativeText);
export const TextInput = styled(NativeTextInput);
export const Pressable = styled(NativePressable);
export const ActivityIndicator = styled(NativeActivityIndicator);
export const SafeAreaView = styled(NativeSafeAreaView);
export const KeyboardAvoidingView = styled(NativeKeyboardAvoidingView);
// Expose only style destinations to the CSS mapper, while forwarding the full native props below.
const ScrollViewStyleTarget: ComponentType<
  Pick<ComponentProps<typeof NativeScrollView>, 'style' | 'contentContainerStyle'>
> = NativeScrollView;
export function ScrollView(
  props: React.ComponentProps<typeof NativeScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  },
) {
  return useCssElement(ScrollViewStyleTarget, props, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
}

export function FlatList<T>(
  props: FlatListProps<T> & {
    className?: string;
    contentContainerClassName?: string;
  },
) {
  const ListStyleTarget: ComponentType<
    Pick<FlatListProps<T>, 'data' | 'style' | 'contentContainerStyle'>
  > = NativeFlatList<T>;
  return useCssElement(ListStyleTarget, props, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
}
