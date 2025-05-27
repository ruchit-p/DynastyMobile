#!/bin/bash

echo "Testing Signal Protocol Implementation..."
echo "======================================="

# Navigate to mobile directory
cd ../mobile

# Run the integration tests
echo "Running integration tests..."
npm test -- src/services/encryption/libsignal/__tests__/integration.test.ts --verbose

# Check if tests passed
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Signal Protocol tests passed!"
    
    # Run specific service tests
    echo ""
    echo "Running service-specific tests..."
    npm test -- src/services/encryption/libsignal/__tests__/LibsignalService.test.ts
    npm test -- src/services/encryption/libsignal/__tests__/KeyGenerationService.test.ts
    npm test -- src/services/encryption/libsignal/__tests__/SessionService.test.ts
    
    echo ""
    echo "✅ All Signal Protocol tests completed successfully!"
else
    echo ""
    echo "❌ Signal Protocol tests failed. Please check the errors above."
    exit 1
fi