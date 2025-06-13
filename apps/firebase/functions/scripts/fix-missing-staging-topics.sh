#!/bin/bash

# Fix missing SNS topics for dynastystaging configuration set

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get AWS account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-2"

echo -e "${BLUE}Fixing missing SNS topics for dynastystaging...${NC}"
echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"
echo -e "${GREEN}Region: $REGION${NC}"
echo ""

# Function to create topic if it doesn't exist
create_topic_if_missing() {
    local topic_name=$1
    local description=$2
    
    echo -e "${BLUE}Checking/Creating SNS topic: $topic_name${NC}"
    
    # Check if topic exists
    EXISTING_TOPIC=$(aws sns list-topics --region $REGION --query "Topics[?contains(TopicArn, '$topic_name')].TopicArn" --output text)
    
    if [ -n "$EXISTING_TOPIC" ]; then
        echo -e "${GREEN}✓ Topic already exists: $EXISTING_TOPIC${NC}"
        echo "$EXISTING_TOPIC"
        return
    fi
    
    # Create the topic
    TOPIC_ARN=$(aws sns create-topic --name "$topic_name" --region $REGION --query TopicArn --output text)
    echo -e "${GREEN}✓ Created topic: $TOPIC_ARN${NC}"
    
    # Set display name
    aws sns set-topic-attributes \
        --topic-arn "$TOPIC_ARN" \
        --attribute-name DisplayName \
        --attribute-value "$description" \
        --region $REGION
    
    # Set policy for SES to publish
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
    
    aws sns set-topic-attributes \
        --topic-arn "$TOPIC_ARN" \
        --attribute-name Policy \
        --attribute-value "$POLICY_DOC" \
        --region $REGION
    
    echo -e "${GREEN}✓ Set permissions for SES${NC}"
    echo "$TOPIC_ARN"
}

# Function to add event destination
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
        --region $REGION \
        2>/dev/null || echo -e "${YELLOW}Event destination $dest_name may already exist${NC}"
    
    echo -e "${GREEN}✓ Added $event_type event destination${NC}"
}

# Create staging topics
echo -e "${YELLOW}=== Creating missing staging topics ===${NC}"

BOUNCE_TOPIC_STAGING=$(create_topic_if_missing "dynasty-ses-bounces-staging" "Dynasty SES Bounce Events - Staging")
echo ""

COMPLAINT_TOPIC_STAGING=$(create_topic_if_missing "dynasty-ses-complaints-staging" "Dynasty SES Complaint Events - Staging")
echo ""

DELIVERY_TOPIC_STAGING=$(create_topic_if_missing "dynasty-ses-deliveries-staging" "Dynasty SES Delivery Events - Staging")
echo ""

# Add event destinations to dynastystaging
echo -e "${YELLOW}=== Configuring dynastystaging event destinations ===${NC}"
add_event_destination "dynastystaging" "bounce-events" "bounce" "$BOUNCE_TOPIC_STAGING"
add_event_destination "dynastystaging" "complaint-events" "complaint" "$COMPLAINT_TOPIC_STAGING" 
add_event_destination "dynastystaging" "delivery-events" "delivery" "$DELIVERY_TOPIC_STAGING"

echo ""
echo -e "${GREEN}=== Staging Setup Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Created/Verified Topics:${NC}"
echo "  Bounces:    $BOUNCE_TOPIC_STAGING"
echo "  Complaints: $COMPLAINT_TOPIC_STAGING"
echo "  Deliveries: $DELIVERY_TOPIC_STAGING"
echo ""

# Verify setup
echo -e "${BLUE}Verifying dynastystaging configuration:${NC}"
aws ses describe-configuration-set --configuration-set-name dynastystaging --region $REGION \
    --query 'EventDestinations[*].{Name:Name,Events:MatchingEventTypes,Enabled:Enabled}' \
    --output table

echo -e "${GREEN}🎉 Dynasty staging email compliance is now fully configured!${NC}"