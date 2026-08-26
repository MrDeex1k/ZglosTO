const { withInfoPlist } = require('expo/config-plugins');

/**
 * Development-only ATS exception for the loopback-preserving S3 hostname used
 * by local presigned uploads. The plugin is conditionally included by app.config.ts.
 */
module.exports = function withLocalUploadAts(config) {
  return withInfoPlist(config, (nativeConfig) => {
    nativeConfig.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        '127.0.0.1.nip.io': {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
      },
    };
    return nativeConfig;
  });
};
