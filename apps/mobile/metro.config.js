const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  const defaultConfig = await getDefaultConfig(__dirname);
  
  // Disable package.json exports
  defaultConfig.resolver = {
    ...defaultConfig.resolver,
    unstable_enablePackageExports: false,
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'crypto') {
        // when importing crypto, resolve to react-native-quick-crypto
        return context.resolveRequest(
          context,
          'react-native-quick-crypto',
          platform,
        );
      }
      if (moduleName === 'stream') {
        // when importing stream, resolve to readable-stream
        return context.resolveRequest(
          context,
          'readable-stream',
          platform,
        );
      }
      if (moduleName === 'buffer' || moduleName === 'node:buffer') {
        // when importing buffer or node:buffer, resolve to @craftzdog/react-native-buffer
        return context.resolveRequest(
          context,
          '@craftzdog/react-native-buffer',
          platform,
        );
      }
      if (moduleName === 'fs') {
        // when importing fs, return a mock module since React Native doesn't have filesystem access
        return {
          type: 'empty',
        };
      }
      if (moduleName === 'path') {
        // when importing path, return a mock module
        return {
          type: 'empty',
        };
      }
      if (moduleName === 'os') {
        // when importing os, return a mock module
        return {
          type: 'empty',
        };
      }
      // otherwise chain to the standard Metro resolver.
      return context.resolveRequest(context, moduleName, platform);
    },
  };
  
  // Customize the config further if needed
  // For example, for monorepo support:
  defaultConfig.watchFolders = [
    require('path').resolve(__dirname, '../..') // Point to the monorepo root
  ]; 
  defaultConfig.resolver.nodeModulesPaths = [
    require('path').resolve(__dirname, 'node_modules'), // Mobile app's node_modules
    require('path').resolve(__dirname, '../../node_modules'), // Monorepo root node_modules
  ];

  return defaultConfig;
})(); 