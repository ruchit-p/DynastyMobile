#!/bin/bash

# Connect the existing staging SNS topics to dynastytest configuration set

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

REGION="us-east-2"

echo -e "${BLUE}Connecting staging SNS topics to dynastytest configuration set...${NC}"
echo ""

# Function to add event destination
add_event_destination() {
    local config_set=$1
    local dest_name=$2
    local event_type=$3
    local topic_arn=$4
    
    echo -e "${BLUE}Adding $event_type event destination to $config_set...${NC}"
    
    # Delete existing destination if it exists
    aws ses delete-configuration-set-event-destination \
        --configuration-set-name "$config_set" \
        --event-destination-name "$dest_name" \
        --region $REGION \
        2>/dev/null || echo -e "${YELLOW}No existing destination to remove${NC}"
    
    # Add new destination
    aws ses create-configuration-set-event-destination \
        --configuration-set-name "$config_set" \
        --event-destination \
        Name="$dest_name",Enabled=true,MatchingEventTypes="$event_type",SNSDestination="{TopicARN=$topic_arn}" \
        --region $REGION
    
    echo -e "${GREEN}✓ Added $event_type event destination${NC}"
}

# Get the existing staging topic ARNs
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

BOUNCE_TOPIC="arn:aws:sns:us-east-2:${ACCOUNT_ID}:dynasty-ses-bounces-staging"
COMPLAINT_TOPIC="arn:aws:sns:us-east-2:${ACCOUNT_ID}:dynasty-ses-complaints-staging"
DELIVERY_TOPIC="arn:aws:sns:us-east-2:${ACCOUNT_ID}:dynasty-ses-deliveries-staging"

echo -e "${YELLOW}=== Configuring dynastytest with staging topics ===${NC}"

# Add event destinations to dynastytest using staging topics
add_event_destination "dynastytest" "bounce-events" "bounce" "$BOUNCE_TOPIC"
add_event_destination "dynastytest" "complaint-events" "complaint" "$COMPLAINT_TOPIC"
add_event_destination "dynastytest" "delivery-events" "delivery" "$DELIVERY_TOPIC"

echo ""
echo -e "${GREEN}=== Configuration Complete! ===${NC}"
echo ""
echo -e "${YELLOW}dynastytest now connected to:${NC}"
echo "  Bounces:    $BOUNCE_TOPIC"
echo "  Complaints: $COMPLAINT_TOPIC"
echo "  Deliveries: $DELIVERY_TOPIC"
echo ""

# Verify all three configuration sets
echo -e "${BLUE}=== Verifying All Configuration Sets ===${NC}"

for CONFIG_SET in "dynastyprod" "dynastytest" "dynastylocal"; do
    echo -e "${BLUE}Configuration Set: $CONFIG_SET${NC}"
    aws ses describe-configuration-set --configuration-set-name "$CONFIG_SET" --region $REGION \
        --query 'EventDestinations[*].{Name:Name,Events:MatchingEventTypes,SNS_Topic:SNSDestination.TopicARN,Enabled:Enabled}' \
        --output table
    echo ""
done

echo -e "${GREEN}🎉 All Dynasty email compliance monitoring is now fully configured!${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "✅ dynastyprod → dynasty-ses-*-prod topics"
echo "✅ dynastytest → dynasty-ses-*-staging topics" 
echo "✅ dynastylocal → dynasty-ses-*-local topics"
echo ""
echo -e "${YELLOW}Your Firebase webhooks will now receive:${NC}"
echo "- Email bounce notifications → Automatic suppression list updates"
echo "- Spam complaint notifications → Immediate user opt-out"
echo "- Delivery confirmations → Complete audit trail"