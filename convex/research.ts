"use node";
import { createHash } from "node:crypto";
import { Agent } from "@convex-dev/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  chooseDocumentLinks,
  companyFor,
  officialUrl,
  startingSource,
} from "./lib/companies";
import {
  eventIdentity,
  RESEARCH_INSTRUCTIONS,
  validateEvents,
} from "./lib/evidence";

const extractionSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      kind: z.enum([
        "results",
        "guidance",
        "corporate_action",
        "business_update",
        "other",
      ]),
      eventDate: z.string().nullable(),
      dateEvidence: z.string().nullable(),
      status: z.enum(["supports", "contradicts", "unclear"]),
      answer: z.string(),
      citations: z.array(z.object({ sourceId: z.string(), quote: z.string() })),
    }),
  ),
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type SourceResult = {
  url: string;
  label: string;
  state: "changed" | "unchanged" | "failed";
  message?: string;
};
class ResearchError extends Error {}

async function scrape(symbol: string, url: string, apiKey: string) {
  if (!officialUrl(symbol, url))
    throw new ResearchError(
      "This source is outside the company's official website.",
    );
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      maxAge: 0,
      timeout: 35000,
    }),
  });
  if (!response.ok)
    throw new ResearchError(
      `Source retrieval is unavailable (HTTP ${response.status}).`,
    );
  const payload = await response.json();
  if (
    !payload.success ||
    typeof payload.data?.markdown !== "string" ||
    (payload.data.metadata?.statusCode ?? 200) >= 400
  )
    throw new ResearchError("The source page could not be read.");
  const finalUrl = officialUrl(
    symbol,
    payload.data.metadata?.url ?? payload.data.metadata?.sourceURL ?? url,
  );
  if (!finalUrl)
    throw new ResearchError(
      "The source redirected outside the company's official website.",
    );
  const content = payload.data.markdown.slice(0, 24000);
  if (content.trim().length < 80)
    throw new ResearchError("The source returned too little readable text.");
  return {
    url: finalUrl,
    content,
    links: Array.isArray(payload.data.links)
      ? payload.data.links.filter(
          (link: unknown): link is string => typeof link === "string",
        )
      : [],
  };
}

export const run = internalAction({
  args: { checkId: v.id("checks") },
  returns: v.null(),
  handler: async (ctx, { checkId }) => {
    if (!(await ctx.runMutation(internal.checkData.start, { checkId })))
      return null;
    const data = await ctx.runQuery(internal.watches.forCheck, { checkId });
    if (!data) return null;
    const sourceResults: SourceResult[] = [];
    try {
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      const gatewayKey = process.env.AI_GATEWAY_API_KEY;
      if (!firecrawlKey || !gatewayKey)
        throw new ResearchError(
          "Research is being configured. Your question is saved; try checking it again shortly.",
        );
      const company = companyFor(data.watch.symbol);
      const sources: {
        id: Id<"snapshots">;
        text: string;
        url: string;
        hash: string;
      }[] = [];
      const foundLinks: string[] = [];
      const attempted: string[] = [];
      const read = async (source: { url: string; label: string }) => {
        attempted.push(source.url);
        try {
          const page = await scrape(
            data.watch.symbol,
            source.url,
            firecrawlKey,
          );
          foundLinks.push(...page.links);
          const contentHash = hash(page.content);
          const saved = await ctx.runMutation(
            internal.checkData.recordSnapshot,
            {
              checkId,
              url: page.url,
              label: source.label,
              contentHash,
              content: page.content,
            },
          );
          if (!saved)
            throw new ResearchError(
              "This check was replaced or the watch was archived.",
            );
          sources.push({
            id: saved.snapshotId,
            text: page.content,
            url: page.url,
            hash: contentHash,
          });
          sourceResults.push({
            url: page.url,
            label: source.label,
            state: saved.isNew ? "changed" : "unchanged",
          });
        } catch (error) {
          sourceResults.push({
            ...source,
            state: "failed",
            message:
              error instanceof ResearchError
                ? error.message
                : "The source did not respond in time.",
          });
        }
      };
      // Spend the small retrieval budget on a document chain, rather than
      // stopping at three navigation/index pages. Each new official page can
      // reveal the actual earnings release or filing for the next slot.
      await read(startingSource(company.symbol, data.watch.question));
      while (attempted.length < 3) {
        const next = chooseDocumentLinks(
          company.symbol,
          foundLinks,
          attempted,
        )[0];
        if (next) {
          await read({
            url: next,
            label: /\.pdf(?:\?|$)/i.test(next)
              ? "Official disclosure document"
              : "Linked official disclosure",
          });
        } else {
          const fallback = company.sources.find(
            (source) => !attempted.includes(source.url),
          );
          if (!fallback) break;
          await read(fallback);
        }
      }
      if (!sources.length)
        throw new ResearchError(
          "None of the official pages could be retrieved. Your previous evidence is unchanged; try again later.",
        );
      const inputHash = hash(
        JSON.stringify({
          sources: sources.map((source) => [source.url, source.hash]).sort(),
          failed: sourceResults
            .filter((source) => source.state === "failed")
            .map((source) => source.url)
            .sort(),
        }),
      );
      if (data.watch.lastSuccessfulHash === inputHash) {
        await ctx.runMutation(internal.checkData.complete, {
          checkId,
          inputHash,
          sourceResults,
          events: [],
          rejectedEvents: 0,
          message:
            "Checked the official sources. Their saved text has not changed; no duplicate events were added.",
        });
        return null;
      }
      const provider = createOpenAI({
        apiKey: gatewayKey,
        baseURL: "https://ai-gateway.vercel.sh/v1",
      });
      const agent = new Agent(components.agent, {
        name: "ThesisLine evidence researcher",
        languageModel: provider.chat("openai/gpt-4.1"),
        instructions: RESEARCH_INSTRUCTIONS,
      });
      const { threadId } = await agent.createThread(ctx, {
        userId: data.watch.userId,
        title: `${company.symbol}: source check`,
      });
      const result = await agent.generateObject(
        ctx,
        { threadId, userId: data.watch.userId },
        {
          schema: extractionSchema,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(75000),
          prompt: JSON.stringify({
            company: company.name,
            question: data.watch.question,
            sources: sources.map((source) => ({
              sourceId: source.id,
              officialUrl: source.url,
              text: source.text,
            })),
          }),
        },
        {
          contextOptions: { recentMessages: 0 },
          storageOptions: { saveMessages: "promptAndOutput" },
        },
      );
      const candidates = result.object.events;
      const valid = validateEvents(candidates, sources);
      const failures = sourceResults.filter(
        (source) => source.state === "failed",
      ).length;
      const rejectedEvents = candidates.length - valid.length;
      const message = valid.length
        ? `Checked ${sources.length} official source page${sources.length === 1 ? "" : "s"}.${failures ? ` ${failures} page could not be retrieved; coverage is incomplete.` : ""}${rejectedEvents ? ` ${rejectedEvents} unverified candidate event was omitted.` : ""}`
        : "No new event with a verified quotation answered this question in the checked sources. Review the original pages for context.";
      await ctx.runMutation(internal.checkData.complete, {
        checkId,
        inputHash,
        sourceResults,
        rejectedEvents,
        message,
        events: valid.map((event) => ({
          ...event,
          fingerprint: hash(eventIdentity(event)),
          citations: event.citations.map((citation) => ({
            snapshotId: citation.sourceId as Id<"snapshots">,
            quote: citation.quote,
          })),
        })),
      });
    } catch (error) {
      const message =
        error instanceof ResearchError
          ? error.message
          : "The research service could not finish this check. Your original sources and earlier evidence are saved. Please try again later.";
      await ctx.runMutation(internal.checkData.fail, {
        checkId,
        message,
        sourceResults,
      });
    }
    return null;
  },
});
