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
    
    // Mock patient database for testing
    this.patientDatabase = {
      "12345": {
        id: "12345",
        name: "John Smith",
        phoneNumber: "+15854836965",
        email: "john.smith@email.com",
        lastAppointment: "2024-12-15",
        nextAppointmentDue: "2025-01-15",
        doctor: "Dr. Johnson",
        department: "Cardiology"
      },
      "67890": {
        id: "67890",
        name: "Sarah Williams",
        phoneNumber: "+15854836965",
        email: "sarah.williams@email.com",
        lastAppointment: "2024-11-20",
        nextAppointmentDue: "2025-02-20",
        doctor: "Dr. Anderson",
        department: "Orthopedics"
      },
      "54321": {
        id: "54321",
        name: "Michael Brown",
        phoneNumber: "+16693332017",
        email: "michael.brown@email.com",
        lastAppointment: "2024-10-10",
        nextAppointmentDue: "2025-01-10",
        doctor: "Dr. Martinez",
        department: "General Medicine"
      }
    };
    
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
          {
            name: "get_patient_details",
            description: "Retrieve patient details by patient ID",
            inputSchema: {
              type: "object",
              properties: {
                patient_id: {
                  type: "string",
                  description: "The unique patient ID to look up",
                },
              },
              required: ["patient_id"],
            },
          },
          {
            name: "call_patient_by_id",
            description: "Look up patient details and initiate an outbound call to schedule their appointment",
            inputSchema: {
              type: "object",
              properties: {
                patient_id: {
                  type: "string",
                  description: "The unique patient ID to call",
                },
                call_purpose: {
                  type: "string",
                  description: "Purpose of the call (e.g., 'follow-up appointment', 'test results', 'medication reminder')",
                  default: "follow-up appointment",
                },
              },
              required: ["patient_id"],
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "make_outbound_call":
          return await this.makeOutboundCall(args);
        case "get_patient_details":
          return await this.getPatientDetails(args);
        case "call_patient_by_id":
          return await this.callPatientById(args);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  async getPatientDetails(args) {
    const { patient_id } = args;

    if (!patient_id) {
      throw new Error("Patient ID is required");
    }

    const patient = this.patientDatabase[patient_id];

    if (!patient) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Patient not found with ID: ${patient_id}

Available test patient IDs: ${Object.keys(this.patientDatabase).join(", ")}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `👤 **Patient Details Found**

**Patient ID:** ${patient.id}
**Name:** ${patient.name}
**Phone:** ${patient.phoneNumber}
**Email:** ${patient.email}
**Last Appointment:** ${patient.lastAppointment}
**Next Appointment Due:** ${patient.nextAppointmentDue}
**Assigned Doctor:** ${patient.doctor}
**Department:** ${patient.department}`,
        },
      ],
    };
  }

  async callPatientById(args) {
    const { patient_id, call_purpose = "follow-up appointment" } = args;

    try {
      // First, get patient details
      const patient = this.patientDatabase[patient_id];

      if (!patient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Patient not found with ID: ${patient_id}

Available test patient IDs: ${Object.keys(this.patientDatabase).join(", ")}`,
            },
          ],
        };
      }

      // Create personalized prompt and greeting
      const personalizedPrompt = `You are a Hospital AI Agent, an outbound receptionist agent calling ${patient.name}. You are calling to help schedule their ${call_purpose}. The patient's last appointment was on ${patient.lastAppointment} with ${patient.doctor} in the ${patient.department} department. Their next appointment is due around ${patient.nextAppointmentDue}. Be friendly, professional, and answer all questions. Use their name during the conversation to make it personal.`;

      const personalizedGreeting = `Hello ${patient.name}, this is the Hospital AI Assistant calling from ${patient.department}. I hope you're doing well! I'm calling because you're due for your ${call_purpose} with ${patient.doctor}. Would you like to schedule that appointment today?`;

      console.error(`[MCP] Calling patient ${patient.name} (ID: ${patient_id}) for ${call_purpose}`);

      // Make the call using the existing method
      const callArgs = {
        number: patient.phoneNumber,
        prompt: personalizedPrompt,
        first_message: personalizedGreeting,
      };

      const callResult = await this.makeOutboundCall(callArgs);

      // Enhance the response with patient information
      const originalText = callResult.content[0].text;
      const enhancedText = `🏥 **Patient Call Initiated**

📋 **Patient Information:**
- **Name:** ${patient.name}
- **ID:** ${patient_id}
- **Department:** ${patient.department}
- **Doctor:** ${patient.doctor}
- **Call Purpose:** ${call_purpose}

${originalText}`;

      return {
        content: [
          {
            type: "text",
            text: enhancedText,
          },
        ],
      };

    } catch (error) {
      console.error(`[MCP] Error calling patient by ID:`, error);
      
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to call patient with ID ${patient_id}

**Error:** ${error.message}`,
          },
        ],
      };
    }
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
      prompt: prompt || "You are a helpful assistant making an outbound call. You are a Hospital AI Agent, an outbound receptionist agent. You are calling a patient to book an appointment for them. Be friendly and professional and answer all questions.",
      first_message: first_message || "Hello, I am a Hospital AI Agent, It seems you are due for your follow up appointment! Could you let me know when you are available?",
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