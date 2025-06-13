const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('child_process');
const path = require('path');

// This plugin runs the fix-firebase-auth.js script during the prebuild process
const withFirebaseAuthFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        const scriptPath = path.join(config.modRequest.projectRoot, 'tools', 'fix-firebase-auth.js');
        console.log(`Running Firebase Auth fix script: ${scriptPath}`);
        execSync(`node ${scriptPath}`, { stdio: 'inherit' });
      } catch (error) {
        console.error('Error running Firebase Auth fix script:', error);
      }
      return config;
    },
  ]);
};

module.exports = withFirebaseAuthFix;
