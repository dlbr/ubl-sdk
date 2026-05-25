import { type PppdvSummary } from '../types/analytics';

export class SefExcelBuilder {
  
  /**
   * Generiše čist Excel-kompatibilan XML string sa nula zavisnosti.
   * Optimizovano za Cloudflare Edge.
   */
  public static buildPoreskaEvidencija(
    period: string, 
    summary: PppdvSummary, 
    salesRecords: any[], 
    purchaseRecords: any[]
  ): string {
    
    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:CharSet="238" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SummaryStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
   <Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DecimalStyle">
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>`;

    // --- SHEET 1: REKAPITULACIJA PPPDV ---
    xml += `
 <Worksheet ss:Name="PPPDV Rekapitualcija">
  <Table ss:ExpandedColumnCount="3" ss:ExpandedRowCount="10" x:FullColumns="1" x:FullRows="1">
   <Column ss:Width="250"/>
   <Column ss:Width="120"/>
   <Column ss:Width="120"/>
   <Row ss:Height="25">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">POZICIJA / OPIS</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">OSNOVICA</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">OBRAČUNATI PDV</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">001 - Promet po opštoj stopi</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija001_osnovicaOpsta}</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija101_pdvOpsta}</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">002 - Promet po posebnoj stopi</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija002_osnovicaPosebna}</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija102_pdvPosebna}</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">003 - Promet oslobođen PDV-a</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija003_oslobodjenSaPravom}</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">0.00</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">008 - Odbitni prethodni porez</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">0.00</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${summary.pozicija008_prethodniPorezOdbitni}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="SummaryStyle"><Data ss:Type="String">FINANSIJSKI SALDO (Plaćanje / Povraćaj)</Data></Cell>
    <Cell ss:StyleID="SummaryStyle"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="SummaryStyle"><Data ss:Type="Number">${summary.porezZaUplatuIliPovracaj}</Data></Cell>
   </Row>
  </Table>
 </Worksheet>`;

    // --- SHEET 2: DETALJNA PRODAJA (DEO 3) ---
    xml += `
 <Worksheet ss:Name="KPR - Izlazne Fakture">
  <Table ss:ExpandedColumnCount="6" ss:ExpandedRowCount="${salesRecords.length + 2}" x:FullColumns="1" x:FullRows="1">
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Column ss:Width="200"/>
   <Column ss:Width="120"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Row ss:Height="25">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Broj Računa</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Datum</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Kupac</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Osnovica</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">PDV</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Tip Kupca</Data></Cell>
   </Row>`;

    for (const row of salesRecords) {
      xml += `
   <Row>
    <Cell><Data ss:Type="String">${row.broj_fakture}</Data></Cell>
    <Cell><Data ss:Type="String">${row.datum_racuna}</Data></Cell>
    <Cell><Data ss:Type="String">${row.naziv_kupca}</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${row.osnovicaOpsta + row.osnovicaPosebna}</Data></Cell>
    <Cell ss:StyleID="DecimalStyle"><Data ss:Type="Number">${row.pdvOpsta + row.pdvPosebna}</Data></Cell>
    <Cell><Data ss:Type="String">${row.tipKupca}</Data></Cell>
   </Row>`;
    }
    xml += `
  </Table>
 </Worksheet>
</Workbook>`;

    return xml;
  }
}
