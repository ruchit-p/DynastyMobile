#!/bin/bash

# Quick commit script that bypasses hooks for emergency commits
# Usage: ./scripts/quick-commit.sh "commit message"

if [ -z "$1" ]; then
  echo "❌ Please provide a commit message"
  echo "Usage: ./scripts/quick-commit.sh \"your commit message\""
  exit 1
fi

echo "⚡ Quick commit (bypassing hooks)..."
git add .
git commit -m "$1" --no-verify

echo "✅ Committed with message: $1"
echo "⚠️  Note: This bypassed linting and tests. Run them manually before pushing:"
echo "   yarn lint:fix"
echo "   yarn test:all"