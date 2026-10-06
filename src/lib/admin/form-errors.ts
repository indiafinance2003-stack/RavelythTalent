import { redirect } from "next/navigation";
import { adminFormErrorUrl } from "@/lib/admin/form-error-message";

export async function runAdminFormAction(
  path: string,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const errorUrl = adminFormErrorUrl(path, error);
    if (errorUrl) redirect(errorUrl);
    throw error;
  }
}
