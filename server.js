#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

class OutboundCallServer {
  constructor() {
    this.server = new Server(
      {
        name: "outbound-call-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Store the API endpoint URL
    this.apiEndpoint = process.env.OUTBOUND_CALL_API_URL || "http://localhost:8000";
    
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "make_outbound_call",
            description: "Initiate an outbound phone call using ElevenLabs AI agent",
            inputSchema: {
              type: "object",
              properties: {
                number: {
                  type: "string",
                  description: "Phone number to call (include country code, e.g., +1234567890)",
                },
                prompt: {
                  type: "string",
                  description: "Custom prompt/instructions for the AI agent during the call",
                  default: "You are a helpful assistant making an outbound call. You are a Hospital AI Agent, an outbound receptionist agent. You are calling a patient to book an appointment for them. Be friendly and professional and answer all questions.",
                },
                first_message: {
                  type: "string", 
                  description: "The first message the AI agent will say when the call connects",
                  default: "Hello, I am a Hospital AI Agent, It seems you are due for your follow up appointment! Could you let me know when you are available?",
                },
              },
              required: ["number"],
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== "make_outbound_call") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await this.makeOutboundCall(args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to make outbound call: ${error.message}`
        );
      }
    });
  }

  async makeOutboundCall(args) {
    const { number, prompt, first_message } = args;

    // Validate required parameters
    if (!number) {
      throw new Error("Phone number is required");
    }

    // Prepare the request payload
    const payload = {
      number: number.trim(),
      prompt: prompt || "You are a helpful assistant making an outbound call",
      first_message: first_message || "Hello! This is an AI assistant calling. How can I help you today?",
    };

    console.error(`[MCP] Initiating call to ${number}`);
    console.error(`[MCP] Prompt: ${payload.prompt}`);
    console.error(`[MCP] First message: ${payload.first_message}`);

    try {
      // Make the API call to your outbound-call endpoint
      const response = await fetch(`${this.apiEndpoint}/outbound-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      return {
        content: [
          {
            type: "text",
            text: `✅ Call initiated successfully!

📞 **Call Details:**
- **Number:** ${number}
- **Call SID:** ${result.callSid}
- **Status:** ${result.success ? 'Success' : 'Failed'}

🤖 **AI Agent Configuration:**
- **Prompt:** ${payload.prompt}
- **First Message:** ${payload.first_message}

The call is now in progress. The recipient should receive the call shortly.`,
          },
        ],
      };
    } catch (error) {
      console.error(`[MCP] Error making outbound call:`, error);
      
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to initiate call to ${number}

**Error:** ${error.message}

Please check:
- Your API server is running at ${this.apiEndpoint}
- The phone number format is correct (include country code)
- Your Twilio and ElevenLabs credentials are properly configured`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Outbound Call MCP server running on stdio");
  }
}

// Start the server
const server = new OutboundCallServer();
server.run().catch(console.error);