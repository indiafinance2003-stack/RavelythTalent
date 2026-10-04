import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type BuiltResumeData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
};

const COLORS = {
  classic: { primary: "#0B2A6F", accent: "#3DB8B0" },
  modern: { primary: "#1F6FEB", accent: "#0B2A6F" },
  minimal: { primary: "#1F2937", accent: "#64748B" },
} as const;

export type ResumeTemplate = keyof typeof COLORS;

function ResumeDocument({
  title,
  template,
  data,
}: {
  title: string;
  template: ResumeTemplate;
  data: BuiltResumeData;
}) {
  const colors = COLORS[template];
  const styles = StyleSheet.create({
    page: {
      paddingTop: 42,
      paddingBottom: 42,
      paddingHorizontal: 48,
      color: "#1F2937",
      fontFamily: "Helvetica",
      fontSize: 10,
      lineHeight: 1.5,
    },
    name: {
      color: colors.primary,
      fontSize: 24,
      fontFamily: "Helvetica-Bold",
    },
    headline: { marginTop: 3, fontSize: 11, color: colors.accent },
    contact: { marginTop: 7, color: "#475569", fontSize: 9 },
    section: { marginTop: 20 },
    sectionTitle: {
      color: colors.primary,
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      borderBottomWidth: 1,
      borderBottomColor: colors.accent,
      paddingBottom: 4,
      marginBottom: 7,
    },
    body: { color: "#334155", whiteSpace: "pre-wrap" },
  });
  const sections = [
    ["Professional summary", data.summary],
    ["Experience", data.experience],
    ["Education", data.education],
    ["Skills", data.skills],
  ] as const;

  return (
    <Document title={title} author="Ravelyth Talent">
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{data.fullName || "Your name"}</Text>
        {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
        <Text style={styles.contact}>
          {[data.email, data.phone, data.location].filter(Boolean).join("  |  ")}
        </Text>
        {sections.map(([heading, value]) =>
          value ? (
            <View key={heading} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>{heading}</Text>
              <Text style={styles.body}>{value}</Text>
            </View>
          ) : null,
        )}
      </Page>
    </Document>
  );
}

export async function renderBuiltResumePdf(
  title: string,
  template: ResumeTemplate,
  data: BuiltResumeData,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(
    <ResumeDocument title={title} template={template} data={data} />,
  );
}
