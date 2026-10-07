import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SMS provider adapter tests (Task 10.1).
 *
 * The HTTP layer is always mocked - no test ever calls MSG91 or Twilio.
 * Module state (`getEnv()` caches) is reloaded per test with `vi.resetModules`
 * so each case can supply its own SMS_* environment.
 */

const ENV_KEYS = [
  "SMS_PROVIDER",
  "MSG91_AUTH_KEY",
  "MSG91_SENDER_ID",
  "MSG91_TEMPLATE_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
] as const;

type EnvOverrides = Partial<Record<(typeof ENV_KEYS)[number], string>>;

let savedEnv: Record<string, string | undefined> = {};

async function loadSms(overrides: EnvOverrides = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  vi.resetModules();
  return import("./index");
}

type Reply = { status: number; body: unknown };

function stubFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const reply = replies[Math.min(index, replies.length - 1)] ?? { status: 500, body: {} };
    index += 1;
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      json: async () => reply.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", mock);
  return { mock, calls };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const input = {
  to: "+919876543210",
  otp: "481920",
  purpose: "login" as const,
  expiresInMinutes: 5,
};

const msg91Configured: EnvOverrides = {
  SMS_PROVIDER: "msg91",
  MSG91_AUTH_KEY: "auth-key-1",
  MSG91_SENDER_ID: "RVTHLT",
  MSG91_TEMPLATE_ID: "dlt-template-1",
};

const twilioConfigured: EnvOverrides = {
  SMS_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "unit-token",
  TWILIO_FROM_NUMBER: "+15005550006",
};

function headers(init: RequestInit | undefined): Record<string, string> {
  const value = init?.headers;
  if (!value) return {};
  if (Array.isArray(value)) return Object.fromEntries(value as [string, string][]);
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  return { ...value };
}

describe("getSmsProvider", () => {
  it("defaults to the console provider", async () => {
    const sms = await loadSms({});
    expect(sms.getSmsProvider().name).toBe("console");
  });

  it("selects MSG91 and Twilio from SMS_PROVIDER", async () => {
    const msg91 = await loadSms(msg91Configured);
    expect(msg91.getSmsProvider().name).toBe("msg91");

    const twilio = await loadSms(twilioConfigured);
    expect(twilio.getSmsProvider().name).toBe("twilio");
  });
});

describe("smsProviderAvailable", () => {
  it("is false for the console provider so OTP login stays hidden", async () => {
    const sms = await loadSms({ SMS_PROVIDER: "console" });
    expect(sms.smsProviderAvailable()).toBe(false);
  });

  it("is false for MSG91 until every credential exists", async () => {
    const missingAll = await loadSms({ SMS_PROVIDER: "msg91" });
    expect(missingAll.smsProviderAvailable()).toBe(false);

    const partial = await loadSms({
      SMS_PROVIDER: "msg91",
      MSG91_AUTH_KEY: "auth-key-1",
    });
    expect(partial.smsProviderAvailable()).toBe(false);
  });

  it("is true for MSG91 with all credentials", async () => {
    const sms = await loadSms(msg91Configured);
    expect(sms.smsProviderAvailable()).toBe(true);
  });

  it("is false for Twilio until every credential exists", async () => {
    const missingAll = await loadSms({ SMS_PROVIDER: "twilio" });
    expect(missingAll.smsProviderAvailable()).toBe(false);

    const partial = await loadSms({
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
    });
    expect(partial.smsProviderAvailable()).toBe(false);
  });

  it("is true for Twilio with all credentials", async () => {
    const sms = await loadSms(twilioConfigured);
    expect(sms.smsProviderAvailable()).toBe(true);
  });
});

describe("Msg91SmsProvider", () => {
  it("posts to the v5 flow endpoint with the auth key, template and 10-digit number", async () => {
    const { calls } = stubFetch([{ status: 200, body: { type: "success", jobId: "job-9" } }]);
    const sms = await loadSms(msg91Configured);
    const provider = sms.getSmsProvider();

    expect(provider.isConfigured()).toBe(true);
    const result = await provider.sendOtp(input);

    expect(result.providerMessageId).toBe("job-9");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(calls[0].init?.method).toBe("POST");
    expect(headers(calls[0].init).authkey).toBe("auth-key-1");

    const body = JSON.parse(String(calls[0].init?.body)) as {
      template_id: string;
      sender: string;
      short_url: string;
      recipients: Array<{ mobiles: string; OTP: string; otp: string }>;
    };
    expect(body.template_id).toBe("dlt-template-1");
    expect(body.sender).toBe("RVTHLT");
    expect(body.short_url).toBe("0");
    expect(body.recipients[0]).toEqual({
      mobiles: "9876543210",
      OTP: "481920",
      otp: "481920",
    });
  });

  it("treats a type: error response as a failure even on HTTP 200", async () => {
    stubFetch([{ status: 200, body: { type: "error", message: "Invalid template" } }]);
    const sms = await loadSms(msg91Configured);
    await expect(sms.getSmsProvider().sendOtp(input)).rejects.toThrow(
      /HTTP 200: Invalid template/,
    );
  });

  it("surfaces HTTP failures from the provider", async () => {
    stubFetch([{ status: 401, body: { type: "error", message: "invalid authkey" } }]);
    const sms = await loadSms(msg91Configured);
    await expect(sms.getSmsProvider().sendOtp(input)).rejects.toThrow(
      /HTTP 401: invalid authkey/,
    );
  });

  it("refuses before any network call when credentials are missing", async () => {
    const { mock } = stubFetch([{ status: 200, body: { type: "success" } }]);
    const sms = await loadSms({ SMS_PROVIDER: "msg91" });
    const error = await sms
      .getSmsProvider()
      .sendOtp(input)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 503, code: "sms_provider_unavailable" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("turns transport failures into plain errors for the generic OTP message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ETIMEDOUT");
      }),
    );
    const sms = await loadSms(msg91Configured);
    const error = await sms
      .getSmsProvider()
      .sendOtp(input)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty("status");
    expect((error as Error).message).toContain("SMS request failed");
  });
});

describe("TwilioSmsProvider", () => {
  it("posts an x-www-form-urlencoded message with Basic auth", async () => {
    const { calls } = stubFetch([
      { status: 201, body: { sid: "SM123", status: "queued" } },
    ]);
    const sms = await loadSms(twilioConfigured);
    const provider = sms.getSmsProvider();

    expect(provider.isConfigured()).toBe(true);
    const result = await provider.sendOtp(input);

    expect(result.providerMessageId).toBe("SM123");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(headers(calls[0].init).Authorization).toBe(
      `Basic ${Buffer.from("AC123:unit-token").toString("base64")}`,
    );

    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("To")).toBe("+919876543210");
    expect(body.get("From")).toBe("+15005550006");
    expect(body.get("Body")).toContain("481920");
    expect(body.get("Body")).toContain("5 minutes");
  });

  it("uses the phone-verification wording for that purpose", async () => {
    const { calls } = stubFetch([
      { status: 201, body: { sid: "SM124", status: "queued" } },
    ]);
    const sms = await loadSms(twilioConfigured);
    await sms.getSmsProvider().sendOtp({ ...input, purpose: "phone_verification" });

    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("Body")).toContain("phone verification code");
  });

  it("surfaces HTTP failures from the provider", async () => {
    stubFetch([
      { status: 401, body: { code: 20003, message: "Authenticate" } },
    ]);
    const sms = await loadSms(twilioConfigured);
    await expect(sms.getSmsProvider().sendOtp(input)).rejects.toThrow(
      /HTTP 401: Authenticate/,
    );
  });

  it("refuses before any network call when credentials are missing", async () => {
    const { mock } = stubFetch([{ status: 201, body: { sid: "SM1" } }]);
    const sms = await loadSms({ SMS_PROVIDER: "twilio" });
    const error = await sms
      .getSmsProvider()
      .sendOtp(input)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 503, code: "sms_provider_unavailable" });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("ConsoleSmsProvider", () => {
  it("logs the OTP in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sms = await loadSms({ SMS_PROVIDER: "console" });
    const result = await sms.getSmsProvider().sendOtp(input);

    expect(result.providerMessageId).toMatch(/^console-/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("otp=481920");
  });

  it("refuses to send anything in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sms = await loadSms({ SMS_PROVIDER: "console" });
    const error = await sms
      .getSmsProvider()
      .sendOtp(input)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 503, code: "sms_provider_unavailable" });
  });
});

describe("dispatchOtp", () => {
  it("returns true when the provider accepts the message", async () => {
    stubFetch([{ status: 201, body: { sid: "SM1", status: "queued" } }]);
    const sms = await loadSms(twilioConfigured);
    await expect(sms.dispatchOtp(input)).resolves.toBe(true);
  });

  it("returns false instead of throwing on transport failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    );
    const sms = await loadSms(twilioConfigured);
    await expect(sms.dispatchOtp(input)).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
