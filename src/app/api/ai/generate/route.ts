// src/app/api/ai/generate/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Kind = "followup" | "post";

/** Very small helper: if OPENAI_API_KEY exists, call OpenAI, else return a mock. */
async function generateText(opts: {
  kind: Kind;
  title?: string | null;
  transcriptUrl?: string | null;
  platform?: string | null;
}) {
  const { kind, title, transcriptUrl, platform } = opts;

  const promptBase = `You are an assistant that writes ${
    kind === "followup" ? "a concise follow-up email" : "a short social media post"
  } after a client meeting. Title: "${title ?? "Untitled"}". Transcript reference (may be a URL): ${
    transcriptUrl ?? "N/A"
  }.`;

  // If you want real AI and have the key:
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: key });
    const sys =
      kind === "followup"
        ? "Write a 2-3 paragraph professional follow-up email in first person. No preface, return only the body."
        : `Write a ${platform === "linkedin" ? "120-180" : "80-140"} word, first-person post summarizing the meeting value. End with up to 3 hashtags. Return only the post text.`;

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: promptBase },
      ],
      temperature: 0.7,
    });

    const text = chat.choices[0]?.message?.content?.trim() || "AI response unavailable.";
    return text;
  }

  // Fallback MOCK (no OpenAI key)
  if (kind === "followup") {
    return [
      `Thanks for the meeting regarding "${title ?? "our agenda"}".`,
      `As discussed, I'll share the recap and next steps shortly.`,
      `Feel free to comment on the shared notes${
        transcriptUrl ? ` (${transcriptUrl})` : ""
      }. Talk soon!`,
    ].join("\n\n");
  }
  // kind === "post"
  return `Had a productive meeting about "${title ?? "our plan"}". We aligned on goals and clear next steps to keep momentum.\n\n#ClientSuccess #Planning #NextSteps`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const fd = await req.formData();
  const meetingId = String(fd.get("meetingId") || "");
  const kind = String(fd.get("kind") || "post") as Kind;
  const automationId = fd.get("automationId") ? String(fd.get("automationId")) : undefined;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { event: true },
  });
  if (!meeting || meeting.userId !== userId) {
    return new Response("Not found", { status: 404 });
  }

  const title = meeting.event?.title ?? "Untitled";
  const transcriptUrl = meeting.transcriptUrl ?? null;

  if (kind === "followup") {
    const text = await generateText({ kind, title, transcriptUrl });
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { aiFollowupEmail: text },
    });
    // back to details
    return Response.redirect(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/meetings/${meeting.id}`, 302);
  }

  // kind === "post"
  // If you later support per-automation prompts, fetch Automation by id here.
  const text = await generateText({
    kind,
    title,
    transcriptUrl,
    platform: "linkedin", // or decide based on automation/provider
  });

  const draft = await prisma.socialPost.create({
    data: {
      meetingId: meeting.id,
      provider: "linkedin", // or "facebook" based on automation selection
      draftText: text,
    },
  });

  return Response.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/meetings/${meeting.id}#draft-${draft.id}`,
    302
  );
}
