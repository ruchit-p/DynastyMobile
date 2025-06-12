#!/bin/bash

# Setup AWS SES SNS Topics for Dynasty Email Compliance
# Compatible with both bash and zsh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get AWS account ID and region
echo -e "${BLUE}Getting AWS account information...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

if [ -z "$REGION" ]; then
    echo -e "${YELLOW}No default region set. Please specify region:${NC}"
    read -p "Enter AWS region (e.g., us-east-1, us-west-2): " REGION
fi

echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"
echo -e "${GREEN}Region: $REGION${NC}"
echo ""

# Function to create SNS topic and set permissions
create_topic_with_permissions() {
    local topic_name=$1
    local description=$2
    
    echo -e "${BLUE}Creating SNS topic: $topic_name${NC}"
    
    # Create the topic
    TOPIC_ARN=$(aws sns create-topic --name "$topic_name" --query TopicArn --output text)
    echo -e "${GREEN}✓ Created topic: $TOPIC_ARN${NC}"
    
    # Set topic attributes for better delivery
    aws sns set-topic-attributes \
        --topic-arn "$TOPIC_ARN" \
        --attribute-name DisplayName \
        --attribute-value "$description"
    
    # Create policy document for SES to publish to SNS
    POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ses.amazonaws.com"
      },
      "Action": "SNS:Publish",
      "Resource": "$TOPIC_ARN",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "$ACCOUNT_ID"
        }
      }
    }
  ]
}
EOF
)
    
    # Set the policy
    aws sns set-topic-attributes \
        --topic-arn "$TOPIC_ARN" \
        --attribute-name Policy \
        --attribute-value "$POLICY_DOC"
    
    echo -e "${GREEN}✓ Set permissions for SES to publish to topic${NC}"
    echo "$TOPIC_ARN"
}

# Function to add event destination to configuration set
add_event_destination() {
    local config_set=$1
    local dest_name=$2
    local event_type=$3
    local topic_arn=$4
    
    echo -e "${BLUE}Adding $event_type event destination to $config_set...${NC}"
    
    aws ses create-configuration-set-event-destination \
        --configuration-set-name "$config_set" \
        --event-destination \
        Name="$dest_name",Enabled=true,MatchingEventTypes="$event_type",SNSDestination="{TopicARN=$topic_arn}" \
        2>/dev/null || echo -e "${YELLOW}Event destination $dest_name may already exist${NC}"
    
    echo -e "${GREEN}✓ Added $event_type event destination${NC}"
}

echo -e "${YELLOW}=== Creating SNS Topics for Dynasty Email Compliance ===${NC}"
echo ""

# Production Environment (dynastyprod)
echo -e "${YELLOW}=== Setting up PRODUCTION environment (dynastyprod) ===${NC}"

BOUNCE_TOPIC_PROD=$(create_topic_with_permissions "dynasty-ses-bounces-prod" "Dynasty SES Bounce Events - Production")
echo ""

COMPLAINT_TOPIC_PROD=$(create_topic_with_permissions "dynasty-ses-complaints-prod" "Dynasty SES Complaint Events - Production")
echo ""

DELIVERY_TOPIC_PROD=$(create_topic_with_permissions "dynasty-ses-deliveries-prod" "Dynasty SES Delivery Events - Production")
echo ""

echo -e "${YELLOW}=== Configuring SES Event Destinations for dynastyprod ===${NC}"
add_event_destination "dynastyprod" "bounce-events" "bounce" "$BOUNCE_TOPIC_PROD"
add_event_destination "dynastyprod" "complaint-events" "complaint" "$COMPLAINT_TOPIC_PROD"
add_event_destination "dynastyprod" "delivery-events" "delivery" "$DELIVERY_TOPIC_PROD"
echo ""

# Test Environment (dynastytest)
echo -e "${YELLOW}=== Setting up TEST environment (dynastytest) ===${NC}"

BOUNCE_TOPIC_TEST=$(create_topic_with_permissions "dynasty-ses-bounces-test" "Dynasty SES Bounce Events - Test")
echo ""

COMPLAINT_TOPIC_TEST=$(create_topic_with_permissions "dynasty-ses-complaints-test" "Dynasty SES Complaint Events - Test")
echo ""

DELIVERY_TOPIC_TEST=$(create_topic_with_permissions "dynasty-ses-deliveries-test" "Dynasty SES Delivery Events - Test")
echo ""

echo -e "${YELLOW}=== Configuring SES Event Destinations for dynastytest ===${NC}"
add_event_destination "dynastytest" "bounce-events" "bounce" "$BOUNCE_TOPIC_TEST"
add_event_destination "dynastytest" "complaint-events" "complaint" "$COMPLAINT_TOPIC_TEST"
add_event_destination "dynastytest" "delivery-events" "delivery" "$DELIVERY_TOPIC_TEST"
echo ""

# Local Environment (dynastylocal)
echo -e "${YELLOW}=== Setting up LOCAL environment (dynastylocal) ===${NC}"

BOUNCE_TOPIC_LOCAL=$(create_topic_with_permissions "dynasty-ses-bounces-local" "Dynasty SES Bounce Events - Local")
echo ""

COMPLAINT_TOPIC_LOCAL=$(create_topic_with_permissions "dynasty-ses-complaints-local" "Dynasty SES Complaint Events - Local")
echo ""

DELIVERY_TOPIC_LOCAL=$(create_topic_with_permissions "dynasty-ses-deliveries-local" "Dynasty SES Delivery Events - Local")
echo ""

echo -e "${YELLOW}=== Configuring SES Event Destinations for dynastylocal ===${NC}"
add_event_destination "dynastylocal" "bounce-events" "bounce" "$BOUNCE_TOPIC_LOCAL"
add_event_destination "dynastylocal" "complaint-events" "complaint" "$COMPLAINT_TOPIC_LOCAL"
add_event_destination "dynastylocal" "delivery-events" "delivery" "$DELIVERY_TOPIC_LOCAL"
echo ""

# Verify setup
echo -e "${YELLOW}=== Verifying Configuration Sets ===${NC}"
for CONFIG_SET in "dynastyprod" "dynastytest" "dynastylocal"; do
    echo -e "${BLUE}Configuration Set: $CONFIG_SET${NC}"
    aws ses describe-configuration-set --configuration-set-name "$CONFIG_SET" --query 'ConfigurationSet.Name' --output text
    
    echo -e "${BLUE}Event Destinations:${NC}"
    aws ses describe-configuration-set --configuration-set-name "$CONFIG_SET" \
        --query 'EventDestinations[*].{Name:Name,Events:MatchingEventTypes,Enabled:Enabled}' \
        --output table
    echo ""
done

# Display summary
echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Created SNS Topics:${NC}"
echo -e "${GREEN}Production Environment:${NC}"
echo "  Bounces:    $BOUNCE_TOPIC_PROD"
echo "  Complaints: $COMPLAINT_TOPIC_PROD"
echo "  Deliveries: $DELIVERY_TOPIC_PROD"
echo ""

echo -e "${GREEN}Test Environment:${NC}"
echo "  Bounces:    $BOUNCE_TOPIC_TEST"
echo "  Complaints: $COMPLAINT_TOPIC_TEST"
echo "  Deliveries: $DELIVERY_TOPIC_TEST"
echo ""

echo -e "${GREEN}Local Environment:${NC}"
echo "  Bounces:    $BOUNCE_TOPIC_LOCAL"
echo "  Complaints: $COMPLAINT_TOPIC_LOCAL"
echo "  Deliveries: $DELIVERY_TOPIC_LOCAL"
echo ""

echo -e "${YELLOW}Configuration Sets Updated:${NC}"
echo -e "${GREEN}✓ dynastyprod${NC}"
echo -e "${GREEN}✓ dynastytest${NC}"
echo -e "${GREEN}✓ dynastylocal${NC}"

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Update your Firebase Function environment variables with the topic ARNs if needed"
echo "2. Test email sending to verify events are being published to SNS"
echo "3. Monitor your webhook endpoints to ensure they're receiving events"
echo ""
echo -e "${GREEN}Your email compliance monitoring is now fully configured! 🎉${NC}"