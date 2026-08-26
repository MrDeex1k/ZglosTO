import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileAuthOperationError } from '@/auth/errors';
import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { FormFieldError } from '@/components/feedback/form-field-error';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import {
  normalizeRegistration,
  type RegistrationFieldErrors,
  type RegistrationFormValue,
  type RegistrationValidationCode,
  validateRegistration,
} from '@/features/registration/registration-form';

const initialValue: RegistrationFormValue = {
  acceptPrivacy: false,
  acceptTerms: false,
  email: '',
  name: '',
  password: '',
};

function registrationErrorKey(error: unknown) {
  if (error instanceof MobileAuthOperationError) {
    if (error.status === 429) return 'rateLimited' as const;
    if (error.code.includes('ALREADY_EXISTS') || error.code.includes('USER_ALREADY_EXISTS')) {
      return 'userExists' as const;
    }
    if (error.code.includes('WEAK_PASSWORD')) return 'weakPassword' as const;
  }
  return 'genericError' as const;
}

export function RegisterScreen() {
  const { signUpWithEmail } = useSession();
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [submitError, setSubmitError] = useState<
    'genericError' | 'rateLimited' | 'userExists' | 'weakPassword' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const validationMessage = (code: RegistrationValidationCode | undefined) => {
    if (code === 'required-name') return t(($) => $.mobile.registration.requiredName);
    if (code === 'invalid-email') return t(($) => $.mobile.registration.invalidEmail);
    if (code === 'short-password') return t(($) => $.mobile.registration.shortPassword);
    if (code === 'privacy-required') return t(($) => $.mobile.registration.privacyRequired);
    if (code === 'terms-required') return t(($) => $.mobile.registration.termsRequired);
    return undefined;
  };

  const submitErrorMessage = () => {
    if (submitError === 'rateLimited') return t(($) => $.mobile.registration.rateLimited);
    if (submitError === 'userExists') return t(($) => $.mobile.registration.userExists);
    if (submitError === 'weakPassword') return t(($) => $.mobile.registration.weakPassword);
    return t(($) => $.mobile.registration.genericError);
  };

  const submit = () => {
    const errors = validateRegistration(value);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitError(null);
    setIsSubmitting(true);
    void signUpWithEmail(normalizeRegistration(value))
      .then((nextSession) => {
        const destination = routeForSession(nextSession);
        router.replace((destination ?? '/') as Href);
        return undefined;
      })
      .catch((error: unknown) => {
        setSubmitError(registrationErrorKey(error));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="mx-auto w-full max-w-xl grow gap-8 px-6 py-10"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <Text accessibilityRole="header" variant="title">
              {t(($) => $.mobile.registration.title)}
            </Text>
            <Text className="text-lg leading-7 text-muted">
              {t(($) => $.mobile.registration.description)}
            </Text>
          </View>

          <View className="gap-5">
            <View className="gap-2">
              <Label>{t(($) => $.mobile.registration.name)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.registration.name)}
                autoCapitalize="words"
                autoComplete="name"
                editable={!isSubmitting}
                onChangeText={(name) => setValue((current) => ({ ...current, name }))}
                returnKeyType="next"
                testID="registration-name"
                textContentType="name"
                value={value.name}
              />
              {fieldErrors.name === undefined ? null : (
                <FormFieldError>{validationMessage(fieldErrors.name)}</FormFieldError>
              )}
            </View>

            <View className="gap-2">
              <Label>{t(($) => $.mobile.registration.email)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.registration.email)}
                autoCapitalize="none"
                autoComplete="email"
                editable={!isSubmitting}
                keyboardType="email-address"
                onChangeText={(email) => setValue((current) => ({ ...current, email }))}
                returnKeyType="next"
                testID="registration-email"
                textContentType="username"
                value={value.email}
              />
              {fieldErrors.email === undefined ? null : (
                <FormFieldError>{validationMessage(fieldErrors.email)}</FormFieldError>
              )}
            </View>

            <View className="gap-2">
              <Label>{t(($) => $.mobile.registration.password)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.registration.password)}
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!isSubmitting}
                onChangeText={(password) => setValue((current) => ({ ...current, password }))}
                onSubmitEditing={() => void submit()}
                returnKeyType="done"
                secureTextEntry={!isPasswordVisible}
                testID="registration-password"
                textContentType="newPassword"
                value={value.password}
              />
              <Text variant="caption">{t(($) => $.mobile.registration.passwordHint)}</Text>
              <Button
                disabled={isSubmitting}
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                testID="registration-password-visibility"
                variant="subtle"
              >
                {isPasswordVisible
                  ? t(($) => $.mobile.registration.hidePassword)
                  : t(($) => $.mobile.registration.showPassword)}
              </Button>
              {fieldErrors.password === undefined ? null : (
                <FormFieldError>{validationMessage(fieldErrors.password)}</FormFieldError>
              )}
            </View>

            <CheckboxField
              checked={value.acceptPrivacy}
              disabled={isSubmitting}
              error={validationMessage(fieldErrors.acceptPrivacy)}
              label={t(($) => $.mobile.registration.acceptPrivacy)}
              onCheckedChange={(acceptPrivacy) =>
                setValue((current) => ({ ...current, acceptPrivacy }))
              }
              testID="registration-privacy"
            />
            <CheckboxField
              checked={value.acceptTerms}
              disabled={isSubmitting}
              error={validationMessage(fieldErrors.acceptTerms)}
              label={t(($) => $.mobile.registration.acceptTerms)}
              onCheckedChange={(acceptTerms) =>
                setValue((current) => ({ ...current, acceptTerms }))
              }
              testID="registration-terms"
            />

            {submitError === null ? null : <FormFieldError>{submitErrorMessage()}</FormFieldError>}

            <Button
              disabled={isSubmitting}
              onPress={() => void submit()}
              testID="registration-submit"
            >
              {isSubmitting
                ? t(($) => $.mobile.registration.registering)
                : t(($) => $.mobile.registration.register)}
            </Button>
            <Button
              disabled={isSubmitting}
              onPress={() => router.replace('/login')}
              variant="secondary"
            >
              {t(($) => $.mobile.registration.openLogin)}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
