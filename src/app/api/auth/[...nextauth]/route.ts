import NextAuth from "next-auth";
import FacebookProvider from "next-auth/providers/facebook";

const handler = NextAuth({
  providers: [
    FacebookProvider({
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
      console.log("user");
      console.log(user);

      return true;
    },

    // async jwt({ token, user }) {
    //   // Si viene del login (primer vez)
    //   if (user) {
    //     token.email = user.email;
    //     token.name = user.name;
    //     token.picture = user.image;
    //     token.sub = token.sub;
    //     token.idUser = (user as any).idUser;
    //     token.rol = (user as any).rol;
    //     token.token = (user as any).token;
    //     token.isValidToken = (user as any).idValidToken;
    //   }
    //   return token;
    // },

    // async session({ session, token }) {
    //   if (token) {
    //     session.user!.email = token.email;
    //     session.user!.name = token.name;
    //     session.user!.image = token.picture;
    //     (session as any).idUser = token.idUser;
    //     (session as any).rol = token.rol;
    //     (session as any).token = token.token;
    //     (session as any).isValidToken = token.isValidToken;
    //   }
    //   return session;
    // },

    // redirect({ baseUrl, url }) {
    //   return `${baseUrl}/principal`;
    // },
  },

  //   pages: {
  //     error: "/auth/error",
  //   },

  //   session: {
  //     strategy: "jwt",
  //   },
});

export { handler as GET, handler as POST };
