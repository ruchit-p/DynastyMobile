#!/bin/bash

# Fix TypeScript issues in test files

# Add acceptsStreaming to createRequest helpers
find src/__tests__ -name "*comprehensive*.test.ts" -o -name "*edge-cases*.test.ts" | while read file; do
  echo "Fixing $file..."
  
  # Fix createRequest helper to include acceptsStreaming
  sed -i '' 's/rawRequest: { ip: '\''127\.0\.0\.1'\'' },$/rawRequest: { ip: '\''127.0.0.1'\'' },\n  acceptsStreaming: false,/g' "$file"
  
  # Remove unused imports
  sed -i '' '/import.*wrapped.*from.*firebase-functions-test/d' "$file"
  
  # Fix PermissionLevel import if it's not used
  if ! grep -q "PermissionLevel\." "$file"; then
    sed -i '' 's/import { PermissionLevel } from/\/\/ import { PermissionLevel } from/g' "$file"
  fi
done

echo "TypeScript issues fixed!"