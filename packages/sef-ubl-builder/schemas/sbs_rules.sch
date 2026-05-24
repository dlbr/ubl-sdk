<?xml version="1.0" encoding="UTF-8"?>
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" 
            xmlns:xs="http://www.w3.org/2001/XMLSchema" 
            queryBinding="xslt2">
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" prefix="cbc"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" prefix="cac"/>
  <sch:ns uri="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" prefix="ubl"/>

  <sch:pattern id="SEF_Bulletproof_Rules">

    <sch:rule context="//cac:AccountingCustomerParty//cbc:CompanyID | //cac:AccountingSupplierParty//cbc:CompanyID">
      <sch:assert test="matches(., '^\d{9}$')">
        [FATAL] PIB mora sadržati tačno 9 numeričkih karaktera.
      </sch:assert>
    </sch:rule>

    <sch:rule context="ubl:Invoice[cbc:InvoiceTypeCode = '386']">
      <sch:assert test="cac:BillingReference">
        [FATAL] Avansni račun (386) mora sadržati BillingReference ka prethodnom avansnom zahtevu.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:TaxCategory[cbc:ID = 'AE']">
      <sch:assert test="cbc:TaxExemptionReason or cbc:TaxExemptionReasonCode">
        [FATAL] Za Reverse Charge (AE) obavezno je navesti zakonski osnov (TaxExemptionReason).
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:Invoice">
      <sch:assert test="xs:date(cbc:IssueDate) &lt;= xs:date(cbc:PaymentDueDate)">
        [FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:Invoice[cbc:DocumentCurrencyCode = 'RSD']">
      <sch:assert test="cbc:TaxCurrencyCode = 'RSD'">
        [FATAL] Ukoliko je faktura u RSD, poreska valuta mora biti RSD.
      </sch:assert>
    </sch:rule>

    <sch:rule context="cac:TaxSubtotal | cac:LegalMonetaryTotal">
      <sch:assert test="not(cbc:TaxableAmount &lt; 0) and not(cbc:PayableAmount &lt; 0)">
        [FATAL] Finansijski iznosi (osnovica, porez, total) ne smeju biti negativni. Koristite tip 381 za storno.
      </sch:assert>
    </sch:rule>

  </sch:pattern>
</sch:schema>