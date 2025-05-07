const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  const defaultConfig = await getDefaultConfig(__dirname);
  
  // Disable package.json exports
  defaultConfig.resolver = {
    ...defaultConfig.resolver,
    unstable_enablePackageExports: false,
  };
  
  // Customize the config further if needed
  // For example, for monorepo support:
  // defaultConfig.watchFolders = [require('path').resolve(__dirname, '../..')]; 
  // defaultConfig.resolver.nodeModulesPaths = [
  //   require('path').resolve(__dirname, 'node_modules'),
  //   require('path').resolve(__dirname, '../../node_modules'),
  // ];

  return defaultConfig;
})(); 