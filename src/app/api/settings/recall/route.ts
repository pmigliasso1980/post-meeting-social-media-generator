import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const fd = await req.formData();
  const minutesRaw = String(fd.get("minutes") ?? "5");
  const minutes = Math.max(0, Math.min(60, parseInt(minutesRaw, 10) || 0));

  await prisma.user.update({
    where: { id: userId },
    data: { recallJoinMinutesBefore: minutes },
  });

  // Back to settings
  return new Response(null, {
    status: 302,
    headers: { Location: "/settings" },
  });
}
