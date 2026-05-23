<?xml version="1.0" encoding="UTF-8"?>
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" 
            xmlns:xs="http://www.w3.org/2001/XMLSchema" 
            queryBinding="xslt2">

  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" prefix="cbc"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" prefix="cac"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" prefix="ubl"/>

  <sch:pattern id="ExhaustiveBusinessRules">

    <sch:rule context="cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID">
      <sch:assert test="matches(., '^\d{9}$')">
        [ERROR] PIB mora imati tačno 9 cifara.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:TaxCategory">
      <sch:assert test="cbc:ID = ('S', 'E', 'AE', 'Z', 'O')">
        [ERROR] Nevalidna TaxCategory ID. Dozvoljene: S, E, AE, Z, O.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:TaxCategory[cbc:ID = 'AE']">
      <sch:assert test="cbc:TaxExemptionReasonCode or cbc:TaxExemptionReason">
        [ERROR] Reverse Charge (AE) zahteva zakonski osnov.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cbc:InvoiceTypeCode">
      <sch:assert test=". = ('380', '381', '386')">
        [ERROR] Tip fakture mora biti 380, 381 ili 386.
      </sch:assert>
    </sch:rule>

    <sch:rule context="//cbc:InvoiceTypeCode[text() = '386']">
      <sch:assert test="ancestor::cac:Invoice/cac:BillingReference">
        [ERROR] Avansni račun (386) mora sadržati BillingReference.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:Invoice">
      <sch:assert test="xs:date(cbc:IssueDate) &lt;= xs:date(cbc:PaymentDueDate)">
        [ERROR] Rok plaćanja ne može biti pre datuma izdavanja.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:Invoice[cbc:DocumentCurrencyCode = 'RSD']">
      <sch:assert test="cbc:TaxCurrencyCode = 'RSD'">
        [ERROR] Ako je valuta fakture RSD, i poreska valuta mora biti RSD.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:LegalMonetaryTotal">
      <sch:assert test="cbc:PayableAmount >= 0">
        [ERROR] Iznos za plaćanje ne sme biti negativan. Za storno koristiti 381.
      </sch:assert>
    </sch:rule>
  </sch:pattern>
</sch:schema>