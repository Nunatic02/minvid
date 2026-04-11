#!/usr/bin/env bash
set -euo pipefail

REPO="Nunatic02/homebrew-minvid"
FORMULA_PATH="Formula/minvid.rb"

# --- Usage ---
BUMP="${1:-}"
if [[ -z "$BUMP" || ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: npm run release -- <patch|minor|major>"
  exit 1
fi

# --- Check gh is available ---
if ! command -v gh &> /dev/null; then
  echo "Error: GitHub CLI (gh) is required. Install it with: brew install gh"
  exit 1
fi

# --- Resolve project root relative to this script ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Bump version & publish to npm ---
cd "$PROJECT_DIR"
echo "Bumping version ($BUMP)..."
NEW_VERSION="$(npm version "$BUMP" --no-git-tag-version | tr -d 'v')"
echo "New version: $NEW_VERSION"

echo "Publishing to npm..."
npm publish

# --- Get SHA256 of new tarball ---
echo "Fetching SHA256..."
TARBALL_URL="https://registry.npmjs.org/@nunatic02/minvid/-/minvid-${NEW_VERSION}.tgz"
SHA256="$(curl -sL "$TARBALL_URL" | shasum -a 256 | awk '{print $1}')"
echo "SHA256: $SHA256"

# --- Fetch current formula from GitHub ---
echo "Updating Homebrew formula on GitHub..."
CURRENT="$(gh api "repos/$REPO/contents/$FORMULA_PATH" --jq '.content' | base64 -d)"
FILE_SHA="$(gh api "repos/$REPO/contents/$FORMULA_PATH" --jq '.sha')"

# --- Replace url and sha256 in formula ---
UPDATED="$(echo "$CURRENT" | sed "s|url \".*\"|url \"${TARBALL_URL}\"|")"
UPDATED="$(echo "$UPDATED" | sed "s|sha256 \".*\"|sha256 \"${SHA256}\"|")"

# --- Push updated formula via GitHub API ---
ENCODED="$(echo "$UPDATED" | base64)"
gh api "repos/$REPO/contents/$FORMULA_PATH" \
  -X PUT \
  -f message="Update minvid to $NEW_VERSION" \
  -f content="$ENCODED" \
  -f sha="$FILE_SHA" \
  --silent

echo ""
echo "Released minvid v$NEW_VERSION"
echo "  npm: https://www.npmjs.com/package/@nunatic02/minvid"
echo "  brew: brew install Nunatic02/minvid/minvid"
