# Windsurf Setup Guide

## 1. AI Rules Configuration
The `.windsurfrules` file has been created in your project root. Windsurf AI will automatically reference this file to follow the **Context7 & TDD** workflow.

## 2. Install Context7 MCP
To enable the Context7 MCP server (which provides up-to-date documentation context), you need to add it to your Windsurf configuration.

### Steps:
1. Open your **Windsurf MCP Config**. (Usually found in Windsurf Settings or `~/.codeium/windsurf/mcp_config.json`)
2. Add the following configuration to the `mcpServers` object:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

3. Restart Windsurf or reload the window.

Once installed, you can use "context7" in your prompts to fetch fresh documentation for libraries like Next.js, Supabase, etc.
