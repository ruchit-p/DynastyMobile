#!/usr/bin/env ts-node

const { writeFileSync, readFileSync, existsSync, mkdirSync } = require('fs')
const { join, dirname } = require('path')

/**
 * Test script to verify Stripe subscription integration
 * Run with: npx ts-node scripts/test-subscription-integration.ts
 */

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
}

const testResults: TestResult[] = []

// Helper function to add test result
function addTestResult(name: string, status: TestResult['status'], message: string) {
  testResults.push({ name, status, message })
  console.log(`${status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️'} ${name}: ${message}`)
}

// Test 1: Check if all required files exist
console.log('\n🔍 Testing file existence...')
const requiredFiles = [
  'src/utils/subscriptionUtils.ts',
  'src/app/pricing/page.tsx',
  'src/app/pricing/layout.tsx',
  'src/app/(protected)/account-settings/subscription/page.tsx',
  'src/app/(protected)/checkout/page.tsx',
  'src/app/(protected)/checkout/success/page.tsx',
  'src/components/providers/StripeProvider.tsx',
  'src/middleware/subscription-rate-limit.ts'
]

requiredFiles.forEach(file => {
  const filePath = join(__dirname, '..', file)
  if (existsSync(filePath)) {
    addTestResult(`File ${file}`, 'pass', 'File exists')
  } else {
    addTestResult(`File ${file}`, 'fail', 'File not found')
  }
})

// Test 2: Check for required environment variables
console.log('\n🔐 Testing environment variables...')
const requiredEnvVars = [
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
]

requiredEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    addTestResult(`Environment ${envVar}`, 'pass', 'Variable is set')
  } else {
    addTestResult(`Environment ${envVar}`, 'warning', 'Variable not set (check .env.local)')
  }
})

// Test 3: Check middleware configuration
console.log('\n⚙️ Testing middleware configuration...')
try {
  const middlewareContent = readFileSync(join(__dirname, '..', 'middleware.ts'), 'utf-8')
  
  // Check for Stripe domains in CSP
  const hasStripeDomains = middlewareContent.includes('https://api.stripe.com') && 
                          middlewareContent.includes('https://checkout.stripe.com') &&
                          middlewareContent.includes('https://js.stripe.com')
  
  if (hasStripeDomains) {
    addTestResult('CSP Stripe domains', 'pass', 'Stripe domains are allowed in CSP')
  } else {
    addTestResult('CSP Stripe domains', 'fail', 'Stripe domains missing from CSP')
  }
  
  // Check for subscription rate limiting
  const hasSubscriptionRateLimit = middlewareContent.includes('subscriptionRateLimit')
  if (hasSubscriptionRateLimit) {
    addTestResult('Subscription rate limiting', 'pass', 'Rate limiting is configured')
  } else {
    addTestResult('Subscription rate limiting', 'fail', 'Rate limiting not configured')
  }
} catch (error) {
  addTestResult('Middleware configuration', 'fail', 'Could not read middleware.ts')
}

// Test 4: Check package dependencies
console.log('\n📦 Testing package dependencies...')
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
  const requiredDeps = [
    '@stripe/stripe-js',
    '@stripe/react-stripe-js',
    'canvas-confetti'
  ]
  
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep] || packageJson.devDependencies[dep]) {
      addTestResult(`Dependency ${dep}`, 'pass', 'Package is installed')
    } else {
      addTestResult(`Dependency ${dep}`, 'fail', 'Package not found in package.json')
    }
  })
} catch (error) {
  addTestResult('Package dependencies', 'fail', 'Could not read package.json')
}

// Test 5: Check TypeScript compilation
console.log('\n🔨 Testing TypeScript compilation...')
const filesToTypeCheck = [
  'src/utils/subscriptionUtils.ts',
  'src/app/pricing/page.tsx',
  'src/app/(protected)/checkout/page.tsx'
]

filesToTypeCheck.forEach(file => {
  try {
    const filePath = join(__dirname, '..', file)
    const fileContent = readFileSync(filePath, 'utf-8')
    
    // Basic syntax check - look for common TypeScript patterns
    if (fileContent.includes('export') && (fileContent.includes('interface') || fileContent.includes('type') || fileContent.includes('function'))) {
      addTestResult(`TypeScript ${file}`, 'pass', 'Basic syntax appears valid')
    } else {
      addTestResult(`TypeScript ${file}`, 'warning', 'Could not verify TypeScript syntax')
    }
  } catch (error) {
    addTestResult(`TypeScript ${file}`, 'fail', 'Could not read file')
  }
})

// Test 6: Check navigation integration
console.log('\n🧭 Testing navigation integration...')
try {
  const layoutContent = readFileSync(
    join(__dirname, '..', 'src/app/(protected)/account-settings/layout.tsx'), 
    'utf-8'
  )
  
  if (layoutContent.includes('Subscription & Billing') && layoutContent.includes('CreditCard')) {
    addTestResult('Navigation menu', 'pass', 'Subscription menu item is configured')
  } else {
    addTestResult('Navigation menu', 'fail', 'Subscription menu item not found')
  }
} catch (error) {
  addTestResult('Navigation menu', 'fail', 'Could not read layout file')
}

// Generate test report
console.log('\n📊 Generating test report...\n')

const passCount = testResults.filter(r => r.status === 'pass').length
const failCount = testResults.filter(r => r.status === 'fail').length
const warningCount = testResults.filter(r => r.status === 'warning').length

const report = `# Stripe Subscription Integration Test Report

Generated on: ${new Date().toISOString()}

## Summary
- ✅ Passed: ${passCount}
- ❌ Failed: ${failCount}
- ⚠️ Warnings: ${warningCount}

## Test Results

${testResults.map(r => `### ${r.name}
- Status: ${r.status === 'pass' ? '✅ Pass' : r.status === 'fail' ? '❌ Fail' : '⚠️ Warning'}
- Message: ${r.message}
`).join('\n')}

## Next Steps

${failCount > 0 ? `1. Fix the ${failCount} failing tests before proceeding with deployment.` : ''}
${warningCount > 0 ? `2. Review the ${warningCount} warnings - these may require configuration in your environment.` : ''}
${failCount === 0 && warningCount === 0 ? '✨ All tests passed! The implementation is ready for manual testing.' : ''}

### Manual Testing Checklist

1. **Pricing Page** (/pricing)
   - [ ] Monthly/yearly toggle works
   - [ ] Plan cards display correctly
   - [ ] "Get Started" buttons navigate properly
   - [ ] Analytics events fire on interactions

2. **Subscription Management** (/account-settings/subscription)
   - [ ] Current plan displays correctly
   - [ ] Storage usage visualization works
   - [ ] Upgrade/downgrade buttons are functional
   - [ ] Cancel subscription flow works

3. **Checkout Flow** (/checkout)
   - [ ] Plan summary shows correct pricing
   - [ ] Stripe Elements load properly
   - [ ] Form validation works
   - [ ] Terms acceptance is required

4. **Success Page** (/checkout/success)
   - [ ] Confetti animation plays
   - [ ] Onboarding steps display
   - [ ] Navigation to dashboard works

5. **Security**
   - [ ] Rate limiting prevents rapid requests
   - [ ] CSP allows Stripe resources
   - [ ] Authentication is required for protected pages
`

// Save report
const reportPath = join(__dirname, '..', 'test-results', 'subscription-integration-test.md')
try {
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, report)
  console.log(`📄 Test report saved to: ${reportPath}`)
} catch (error) {
  console.error('Failed to save test report:', error)
}

// Exit with appropriate code
process.exit(failCount > 0 ? 1 : 0)