#!/bin/bash

echo "Testing R2 Integration with Firebase Emulator..."
echo ""

# Test 1: Test R2 Integration
echo "1. Testing R2 configuration..."
curl -X POST http://127.0.0.1:5001/dynasty-eba63/us-central1/testR2Integration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-id" \
  -d '{"data": {}}' | python3 -m json.tool

echo ""
echo "2. Testing R2 vault upload URL generation..."
curl -X POST http://127.0.0.1:5001/dynasty-eba63/us-central1/getVaultUploadSignedUrlR2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-id" \
  -d '{"data": {"fileName": "test-document.pdf", "fileType": "application/pdf", "parentId": null}}' | python3 -m json.tool

echo ""
echo "✅ R2 Integration tests completed!"