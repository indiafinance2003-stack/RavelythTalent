import type { AiProvider, AiRequest } from "./ai-provider";
import {
  classificationOutputSchema,
  draftOutputSchema,
  hasUnsafeDraftPromise,
  parseAiJson,
} from "./ai-safety";
import { AppError } from "@/lib/errors";

export async function generateClassification(
  provider: AiProvider,
  request: AiRequest,
) {
  const result = await provider.complete(request);
  try {
    return {
      ...parseAiJson(result.text, classificationOutputSchema),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch {
    throw new AppError("AI classification was rejected because it did not match the required schema.", 422, "ai_invalid_output");
  }
}

export async function generateDraft(
  provider: AiProvider,
  request: AiRequest,
) {
  const result = await provider.complete(request);
  let output: ReturnType<typeof draftOutputSchema.parse>;
  try {
    output = parseAiJson(result.text, draftOutputSchema);
  } catch {
    throw new AppError("AI draft was rejected because it did not match the required schema.", 422, "ai_invalid_output");
  }
  if (hasUnsafeDraftPromise(output.draft)) {
    throw new AppError("AI draft was rejected because it contains an unsafe promise.", 422, "ai_unsafe_output");
  }
  return {
    ...output,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
