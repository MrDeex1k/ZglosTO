import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { FormFieldError } from '@/components/feedback/form-field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { parseLoginIntent, resolveAuthenticatedIntent } from '@/linking/deep-link-intent';

export function LoginScreen() {
  const { intent: intentParam } = useLocalSearchParams<{ intent?: string | string[] }>();
  const intent = parseLoginIntent(intentParam);
  const { signInWithEmail } = useSession();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === '' || password === '') {
      setError(t(($) => $.mobile.auth.requiredFields));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    void signInWithEmail(normalizedEmail, password)
      .then((nextSession) => {
        const destination =
          resolveAuthenticatedIntent(nextSession, intent) ?? routeForSession(nextSession);
        if (destination === null) setError(t(($) => $.mobile.auth.unsupportedRole));
        else router.replace(destination as Href);
        return undefined;
      })
      .catch(() => {
        setError(t(($) => $.mobile.auth.signInError));
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
          contentContainerClassName="mx-auto w-full max-w-xl grow justify-center gap-8 px-6 py-10"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <Text accessibilityRole="header" variant="title">
              {t(($) => $.mobile.auth.title)}
            </Text>
            <Text className="text-lg leading-7 text-muted">
              {t(($) => $.mobile.auth.description)}
            </Text>
          </View>

          <View className="gap-5">
            <View className="gap-2">
              <Label>{t(($) => $.mobile.auth.email)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.auth.email)}
                autoCapitalize="none"
                autoComplete="email"
                editable={!isSubmitting}
                keyboardType="email-address"
                onChangeText={setEmail}
                returnKeyType="next"
                testID="login-email"
                textContentType="username"
                value={email}
              />
            </View>
            <View className="gap-2">
              <Label>{t(($) => $.mobile.auth.password)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.auth.password)}
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!isSubmitting}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                returnKeyType="go"
                secureTextEntry
                testID="login-password"
                textContentType="password"
                value={password}
              />
            </View>

            {error === null ? null : <FormFieldError>{error}</FormFieldError>}

            <Button disabled={isSubmitting} onPress={submit} testID="login-submit">
              {isSubmitting ? t(($) => $.mobile.auth.signingIn) : t(($) => $.mobile.auth.signIn)}
            </Button>
            <Button
              disabled={isSubmitting}
              onPress={() => router.push('/register')}
              variant="secondary"
            >
              {t(($) => $.mobile.registration.register)}
            </Button>
            <Button disabled={isSubmitting} onPress={() => router.back()} variant="subtle">
              {t(($) => $.mobile.routes.backHome)}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
