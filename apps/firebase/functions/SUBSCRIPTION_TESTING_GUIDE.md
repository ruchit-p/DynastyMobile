# Dynasty Subscription System Testing Guide

This guide provides comprehensive documentation for testing the Dynasty Subscription System, including automated test execution, performance validation, and deployment readiness checks.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Automation Scripts](#test-automation-scripts)
3. [Test Categories](#test-categories)
4. [Performance Testing](#performance-testing)
5. [Security Testing](#security-testing)
6. [Integration with Development Workflow](#integration-with-development-workflow)
7. [CI/CD Integration](#cicd-integration)
8. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

Ensure you're in the Firebase functions directory:

```bash
cd apps/firebase/functions
```

### Basic Test Execution

1. **Quick Development Tests** (30 seconds):

   ```bash
   ./scripts/quick-test-subscription.sh
   ```

2. **Full Test Suite** (5-10 minutes):

   ```bash
   ./scripts/test-subscription-system.sh
   ```

3. **Performance Tests Only**:
   ```bash
   npm test -- --config=jest.subscription.config.js --testPathPattern="performance"
   ```

## Test Automation Scripts

### Main Test Script: `test-subscription-system.sh`

Comprehensive test execution script that runs all test categories:

```bash
# Full test suite
./scripts/test-subscription-system.sh

# Skip performance tests (faster execution)
./scripts/test-subscription-system.sh --skip-performance
```

**Features:**

- ✅ TypeScript compilation check
- ✅ ESLint validation
- ✅ Unit tests for all services
- ✅ Integration tests
- ✅ Security validation tests
- ✅ Performance and load tests
- ✅ Coverage reporting (80% threshold)
- ✅ Deployment readiness validation

### Quick Test Script: `quick-test-subscription.sh`

Rapid feedback for development:

```bash
./scripts/quick-test-subscription.sh
```

**Features:**

- ⚡ Essential service tests only
- ⚡ Quick TypeScript check
- ⚡ Core security tests
- ⚡ 30-second execution time

### Custom Jest Configuration

Use the specialized subscription testing configuration:

```bash
# Run with subscription-specific Jest config
npm test -- --config=jest.subscription.config.js

# Run specific test categories
npm test -- --config=jest.subscription.config.js --testPathPattern="services|webhooks"
```

## Test Categories

### 1. Unit Tests (`src/**/__tests__/services/`)

Test individual services in isolation:

```bash
# All service tests
npm test -- --testPathPattern="services.*test.ts"

# Specific service
npm test -- --testPathPattern="stripeService.test.ts"
npm test -- --testPathPattern="subscriptionService.test.ts"
```

**Coverage:**

- StripeService: Customer creation, checkout sessions, subscription management
- SubscriptionService: Subscription lifecycle, family plans, storage calculations
- WebhookHandler: Event processing, signature validation, error handling

### 2. Integration Tests (`src/**/__tests__/integration/`)

Test complete subscription flows:

```bash
npm test -- --testPathPattern="integration.*test.ts"
```

**Scenarios:**

- End-to-end subscription creation
- Payment failure handling
- Plan upgrades and downgrades
- Family member management
- Webhook event processing chains

### 3. Security Tests (`src/**/__tests__/security/`)

Validate security measures:

```bash
npm test -- --testPathPattern="security.*test.ts"
```

**Security Areas:**

- Authentication and authorization
- Input validation and sanitization
- Rate limiting
- Webhook signature verification
- Data access controls
- Error message sanitization

### 4. Performance Tests (`src/**/__tests__/performance/`)

Load and performance validation:

```bash
# Standard performance tests
npm test -- --testPathPattern="subscriptionPerformance.test.ts"

# Real-world load tests
npm test -- --testPathPattern="realWorldLoadTest.test.ts" --testTimeout=120000
```

**Performance Scenarios:**

- Concurrent checkout sessions (50+ simultaneous)
- Webhook burst processing (100+ events)
- Database performance under load
- Memory usage monitoring
- Cold start measurement

## Performance Testing

### Load Testing Utilities

The performance testing framework includes comprehensive utilities:

```typescript
import { LoadTestExecutor, MemoryMonitor, PerformanceAssertions } from '../utils/loadTestUtils';

// Example usage
const loadTester = new LoadTestExecutor();
const result = await loadTester.executeLoadTest(operationFactory, {
  concurrency: 25,
  totalOperations: 500,
  warmupOperations: 20,
});

// Validate performance
PerformanceAssertions.assertOperationsPerSecond(result, 20);
PerformanceAssertions.assertErrorRate(result, 5);
```

### Performance Benchmarks

| Metric                   | Minimum Requirement | Optimal Target |
| ------------------------ | ------------------- | -------------- |
| Operations/Second        | 15 ops/sec          | 30+ ops/sec    |
| 95th Percentile Response | <1000ms             | <500ms         |
| Error Rate               | <10%                | <2%            |
| Memory Usage             | <512MB              | <256MB         |

### Real-World Scenarios

The load testing suite includes production-like scenarios:

1. **Production Traffic Simulation**: Mixed individual/family plans
2. **Black Friday Surge**: High-intensity burst traffic
3. **Mixed Workload**: 50% checkouts, 25% queries, 15% webhooks, 10% updates
4. **Stress Testing**: Extreme concurrent load (100+ operations)
5. **Failure Recovery**: Testing system resilience

## Security Testing

### Security Validation Areas

1. **Authentication Security**:

   - Unauthenticated request rejection
   - Valid authentication requirements
   - User ownership validation

2. **Authorization Security**:

   - Family plan ownership enforcement
   - Subscription modification permissions
   - Cross-user data access prevention

3. **Input Validation**:

   - Malicious input sanitization
   - Parameter validation
   - Path traversal prevention

4. **Rate Limiting**:

   - Checkout creation limits
   - Subscription modification throttling
   - Admin bypass functionality

5. **Webhook Security**:
   - Signature verification
   - Replay attack prevention
   - Missing header handling

### Running Security Tests

```bash
# All security tests
npm test -- --testPathPattern="security"

# Specific security areas
npm test -- --testNamePattern="Authentication"
npm test -- --testNamePattern="Input Validation"
```

## Integration with Development Workflow

### Git Hooks Integration

The test automation integrates with Dynasty's existing git hooks:

```bash
# Pre-commit hook (add to .git/hooks/pre-commit)
#!/bin/bash
cd apps/firebase/functions
./scripts/quick-test-subscription.sh
```

### Pre-Deployment Validation

Before deploying to production:

```bash
# Full validation
./scripts/test-subscription-system.sh

# Check deployment readiness
echo $? # Should be 0 for successful deployment
```

### Development Workflow

1. **During Development**:

   ```bash
   ./scripts/quick-test-subscription.sh
   ```

2. **Before PR Creation**:

   ```bash
   ./scripts/test-subscription-system.sh
   ```

3. **Before Production Deployment**:
   ```bash
   ./scripts/test-subscription-system.sh
   # Review test results in ./test-results/
   # Check coverage report at ./coverage/combined/index.html
   ```

## CI/CD Integration

### Manual Deployment Process

Since Dynasty uses manual deployment, integrate testing into the deployment process:

```bash
# 1. Run comprehensive tests
./scripts/test-subscription-system.sh

# 2. Review results
open ./test-results/subscription-test-report.html
open ./coverage/combined/index.html

# 3. Deploy if tests pass
firebase deploy --only functions
```

### Test Results and Reporting

Test results are generated in multiple formats:

```bash
test-results/
├── unit-test-results.xml          # JUnit format
├── integration-test-results.xml   # JUnit format
├── security-test-results.xml      # JUnit format
├── performance-test-results.xml   # JUnit format
├── subscription-test-report.html  # HTML report
├── unit-tests.log                 # Detailed logs
├── integration-tests.log          # Detailed logs
├── security-tests.log             # Detailed logs
└── performance-tests.log          # Detailed logs

coverage/
├── unit/                          # Unit test coverage
├── integration/                   # Integration test coverage
└── combined/                      # Combined coverage report
    └── index.html                 # Main coverage report
```

### Environment Configuration

The testing system validates required environment variables:

```bash
# Required for subscription system
STRIPE_SECRET_KEY=sk_test_...
EMAIL_PROVIDER=ses
SES_CONFIG={"region":"us-east-1",...}
R2_CONFIG={"bucketName":"dynastytest",...}
FRONTEND_URL=http://localhost:3000
```

## Troubleshooting

### Common Issues

1. **TypeScript Compilation Errors**:

   ```bash
   # Check for type errors
   npx tsc --noEmit

   # Fix common issues
   npm run lint:fix
   ```

2. **Test Timeouts**:

   ```bash
   # Increase timeout for performance tests
   npm test -- --testTimeout=300000  # 5 minutes
   ```

3. **Memory Issues**:

   ```bash
   # Monitor memory usage
   node --expose-gc --max-old-space-size=4096 $(which npm) test
   ```

4. **Firebase Connection Issues**:
   ```bash
   # Ensure emulator variables are set
   export FUNCTIONS_EMULATOR=true
   export FIRESTORE_EMULATOR_HOST=localhost:8080
   ```

### Performance Issues

If performance tests fail:

1. **Check System Resources**:

   ```bash
   # Monitor CPU and memory
   top -p $(pgrep -f jest)
   ```

2. **Reduce Concurrency**:

   ```bash
   # Run with fewer concurrent operations
   npm test -- --maxWorkers=2
   ```

3. **Skip Performance Tests**:
   ```bash
   # For development, skip performance tests
   ./scripts/test-subscription-system.sh --skip-performance
   ```

### Debugging Test Failures

1. **Verbose Output**:

   ```bash
   npm test -- --verbose --no-coverage
   ```

2. **Single Test File**:

   ```bash
   npm test -- stripeService.test.ts --verbose
   ```

3. **Specific Test Case**:
   ```bash
   npm test -- --testNamePattern="should create checkout session"
   ```

### Test Data Cleanup

If tests leave behind test data:

```bash
# Clean test results
rm -rf test-results coverage

# Reset test environment
npm run clean  # If available in package.json
```

## Best Practices

### Test Development

1. **Use the Test Environment**:

   ```typescript
   import { StripeTestEnvironment } from '../utils/testHelpers';
   const testEnv = new StripeTestEnvironment();
   ```

2. **Mock External Services**:

   ```typescript
   testEnv.mockStripeClient.customers.create.mockResolvedValue(mockCustomer);
   ```

3. **Use Performance Assertions**:
   ```typescript
   PerformanceAssertions.assertWithinTimeLimit(operation, 1000);
   ```

### Continuous Improvement

1. **Monitor Performance Trends**:

   - Track performance metrics over time
   - Set up alerts for degradation
   - Review baseline performance regularly

2. **Update Test Coverage**:

   - Add tests for new features
   - Maintain 80%+ coverage threshold
   - Focus on critical subscription paths

3. **Security Testing Updates**:
   - Add new attack scenarios
   - Update validation rules
   - Test against latest threats

## Support

For issues with the testing system:

1. **Check Logs**: Review test logs in `./test-results/`
2. **Performance Issues**: Monitor system resources during test execution
3. **Coverage Issues**: Review coverage report and add missing tests
4. **Security Concerns**: Ensure all security tests pass before deployment

The test automation system is designed to provide comprehensive validation of the Dynasty Subscription System while integrating seamlessly with the existing manual deployment workflow.
