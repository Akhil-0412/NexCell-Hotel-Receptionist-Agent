# NexCell Voice Agent - Deployment Research Brief

## Project Overview
NexCell Voice Agent is an AI-powered voice receptionist for hotels. Guests connect via a browser-based WebRTC frontend, speak naturally, and the agent handles bookings, FAQ lookups, availability, and invoicing.

## Architecture & Components to Deploy
The system consists of two main Python 3.11+ services that need to run concurrently:

1. **Frontend & Voice Orchestrator Server (`src/frontend_server.py`)**
   - **Framework:** Starlette web server
   - **Function:** Serves the web dashboard (LiveKit Components UI) and dynamically spawns LiveKit Voice Agent worker processes in the background.
   - **Port:** Typically runs on `8001`.

2. **MCP Tool Server (`src/mcp_server.py`)**
   - **Framework:** FastMCP
   - **Function:** Provides external tools (availability check, booking, FAQ, email/invoicing) to the LangGraph/Gemini LLM agent over Server-Sent Events (SSE).
   - **Port:** Typically runs on `8000`.

## Tech Stack & External Dependencies
- **Voice/WebRTC:** LiveKit Cloud (requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- **LLM/AI APIs:** Gemini (`GOOGLE_API_KEY`), Groq STT (`GROQ_API_KEY`), Cartesia TTS (`CARTESIA_API_KEY`)
- **Email:** SMTP for sending invoices (requires `SMTP_SERVER`, `SMTP_PORT`, `SENDER_EMAIL`, `SENDER_PASSWORD`)
- **Package Manager:** `uv` is used for dependency management (`pyproject.toml` / `requirements.txt`).

## Research Goal
Identify completely free online hosting solutions to deploy these two Python backend services continuously or on-demand. The deployment must support:
- Running two Python processes.
- Exposing ports for the frontend and SSE tool server.
- Outbound API connections to LiveKit, Google, Groq, Cartesia, and SMTP.
- Support for environment variable management.
