/**
 * Intro draft generation (FR-E2/E3): share-safe prompt → OpenRouter →
 * Zod-validated JSON; 1 strict retry; template fallback keeps the composer
 * usable with the LLM down (mirrors rerank degraded mode).
 */
import { z } from "zod";
import { chatCompletion, extractJson, Message } from "../llm/client";
import { isCircuitOpen, recordFailure, recordSuccess } from "../llm/breaker";

export const DraftSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(1500),
});
export type Draft = z.infer<typeof DraftSchema>;

export interface DraftContext {
  userName: string;
  target: { name: string; title: string | null; company: string | null };
  mutual: { name: string; title: string | null; company: string | null } | null;
}

const who = (p: { name: string; title: string | null; company: string | null }) =>
  `${p.name}${p.title ? `, ${p.title}` : ""}${p.company ? ` at ${p.company}` : ""}`;

export function buildDraftMessages(ctx: DraftContext): Message[] {
  const system =
    'You write short, warm intro-request emails. Output ONLY JSON: {"subject": string, "body": string}. ' +
    "Rules: max 120 words; ask the MUTUAL for a brief intro to the TARGET; never include email addresses; " +
    "never invent facts beyond those provided; no pressure language.";

  const user = ctx.mutual
    ? `From: ${ctx.userName}. Mutual contact: ${who(ctx.mutual)}. Target: ${who(ctx.target)}. ` +
      `Write a request to ${ctx.mutual.name} asking for an introduction to ${ctx.target.name}.`
    : `From: ${ctx.userName}. Target: ${who(ctx.target)}. ` +
      `No mutual exists — write a brief self-introduction to ${ctx.target.name} instead.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function generateFallbackDraft(ctx: DraftContext): Draft {
  if (ctx.mutual) {
    return {
      subject: `Quick intro to ${ctx.target.name}?`,
      body:
        `Hi ${ctx.mutual.name},\n\n` +
        `I'm trying to reach ${ctx.target.name}${ctx.target.company ? ` at ${ctx.target.company}` : ""} and a warm path would mean a lot. ` +
        `Would you be open to making a brief introduction?\n\n` +
        `Thanks,\n${ctx.userName}`,
    };
  }
  return {
    subject: `Great to meet you, ${ctx.target.name}`,
    body:
      `Hi ${ctx.target.name},\n\n` +
      `I came across your work${ctx.target.title ? ` as ${ctx.target.title}` : ""}${ctx.target.company ? ` at ${ctx.target.company}` : ""} and wanted to introduce myself. ` +
      `Would you be open to a short conversation?\n\n` +
      `Best,\n${ctx.userName}`,
  };
}

export async function generateDraft(
  ctx: DraftContext,
  deps = { chatCompletion, extractJson, isCircuitOpen, recordSuccess, recordFailure }
): Promise<{ draft: Draft; degraded: boolean }> {
  if (await deps.isCircuitOpen()) {
    return { draft: generateFallbackDraft(ctx), degraded: true };
  }

  const messages = buildDraftMessages(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.chatCompletion(messages, { temperature: 0.4, maxTokens: 400 });
      const draft = DraftSchema.parse(deps.extractJson<unknown>(raw));
      await deps.recordSuccess();
      return { draft, degraded: false };
    } catch {
      messages.push({
        role: "user",
        content: 'Your previous reply was not valid JSON. Reply with ONLY {"subject": string, "body": string}.',
      });
    }
  }

  await deps.recordFailure();
  return { draft: generateFallbackDraft(ctx), degraded: true };
}
