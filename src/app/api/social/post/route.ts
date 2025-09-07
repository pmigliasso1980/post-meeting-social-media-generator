import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

async function postToLinkedIn(text: string, accessToken: string) {
  // Paso 1: obtener el actor (urn) del usuario autenticado
  const meResp = await fetch("https://api.linkedin.com/v2/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  if (!meResp.ok) throw new Error(`LinkedIn /me failed: ${await meResp.text()}`);
  const me = await meResp.json();
  const actor = me.id ? `urn:li:person:${me.id}` : null;
  if (!actor) throw new Error("No actor urn");

  // Paso 2: crear el post UGC (texto puro)
  const body = {
    author: actor,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "CONNECTIONS" },
  };

  const postResp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!postResp.ok) throw new Error(`LinkedIn post failed: ${await postResp.text()}`);
  const data = await postResp.json();
  // `id` suele traer el URN del post
  return data;
}

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const socialPostId = String(fd.get("socialPostId") || "");

  const sp = await prisma.socialPost.findUnique({
    where: { id: socialPostId },
    include: { meeting: true },
  });
  if (!sp) return new Response("Not found", { status: 404 });
  if (sp.postedAt) return Response.json({ ok: true, alreadyPosted: true });

  let postUrl: string | null = null;
  let posted = false;

  try {
    if (sp.provider === "linkedin") {
      const sa = await prisma.socialAccount.findFirst({
        where: { userId: sp.meeting.userId, provider: "linkedin" },
      });

      if (sa?.accessToken) {
        const res = await postToLinkedIn(sp.draftText, sa.accessToken);
        // armar URL pública aproximada (LinkedIn no devuelve directa)
        const urn = res?.id as string | undefined; // e.g. urn:li:ugcPost:XXXX
        postUrl = urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}` : null;
        posted = true;
      }
    }

    // TODO: provider === "facebook" → usar Graph API con Page token (/me/feed?message=)
    // por ahora mockeamos SI NO hay token o proveedor no soportado
  } catch (e) {
    console.error("post social error", e);
  }

  const now = new Date();
  const finalUrl =
    postUrl ||
    (sp.provider === "facebook"
      ? `https://www.facebook.com/permalink/${sp.id.slice(0, 8)}`
      : `https://www.linkedin.com/feed/update/${sp.id.slice(0, 8)}`);

  await prisma.socialPost.update({
    where: { id: sp.id },
    data: {
      postedAt: now,
      postUrl: finalUrl,
    },
  });

  return Response.json({ ok: true, provider: sp.provider, realPosted: posted, postUrl: finalUrl });
}
