#!/bin/bash

# Script to set R2 secrets in Firebase (Gen 2)
# Usage: ./scripts/set-r2-secrets.sh

echo "Setting R2 configuration in Firebase..."
echo ""
echo "You'll need to provide your R2 credentials in JSON format."
echo "Format: {\"accountId\":\"...\",\"accessKeyId\":\"...\",\"secretAccessKey\":\"...\"}"
echo ""

# Check if R2 credentials are provided as argument
if [ -n "$1" ]; then
    R2_CONFIG_JSON="$1"
else
    echo "Please enter your R2 configuration JSON:"
    read -r R2_CONFIG_JSON
fi

# Validate JSON format
if ! echo "$R2_CONFIG_JSON" | jq . >/dev/null 2>&1; then
    echo "Error: Invalid JSON format. Please ensure your configuration is valid JSON."
    echo "Example: {\"accountId\":\"xxx\",\"accessKeyId\":\"yyy\",\"secretAccessKey\":\"zzz\"}"
    exit 1
fi

# Set the bundled secret
echo ""
echo "Setting R2_CONFIG secret..."
echo "$R2_CONFIG_JSON" | firebase functions:secrets:set R2_CONFIG

echo ""
echo "R2 configuration has been set. You can verify it with:"
echo "firebase functions:secrets:access R2_CONFIG"
echo ""
echo "Note: This bundled approach saves costs compared to individual secrets."
echo "You're now using 1 secret instead of 3, saving $0.80/month!"