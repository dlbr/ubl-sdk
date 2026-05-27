#!/bin/bash
set -e

# Skripta za sinhronizaciju packages/ubl-sdk/ sa javnim dlbr/ubl-sdk repoom.
# Pokrenuta od strane monorepo GitHub Action-a nakon što Changesets bumpa verziju.
#
# Strategija: git subtree split kreira čist branch samo sa kodom iz packages/ubl-sdk/,
# bez ikakvog monorepo "šuma". Taj branch se force-pusha na main javnog repoa.
# Force push je siguran jer je javni repo mirror, ne kolaborativni repo.

if [ -z "$UBL_SDK_SYNC_TOKEN" ]; then
  echo "Error: UBL_SDK_SYNC_TOKEN is not set in environment."
  exit 1
fi

PUBLIC_REPO="https://${UBL_SDK_SYNC_TOKEN}@github.com/dlbr/ubl-sdk.git"

echo "Configuring git..."
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Kreiranje čistog branch-a koji sadrži samo packages/ubl-sdk/ historiju
echo "Splitting packages/ubl-sdk subtree..."
SPLIT_BRANCH="ubl-sdk-sync-$(date +%s)"
git subtree split --prefix=packages/ubl-sdk -b "$SPLIT_BRANCH"

# Force push čistog branch-a na main javnog repoa
echo "Force-pushing to dlbr/ubl-sdk main..."
git push "$PUBLIC_REPO" "${SPLIT_BRANCH}:main" --force

# Čišćenje lokalnog temp branch-a
git branch -D "$SPLIT_BRANCH"

# Push svih v* tagova na javni repo
echo "Pushing version tags to dlbr/ubl-sdk..."
git push "$PUBLIC_REPO" --tags

echo "Sync complete!"
