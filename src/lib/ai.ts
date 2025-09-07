import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateFollowupEmail(transcriptText: string) {
  const prompt = `You are an assistant composing a concise, professional follow-up email to a client after a meeting.
Include: greeting, 3-5 bullet recap points with specifics, clear next steps, and a warm closing.
Meeting transcript:
${transcriptText}`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3
  });
  return res.choices[0]?.message?.content || "";
}

export async function generateSocialPost(transcriptSummary: string, platform: "linkedin"|"facebook") {
  const prompt = `Write a short ${platform} post (<220 words, ideally 50-120) highlighting insights from a client meeting.
Tone: expert, friendly, compliance-safe (no PII). Include 1-2 relevant hashtags. No emojis.
Transcript summary:
${transcriptSummary}`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5
  });
  return res.choices[0]?.message?.content || "";
}
