#!/bin/bash
set -e

# Skripta za sinhronizaciju packages/ubl-sdk/ sa javnim dlbr/ubl-sdk repoom.
# Pokrenuta od strane monorepo GitHub Action-a nakon što Changesets bumpa verziju.
#
# KRITIČNO: actions/checkout instalira globalni git credential helper koji presreće
# SVE GitHub HTTPS zahtjeve i vraća GITHUB_TOKEN (github-actions[bot]).
# Koristimo -c credential.helper="" da ga zaobiđemo i koristimo token iz URL-a.

if [ -z "$UBL_SDK_SYNC_TOKEN" ]; then
  echo "Error: UBL_SDK_SYNC_TOKEN is not set in environment."
  exit 1
fi

PUBLIC_REPO="https://${UBL_SDK_SYNC_TOKEN}@github.com/dlbr/ubl-sdk.git"

echo "Configuring git..."
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Čitanje verzije iz package.json
VERSION=$(node -p "require('./packages/ubl-sdk/package.json').version")
TAG="v${VERSION}"
echo "Version to publish: ${TAG}"

# Provjeri da li tag već postoji na javnom repou
if git -c credential.helper="" ls-remote --tags "$PUBLIC_REPO" "refs/tags/${TAG}" | grep -q "${TAG}"; then
  echo "Tag ${TAG} already exists on public repo. Skipping."
  exit 0
fi

# Kreiranje čistog branch-a koji sadrži samo packages/ubl-sdk/ historiju
echo "Splitting packages/ubl-sdk subtree..."
SPLIT_BRANCH="ubl-sdk-sync-${VERSION}"
git subtree split --prefix=packages/ubl-sdk -b "$SPLIT_BRANCH"

# Force push čistog branch-a na main javnog repoa
# -c credential.helper="" zaobilazi actions/checkout credential helper
echo "Force-pushing to dlbr/ubl-sdk main..."
git -c credential.helper="" push "$PUBLIC_REPO" "${SPLIT_BRANCH}:main" --force

# Čišćenje lokalnog temp branch-a
git branch -D "$SPLIT_BRANCH"

# Kreiranje i push v* taga koji triggeruje publish.yml na javnom repou
echo "Creating and pushing tag ${TAG}..."
git tag "$TAG" || true
git -c credential.helper="" push "$PUBLIC_REPO" "refs/tags/${TAG}"

echo "Sync complete! Published ${TAG} to dlbr/ubl-sdk."
