import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createInventoryMcpServer } from '@/lib/mcp/server';
import { runInMcpScope } from '@/lib/mcp/context';
import { API_KEY_PREFIX, findApiKey } from '@/lib/apiKey';

/** Constant-time check against MCP_SERVER_TOKEN, so the token can't be guessed from response timings. */
function isDeploymentToken(token: string) {
  const expected = process.env.MCP_SERVER_TOKEN?.trim();
  // An unset, short or example value would let anyone in as any member.
  if (!expected || expected.length < 32 || expected === 'replace-with-a-long-random-token' || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Stateless Streamable HTTP MCP endpoint: any MCP client (Claude, or another
// agent runtime) can POST /api/mcp to call the tools in lib/mcp/server.ts,
// with `Authorization: Bearer` and either
// - a team API key (Settings → API keys): calls are held to that team and act
//   as the member who created the key, or
// - MCP_SERVER_TOKEN: the operator's token, which may act as any member of any
//   team, so keep it for trusted infrastructure.
// A fresh server+transport is created per request since there's no session
// state to keep.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Only POST is supported on this stateless MCP endpoint.' } });
    return;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  let limit: { teamSlug: string; email: string } | null = null;
  if (token.startsWith(API_KEY_PREFIX)) {
    try {
      const { key, member } = await findApiKey(token);
      limit = { teamSlug: key.team.slug, email: member.user.email };
    } catch (error) {
      res.status(401).json({ error: { message: error instanceof Error ? error.message : 'Missing or invalid API key.' } });
      return;
    }
  } else if (!isDeploymentToken(token)) {
    res.status(401).json({ error: { message: 'Missing or invalid bearer token.' } });
    return;
  }

  const server = createInventoryMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  if (limit) await runInMcpScope(limit, () => transport.handleRequest(req, res));
  else await transport.handleRequest(req, res);
}
