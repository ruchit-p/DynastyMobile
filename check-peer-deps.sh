#!/bin/bash

echo "Checking for peer dependency warnings..."
echo "========================================="

# Run yarn install and capture warnings
yarn install 2>&1 | grep -E "warning.*peer|unmet peer" | grep -E "jest-expo|react-test-renderer|react-family-tree|tailwindcss-animate|@sentry/nextjs|react-native-phone-number-input|country-picker-modal" | sort | uniq

echo ""
echo "Summary of peer dependency issues:"
echo "========================================="

# List the specific packages mentioned in the user's query
echo "1. jest-expo and react-test-renderer issues:"
yarn install 2>&1 | grep -E "jest-expo.*react-test-renderer|react-test-renderer.*peer"

echo ""
echo "2. react-family-tree issues:"
yarn install 2>&1 | grep "react-family-tree"

echo ""
echo "3. tailwindcss-animate issues:"
yarn install 2>&1 | grep "tailwindcss-animate"

echo ""
echo "4. @sentry/nextjs and OpenTelemetry issues:"
yarn install 2>&1 | grep -E "@sentry/nextjs|OpenTelemetry|webpack-plugin"

echo ""
echo "5. react-native-phone-number-input and country picker issues:"
yarn install 2>&1 | grep -E "react-native-phone-number-input|country-picker-modal"