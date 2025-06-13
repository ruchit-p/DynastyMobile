#!/bin/bash

# Add SNS permissions to ses-admin user for email compliance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Adding SNS permissions to ses-admin user...${NC}"

# Create SNS policy for email compliance
SNS_POLICY_DOC=$(cat <<'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "sns:CreateTopic",
                "sns:DeleteTopic",
                "sns:SetTopicAttributes",
                "sns:GetTopicAttributes",
                "sns:ListTopics",
                "sns:ListTopicsByName",
                "sns:Subscribe",
                "sns:Unsubscribe",
                "sns:Publish"
            ],
            "Resource": [
                "arn:aws:sns:*:*:dynasty-ses-*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "sns:ListTopics"
            ],
            "Resource": "*"
        }
    ]
}
EOF
)

# Create the policy
echo -e "${BLUE}Creating SNS policy for Dynasty email compliance...${NC}"
aws iam create-policy \
    --policy-name DynastySNSEmailCompliancePolicy \
    --policy-document "$SNS_POLICY_DOC" \
    --description "SNS permissions for Dynasty email compliance monitoring" \
    2>/dev/null || echo -e "${YELLOW}Policy may already exist${NC}"

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Attach the policy to ses-admin user
echo -e "${BLUE}Attaching SNS policy to ses-admin user...${NC}"
aws iam attach-user-policy \
    --user-name ses-admin \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/DynastySNSEmailCompliancePolicy"

echo -e "${GREEN}✓ SNS permissions added to ses-admin user${NC}"

# List current policies for verification
echo -e "${BLUE}Current policies attached to ses-admin:${NC}"
aws iam list-attached-user-policies --user-name ses-admin --output table

echo ""
echo -e "${GREEN}Setup complete! You can now run the SNS topics creation script.${NC}"
echo -e "${BLUE}Run: ./scripts/setup-ses-sns-topics-simple.sh${NC}"