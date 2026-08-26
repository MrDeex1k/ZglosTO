import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CurrentCreateIncidentRequest,
  CurrentCreateIncidentResponse,
} from '@zglosto/contracts';
import { fetch as expoFetch } from 'expo/fetch';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAuthenticatedFetch } from '@/api/authenticated-fetch';
import { createApiClient, type MobileFetch } from '@/api/client';
import { ApiError } from '@/api/errors';
import { useSession } from '@/auth/session-provider';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { FormFieldError } from '@/components/feedback/form-field-error';
import { StatePanel } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import {
  type ReportIncidentField,
  type ReportIncidentFields,
  validateReportIncidentForm,
} from '@/features/report-incident/report-form';
import {
  checksumIncidentImage,
  uploadPresignedIncidentImage,
} from '@/features/report-incident/native-image';
import {
  IncidentImageError,
  type IncidentImageErrorCode,
  type SelectedIncidentImage,
} from '@/features/report-incident/selected-image';
import { submitIncidentWithOptionalImage } from '@/features/report-incident/submit-incident';
import { useIncidentImagePicker } from '@/features/report-incident/use-incident-image-picker';
import { useLocale } from '@/i18n/i18n-provider';
import { useNetworkAvailability } from '@/queries/network-state';
import { queryKeys } from '@/queries/query-keys';

type FieldErrors = Partial<Record<ReportIncidentField, 'email' | 'required'>>;

function submissionErrorKey(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return 'rateLimited' as const;
  if (error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout')) {
    return 'networkError' as const;
  }
  return 'submitError' as const;
}

function imageErrorKey(error: unknown): IncidentImageErrorCode {
  return error instanceof IncidentImageError ? error.code : 'unavailable';
}

type SubmissionProgress =
  | { stage: 'creating' | 'preparing'; value: null }
  | { stage: 'uploading'; value: number };

export function ReportIncidentScreen() {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();

  if (runtime.status !== 'ready') return null;

  const { session } = sessionContext;
  if (session.status === 'authenticated' && session.role !== 'resident') {
    return <UnsupportedReporterScreen />;
  }
  if (session.status === 'unknown') return <ReporterSessionLoadingScreen />;
  if (session.status === 'stale') {
    return <UnavailableReporterScreen />;
  }
  if (session.status === 'anonymous' && !runtime.config.features.anonymousReports) {
    return <SignInRequiredScreen />;
  }

  return <ReadyReportIncidentScreen runtime={runtime} sessionContext={sessionContext} />;
}

function ReporterSessionLoadingScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
      <ActivityIndicator accessibilityLabel={t(($) => $.mobile.reportIncident.checkingSession)} />
      <Text className="text-center text-muted">
        {t(($) => $.mobile.reportIncident.checkingSession)}
      </Text>
    </SafeAreaView>
  );
}

function UnsupportedReporterScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 justify-center bg-canvas p-6">
      <StatePanel
        actionLabel={t(($) => $.mobile.routes.backHome)}
        description={t(($) => $.mobile.reportIncident.unsupportedRoleDescription)}
        onAction={() => router.back()}
        title={t(($) => $.mobile.reportIncident.unavailableTitle)}
      />
    </SafeAreaView>
  );
}

function UnavailableReporterScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 justify-center bg-canvas p-6">
      <StatePanel
        actionLabel={t(($) => $.mobile.routes.backHome)}
        description={t(($) => $.mobile.reportIncident.sessionUnavailableDescription)}
        onAction={() => router.back()}
        title={t(($) => $.mobile.reportIncident.unavailableTitle)}
      />
    </SafeAreaView>
  );
}

function SignInRequiredScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 justify-center bg-canvas p-6">
      <StatePanel
        actionLabel={t(($) => $.mobile.auth.signIn)}
        description={t(($) => $.mobile.reportIncident.signInRequiredDescription)}
        onAction={() => router.replace('/login')}
        title={t(($) => $.mobile.reportIncident.signInRequiredTitle)}
      />
    </SafeAreaView>
  );
}

function ReadyReportIncidentScreen({
  runtime,
  sessionContext,
}: {
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  sessionContext: ReturnType<typeof useSession>;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const networkAvailability = useNetworkAvailability();
  const isOffline = networkAvailability === 'offline';
  const { session } = sessionContext;
  const residentSession =
    session.status === 'authenticated' && session.role === 'resident' ? session : null;
  const fallbackServiceKey = runtime.config.routing.fallbackServiceKey;
  const [fields, setFields] = useState<ReportIncidentFields>({
    address: '',
    description: '',
    email: residentSession?.email ?? '',
    serviceKey: fallbackServiceKey,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { image, imageError, pickImage, removeImage, setImageError } = useIncidentImagePicker();
  const [submissionProgress, setSubmissionProgress] = useState<SubmissionProgress | null>(null);
  const [submissionError, setSubmissionError] = useState<ReturnType<
    typeof submissionErrorKey
  > | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const fetcher =
    residentSession === null
      ? (expoFetch as MobileFetch)
      : createAuthenticatedFetch({
          fetcher: expoFetch as MobileFetch,
          getCookie: sessionContext.getCookie,
          onForbidden: sessionContext.handleForbidden,
          onUnauthorized: sessionContext.handleUnauthorized,
        });
  const client = createApiClient({ fetcher, origin: runtime.environment.apiOrigin });
  const mutation = useMutation({
    mutationFn: ({
      image: selectedImage,
      request,
      signal,
    }: {
      image: SelectedIncidentImage | null;
      request: CurrentCreateIncidentRequest;
      signal: AbortSignal;
    }) =>
      submitIncidentWithOptionalImage({
        client,
        dependencies: {
          checksumImage: async (candidate) => {
            setSubmissionProgress({ stage: 'preparing', value: null });
            return checksumIncidentImage(candidate);
          },
          uploadImage: ({ image: candidate, onProgress, signal: uploadSignal, upload }) =>
            uploadPresignedIncidentImage({
              image: candidate,
              onProgress: ({ bytesSent, totalBytes }) => onProgress?.(bytesSent, totalBytes),
              ...(uploadSignal === undefined ? {} : { signal: uploadSignal }),
              upload,
            }),
        },
        image: selectedImage,
        onCreatingIncident: () => setSubmissionProgress({ stage: 'creating', value: null }),
        onProgress: (sent, total) =>
          setSubmissionProgress({
            stage: 'uploading',
            value: total > 0 ? Math.min(1, sent / total) : 0,
          }),
        request,
        signal,
      }),
    onSuccess: async () => {
      removeImage();
      const invalidations = [
        queryClient.invalidateQueries({
          queryKey: queryKeys.publicIncidents(runtime.environment.apiOrigin),
        }),
      ];
      if (residentSession !== null) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.residentIncidents(
              runtime.environment.apiOrigin,
              residentSession.userId,
            ),
          }),
        );
      }
      await Promise.all(invalidations);
    },
    onSettled: () => {
      abortController.current = null;
      setSubmissionProgress(null);
    },
  });
  const services = [...runtime.config.services]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((service) => ({ key: service.key, label: service.label[locale] }));

  useEffect(
    () => () => {
      abortController.current?.abort();
    },
    [],
  );

  const updateField = (field: ReportIncidentField, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmissionError(null);
  };

  const submit = () => {
    const validation = validateReportIncidentForm(fields);
    if (!validation.success) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSubmissionError(null);
    if (isOffline) {
      setSubmissionError('networkError');
      return;
    }
    const controller = new AbortController();
    abortController.current = controller;
    setSubmissionProgress({ stage: image === null ? 'creating' : 'preparing', value: null });
    mutation.mutate(
      { image, request: validation.request, signal: controller.signal },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.kind === 'aborted') return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSubmissionError(submissionErrorKey(error));
          if (error instanceof IncidentImageError) setImageError(imageErrorKey(error));
        },
      },
    );
  };

  const resetForm = () => {
    setFields({
      address: '',
      description: '',
      email: residentSession?.email ?? '',
      serviceKey: fallbackServiceKey,
    });
    setFieldErrors({});
    removeImage();
    setSubmissionProgress(null);
    setSubmissionError(null);
    mutation.reset();
  };

  if (mutation.isSuccess) {
    return (
      <ReportIncidentSuccess
        authenticated={residentSession !== null}
        onReset={resetForm}
        response={mutation.data}
      />
    );
  }

  const fieldErrorMessage = (field: ReportIncidentField) => {
    const error = fieldErrors[field];
    if (error === 'email') return t(($) => $.mobile.reportIncident.invalidEmail);
    if (error === 'required') return t(($) => $.mobile.reportIncident.requiredField);
    return null;
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="mx-auto w-full max-w-2xl gap-7 px-6 py-8"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <Text accessibilityRole="header" variant="title">
              {t(($) => $.mobile.reportIncident.title)}
            </Text>
            <Text className="text-lg leading-7 text-muted">
              {t(($) => $.mobile.reportIncident.description)}
            </Text>
          </View>

          <Card accessibilityRole="alert" className="gap-2 border-danger">
            <Text className="font-bold">{t(($) => $.incidents.emergencyDisclaimer.title)}</Text>
            <Text>{t(($) => $.incidents.emergencyDisclaimer.message)}</Text>
          </Card>

          {isOffline ? <ConnectivityNotice variant="offline" /> : null}

          <View className="gap-5">
            <View className="gap-2">
              <Label>{t(($) => $.mobile.reportIncident.descriptionLabel)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.reportIncident.descriptionLabel)}
                className="min-h-28"
                editable={!mutation.isPending}
                multiline
                onChangeText={(value) => updateField('description', value)}
                textAlignVertical="top"
                value={fields.description}
              />
              {fieldErrorMessage('description') === null ? null : (
                <FormFieldError>{fieldErrorMessage('description')}</FormFieldError>
              )}
            </View>

            <View className="gap-2">
              <Label>{t(($) => $.mobile.reportIncident.addressLabel)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.reportIncident.addressLabel)}
                autoComplete="street-address"
                editable={!mutation.isPending}
                onChangeText={(value) => updateField('address', value)}
                value={fields.address}
              />
              {fieldErrorMessage('address') === null ? null : (
                <FormFieldError>{fieldErrorMessage('address')}</FormFieldError>
              )}
            </View>

            <View className="gap-2">
              <Label>{t(($) => $.mobile.reportIncident.emailLabel)}</Label>
              <Input
                accessibilityLabel={t(($) => $.mobile.reportIncident.emailLabel)}
                autoCapitalize="none"
                autoComplete="email"
                editable={!mutation.isPending && residentSession === null}
                keyboardType="email-address"
                onChangeText={(value) => updateField('email', value)}
                textContentType="emailAddress"
                value={fields.email}
              />
              {residentSession === null ? null : (
                <Text variant="caption">{t(($) => $.mobile.reportIncident.accountEmailHint)}</Text>
              )}
              {fieldErrorMessage('email') === null ? null : (
                <FormFieldError>{fieldErrorMessage('email')}</FormFieldError>
              )}
            </View>

            <IncidentServiceField
              disabled={mutation.isPending}
              error={fieldErrorMessage('serviceKey')}
              onSelect={(serviceKey) => updateField('serviceKey', serviceKey)}
              selectedKey={fields.serviceKey}
              services={services}
            />

            <IncidentImageField
              disabled={mutation.isPending}
              error={imageError}
              image={image}
              onPick={pickImage}
              onRemove={removeImage}
            />

            {submissionError === null ? null : (
              <FormFieldError>{t(($) => $.mobile.reportIncident[submissionError])}</FormFieldError>
            )}

            <IncidentSubmissionProgress progress={submissionProgress} />

            <Button disabled={mutation.isPending || isOffline} onPress={submit}>
              {mutation.isPending
                ? t(($) => $.mobile.reportIncident.submitting)
                : isOffline
                  ? t(($) => $.mobile.reportIncident.offlineSubmit)
                  : submissionError === null
                    ? t(($) => $.mobile.reportIncident.submit)
                    : t(($) => $.mobile.reportIncident.retrySubmit)}
            </Button>
            {mutation.isPending ? (
              <Button onPress={() => abortController.current?.abort()} variant="secondary">
                {t(($) => $.mobile.reportIncident.cancelUpload)}
              </Button>
            ) : null}
            <Button disabled={mutation.isPending} onPress={() => router.back()} variant="subtle">
              {t(($) => $.mobile.reportIncident.cancel)}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IncidentServiceField({
  disabled,
  error,
  onSelect,
  selectedKey,
  services,
}: {
  disabled: boolean;
  error: null | string;
  onSelect: (serviceKey: string) => void;
  selectedKey: string;
  services: ReadonlyArray<{ key: string; label: string }>;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <Label>{t(($) => $.mobile.reportIncident.serviceLabel)}</Label>
      <View accessibilityRole="radiogroup" className="gap-3">
        {services.map((service) => {
          const selected = selectedKey === service.key;
          return (
            <Button
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              disabled={disabled}
              key={service.key}
              onPress={() => onSelect(service.key)}
              variant={selected ? 'primary' : 'secondary'}
            >
              {service.label}
            </Button>
          );
        })}
      </View>
      {error === null ? null : <FormFieldError>{error}</FormFieldError>}
    </View>
  );
}

function ReportIncidentSuccess({
  authenticated,
  onReset,
  response,
}: {
  authenticated: boolean;
  onReset: () => void;
  response: CurrentCreateIncidentResponse;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 justify-center bg-canvas p-6">
      <View className="mx-auto w-full max-w-xl gap-6">
        <Badge>{t(($) => $.mobile.reportIncident.successBadge)}</Badge>
        <Text accessibilityLiveRegion="polite" accessibilityRole="header" variant="title">
          {t(($) => $.mobile.reportIncident.successTitle)}
        </Text>
        <Text className="text-lg leading-7 text-muted">
          {t(($) => $.mobile.reportIncident.successDescription)}
        </Text>
        <Card className="gap-2">
          <Text variant="caption">{t(($) => $.mobile.reportIncident.reportNumber)}</Text>
          <Text className="font-semibold">{response.incydent.id_zgloszenia}</Text>
        </Card>
        <Button onPress={() => router.replace(authenticated ? '/resident' : '/')}>
          {authenticated
            ? t(($) => $.mobile.auth.openDashboard)
            : t(($) => $.mobile.routes.backHome)}
        </Button>
        <Button onPress={onReset} variant="secondary">
          {t(($) => $.mobile.reportIncident.reportAnother)}
        </Button>
      </View>
    </SafeAreaView>
  );
}

function IncidentImageField({
  disabled,
  error,
  image,
  onPick,
  onRemove,
}: {
  disabled: boolean;
  error: IncidentImageErrorCode | 'permission' | null;
  image: SelectedIncidentImage | null;
  onPick: (source: 'camera' | 'library') => Promise<void>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Label>{t(($) => $.mobile.reportIncident.imageLabel)}</Label>
        <Text variant="caption">{t(($) => $.mobile.reportIncident.imageHint)}</Text>
      </View>
      {image === null ? null : (
        <Card className="gap-3 overflow-hidden p-0">
          <Image
            accessibilityLabel={t(($) => $.mobile.reportIncident.imagePreview)}
            contentFit="cover"
            source={{ uri: image.uri }}
            style={{ height: 220, width: '100%' }}
          />
          <View className="gap-1 px-4 pb-4">
            <Text className="font-semibold" numberOfLines={1}>
              {image.fileName}
            </Text>
            <Text variant="caption">
              {t(($) => $.mobile.reportIncident.imageSize, {
                size: (image.sizeBytes / (1024 * 1024)).toFixed(2),
              })}
            </Text>
          </View>
        </Card>
      )}
      <View className="gap-3 sm:flex-row">
        <Button
          className="flex-1"
          disabled={disabled}
          onPress={() => void onPick('library')}
          variant="secondary"
        >
          {t(($) => $.mobile.reportIncident.chooseFromLibrary)}
        </Button>
        <Button
          className="flex-1"
          disabled={disabled}
          onPress={() => void onPick('camera')}
          variant="secondary"
        >
          {t(($) => $.mobile.reportIncident.takePhoto)}
        </Button>
      </View>
      {image === null ? null : (
        <Button disabled={disabled} onPress={onRemove} variant="subtle">
          {t(($) => $.mobile.reportIncident.removeImage)}
        </Button>
      )}
      {error === null ? null : (
        <FormFieldError>{t(($) => $.mobile.reportIncident.imageErrors[error])}</FormFieldError>
      )}
    </View>
  );
}

function IncidentSubmissionProgress({ progress }: { progress: SubmissionProgress | null }) {
  const { t } = useTranslation();
  if (progress === null) return null;
  const percentage = progress.stage === 'uploading' ? Math.round(progress.value * 100) : null;

  return (
    <View accessibilityLiveRegion="polite" className="gap-2">
      <Text>
        {progress.stage === 'preparing'
          ? t(($) => $.mobile.reportIncident.preparingImage)
          : progress.stage === 'uploading'
            ? t(($) => $.mobile.reportIncident.uploadingImage, { progress: percentage })
            : t(($) => $.mobile.reportIncident.creatingIncident)}
      </Text>
      {percentage === null ? null : (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: percentage }}
          className="h-2 overflow-hidden rounded-full bg-gray-200"
        >
          <View className="h-full rounded-full bg-ink" style={{ width: `${percentage}%` }} />
        </View>
      )}
    </View>
  );
}
