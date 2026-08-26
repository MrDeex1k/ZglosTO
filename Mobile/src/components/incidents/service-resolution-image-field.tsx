import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ApiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  checksumIncidentImage,
  uploadPresignedIncidentImage,
} from '@/features/report-incident/native-image';
import { useIncidentImagePicker } from '@/features/report-incident/use-incident-image-picker';
import {
  serviceMutationFailureAction,
  type ServiceMutationFailureAction,
} from '@/features/service-incidents/service-phase5-policy';
import { submitServiceResolutionImage } from '@/features/service-incidents/submit-resolution-image';
import type { NetworkAvailability } from '@/queries/network-availability';

export function ServiceResolutionImageField({
  client,
  incidentId,
  networkAvailability,
  onCompleted,
}: {
  client: ApiClient;
  incidentId: string;
  networkAvailability: NetworkAvailability;
  onCompleted: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { image, imageError, pickImage, removeImage } = useIncidentImagePicker();
  const [progress, setProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'success' | ServiceMutationFailureAction | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (image === null) throw new Error('Resolution image is required.');
      const controller = new AbortController();
      abortController.current = controller;
      return submitServiceResolutionImage({
        client,
        dependencies: {
          checksumImage: checksumIncidentImage,
          uploadImage: ({ image: candidate, onProgress, signal, upload }) =>
            uploadPresignedIncidentImage({
              image: candidate,
              onProgress: ({ bytesSent, totalBytes }) => onProgress?.(bytesSent, totalBytes),
              ...(signal === undefined ? {} : { signal }),
              upload,
            }),
        },
        image,
        incidentId,
        onProgress: (sent, total) => setProgress(total > 0 ? Math.min(1, sent / total) : 0),
        signal: controller.signal,
      });
    },
    onSettled: () => {
      abortController.current = null;
      setProgress(null);
    },
    onError: async (error) => {
      const action = serviceMutationFailureAction(error);
      if (action === 'silent') return;
      setFeedback(action);
      if (action === 'conflict-refresh' || action === 'incident-unavailable') await onCompleted();
    },
    onSuccess: async () => {
      removeImage();
      setFeedback('success');
      await onCompleted();
    },
  });
  const isOffline = networkAvailability === 'offline';
  const pick = async (source: 'camera' | 'library') => {
    mutation.reset();
    setFeedback(null);
    await pickImage(source);
  };
  const submit = () => {
    mutation.reset();
    setFeedback(null);
    mutation.mutate();
  };
  const remove = () => {
    mutation.reset();
    setFeedback(null);
    removeImage();
  };

  useEffect(
    () => () => {
      abortController.current?.abort();
    },
    [],
  );

  return (
    <View className="gap-3">
      <Text variant="caption">{t(($) => $.mobile.serviceDetails.resolutionUploadHint)}</Text>
      {image === null ? null : (
        <View className="gap-2 overflow-hidden rounded-xl border border-border">
          <Image
            accessible
            accessibilityLabel={t(($) => $.mobile.serviceDetails.resolutionPreviewAlt)}
            contentFit="cover"
            source={{ uri: image.uri }}
            style={{ height: 200, width: '100%' }}
          />
          <Text className="px-4 pb-3 font-semibold" numberOfLines={1}>
            {image.fileName}
          </Text>
        </View>
      )}
      <View className="gap-2">
        <Button
          disabled={mutation.isPending}
          onPress={() => void pick('library')}
          testID="resolution-pick-library"
          variant="secondary"
        >
          {t(($) => $.mobile.reportIncident.chooseFromLibrary)}
        </Button>
        <Button
          disabled={mutation.isPending}
          onPress={() => void pick('camera')}
          testID="resolution-pick-camera"
          variant="secondary"
        >
          {t(($) => $.mobile.reportIncident.takePhoto)}
        </Button>
      </View>
      {imageError === null ? null : (
        <Text accessibilityLiveRegion="polite" className="text-danger">
          {t(($) => $.mobile.reportIncident.imageErrors[imageError])}
        </Text>
      )}
      {progress === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: Math.round(progress * 100) }}
          className="text-muted"
        >
          {t(($) => $.mobile.serviceDetails.uploadingResolution, {
            progress: Math.round(progress * 100),
          })}
        </Text>
      )}
      <ResolutionUploadFeedback feedback={feedback} />
      {image === null ? null : (
        <Button
          disabled={mutation.isPending || isOffline}
          onPress={submit}
          testID="resolution-upload"
        >
          {mutation.isPending
            ? t(($) => $.mobile.serviceDetails.savingResolution)
            : t(($) => $.mobile.serviceDetails.uploadResolution)}
        </Button>
      )}
      {mutation.isPending ? (
        <Button
          onPress={() => abortController.current?.abort()}
          testID="resolution-upload-cancel"
          variant="secondary"
        >
          {t(($) => $.mobile.reportIncident.cancelUpload)}
        </Button>
      ) : null}
      {image === null || mutation.isPending ? null : (
        <Button onPress={remove} testID="resolution-remove" variant="subtle">
          {t(($) => $.mobile.reportIncident.removeImage)}
        </Button>
      )}
    </View>
  );
}

function ResolutionUploadFeedback({
  feedback,
}: {
  feedback: 'success' | ServiceMutationFailureAction | null;
}) {
  const { t } = useTranslation();
  if (feedback === null || feedback === 'silent') return null;
  let message: string;
  switch (feedback) {
    case 'success':
      message = t(($) => $.mobile.serviceDetails.resolutionUploadSuccess);
      break;
    case 'conflict-refresh':
      message = t(($) => $.mobile.serviceDetails.resolutionConflictError);
      break;
    case 'incident-unavailable':
      message = t(($) => $.mobile.serviceDetails.incidentUnavailableError);
      break;
    case 'retry-manually':
      message = t(($) => $.mobile.serviceDetails.resolutionRetryableError);
      break;
    case 'scope-changed':
      message = t(($) => $.mobile.serviceDetails.scopeChangedError);
      break;
    case 'session-expired':
      message = t(($) => $.mobile.serviceDetails.sessionExpiredError);
      break;
    case 'show-error':
      message = t(($) => $.mobile.serviceDetails.resolutionUploadError);
      break;
  }
  return (
    <Text
      accessibilityLiveRegion="polite"
      className={feedback === 'success' ? 'text-success' : 'text-danger'}
      testID="resolution-upload-feedback"
    >
      {message}
    </Text>
  );
}
