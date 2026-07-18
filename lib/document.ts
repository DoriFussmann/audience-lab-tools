/** Client-side helpers for Audience Define document upload. */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const TEXT_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".rtf",
]);

const PDF_EXTS = new Set([".pdf"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export type PreparedDocument =
  | { kind: "text"; name: string; text: string }
  | { kind: "pdf"; name: string; mediaType: "application/pdf"; data: string }
  | {
      kind: "image";
      name: string;
      mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
      data: string;
    };

export function acceptAttribute() {
  return ".txt,.md,.markdown,.csv,.tsv,.json,.rtf,.pdf,.png,.jpg,.jpeg,.gif,.webp";
}

export function isSupportedDocument(file: File): boolean {
  const ext = extension(file.name);
  return TEXT_EXTS.has(ext) || PDF_EXTS.has(ext) || IMAGE_EXTS.has(ext);
}

function extension(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function imageMediaType(
  file: File
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  const byType = file.type.toLowerCase();
  if (byType === "image/png") return "image/png";
  if (byType === "image/jpeg") return "image/jpeg";
  if (byType === "image/gif") return "image/gif";
  if (byType === "image/webp") return "image/webp";
  const ext = extension(file.name);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return null;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Prepare a local file for /api/define. Throws a user-facing Error on failure. */
export async function prepareDocument(file: File): Promise<PreparedDocument> {
  if (!file || !file.size) throw new Error("Empty file");
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File is too large (max 10 MB)");
  }
  if (!isSupportedDocument(file)) {
    throw new Error("Supported formats: PDF, text (.txt, .md, .csv, .json), or image");
  }

  const ext = extension(file.name);
  const name = file.name || "document";

  if (TEXT_EXTS.has(ext) || (file.type.startsWith("text/") && !PDF_EXTS.has(ext))) {
    const text = (await readAsText(file)).trim();
    if (!text) throw new Error("Document has no readable text");
    return { kind: "text", name, text };
  }

  if (PDF_EXTS.has(ext) || file.type === "application/pdf") {
    const data = await readAsBase64(file);
    return { kind: "pdf", name, mediaType: "application/pdf", data };
  }

  const mediaType = imageMediaType(file);
  if (mediaType) {
    const data = await readAsBase64(file);
    return { kind: "image", name, mediaType, data };
  }

  throw new Error("Supported formats: PDF, text (.txt, .md, .csv, .json), or image");
}
