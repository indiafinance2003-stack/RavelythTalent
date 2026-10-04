/**
 * Candidate entitlement codes, in one place.
 *
 * These strings are rows in `premium_entitlements`, seeded by
 * `drizzle/0011_majestic_night_thrasher.sql` and mapped to plans by
 * `candidate_premium_plan_entitlements`. They are NOT invented here: this module
 * exists so that a typo becomes a compile error instead of a request that
 * silently 403s for a reason nobody can find, and so the client and server
 * cannot disagree about which code gates which feature.
 *
 * Deliberately NOT `server-only`: the builder UI needs to know which controls to
 * show as locked, and it must use the same constants the server enforces with.
 * That is a usability affordance, never a security boundary — every check is
 * repeated server-side in the service layer, because anything in the browser can
 * be edited.
 */

export const CANDIDATE_ENTITLEMENT_CODES = {
  /** Structured Resume Builder: save/restore an editable resume document. */
  RESUME_BUILDER: 'resume_builder_premium',
  /** The three professional layouts (modern, executive, technical). */
  PROFESSIONAL_TEMPLATES: 'professional_resume_templates',
  /** More than one version of the same resume. */
  MULTIPLE_VERSIONS: 'multiple_resume_versions',
  /** Rendering a resume version to a PDF, and downloading it. */
  PDF_EXPORT: 'pdf_resume_export',
  /** Listing and restoring earlier resume versions. */
  VERSION_HISTORY: 'resume_version_history',
} as const;

export type CandidateEntitlementCode =
  (typeof CANDIDATE_ENTITLEMENT_CODES)[keyof typeof CANDIDATE_ENTITLEMENT_CODES];

export const ALL_CANDIDATE_ENTITLEMENT_CODES: readonly CandidateEntitlementCode[] = [
  CANDIDATE_ENTITLEMENT_CODES.RESUME_BUILDER,
  CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES,
  CANDIDATE_ENTITLEMENT_CODES.MULTIPLE_VERSIONS,
  CANDIDATE_ENTITLEMENT_CODES.PDF_EXPORT,
  CANDIDATE_ENTITLEMENT_CODES.VERSION_HISTORY,
];

function has(granted: ReadonlySet<string>, code: CandidateEntitlementCode): boolean {
  return granted.has(code);
}

/**
 * The builder capabilities a candidate actually holds right now.
 *
 * Returning a resolved capability set (rather than letting each caller test five
 * separate strings) is what keeps the UI and the service in step: there is one
 * definition of "this candidate may export a PDF", so a sixth entitlement added
 * later cannot be enforced on the server and forgotten in the UI.
 */
export interface BuilderCapabilities {
  canBuild: boolean;
  canUseProfessionalTemplates: boolean;
  canKeepMultipleVersions: boolean;
  canExportPdf: boolean;
  canViewVersionHistory: boolean;
  /** Convenience: whether anything at all is locked. */
  hasAnyRestriction: boolean;
}

export function resolveBuilderCapabilities(
  granted: ReadonlySet<string> | readonly string[]
): BuilderCapabilities {
  const set = granted instanceof Set ? granted : new Set(granted);
  const capabilities: BuilderCapabilities = {
    canBuild: has(set, CANDIDATE_ENTITLEMENT_CODES.RESUME_BUILDER),
    canUseProfessionalTemplates: has(set, CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES),
    canKeepMultipleVersions: has(set, CANDIDATE_ENTITLEMENT_CODES.MULTIPLE_VERSIONS),
    canExportPdf: has(set, CANDIDATE_ENTITLEMENT_CODES.PDF_EXPORT),
    canViewVersionHistory: has(set, CANDIDATE_ENTITLEMENT_CODES.VERSION_HISTORY),
    hasAnyRestriction: false,
  };
  capabilities.hasAnyRestriction = !Object.values(capabilities)
    .slice(0, 5)
    .every(Boolean);
  return capabilities;
}
