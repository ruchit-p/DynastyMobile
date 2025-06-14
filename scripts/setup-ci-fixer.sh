#!/bin/bash

# Setup script for CI/CD Auto-Fix workflow

set -e

echo "🔧 Setting up CI/CD Auto-Fix workflow..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. Check required tools
echo -e "${YELLOW}Checking required tools...${NC}"

check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $1 is installed${NC}"
        return 0
    fi
}

ALL_GOOD=true

# Check GitHub CLI
if ! check_tool "gh"; then
    echo "  Install with: brew install gh"
    echo "  Then run: gh auth login"
    ALL_GOOD=false
fi

# Check jq (JSON processor)
if ! check_tool "jq"; then
    echo "  Install with: brew install jq"
    ALL_GOOD=false
fi

# Check ts-node
if ! check_tool "ts-node"; then
    echo "  Install with: yarn global add ts-node typescript"
    ALL_GOOD=false
fi

# 2. Create necessary directories
echo -e "\n${YELLOW}Creating directories...${NC}"
mkdir -p .github/workflows
mkdir -p scripts

# 3. Set up Git hooks (optional)
echo -e "\n${YELLOW}Setting up Git hooks...${NC}"
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
# Pre-push hook to check for CI errors before pushing

echo "🔍 Running pre-push CI checks..."

# Run quick lint check
if ! yarn lint:all > /dev/null 2>&1; then
    echo "⚠️  Linting errors detected. Run 'yarn fix:ci' to fix automatically."
    echo "Or push with --no-verify to skip this check."
    exit 1
fi

echo "✅ Pre-push checks passed!"
EOF

chmod +x .git/hooks/pre-push
echo -e "${GREEN}✅ Git pre-push hook installed${NC}"

# 4. Install dependencies if needed
echo -e "\n${YELLOW}Checking project dependencies...${NC}"

# Check if prettier is installed
if ! grep -q "prettier" package.json; then
    echo -e "${YELLOW}Installing prettier...${NC}"
    yarn add --dev prettier
fi

# 5. Create prettier config if it doesn't exist
if [ ! -f ".prettierrc" ]; then
    echo -e "\n${YELLOW}Creating prettier config...${NC}"
    cat > .prettierrc << 'EOF'
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
EOF
    echo -e "${GREEN}✅ Prettier config created${NC}"
fi

# 6. GitHub Actions permissions reminder
echo -e "\n${YELLOW}GitHub Repository Settings Required:${NC}"
echo "1. Go to: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/settings/actions"
echo "2. Under 'Workflow permissions', select:"
echo "   - ✅ Read and write permissions"
echo "   - ✅ Allow GitHub Actions to create and approve pull requests"
echo ""
echo "3. Under 'Actions secrets and variables', ensure these exist:"
echo "   - GITHUB_TOKEN (automatic)"
echo "   - Any other secrets your workflows need"

# 7. Test the setup
echo -e "\n${YELLOW}Testing setup...${NC}"

# Test GitHub CLI
if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null; then
        echo -e "${GREEN}✅ GitHub CLI authenticated${NC}"
    else
        echo -e "${RED}❌ GitHub CLI not authenticated. Run: gh auth login${NC}"
        ALL_GOOD=false
    fi
fi

# Test script permissions
for script in scripts/claude-*.sh; do
    if [ -f "$script" ]; then
        if [ ! -x "$script" ]; then
            chmod +x "$script"
            echo -e "${GREEN}✅ Made $script executable${NC}"
        fi
    fi
done

# Summary
echo -e "\n${YELLOW}================== Setup Summary ==================${NC}"
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ All requirements met! CI/CD Auto-Fix is ready to use.${NC}"
    echo ""
    echo "Quick start commands:"
    echo "  yarn fix:pr <number>     # Fix a specific PR"
    echo "  yarn fix:ci              # Fix current branch"
    echo "  yarn fix:ci:ts --help    # Advanced TypeScript fixer"
else
    echo -e "${RED}❌ Some requirements are missing. Please install them.${NC}"
fi
echo -e "${YELLOW}===================================================${NC}"