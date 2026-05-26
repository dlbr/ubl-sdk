#!/bin/bash
set -e

# Ovo je skripta koju pokreće monorepo GitHub Action nakon što Changesets bumpa verziju.
# GitHub Action okruženje će obezbijediti UBL_SDK_SYNC_TOKEN u ENV-u.

if [ -z "$UBL_SDK_SYNC_TOKEN" ]; then
  echo "Error: UBL_SDK_SYNC_TOKEN is not set in environment."
  exit 1
fi

echo "Setting up git config..."
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Splitovanje ubl-sdk foldera i push na javni repo
echo "Syncing subtree to dlbr/ubl-sdk..."
git subtree push --prefix=packages/ubl-sdk https://x-access-token:${UBL_SDK_SYNC_TOKEN}@github.com/dlbr/ubl-sdk.git main

# Guranje lokalnih tagova (koje je generisao Changesets) na javni repo
echo "Pushing tags to dlbr/ubl-sdk..."
git push https://x-access-token:${UBL_SDK_SYNC_TOKEN}@github.com/dlbr/ubl-sdk.git --tags

echo "Sync complete!"
