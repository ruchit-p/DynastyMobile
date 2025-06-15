#!/bin/bash

# Stripe Secrets Setup Script
# Run this script to configure all Stripe secrets in Firebase

echo "Setting up Stripe secrets for Firebase Functions..."

# API Keys - REPLACE THESE WITH YOUR ACTUAL KEYS
echo "Setting Stripe API keys..."
# firebase functions:secrets:set STRIPE_SECRET_KEY="sk_live_YOUR_SECRET_KEY"
# firebase functions:secrets:set STRIPE_PUBLISHABLE_KEY="pk_live_YOUR_PUBLISHABLE_KEY"
# firebase functions:secrets:set STRIPE_WEBHOOK_SECRET="whsec_YOUR_WEBHOOK_SECRET"

# Product IDs
echo "Setting Stripe Product IDs..."
firebase functions:secrets:set STRIPE_PRODUCT_FREE="prod_STTujqN4OfWiE8"
firebase functions:secrets:set STRIPE_PRODUCT_INDIVIDUAL_PLUS="prod_STTtdOmm3OjPxQ"
firebase functions:secrets:set STRIPE_PRODUCT_FAMILY_2_5TB="prod_STTvKJTt5QhTt9"
firebase functions:secrets:set STRIPE_PRODUCT_FAMILY_7_5TB="prod_STVDPTdGGXWqhD"
firebase functions:secrets:set STRIPE_PRODUCT_FAMILY_12TB="prod_STVGxk4sOSLsw2"

# Addon Product IDs (all use the same base product)
firebase functions:secrets:set STRIPE_PRODUCT_ADDON_1TB="prod_STV4aalNPp3LEM"
firebase functions:secrets:set STRIPE_PRODUCT_ADDON_2TB="prod_STV4aalNPp3LEM"
firebase functions:secrets:set STRIPE_PRODUCT_ADDON_5TB="prod_STV4aalNPp3LEM"
firebase functions:secrets:set STRIPE_PRODUCT_ADDON_20TB="prod_STV4aalNPp3LEM"

# Price IDs
echo "Setting Stripe Price IDs..."

# Free Plan
firebase functions:secrets:set STRIPE_PRICE_FREE="price_1RYWwWDPvUT1MYwpDn5s9ArJ"

# Individual Plan
firebase functions:secrets:set STRIPE_PRICE_INDIVIDUAL_PLUS_MONTHLY="price_1RYWvPDPvUT1MYwpIiPxdSt7"
# firebase functions:secrets:set STRIPE_PRICE_INDIVIDUAL_PLUS_YEARLY="price_YOUR_YEARLY_ID"

# Family Plans
firebase functions:secrets:set STRIPE_PRICE_FAMILY_2_5TB_MONTHLY="price_1RYWxlDPvUT1MYwpYS8Gg7lU"
firebase functions:secrets:set STRIPE_PRICE_FAMILY_7_5TB_MONTHLY="price_1RYYCvDPvUT1MYwpIQhrdSJE"
firebase functions:secrets:set STRIPE_PRICE_FAMILY_12TB_MONTHLY="price_1RYYGCDPvUT1MYwpH9O3tl8o"

# Storage Add-ons
firebase functions:secrets:set STRIPE_PRICE_ADDON_1TB_MONTHLY="price_1RYY4lDPvUT1MYwpDvLASC1f"
firebase functions:secrets:set STRIPE_PRICE_ADDON_2TB_MONTHLY="price_1RYYBGDPvUT1MYwpASLCGE5I"
firebase functions:secrets:set STRIPE_PRICE_ADDON_5TB_MONTHLY="price_1RYYBGDPvUT1MYwpLoYHJTyf"
firebase functions:secrets:set STRIPE_PRICE_ADDON_20TB_MONTHLY="price_1RYYBGDPvUT1MYwpGIPPZhLa"

echo "Stripe secrets setup complete!"
echo ""
echo "IMPORTANT: Don't forget to:"
echo "1. Uncomment and set your actual Stripe API keys (lines 8-10)"
echo "2. Create yearly prices in Stripe if you want to offer annual billing"
echo "3. Configure your webhook endpoint in the Stripe Dashboard"
echo "4. Update your web app's .env.production with NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"