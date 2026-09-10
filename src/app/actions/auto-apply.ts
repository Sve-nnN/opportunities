"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getOpportunityByExternalId } from "@/db/queries/opportunities";
import { getAllProfileFields } from "@/db/queries/profile";
import { buildApplyPrompt } from "@/lib/auto-apply-prompt";

// Same T-07-01 criterion as the callback route (route.ts): the client
// (Plan 07-02's SendToAiButton) sends only this string — url/title/company/
// perfil are always re-read server-side below, never accepted from the
// client.
const externalIdSchema = z.string().min(1);

export type GenerateApplyPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; message: string };

/**
 * Server Action wrapping `buildApplyPrompt` with real server-side reads
 * (07-CONTEXT.md "Generación del prompt"). Never writes to Postgres and
 * never calls `revalidatePath` — generating/copying a prompt is not a
 * tracking event, only the Phase 6 callback route is (07-CONTEXT.md
 * "Generar/copiar el prompt NO marca ningún estado del lado del servidor").
 */
export async function generateApplyPrompt(
  externalId: string,
): Promise<GenerateApplyPromptResult> {
  const parsedExternalId = externalIdSchema.safeParse(externalId);
  if (!parsedExternalId.success) {
    return { ok: false, message: "Invalid externalId" };
  }

  // Checked BEFORE any DB read (07-01-PLAN.md action) — never spend a query
  // on an opportunity/profile lookup that would only produce an unusable
  // prompt (a curl block with no Authorization value) anyway.
  const callbackSecret = process.env.AUTO_APPLY_CALLBACK_SECRET;
  if (!callbackSecret) {
    return { ok: false, message: "Falta configurar AUTO_APPLY_CALLBACK_SECRET" };
  }

  // Defensive, in practice unreachable from the UI (the button only ever
  // renders for a real row) — the Server Action still never blindly trusts
  // its own argument (07-01-PLAN.md threat_model T-07-01). The `!opportunity.url`
  // check enforces "Oportunidades sin url: botón deshabilitado" server-side
  // too (07-CONTEXT.md) — the disabled `<button>` is a client-only UX hint
  // and is not a trust boundary; without this, any real externalId for a
  // URL-less opportunity still produced a curl block embedding the real
  // secret with no application page to justify it (fixed per code review
  // WR-01, 07-REVIEW.md).
  const opportunity = await getOpportunityByExternalId(parsedExternalId.data);
  if (!opportunity || !opportunity.url) {
    return { ok: false, message: "No se encontró la oportunidad" };
  }

  const profileFieldRows = await getAllProfileFields();
  const baseUrl = await resolveBaseUrl();

  const prompt = buildApplyPrompt({
    externalId: parsedExternalId.data,
    opportunityUrl: opportunity.url ?? "",
    opportunityTitle: opportunity.title,
    opportunityCompany: opportunity.company,
    profileFields: profileFieldRows.map((field) => ({
      label: field.label,
      value: field.value,
      category: field.category,
    })),
    baseUrl,
    callbackSecret,
  });

  return { ok: true, prompt };
}

/**
 * `NEXT_PUBLIC_APP_URL` wins when set (used as-is, trailing slash trimmed
 * so callers can always append `/api/...` without a double slash). This is
 * the only trustworthy source in production — set it in Dokploy.
 *
 * If unset, falls back to the request's own `host` header — deliberately
 * NEVER `x-forwarded-host`. `host` cannot be overridden by client-side
 * `fetch()` (it's a forbidden header name in the Fetch spec — the browser
 * always sends the real connection host). `x-forwarded-host` IS
 * attacker-settable (XSS, a malicious extension, or a hand-crafted direct
 * call to this Server Action) and this value feeds straight into the
 * `POST ${baseUrl}/.../apply-session` line embedded in the generated curl
 * block, which also carries `AUTO_APPLY_CALLBACK_SECRET` — trusting a
 * spoofable header here would let an attacker redirect where the secret is
 * sent (fixed per code review CR-01, 07-REVIEW.md). `x-forwarded-proto` is
 * not attacker-relevant the same way (it only picks http/https), so it's
 * still read with a `https` default unless the resolved host looks like a
 * local dev host, matching how this app is actually run locally (`pnpm dev`
 * on plain HTTP). `headers()` is available inside Server Actions in
 * Next.js 16 (confirmed via Context7 `/vercel/next.js`).
 */
async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost";
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");
  const proto =
    headerList.get("x-forwarded-proto") ?? (isLocalHost ? "http" : "https");

  return `${proto}://${host}`;
}
