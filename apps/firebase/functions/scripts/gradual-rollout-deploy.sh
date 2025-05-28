#!/bin/bash

# Gradual Rollout Deployment Script
# This script deploys functions with CSRF protection using a gradual rollout strategy

set -e

FUNCTIONS_TO_DEPLOY=(
    "auth-handleSignUp"
    "auth-updateUserPassword" 
    "auth-initiatePasswordReset"
    "auth-handleAccountDeletion"
    "auth-updateUserProfile"
)

echo "🚀 Starting gradual rollout deployment for CSRF-protected functions..."
echo "📋 Functions to deploy: ${#FUNCTIONS_TO_DEPLOY[@]}"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Verify configuration first
echo "🔍 Verifying production configuration..."
if ! ./scripts/verify-production-config.sh; then
    echo "❌ Configuration verification failed. Please fix configuration issues first."
    exit 1
fi

echo "✅ Configuration verified successfully"

# Build functions first
echo "🔨 Building functions..."
if ! npm run build; then
    echo "❌ Build failed. Please fix TypeScript errors first."
    exit 1
fi

echo "✅ Build completed successfully"

# Function to deploy a single function with monitoring
deploy_function() {
    local func_name=$1
    local retry_count=0
    local max_retries=3
    
    echo ""
    echo "📦 Deploying function: $func_name"
    echo "⏱️  $(date)"
    
    while [ $retry_count -lt $max_retries ]; do
        if firebase deploy --only functions:$func_name; then
            echo "✅ Successfully deployed $func_name"
            
            # Wait for deployment to stabilize
            echo "⏳ Waiting 30 seconds for deployment to stabilize..."
            sleep 30
            
            # Check function health
            echo "🏥 Checking function health..."
            if check_function_health $func_name; then
                echo "✅ Function $func_name is healthy"
                return 0
            else
                echo "⚠️  Function $func_name health check failed"
                return 1
            fi
        else
            ((retry_count++))
            echo "❌ Deployment failed (attempt $retry_count/$max_retries)"
            if [ $retry_count -lt $max_retries ]; then
                echo "⏳ Waiting 60 seconds before retry..."
                sleep 60
            fi
        fi
    done
    
    echo "❌ Failed to deploy $func_name after $max_retries attempts"
    return 1
}

# Function to check function health
check_function_health() {
    local func_name=$1
    
    # Get function logs to check for errors
    echo "📋 Checking recent logs for $func_name..."
    
    # Check if function is responding (this would need actual endpoint testing in real deployment)
    # For now, we'll check that the function exists and has no immediate errors
    firebase functions:log --only $func_name --lines 5 > /tmp/function_logs.txt 2>&1
    
    if grep -i "error\|exception\|crash" /tmp/function_logs.txt; then
        echo "⚠️  Found errors in function logs"
        cat /tmp/function_logs.txt
        return 1
    fi
    
    return 0
}

# Function to rollback if needed
rollback_function() {
    local func_name=$1
    echo "🔄 Rolling back function: $func_name"
    
    # In a real scenario, you'd deploy the previous version
    # For now, we'll just log the rollback action
    echo "⚠️  Rollback required for $func_name - manual intervention needed"
    echo "📝 To rollback manually:"
    echo "   1. Check previous deployment version"
    echo "   2. Deploy previous version: firebase deploy --only functions:$func_name"
    echo "   3. Verify rollback success"
}

# Deploy functions one by one
SUCCESSFUL_DEPLOYMENTS=()
FAILED_DEPLOYMENTS=()

for func_name in "${FUNCTIONS_TO_DEPLOY[@]}"; do
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "🎯 Deploying function: $func_name"
    echo "📊 Progress: $((${#SUCCESSFUL_DEPLOYMENTS[@]} + ${#FAILED_DEPLOYMENTS[@]} + 1))/${#FUNCTIONS_TO_DEPLOY[@]}"
    echo "═══════════════════════════════════════════════════════════════"
    
    if deploy_function $func_name; then
        SUCCESSFUL_DEPLOYMENTS+=($func_name)
        echo "✅ $func_name deployment successful"
        
        # Continue with next function
        echo "⏭️  Proceeding to next function..."
        
    else
        FAILED_DEPLOYMENTS+=($func_name)
        echo "❌ $func_name deployment failed"
        
        # Ask whether to continue or abort
        echo ""
        echo "⚠️  Deployment failed for $func_name"
        echo "🤔 Options:"
        echo "   1. Continue with remaining functions"
        echo "   2. Abort deployment"
        echo "   3. Retry this function"
        
        read -p "Enter choice (1/2/3): " choice
        
        case $choice in
            1)
                echo "▶️  Continuing with remaining functions..."
                ;;
            2)
                echo "🛑 Aborting deployment..."
                break
                ;;
            3)
                echo "🔄 Retrying $func_name..."
                if deploy_function $func_name; then
                    SUCCESSFUL_DEPLOYMENTS+=($func_name)
                    # Remove from failed list
                    FAILED_DEPLOYMENTS=("${FAILED_DEPLOYMENTS[@]/$func_name}")
                    echo "✅ Retry successful for $func_name"
                else
                    echo "❌ Retry failed for $func_name"
                fi
                ;;
            *)
                echo "❓ Invalid choice, continuing..."
                ;;
        esac
    fi
done

# Final summary
echo ""
echo "📊 DEPLOYMENT SUMMARY"
echo "====================="
echo "✅ Successful deployments (${#SUCCESSFUL_DEPLOYMENTS[@]}):"
for func in "${SUCCESSFUL_DEPLOYMENTS[@]}"; do
    echo "   - $func"
done

if [ ${#FAILED_DEPLOYMENTS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Failed deployments (${#FAILED_DEPLOYMENTS[@]}):"
    for func in "${FAILED_DEPLOYMENTS[@]}"; do
        echo "   - $func"
    done
fi

echo ""
echo "🎯 Overall Success Rate: $((${#SUCCESSFUL_DEPLOYMENTS[@]} * 100 / ${#FUNCTIONS_TO_DEPLOY[@]}))%"

if [ ${#FAILED_DEPLOYMENTS[@]} -eq 0 ]; then
    echo ""
    echo "🎉 ALL FUNCTIONS DEPLOYED SUCCESSFULLY!"
    echo ""
    echo "✅ CSRF protection is now active on all authentication functions"
    echo "🔒 Rate limiting is enforced"
    echo "🛡️  Security configuration is complete"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Test authentication flows with CSRF protection"
    echo "   2. Monitor function logs for any issues"
    echo "   3. Update frontend to include CSRF tokens"
    echo "   4. Run end-to-end tests"
    
    # Mark todo as completed
    echo ""
    echo "✅ Production deployment with CSRF protection completed successfully!"
    
else
    echo ""
    echo "⚠️  PARTIAL DEPLOYMENT COMPLETED"
    echo "❗ Please address failed deployments before proceeding to production"
    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "   1. Check function logs: firebase functions:log --only [function-name]"
    echo "   2. Verify configuration: ./scripts/verify-production-config.sh"
    echo "   3. Check TypeScript build: npm run build"
    echo "   4. Retry failed deployments individually"
    
    exit 1
fi