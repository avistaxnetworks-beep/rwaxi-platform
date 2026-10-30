import "server-only";
import crypto from "node:crypto";
import { platformPrisma, type Prisma } from "@rwaxi/database";
import { requestMeta } from "@/app/_lib/server/tenant-context";

/**
 * A console report as a file: CSV (UTF-8 with BOM, so spreadsheets read the accents), its SHA-256 over the exact bytes
 * served, and a PLATFORM_REPORT_EXPORTED AuditEvent — organization-less, like console logins — naming who exported
 * which report with which filters, how many rows, and that hash (subjectHash): the file can be checked later.
 */
export function csvOf(header: string[], rows: unknown[][]): { body: Buffer; sha256: string } {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = `﻿${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
  const body = Buffer.from(text, "utf8");
  return { body, sha256: `0x${crypto.createHash("sha256").update(body).digest("hex")}` };
}

export async function recordReportExport(
  actor: { id: string; email: string },
  report: "audit" | "fees",
  details: { filters: Record<string, unknown>; rows: number; truncated: boolean; sha256: string; fileName: string },
): Promise<void> {
  const meta = await requestMeta();
  await platformPrisma().auditEvent.create({
    data: {
      organizationId: null,
      action: "PLATFORM_REPORT_EXPORTED",
      actorUserId: actor.id,
      actorEmail: actor.email,
      entityType: "PlatformReport",
      entityId: details.fileName,
      subjectHash: details.sha256,
      payload: { report, ...details } as Prisma.InputJsonValue,
      ...meta,
    },
  });
}

/** The answer of a file export: bytes, name, and the SHA-256 the console shows (and the export event records). */
export function fileResponse(body: Buffer, fileName: string, sha256: string, rows: number): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-SHA256": sha256,
      "X-Report-Rows": String(rows),
    },
  });
}
