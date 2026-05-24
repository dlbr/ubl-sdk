<?xml version="1.0" encoding="UTF-8"?>
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" 
            xmlns:xs="http://www.w3.org/2001/XMLSchema" 
            queryBinding="xslt2">

  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" prefix="cbc"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" prefix="cac"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" prefix="ubl"/>

  <sch:pattern id="ExhaustiveBusinessRules">

    <!-- 1. PIB Validacija -->
    <sch:rule context="cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID">
      <sch:assert test="matches(., '^\d{9}$')">
        [FATAL] PIB mora imati tačno 9 cifara.
      </sch:assert>
    </sch:rule>

    <!-- 2. Poreske kategorije -->
    <sch:rule context="cac:TaxCategory">
      <sch:assert test="cbc:ID = ('S', 'E', 'AE', 'Z', 'O')">
        [FATAL] Nevalidna TaxCategory ID. Dozvoljene: S, E, AE, Z, O.
      </sch:assert>
    </sch:rule>

    <!-- 3. Reverse Charge (AE) Obaveza -->
    <sch:rule context="cac:TaxCategory[cbc:ID = 'AE']">
      <sch:assert test="cbc:TaxExemptionReasonCode or cbc:TaxExemptionReason">
        [FATAL] Reverse Charge (AE) zahteva zakonski osnov (TaxExemptionReasonCode ili Text).
      </sch:assert>
    </sch:rule>

    <!-- 4. Avansni račun (386) i BillingReference -->
    <sch:rule context="cbc:InvoiceTypeCode[text() = '386']">
      <sch:assert test="ancestor::cac:Invoice/cac:BillingReference">
        [FATAL] Avansni račun (386) mora sadržati BillingReference.
      </sch:assert>
    </sch:rule>

    <!-- 5. Datumski integritet -->
    <sch:rule context="cac:Invoice">
      <sch:assert test="xs:date(cbc:IssueDate) &lt;= xs:date(cbc:PaymentDueDate)">
        [FATAL] Rok plaćanja ne može biti pre datuma izdavanja.
      </sch:assert>
      <sch:assert test="xs:date(cbc:IssueDate) &lt;= xs:date(current-date())">
        [FATAL] Datum izdavanja ne može biti u budućnosti.
      </sch:assert>
    </sch:rule>

    <!-- 6. Valutna harmonizacija -->
    <sch:rule context="cac:Invoice[cbc:DocumentCurrencyCode = 'RSD']">
      <sch:assert test="cbc:TaxCurrencyCode = 'RSD'">
        [FATAL] Ako je valuta fakture RSD, i poreska valuta mora biti RSD.
      </sch:assert>
    </sch:rule>

    <!-- 7. Finansijski integritet -->
    <sch:rule context="cac:LegalMonetaryTotal">
      <sch:assert test="cbc:PayableAmount >= 0">
        [FATAL] Iznos za plaćanje ne sme biti negativan. Za storno koristiti 381.
      </sch:assert>
    </sch:rule>

    <!-- 8. Catch-All strukturalna pravila -->
    <sch:rule context="cac:Invoice">
      <sch:assert test="cbc:ID and cbc:IssueDate and cac:AccountingSupplierParty">
        [FATAL] Struktura fakture je nepotpuna – nedostaju osnovni elementi (ID, IssueDate, Supplier).
      </sch:assert>
    </sch:rule>

  </sch:pattern>
</sch:schema>