import { createMcpHandler } from 'agents/mcp/server';
import { server } from '@/lib/mcp';
import { body, event, failure } from '@/lib/experiment';
export async function POST(r: Request) {
  try {
    const payload = await body(r);
    if (payload?.method === 'initialize') await event(r, 'mcp_initialize');
    if (payload?.method === 'tools/list') await event(r, 'mcp_tools_list');
    const copy = new Request(r.url, {
      method: 'POST',
      headers: r.headers,
      body: JSON.stringify(payload),
    });
    return await createMcpHandler(() => server(r), {
      route: '/mcp',
      allowedOriginHostnames: [
        new URL(r.url).hostname,
        'localhost',
        '127.0.0.1',
      ],
    }).fetch(copy);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(r: Request) {
  return createMcpHandler(() => server(r), { route: '/mcp' }).fetch(r);
}
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type,Accept,MCP-Protocol-Version,MCP-Session-Id',
    },
  });
}
