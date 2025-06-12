#!/bin/bash

# Setup AWS SES SNS Topics for Dynasty Email Compliance
# This script creates SNS topics and configures SES event destinations
# for dynastytest, dynastyprod, and dynastylocal configuration sets

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

# Arrays to store topic ARNs
declare -A BOUNCE_TOPICS
declare -A COMPLAINT_TOPICS
declare -A DELIVERY_TOPICS

# Create topics for each environment
ENVIRONMENTS=("prod" "test" "local")
CONFIG_SETS=("dynastyprod" "dynastytest" "dynastylocal")

for i in "${!ENVIRONMENTS[@]}"; do
    ENV="${ENVIRONMENTS[$i]}"
    CONFIG_SET="${CONFIG_SETS[$i]}"
    
    echo -e "${YELLOW}=== Setting up $ENV environment ($CONFIG_SET) ===${NC}"
    
    # Create bounce topic
    BOUNCE_TOPICS[$ENV]=$(create_topic_with_permissions \
        "dynasty-ses-bounces-$ENV" \
        "Dynasty SES Bounce Events - $ENV")
    echo ""
    
    # Create complaint topic
    COMPLAINT_TOPICS[$ENV]=$(create_topic_with_permissions \
        "dynasty-ses-complaints-$ENV" \
        "Dynasty SES Complaint Events - $ENV")
    echo ""
    
    # Create delivery topic
    DELIVERY_TOPICS[$ENV]=$(create_topic_with_permissions \
        "dynasty-ses-deliveries-$ENV" \
        "Dynasty SES Delivery Events - $ENV")
    echo ""
    
    echo -e "${YELLOW}=== Configuring SES Event Destinations for $CONFIG_SET ===${NC}"
    
    # Add event destinations to configuration set
    add_event_destination "$CONFIG_SET" "bounce-events" "bounce" "${BOUNCE_TOPICS[$ENV]}"
    add_event_destination "$CONFIG_SET" "complaint-events" "complaint" "${COMPLAINT_TOPICS[$ENV]}"
    add_event_destination "$CONFIG_SET" "delivery-events" "delivery" "${DELIVERY_TOPICS[$ENV]}"
    
    echo ""
done

# Verify setup
echo -e "${YELLOW}=== Verifying Configuration Sets ===${NC}"
for CONFIG_SET in "${CONFIG_SETS[@]}"; do
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
for ENV in "${ENVIRONMENTS[@]}"; do
    echo -e "${GREEN}$ENV Environment:${NC}"
    echo "  Bounces:    ${BOUNCE_TOPICS[$ENV]}"
    echo "  Complaints: ${COMPLAINT_TOPICS[$ENV]}"
    echo "  Deliveries: ${DELIVERY_TOPICS[$ENV]}"
    echo ""
done

echo -e "${YELLOW}Configuration Sets Updated:${NC}"
for CONFIG_SET in "${CONFIG_SETS[@]}"; do
    echo -e "${GREEN}✓ $CONFIG_SET${NC}"
done

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Update your Firebase Function environment variables with the topic ARNs if needed"
echo "2. Test email sending to verify events are being published to SNS"
echo "3. Monitor your webhook endpoints to ensure they're receiving events"
echo ""
echo -e "${GREEN}Your email compliance monitoring is now fully configured! 🎉${NC}"