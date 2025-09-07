import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const fd = await req.formData();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "");
  const provider = String(fd.get("provider") || "linkedin");
  const promptTemplate = String(fd.get("promptTemplate") || "");

  if (!name || !promptTemplate) return new Response("Missing fields", { status: 400 });

  if (id) {
    await prisma.automation.update({
      where: { id },
      data: { name, provider, promptTemplate },
    });
  } else {
    await prisma.automation.create({
      data: { name, provider, promptTemplate, userId, isEnabled: true },
    });
  }

  return new Response(null, { status: 302, headers: { Location: "/settings" } });
}
