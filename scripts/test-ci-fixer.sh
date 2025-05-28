#!/bin/bash

# Test script for CI/CD Auto-Fix workflow

echo "🧪 Testing CI/CD Auto-Fix workflow..."

# Create a test file with intentional errors
TEST_FILE="test-ci-errors.ts"
cat > $TEST_FILE << 'EOF'
// Intentional errors for testing
const unusedVariable = 42;
const data: any = { name: "test" };

export function testFunction(param: any): any {
  console.log("Missing semicolon")
  return param
}

// React component with missing dependency
import { useEffect, useState } from 'react';

export function TestComponent() {
  const [count, setCount] = useState(0);
  const [multiplier] = useState(2);
  
  useEffect(() => {
    console.log(count * multiplier);
  }, [count]); // Missing 'multiplier' dependency
  
  return <div>{count}</div>;
}
EOF

echo "✅ Created test file with errors: $TEST_FILE"
echo ""
echo "Errors introduced:"
echo "  - Unused variable"
echo "  - 'any' type usage"
echo "  - Missing semicolons"
echo "  - Missing React Hook dependency"
echo ""
echo "To test the fixer, run:"
echo "  ./scripts/claude-fix-ci-errors.sh --branch \$(git branch --show-current)"
echo ""
echo "Or use the TypeScript version:"
echo "  npx ts-node scripts/claude-ci-fixer.ts --branch \$(git branch --show-current)"
echo ""
echo "When done testing, remove with: rm $TEST_FILE"