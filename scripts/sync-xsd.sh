#!/bin/bash

# Destinacija
TARGET_DIR="/Users/dlbr/labs/sef/packages/ubl-sdk/src/schemas/common"
BASE_URL="https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common"

mkdir -p "$TARGET_DIR"

echo "📥 Preuzimam kompletan set UBL 2.1 komponenti..."

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
  echo "Downloading $FILE..."
  curl -s -o "$TARGET_DIR/$FILE" "$BASE_URL/$FILE"
done

echo "✅ Sinhronizacija završena. Svi zavisni moduli su lokalno dostupni."