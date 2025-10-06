/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      // const cookieStore = cookies();
      // const mode = (await cookieStore).get("mode")?.value;

      // if (mode && mode == "login") {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/user/loginGoogle`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
            }),
          }
        );
        const status = await resp.status;
        const data = await resp.json();

        if (status == 200) {
          const isValidToken = verify(
            data.data.token,
            process.env.NEXT_PUBLIC_KEY_JWT || ""
          );

          (user as any).idUser = Number(data.data.idUser.toString());
          // (user as any).jwt = token;
          (user as any).token = data.data.token;
          (user as any).rol = "customer";
          (user as any).idValidToken = isValidToken;
          return true;
        } else {
          throw new Error(data?.data.message || "Error interno del servidor");
        }
   //   }

      return false;
    },

    async jwt({ token, user }) {
      // Si viene del login (primer vez)
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.sub = token.sub;
        token.idUser = (user as any).idUser;
        token.rol = (user as any).rol;
        token.token = (user as any).token;
        token.isValidToken = (user as any).idValidToken;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user!.email = token.email;
        session.user!.name = token.name;
        session.user!.image = token.picture;
        (session as any).idUser = token.idUser;
        (session as any).rol = token.rol;
        (session as any).token = token.token;
        (session as any).isValidToken = token.isValidToken;
      }
      return session;
    },

    redirect({ baseUrl, url }) {
      return `${baseUrl}/inicio`;
    },
  },

  pages: {
    error: "/auth/error",
  },

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };