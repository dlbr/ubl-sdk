<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <sch:pattern>
    <sch:rule context="cac:PartyTaxScheme/cbc:CompanyID">
      <sch:assert test="matches(., '^\d{9}$')">
        [ERROR] PIB mora biti tačno 9 cifara.
      </sch:assert>
    </sch:rule>
    
    <sch:rule context="cac:Invoice">
      <sch:assert test="cbc:IssueDate &lt;= cbc:PaymentDueDate">
        [ERROR] Rok plaćanja mora biti nakon ili na dan izdavanja fakture.
      </sch:assert>
    </sch:rule>
  </sch:pattern>
</sch:schema>