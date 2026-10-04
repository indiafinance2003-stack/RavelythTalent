import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Tax invoice rendered with @react-pdf/renderer (explicitly NOT Puppeteer).
 * Runs on the Node server only; the package is listed in
 * `serverExternalPackages` so the bundler leaves it alone.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1F2937", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0B2A6F" },
  tagline: { fontSize: 9, color: "#475569", marginTop: 2 },
  right: { textAlign: "right" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0B2A6F" },
  meta: { fontSize: 9, color: "#475569", marginTop: 2 },
  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0B2A6F",
    marginBottom: 6,
  },
  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  rowLast: { flexDirection: "row" },
  cell: { padding: 8, flex: 1 },
  cellRight: { padding: 8, textAlign: "right", flex: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  note: { marginTop: 20, fontSize: 8, color: "#64748B", lineHeight: 1.5 },
});

export type InvoicePdfData = {
  invoiceNumber: string;
  issuedOn: string;
  sellerName: string;
  sellerGstin?: string | null;
  sellerAddress?: string | null;
  buyerName: string;
  buyerEmail: string;
  planName: string;
  description: string;
  subtotalPaise: number;
  taxRate: string;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  orderId?: string | null;
};

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );

function InvoiceDocument(data: InvoicePdfData) {
  return (
    <Document title={`Invoice ${data.invoiceNumber}`} author="Ravelyth Talent">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              Ravelyth <Text style={{ color: "#3DB8B0" }}>Talent</Text>
            </Text>
            <Text style={styles.tagline}>
              Connecting Great People with Great Opportunities
            </Text>
            {data.sellerAddress ? (
              <Text style={styles.meta}>{data.sellerAddress}</Text>
            ) : null}
            {data.sellerGstin ? (
              <Text style={styles.meta}>GSTIN: {data.sellerGstin}</Text>
            ) : null}
          </View>
          <View style={styles.right}>
            <Text style={styles.title}>TAX INVOICE</Text>
            <Text style={styles.meta}>Invoice no: {data.invoiceNumber}</Text>
            <Text style={styles.meta}>Date: {data.issuedOn}</Text>
            {data.orderId ? (
              <Text style={styles.meta}>Order: {data.orderId}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billed to</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.buyerName}</Text>
          <Text style={styles.meta}>{data.buyerEmail}</Text>
        </View>

        <View style={[styles.section, styles.table]}>
          <View style={styles.row}>
            <Text style={[styles.cell, styles.bold]}>Description</Text>
            <Text style={[styles.cellRight, styles.bold]}>Amount</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text>{data.description}</Text>
              {data.periodStart && data.periodEnd ? (
                <Text style={styles.meta}>
                  Period: {data.periodStart} to {data.periodEnd}
                </Text>
              ) : null}
            </View>
            <Text style={styles.cellRight}>{rupees(data.subtotalPaise)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cell}>
              GST @ {data.taxRate}%
            </Text>
            <Text style={styles.cellRight}>{rupees(data.taxPaise)}</Text>
          </View>
          <View style={styles.rowLast}>
            <Text style={[styles.cell, styles.bold]}>Total</Text>
            <Text style={[styles.cellRight, styles.bold]}>
              {rupees(data.totalPaise)}
            </Text>
          </View>
        </View>

        <Text style={styles.note}>
          This is a computer-generated invoice and does not require a signature.
          {Number(data.taxRate) === 0
            ? " No GST has been charged as the applicable rate is currently 0%."
            : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...data} />);
}
