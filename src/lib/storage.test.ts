import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readValidatedUpload,
  resolveStoredPath,
  safeFileName,
  sniffMime,
} from "./storage";

const pdfMime = "application/pdf";
const pdfBytes = Buffer.from("%PDF-1.7\nlocal test fixture\n");
const pdfOptions = { allowedMimes: [pdfMime], maxBytes: 5 * 1024 * 1024 };

describe("upload validation and private storage paths", () => {
  it("sniffs real PDF magic bytes and rejects content disguised as a PDF", () => {
    expect(sniffMime(pdfBytes)).toBe(pdfMime);
    expect(sniffMime(Buffer.from("not a PDF"))).toBeNull();
  });

  it("accepts a valid PDF but rejects fake extensions, MIME mismatches and oversized files", async () => {
    const valid = new File([pdfBytes], "resume.pdf", { type: pdfMime });
    await expect(readValidatedUpload(valid, pdfOptions)).resolves.toMatchObject({ mimeType: pdfMime });

    const fake = new File([Buffer.from("not a PDF")], "resume.pdf", { type: pdfMime });
    await expect(readValidatedUpload(fake, pdfOptions)).rejects.toMatchObject({ code: "invalid_file_contents" });

    const wrongExtension = new File([pdfBytes], "resume.exe", { type: pdfMime });
    await expect(readValidatedUpload(wrongExtension, pdfOptions)).rejects.toMatchObject({ code: "unsupported_file_type" });

    const traversalName = new File([pdfBytes], "../resume.pdf", { type: pdfMime });
    await expect(readValidatedUpload(traversalName, pdfOptions)).rejects.toMatchObject({ code: "invalid_file_name" });

    const oversized = new File([Buffer.alloc(33)], "resume.pdf", { type: pdfMime });
    await expect(readValidatedUpload(oversized, { ...pdfOptions, maxBytes: 32 })).rejects.toMatchObject({ code: "file_too_large" });
  });

  it("normalizes display names and refuses traversal outside the upload root", async () => {
    expect(safeFileName("../../private resume.pdf")).toBe("private_resume.pdf");
    await expect(resolveStoredPath(path.join("..", "outside.txt"))).rejects.toMatchObject({ code: "invalid_path" });
  });
});
