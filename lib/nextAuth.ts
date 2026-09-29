import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { getUserByEmail } from 'models/user';
import { clientAddress, hit, isLimited, reset } from '@/lib/rateLimit';

// Browsers don't scope cookies by port on `localhost`, so this app and its
// sibling Humlens apps (procurement, etc.) running on other localhost ports
// would otherwise all fight over NextAuth's default cookie name
// (`next-auth.session-token`) — whichever app you signed into most recently
// wins the cookie slot, and every other app looks logged-out on refresh
// because it can't decode a JWT signed with a different app's secret. Giving
// each app its own cookie name isolates them completely.
const LOGIN_WINDOW_MS = 15 * 60_000;
// A bcrypt hash of a random string, compared against when the email is unknown.
const DUMMY_HASH = '$2a$12$4Zx9Xxn1eD./PfOd8FtLG.6G30fQVt4GKswWcrOMIjGk58W187Kgu';

const useSecureCookies = (process.env.NEXTAUTH_URL || '').startsWith('https://');
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/auth/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}humlens-inventory.session-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}humlens-inventory.callback-url`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? '__Host-' : ''}humlens-inventory.csrf-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // At most 10 wrong passwords per account and 50 per address in 15
        // minutes; a correct password clears the account's count.
        const emailKey = `login:email:${credentials.email.trim().toLowerCase()}`;
        const ipKey = `login:ip:${clientAddress(req?.headers)}`;
        if (isLimited(emailKey, 10, LOGIN_WINDOW_MS) || isLimited(ipKey, 50, LOGIN_WINDOW_MS)) {
          throw new Error('too-many-attempts');
        }

        const user = await getUserByEmail(credentials.email);
        // Check a password even when there's no such user, so the response
        // time doesn't reveal which emails have accounts.
        const isValid = await verifyPassword(credentials.password, user?.password || DUMMY_HASH);

        if (!user || !user.password || !isValid) {
          hit(emailKey, 10, LOGIN_WINDOW_MS);
          hit(ipKey, 50, LOGIN_WINDOW_MS);
          throw new Error('invalid-credentials');
        }
        reset(emailKey);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};
