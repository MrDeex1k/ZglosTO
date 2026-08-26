import type { ConfigContext, ExpoConfig } from 'expo/config';

const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeAppLinkHost(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  const host = value.trim().toLowerCase();
  if (!HOST_PATTERN.test(host)) {
    throw new Error('MOBILE_APP_LINK_HOST must be a DNS hostname without a scheme, port or path.');
  }
  return host;
}

export function createNativeAppLinkConfig(host: string) {
  return {
    androidIntentFilters: [
      {
        action: 'VIEW' as const,
        autoVerify: true as const,
        category: ['BROWSABLE', 'DEFAULT'] as ['BROWSABLE', 'DEFAULT'],
        data: [
          { host, pathPrefix: '/open', scheme: 'https' as const },
          { host, pathPrefix: '/auth/email-verified', scheme: 'https' as const },
        ],
      },
    ],
    iosAssociatedDomains: [`applinks:${host}`],
  };
}

const appLinkHost = normalizeAppLinkHost(process.env.MOBILE_APP_LINK_HOST);
const appLinks = appLinkHost === null ? null : createNativeAppLinkConfig(appLinkHost);
const allowLocalHttp = process.env.EXPO_PUBLIC_ALLOW_HTTP_ORIGIN?.trim() === 'true';
const appFunctionalityPurpose = ['NSPrivacyCollectedDataTypePurposeAppFunctionality'];
const collectedDataTypes = [
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypePhysicalAddress',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeOtherUserContent',
].map((NSPrivacyCollectedDataType) => ({
  NSPrivacyCollectedDataType,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypePurposes: appFunctionalityPurpose,
  NSPrivacyCollectedDataTypeTracking: false,
}));

const createConfig = ({ config: baseConfig }: ConfigContext): ExpoConfig => ({
  ...baseConfig,
  name: 'ZgłosTO',
  slug: 'zglosto',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'light',
  scheme: 'zglosto',
  ios: {
    bundleIdentifier: 'pl.zglosto.app',
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: collectedDataTypes,
      NSPrivacyTracking: false,
    },
    supportsTablet: true,
    ...(appLinks === null ? {} : { associatedDomains: appLinks.iosAssociatedDomains }),
  },
  android: {
    package: 'pl.zglosto.app',
    predictiveBackGestureEnabled: true,
    ...(appLinks === null ? {} : { intentFilters: appLinks.androidIntentFilters }),
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        cameraPermission:
          'ZgłosTO potrzebuje dostępu do aparatu, aby wykonać zdjęcie do zgłoszenia.',
        microphonePermission: false,
        photosPermission:
          'ZgłosTO potrzebuje dostępu do biblioteki zdjęć, aby dołączyć zdjęcie do zgłoszenia.',
      },
    ],
    [
      'expo-build-properties',
      {
        android: { minSdkVersion: 31 },
        ios: { deploymentTarget: '17.0', privacyManifestAggregationEnabled: true },
      },
    ],
    ...(allowLocalHttp ? ['./plugins/with-local-upload-ats.cjs'] : []),
  ],
  experiments: {
    reactCompiler: true,
    typedRoutes: true,
  },
  extra: {
    analyticsEnabled: false,
    buildMode: 'local',
  },
});

export default createConfig;
