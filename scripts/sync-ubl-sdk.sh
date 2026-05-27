#!/bin/bash
set -e

# Skripta za sinhronizaciju packages/ubl-sdk/ sa javnim dlbr/ubl-sdk repoom via SSH Deploy Key.
# Pokrenuta od strane monorepo GitHub Action-a nakon što Changesets bumpa verziju.

PUBLIC_REPO="git@github.com:dlbr/ubl-sdk.git"

# Čitanje verzije iz package.json
VERSION=$(node -p "require('./packages/ubl-sdk/package.json').version")
TAG="v${VERSION}"
echo "Version to sync: ${TAG}"

TEMP_DIR=".temp-ubl-sdk-clone"
rm -rf "$TEMP_DIR"

echo "Cloning public repo..."
git clone "$PUBLIC_REPO" "$TEMP_DIR"

echo "Syncing files..."
# Brišemo sve osim .git i .github iz klona kako bismo osigurali da obrisani fajlovi budu uklonjeni
find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -not -name ".git" -not -name ".github" -exec rm -rf {} +

# Kopiramo nove fajlove iz packages/ubl-sdk/ osim .github/
rsync -av --exclude='.github' --exclude='node_modules' --exclude='dist' packages/ubl-sdk/ "$TEMP_DIR/"

cd "$TEMP_DIR"

echo "Configuring git..."
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Provjera da li ima promjena za commit
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "chore(release): sync v${VERSION}"
  echo "Pushing changes to main..."
  git push origin main
else
  echo "No changes to sync."
fi

# Kreiranje i push taga
if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "${TAG}"; then
  echo "Tag ${TAG} already exists. Skipping tag push."
else
  echo "Creating and pushing tag ${TAG}..."
  git tag "$TAG"
  git push origin "$TAG"
fi

cd ..
rm -rf "$TEMP_DIR"

# Kreiranje GitHub Release na javnom repou pomoću gh CLI ako je token dostupan
if [ -n "$UBL_SDK_SYNC_TOKEN" ]; then
  echo "Creating GitHub Release on dlbr/ubl-sdk..."
  GH_TOKEN="$UBL_SDK_SYNC_TOKEN" gh release create "$TAG" --repo dlbr/ubl-sdk --generate-notes || echo "Release already exists or failed to create."
else
  echo "UBL_SDK_SYNC_TOKEN not set, skipping GitHub Release creation."
fi

echo "Sync complete! Published ${TAG} to dlbr/ubl-sdk."
