import { Client, StreamableHTTPClientTransport, type CallToolResult, type Tool } from '@modelcontextprotocol/client';
import { getOpenArtAccessToken } from './openart-oauth';
import { DEFAULT_OPENART_MCP_URL, trustedOpenArtMcpUrl } from './openart-network-policy';

export { DEFAULT_OPENART_MCP_URL } from './openart-network-policy';

export type OpenArtTool = Tool;
export type OpenArtToolResult = CallToolResult;

export class OpenArtMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  async connect() {
    if (this.client) return this.client;
    const url = trustedOpenArtMcpUrl(process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL);

    const client = new Client({ name: 'karzoun-media-factory', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(url, {
      authProvider: {
        token: async () => {
          const token = await getOpenArtAccessToken();
          if (!token) throw new Error('OpenArt MCP OAuth credential is missing');
          return token;
        },
        onUnauthorized: async () => { await getOpenArtAccessToken({ forceRefresh: true }); }
      }
    });
    await client.connect(transport);
    this.client = client;
    this.transport = transport;
    return client;
  }

  async listTools() {
    const client = await this.connect();
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 60_000) {
    const client = await this.connect();
    const result = await client.callTool(
      { name, arguments: args },
      { timeout: timeoutMs, maxTotalTimeout: timeoutMs }
    );
    return result as CallToolResult;
  }

  async close() {
    const client = this.client;
    this.client = null;
    this.transport = null;
    if (client) await client.close();
  }
}
