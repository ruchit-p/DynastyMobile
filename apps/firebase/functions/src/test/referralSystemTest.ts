/**
 * Referral System Integration Test
 *
 * This test validates that the referral system integration is working correctly
 * by testing the key components without requiring actual Firebase setup.
 */

import {ReferralService} from "../services/referralService";
import {StorageCalculationService} from "../services/storageCalculationService";
import {REFERRAL_CONFIG, STORAGE_ALLOCATIONS} from "../config/stripeProducts";

export async function validateReferralSystemIntegration(): Promise<{
  success: boolean;
  errors: string[];
  validations: string[];
}> {
  const errors: string[] = [];
  const validations: string[] = [];

  try {
    // 1. Validate ReferralService can be instantiated
    const referralService = new ReferralService();
    validations.push("✅ ReferralService instantiated successfully");

    // 2. Validate StorageCalculationService can be instantiated
    const storageService = new StorageCalculationService();
    validations.push("✅ StorageCalculationService instantiated successfully");

    // 3. Validate referral configuration is correct
    if (REFERRAL_CONFIG.storagePerReferralGB === 1) {
      validations.push("✅ Referral storage bonus configured: 1GB per referral");
    } else {
      errors.push("❌ Incorrect referral storage bonus amount");
    }

    if (REFERRAL_CONFIG.maxReferrals === 50) {
      validations.push("✅ Maximum referrals configured: 50 referrals");
    } else {
      errors.push("❌ Incorrect maximum referrals limit");
    }

    if (REFERRAL_CONFIG.referralExpirationDays === 90) {
      validations.push("✅ Referral expiration configured: 90 days");
    } else {
      errors.push("❌ Incorrect referral expiration period");
    }

    // 4. Validate storage allocation limits for each plan
    const freeLimit = STORAGE_ALLOCATIONS.free.maxReferralBonusGB;
    const individualLimit = STORAGE_ALLOCATIONS.individual.plus.maxReferralBonusGB;
    const family25TBLimit = STORAGE_ALLOCATIONS.family.family_2_5tb.maxReferralBonusGB;
    const family75TBLimit = STORAGE_ALLOCATIONS.family.family_7_5tb.maxReferralBonusGB;
    const family12TBLimit = STORAGE_ALLOCATIONS.family.family_12tb.maxReferralBonusGB;

    if (freeLimit === 5 && individualLimit === 25 && family25TBLimit === 100 &&
        family75TBLimit === 200 && family12TBLimit === 300) {
      validations.push("✅ All plan referral bonus limits configured correctly");
    } else {
      errors.push("❌ Incorrect referral bonus limits for one or more plans");
    }

    // 5. Validate method signatures and interfaces
    if (typeof referralService.generateReferralCode === "function") {
      validations.push("✅ generateReferralCode method exists");
    } else {
      errors.push("❌ generateReferralCode method missing");
    }

    if (typeof referralService.validateReferralCode === "function") {
      validations.push("✅ validateReferralCode method exists");
    } else {
      errors.push("❌ validateReferralCode method missing");
    }

    if (typeof referralService.createReferral === "function") {
      validations.push("✅ createReferral method exists");
    } else {
      errors.push("❌ createReferral method missing");
    }

    if (typeof referralService.completeReferral === "function") {
      validations.push("✅ completeReferral method exists");
    } else {
      errors.push("❌ completeReferral method missing");
    }

    if (typeof storageService.calculateUserStorage === "function") {
      validations.push("✅ calculateUserStorage method exists");
    } else {
      errors.push("❌ calculateUserStorage method missing");
    }

    // 6. Test that no circular dependencies exist (can instantiate both services)
    try {
      const referralService2 = new ReferralService();
      const storageService2 = new StorageCalculationService();
      // Verify both services exist
      if (referralService2 && storageService2) {
        validations.push("✅ No circular dependency detected - both services instantiate independently");
      }
    } catch (error) {
      errors.push("❌ Circular dependency still exists");
    }

    return {
      success: errors.length === 0,
      errors,
      validations,
    };
  } catch (error) {
    errors.push(`❌ Critical error during validation: ${error}`);
    return {
      success: false,
      errors,
      validations,
    };
  }
}

// Export test function for use in other contexts
export {validateReferralSystemIntegration as testReferralSystem};
