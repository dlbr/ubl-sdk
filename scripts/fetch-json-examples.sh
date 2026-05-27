#!/bin/bash

# Destinacija
TARGET_DIR="packages/ubl-sdk/src/examples/vat-records"
BASE_URL="https://www.efaktura.gov.rs"
SOURCE_PAGE="https://www.efaktura.gov.rs/tekst/4092/primeri-json-fajlova-za-pojedinacne-evidencije-obracuna-pdv.php"

mkdir -p "$TARGET_DIR"

echo "🔍 Skeniram stranicu za JSON primerima..."

# Preuzmi stranicu i izvuci sve .json linkove
# grep pronalazi href="/.../ime.json", sed čisti putanju
JSON_LINKS=$(curl -s "$SOURCE_PAGE" | grep -o 'href="[^"]*\.json"' | sed 's/href="//;s/"//')

for LINK in $JSON_LINKS; do
  # Ako je link relativan, dodaj bazu
  [[ $LINK != http* ]] && FULL_URL="$BASE_URL$LINK" || FULL_URL="$LINK"
  
  FILE_NAME=$(basename "$LINK")
  
  echo "⬇️ Preuzimam: $FILE_NAME"
  if curl -s -o "$TARGET_DIR/$FILE_NAME" "$FULL_URL"; then
    echo "  [OK]"
  else
    echo "  [ERROR] Neuspešno preuzimanje $FILE_NAME"
  fi
done

echo "✅ Sinhronizacija JSON primera završena u $TARGET_DIR"