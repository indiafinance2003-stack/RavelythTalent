/** Shared form/action state so every form reports errors the same way. */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Values to repopulate after a failure (never includes passwords). */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

export function formError(message: string, values?: Record<string, string>): FormState {
  return { status: "error", message, ...(values ? { values } : {}) };
}

export function formSuccess(message: string, values?: Record<string, string>): FormState {
  return { status: "success", message, ...(values ? { values } : {}) };
}

/** Flattens a ZodError into `{ field: message }` for form rendering. */
export function fieldErrorsFromIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}