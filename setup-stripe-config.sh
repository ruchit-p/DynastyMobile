#!/bin/bash

# Stripe Configuration Setup Script
# This script sets up a single JSON secret containing all Stripe product and price IDs

echo "Setting up Stripe configuration secret..."

# Check if stripe-config.json exists
if [ ! -f "stripe-config.json" ]; then
    echo "Error: stripe-config.json not found!"
    echo "Please ensure stripe-config.json exists in the current directory."
    exit 1
fi

# Set the Stripe configuration as a single JSON secret
echo "Creating STRIPE_CONFIG secret with all product and price IDs..."
firebase functions:secrets:set STRIPE_CONFIG < stripe-config.json

if [ $? -eq 0 ]; then
    echo "✅ Successfully set STRIPE_CONFIG secret!"
    echo ""
    echo "The following configuration has been stored:"
    echo "- Product IDs for all plans"
    echo "- Price IDs for all plans and addons"
    echo ""
    echo "Next steps:"
    echo "1. Update stripeProducts.ts to use the STRIPE_CONFIG secret"
    echo "2. Deploy your Firebase functions"
    echo "3. Configure webhook endpoint in Stripe Dashboard"
else
    echo "❌ Failed to set STRIPE_CONFIG secret"
    echo "Please check your Firebase authentication and try again"
    exit 1
fi