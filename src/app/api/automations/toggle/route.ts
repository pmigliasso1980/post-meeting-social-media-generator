import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const fd = await req.formData();
  const id = String(fd.get("id") || "");
  const enable = fd.get("enable") === "on";

  await prisma.automation.update({
    where: { id },
    data: { isEnabled: enable },
  });

  return new Response(null, { status: 302, headers: { Location: "/settings" } });
}
