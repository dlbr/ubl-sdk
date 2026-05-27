#!/bin/bash

# Postavi putanje relativno u odnosu na koren projekta (ako skriptu pokrećeš iz root-a)
TARGET_DIR="packages/ubl-sdk/src/schemas/common"
BASE_URL="https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common"

# Kreiraj direktorijum ako ne postoji
mkdir -p "$TARGET_DIR"

echo "🚀 Sinhronizacija UBL 2.1 modula u $TARGET_DIR..."

FILES=(
  "CCTS_CCT_SchemaModule-2.1.xsd"
  "UBL-CommonAggregateComponents-2.1.xsd"
  "UBL-CommonBasicComponents-2.1.xsd"
  "UBL-CommonExtensionComponents-2.1.xsd"
  "UBL-CommonSignatureComponents-2.1.xsd"
  "UBL-CoreComponentParameters-2.1.xsd"
  "UBL-ExtensionContentDataType-2.1.xsd"
  "UBL-QualifiedDataTypes-2.1.xsd"
  "UBL-SignatureAggregateComponents-2.1.xsd"
  "UBL-SignatureBasicComponents-2.1.xsd"
  "UBL-UnqualifiedDataTypes-2.1.xsd"
  "UBL-XAdESv132-2.1.xsd"
  "UBL-XAdESv141-2.1.xsd"
  "UBL-xmldsig-core-schema-2.1.xsd"
)

for FILE in "${FILES[@]}"; do
  URL="$BASE_URL/$FILE"
  OUTPUT="$TARGET_DIR/$FILE"
  
  # Koristimo -f (fail) da detektujemo ako server vrati 404
  # -S (show-error) da vidimo šta je pošlo po zlu
  if curl -f -s -o "$OUTPUT" "$URL"; then
    echo "  [OK] Preuzet: $FILE"
  else
    echo "  [ERROR] Nije moguće preuzeti $FILE sa $URL"
    exit 1
  fi
done

echo "✅ Sinhronizacija završena uspešno."