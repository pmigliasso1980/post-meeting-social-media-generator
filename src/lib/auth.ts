// src/lib/auth.ts
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { type NextAuthOptions } from "next-auth";

const isMock = process.env.MOCK_AUTH === "1";

// --------- Custom LinkedIn provider (real, se queda para más adelante) ---------
const LinkedInProvider: OAuthConfig<any> = {
  id: "linkedin",
  name: "LinkedIn",
  type: "oauth",
  version: "2.0",
  authorization: {
    url: "https://www.linkedin.com/oauth/v2/authorization",
    params: { scope: "openid profile email w_member_social" },
  },
  token: { url: "https://www.linkedin.com/oauth/v2/accessToken" },
  userinfo: { url: "https://api.linkedin.com/v2/userinfo" },
  profile: (profile: any) => ({
    id: profile.sub,
    name: profile.name,
    email: profile.email,
  }),
  clientId: process.env.LINKEDIN_CLIENT_ID!,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
};

// --------- Custom Facebook provider (real, se queda para más adelante) ---------
const FacebookProviderCustom: OAuthConfig<any> = {
  id: "facebook",
  name: "Facebook",
  type: "oauth",
  version: "2.0",
  authorization: {
    url: "https://www.facebook.com/v18.0/dialog/oauth",
    params: {
      scope:
        "email,public_profile,pages_manage_posts,pages_read_engagement,pages_show_list,publish_video,pages_manage_metadata",
    },
  },
  token: { url: "https://graph.facebook.com/v18.0/oauth/access_token" },
  userinfo: { url: "https://graph.facebook.com/me?fields=id,name,email" },
  profile: (profile: any) => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
  }),
  clientId: process.env.FACEBOOK_CLIENT_ID!,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
};

// --------- Opciones NextAuth (conmutables por MOCK_AUTH) ---------
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // En mock usamos JWT (sin tabla Session); en real, DB (NextAuth por defecto)
  session: { strategy: isMock ? "jwt" : "database" },

  providers: isMock
    ? [
        // ---------- MOCK: Credentials (Dev Login) ----------
        Credentials({
          name: "Dev Login",
          credentials: {
            email: { label: "Email", type: "email", value: "dev@example.com" },
            name: { label: "Name", type: "text", value: "Dev User" },
          },
          async authorize(creds) {
            const email = String(creds?.email || "dev@example.com");
            const name = String(creds?.name || "Dev User");

            // Asegura usuario en la DB (find-or-create)
            const user =
              (await prisma.user.findUnique({ where: { email } })) ??
              (await prisma.user.create({ data: { email, name } }));

            return { id: user.id, email: user.email, name: user.name ?? "Dev User" };
          },
        }),
      ]
    : [
        // ---------- REAL: Google + (luego) LinkedIn/Facebook ----------
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorization: {
            params: {
              access_type: "offline",
              prompt: "consent",
              scope:
                process.env.GOOGLE_OAUTH_SCOPES ||
                "openid email profile https://www.googleapis.com/auth/calendar.readonly",
            },
          },
        }),
        LinkedInProvider,
        FacebookProviderCustom,
      ],

  callbacks: {
    async jwt({ token, user }) {
      // para MOCK (JWT) y también útil en real
      if (user) token.id = (user as any).id;
      return token;
    },
    async session({ session, token, user }) {
      // Popular session.user.id (soporta JWT o DB)
      if (token?.id) (session.user as any).id = token.id;
      if (user?.id && !(session.user as any).id) (session.user as any).id = user.id;
      return session;
    },
    // Mantengo tu signIn original (guarda tokens de LinkedIn/Facebook cuando pase a real)
    async signIn({ account, profile, user }) {
      if (!account) return true;

      // Persist email/name en Account (opcional)
      await prisma.account
        .update({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId!,
            },
          },
          data: {
            email: (profile as any)?.email,
            name: (profile as any)?.name,
          },
        })
        .catch(() => {});

      // Guardar tokens LinkedIn/Facebook (cuando no estemos en mock)
      if (!isMock && user && (account.provider === "linkedin" || account.provider === "facebook")) {
        const provider = account.provider;
        const accessToken = account.access_token || null;
        const refreshToken = account.refresh_token || null;
        const expiresAt = account.expires_at || null;

        const accountId =
          provider === "linkedin"
            ? (profile as any)?.sub
              ? `urn:li:person:${(profile as any).sub}`
              : null
            : (profile as any)?.id || null;

        await prisma.socialAccount
          .upsert({
            where: { userId_provider: { userId: user.id, provider } },
            update: { accessToken, refreshToken, expiresAt: expiresAt || undefined, accountId },
            create: {
              userId: user.id,
              provider,
              accessToken,
              refreshToken,
              expiresAt: expiresAt || undefined,
              accountId,
            },
          })
          .catch(() => {});
      }

      return true;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
