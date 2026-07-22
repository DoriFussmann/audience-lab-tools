import { jsPDF } from "jspdf";
import {
  categoryFields,
  type FieldSchema,
} from "./fields";
import { slugFilename } from "./fusion";
import type { DefineReportMeta, FieldMap } from "./types";

export const PROJECT_REPORTS_BUCKET = "project-reports";

export type ReportSection = {
  label: string;
  bullets: { label: string; value: string }[];
};

export type DefineReportData = {
  projectName: string;
  clientName: string;
  dateLabel: string;
  sections: ReportSection[];
};

function dateFilenameToken(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Cover client line: Example Account when confirmed, else project name. */
export function reportClientName(projectName: string, fields: FieldMap): string {
  const company = fields.companyName;
  if (company?.status === "confirmed" && company.value.trim()) {
    return company.value.trim();
  }
  return projectName.trim() || "Untitled";
}

export function buildDefineReportData(
  projectName: string,
  fields: FieldMap,
  schema: FieldSchema,
  date: Date = new Date()
): DefineReportData {
  const clientName = reportClientName(projectName, fields);
  const sections: ReportSection[] = [];
  for (const cat of schema.categories) {
    const bullets: ReportSection["bullets"] = [];
    for (const f of categoryFields(schema, cat.id)) {
      const state = fields[f.key] || {
        value: "",
        status: "empty" as const,
        inferred: false,
      };
      if (state.status === "empty") continue;
      const value =
        state.status === "skipped" || !state.value.trim()
          ? "—"
          : state.value.trim() +
            (state.inferred && state.status === "confirmed" ? " (inferred)" : "");
      bullets.push({ label: f.label, value });
    }
    if (bullets.length) sections.push({ label: cat.label, bullets });
  }
  return {
    projectName: projectName.trim() || "Untitled",
    clientName,
    dateLabel: date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    sections,
  };
}

export function defineReportFilename(projectName: string, date: Date = new Date()): string {
  return `${slugFilename(projectName) || "project"}-define-summary-${dateFilenameToken(date)}.pdf`;
}

export function defineReportStoragePath(projectId: string): string {
  return `${projectId}/define-summary.pdf`;
}

/** Build a 2-page landscape PDF: cover (login-spirit) + one content page of section bullets. */
export function buildDefineReportPdf(data: DefineReportData): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const brand = { r: 44, g: 74, b: 110 }; // #2c4a6e

  // —— Cover ——
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(0, 0, pageW, pageH, "F");

  // Soft atmospheric washes (approximated as translucent ellipses via light overlays)
  doc.setFillColor(120, 160, 200);
  doc.setGState(doc.GState({ opacity: 0.22 }));
  doc.ellipse(pageW * 0.2, pageH * 0.28, pageW * 0.45, pageH * 0.35, "F");
  doc.setFillColor(40, 70, 110);
  doc.setGState(doc.GState({ opacity: 0.35 }));
  doc.ellipse(pageW * 0.88, pageH * 0.82, pageW * 0.4, pageH * 0.35, "F");
  doc.setGState(doc.GState({ opacity: 1 }));

  // Grid
  doc.setDrawColor(255, 255, 255);
  doc.setGState(doc.GState({ opacity: 0.07 }));
  doc.setLineWidth(0.5);
  for (let x = 0; x <= pageW; x += 48) {
    doc.line(x, 0, x, pageH);
  }
  for (let y = 0; y <= pageH; y += 48) {
    doc.line(0, y, pageW, y);
  }
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setGState(doc.GState({ opacity: 0.5 }));
  doc.text("Audience tools", margin, 44);
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFontSize(40);
  doc.text("Drop The Mic", margin, pageH * 0.42);
  doc.setFontSize(13);
  doc.setGState(doc.GState({ opacity: 0.7 }));
  doc.text("Define your audience. Find your crowd.", margin, pageH * 0.42 + 28);
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFontSize(11);
  doc.setGState(doc.GState({ opacity: 0.55 }));
  doc.text("Audience Definition Report", margin, pageH - 110);
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setFontSize(20);
  doc.text(data.clientName, margin, pageH - 84, {
    maxWidth: pageW * 0.55,
  });
  doc.setFontSize(11);
  doc.setGState(doc.GState({ opacity: 0.7 }));
  let metaY = pageH - 62;
  if (data.clientName !== data.projectName) {
    doc.text(`Project: ${data.projectName}`, margin, metaY, {
      maxWidth: pageW * 0.55,
    });
    metaY += 16;
  }
  doc.text(data.dateLabel, margin, metaY);
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFontSize(10);
  doc.setGState(doc.GState({ opacity: 0.4 }));
  doc.text("Built by Blueprint Intent", pageW - margin, pageH - 36, { align: "right" });
  doc.setGState(doc.GState({ opacity: 1 }));

  // —— Content ——
  doc.addPage("letter", "landscape");
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setTextColor(26, 26, 26); // ink

  doc.setFontSize(14);
  doc.text("Definition Summary", margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(138, 138, 138); // muted
  doc.text(`${data.clientName}  ·  ${data.dateLabel}`, margin, margin + 20);
  doc.setDrawColor(230, 230, 230); // line
  doc.setLineWidth(1);
  doc.line(margin, margin + 30, pageW - margin, margin + 30);

  const contentTop = margin + 46;
  const contentBottom = pageH - margin;
  const colGap = 28;
  const colW = (pageW - margin * 2 - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colW + colGap;

  // Measure sections; pack into two columns to fit one page
  type Block = { label: string; lines: string[]; height: number };
  const blocks: Block[] = [];
  const labelSize = 9;
  const bulletSize = 8;
  const lineH = 11;
  const sectionGap = 10;

  for (const section of data.sections) {
    const lines: string[] = [];
    for (const b of section.bullets) {
      const wrapped = doc.splitTextToSize(`• ${b.label}: ${b.value}`, colW) as string[];
      lines.push(...wrapped);
    }
    const height = 14 + lines.length * lineH + sectionGap;
    blocks.push({ label: section.label, lines, height });
  }

  // Greedy column pack
  let leftH = 0;
  let rightH = 0;
  const leftBlocks: Block[] = [];
  const rightBlocks: Block[] = [];
  for (const block of blocks) {
    if (leftH <= rightH) {
      leftBlocks.push(block);
      leftH += block.height;
    } else {
      rightBlocks.push(block);
      rightH += block.height;
    }
  }

  const maxH = contentBottom - contentTop;
  const totalH = Math.max(leftH, rightH);
  const scale = totalH > maxH ? maxH / totalH : 1;
  const drawLineH = lineH * scale;
  const drawSectionTitle = 11 * scale;

  function drawColumn(blocksInCol: Block[], x: number) {
    let y = contentTop;
    for (const block of blocksInCol) {
      doc.setFontSize(Math.max(7, labelSize * scale));
      doc.setTextColor(138, 138, 138);
      doc.text(block.label.toUpperCase(), x, y);
      y += drawSectionTitle;
      doc.setFontSize(Math.max(6.5, bulletSize * scale));
      doc.setTextColor(26, 26, 26);
      for (const line of block.lines) {
        if (y > contentBottom - 4) break;
        doc.text(line, x, y, { maxWidth: colW });
        y += drawLineH;
      }
      y += sectionGap * scale;
    }
  }

  drawColumn(leftBlocks, leftX);
  drawColumn(rightBlocks, rightX);

  return doc.output("blob");
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload via server (creates bucket if needed; uses service role). */
export async function uploadDefineReport(projectId: string, blob: Blob): Promise<string> {
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("file", blob, "define-summary.pdf");
  const res = await fetch("/api/define-report", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return String(data.path);
}

export async function removeDefineReport(projectId: string, path: string): Promise<void> {
  const params = new URLSearchParams({ projectId, path });
  const res = await fetch(`/api/define-report?${params}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Delete failed");
  }
}

export async function getDefineReportSignedUrl(
  projectId: string,
  path: string
): Promise<string> {
  const params = new URLSearchParams({ projectId, path });
  const res = await fetch(`/api/define-report?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not open PDF");
  return String(data.url);
}

export function buildReportMeta(
  path: string,
  fileName: string,
  clientName: string,
  savedAt: number = Date.now()
): DefineReportMeta {
  return { path, fileName, savedAt, clientName };
}
