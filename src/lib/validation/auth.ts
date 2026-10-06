import { z } from "zod";

/** Auth-related zod schemas. Every server action and API route parses with these. */

export const emailSchema = z
  .email("Enter a valid email address.")
  .max(254, "Email address is too long.")
  .transform((v) => v.trim().toLowerCase());

/**
 * 8-72 characters: the lower bound is our policy, the upper bound is bcrypt's
 * hard limit and protects argon2 from absurdly large inputs.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

/** Indian mobile numbers: 10 digits starting 6-9, optionally prefixed with 91. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?91[-\s]?)?[6-9]\d{9}$/,
    "Enter a valid 10-digit Indian mobile number.",
  )
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length === 10 ? `+91${digits}` : `+${digits}`;
  });

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name.")
  .max(120, "Name is too long.");

export const companyNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your company name.")
  .max(160, "Company name is too long.");

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: z
      .union([phoneSchema, z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    role: z.enum(["job_seeker", "recruiter"]).default("job_seeker"),
    companyName: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined)),
    companyWebsite: z
      .union([
        z.string().trim().max(200).url("Enter a valid company website URL."),
        z.literal(""),
      ])
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.role !== "recruiter" || Boolean(data.companyName), {
    message: "Company name is required to register as a recruiter.",
    path: ["companyName"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, "Invalid reset link."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(["login", "phone_verification"]).default("login"),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
  purpose: z.enum(["login", "phone_verification"]).default("login"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** Convenience for actions that receive a FormData object. */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}