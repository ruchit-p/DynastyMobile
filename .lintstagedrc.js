module.exports = {
  // Web app files - exclude test files
  'apps/web/dynastyweb/**/*.{js,jsx,ts,tsx}': (filenames) => {
    const nonTestFiles = filenames.filter(
      file => !file.includes('.test.') && 
             !file.includes('.spec.') && 
             !file.includes('__tests__') &&
             !file.includes('__mocks__') &&
             !file.includes('test-utils') &&
             !file.includes('testSetup')
    );
    
    if (nonTestFiles.length === 0) return [];
    
    return [
      `cd apps/web/dynastyweb && yarn lint --fix -- ${nonTestFiles.map(f => f.replace(/^.*\/dynastyweb\//, '')).join(' ')}`,
      `prettier --write ${nonTestFiles.join(' ')}`
    ];
  },
  
  // Firebase functions files - exclude test files
  'apps/firebase/functions/**/*.{js,ts}': (filenames) => {
    const nonTestFiles = filenames.filter(
      file => !file.includes('.test.') && 
             !file.includes('.spec.') && 
             !file.includes('__tests__') &&
             !file.includes('__mocks__') &&
             !file.includes('test-utils') &&
             !file.includes('testHelpers') &&
             !file.includes('testSetup') &&
             !file.includes('/test/') &&
             !file.includes('Mock')
    );
    
    if (nonTestFiles.length === 0) return [];
    
    return [
      `cd apps/firebase/functions && npm run lint -- --fix ${nonTestFiles.map(f => f.replace(/^.*\/functions\//, '')).join(' ')}`,
      `prettier --write ${nonTestFiles.join(' ')}`
    ];
  },
  
  // Config files - still process these
  '*.{json,md,yml,yaml}': [
    'prettier --write'
  ]
};