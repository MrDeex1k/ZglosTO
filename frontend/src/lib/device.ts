interface NavigatorWithUserAgentData {
  maxTouchPoints?: number;
  platform?: string;
  userAgent: string;
  userAgentData?: {
    mobile: boolean;
  };
}

const MOBILE_OR_TABLET_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i;

export function isMobileOrTablet(
  browserNavigator: NavigatorWithUserAgentData | null = typeof navigator === 'undefined'
    ? null
    : navigator,
): boolean {
  if (browserNavigator === null) return false;

  if (browserNavigator.userAgentData?.mobile === true) return true;

  const isIPadUsingDesktopUserAgent =
    browserNavigator.platform === 'MacIntel' && (browserNavigator.maxTouchPoints ?? 0) > 1;
  if (isIPadUsingDesktopUserAgent) return true;

  return MOBILE_OR_TABLET_USER_AGENT.test(browserNavigator.userAgent);
}
