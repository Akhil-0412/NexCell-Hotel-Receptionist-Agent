# **Strategic Deployment Analysis for NexCell Voice Agent Infrastructure**

The architectural convergence of real-time Voice Artificial Intelligence (Voice AI) and LLM-driven tool orchestration imposes extraordinary demands on backend infrastructure. The NexCell Voice Agent ecosystem relies on two concurrently executing Python 3.11+ services: a Starlette-based frontend serving as a WebRTC orchestrator and LiveKit worker pool, and a FastMCP tool server streaming data via Server-Sent Events (SSE). Operating this dual-service topology within the constraints of zero-cost cloud hosting requires precise navigation of evolving platform limitations, aggressive sleep policies, and stringent network buffering protocols.  
This analysis evaluates the 2026 free-tier cloud landscape, providing a comprehensive blueprint for deploying the NexCell infrastructure. The assessment examines process concurrency, port exposure, environment variable security, outbound routing for SMTP and third-party AI APIs, and the package management mechanics of the uv ecosystem.

## **1\. Architectural Imperatives and Workload Profiling**

To architect a resilient deployment strategy, the underlying mechanics of the NexCell components must be rigorously profiled against the physical and networking constraints of modern cloud environments.

### **1.1 LiveKit Orchestration and the ASGI Concurrency Model**

The primary service, frontend\_server.py, operates on the Starlette web framework and functions dualistically. First, it serves the LiveKit Components web dashboard to end-users via HTTP. Second, it operates as an always-on LiveKit Agent worker process. In the LiveKit architecture, the worker model utilizes a decentralized job dispatch system; the LiveKit Cloud server automatically balances incoming WebRTC voice sessions across available agent servers1.  
This execution model demands continuous asynchronous processing. When a guest initiates a conversation, the Starlette application spawns a dedicated sub-process to handle the session's specific audio stream, interacting continuously with Speech-to-Text (STT), Large Language Model (LLM), and Text-to-Speech (TTS) endpoints1. Consequently, the hosting environment must support robust multiprocessing and high-performance asynchronous event loops. The Python 3.11+ runtime, when deployed via the Uvicorn Asynchronous Server Gateway Interface (ASGI) server, leverages uvloop to manage these concurrent connections2.  
Voice AI necessitates ultra-low latency. A production-grade voice pipeline utilizing Groq for STT, Gemini for reasoning, and Cartesia for TTS requires an end-to-end latency—or Time-to-First-Byte (TTFB)—of under 500 milliseconds to maintain natural conversational pacing4. If the host infrastructure places the Starlette container into a dormant state during periods of inactivity, the resulting 10 to 30-second cold start upon the next invocation will catastrophically degrade the user experience5. The deployment environment must therefore guarantee uninterrupted, continuous execution.  
Furthermore, managing concurrent WebRTC streams and local Voice Activity Detection (VAD) models requires persistent memory allocation. While LiveKit recommends 4 compute cores and 8GB of RAM for high-throughput enterprise pools1, a zero-cost deployment managing sporadic hotel guest traffic strictly requires a baseline of 1GB to 2GB of RAM to prevent the host's Out-Of-Memory (OOM) killer from terminating the ASGI worker during traffic spikes.

### **1.2 FastMCP and Server-Sent Events (SSE) Networking Constraints**

The secondary service, mcp\_server.py, utilizes the FastMCP framework to construct a Model Context Protocol (MCP) server7. This service provides external capabilities—such as hotel availability lookups, FAQ retrieval, and SMTP-based invoicing—to the LangGraph and Gemini orchestration layer. The communication between the LangGraph agent and the FastMCP server occurs over Server-Sent Events (SSE) on port 8000\.  
SSE relies on a persistent, unidirectional HTTP/1.1 connection where the server pushes discrete data chunks to the client over an extended duration8. This architecture conflicts fundamentally with the default configurations of shared ingress controllers and reverse proxies utilized by most managed cloud platforms. Platforms utilizing Nginx, Envoy, or proprietary load balancers natively buffer HTTP responses to optimize bandwidth transfer, waiting for the payload to reach a specific byte threshold before flushing the data to the client network8.  
In the context of the NexCell deployment, proxy buffering intercepts the streaming tool-call tokens, causing the LangGraph agent to stall, await data indefinitely, and eventually trigger a timeout exception9. A viable hosting solution must allow the developer to inject specific HTTP headers—notably X-Accel-Buffering: no and Cache-Control: no-cache—and possess a networking plane that explicitly honors these directives to allow raw, unbuffered streaming11. Alternatively, the platform must allow the mounting of the FastMCP application directly onto the Starlette application via mcp.http\_app(), sharing the ASGI lifespan to bypass external network hops entirely13.

### **1.3 External API Dependencies and SMTP Egress Routing**

The NexCell ecosystem operates as an orchestration hub, relying heavily on outbound network connections to interface with third-party cognitive and communication APIs.  
The integration with LiveKit Cloud dictates that the agent server establishes an outbound WebSocket connection to the LiveKit server to listen for incoming job dispatches1. This architectural design choice is highly advantageous for restricted cloud environments, as it eliminates the need to expose inbound TCP or UDP ports to the public internet for WebRTC media routing. The frontend server solely requires outbound access configured via the LIVEKIT\_URL, LIVEKIT\_API\_KEY, and LIVEKIT\_API\_SECRET environment variables. Similarly, the cognitive pipeline demands unrestricted outbound HTTPS traffic to Google (Gemini), Groq, and Cartesia, utilizing their respective API key environment variables.  
The invoicing capability introduces a critical network security hurdle. The FastMCP tool utilizes the Simple Mail Transfer Protocol (SMTP) to dispatch guest invoices, requiring SMTP\_SERVER, SMTP\_PORT, SENDER\_EMAIL, and SENDER\_PASSWORD configurations. To prevent the proliferation of spam, modern cloud hyperscalers globally block outbound traffic on TCP Port 2515. A successful deployment dictates that the Python SMTP library is configured to route traffic over authenticated, encrypted channels, specifically utilizing TCP Port 465 (Implicit SSL/TLS) or TCP Port 587 (STARTTLS)16. Any hosting provider selected must permit outbound traffic on these specific secure mail ports.

### **1.4 Containerization and the uv Package Manager**

Dependency management and virtual environment orchestration for NexCell utilize uv, a high-performance Python package installer18. In a cloud deployment scenario, uv significantly accelerates the continuous integration and continuous deployment (CI/CD) pipeline. When constructing Docker images for the frontend and MCP servers, the Dockerfile must be configured to copy the uv binary, synchronize the pyproject.toml dependencies, and execute the applications directly via uv run18. The hosting platform must support custom Dockerfile deployments to accommodate this modern build infrastructure, as legacy buildpacks often default to standard pip or poetry implementations that may conflict with the uv lockfile format.

## **2\. The 2026 Zero-Cost Cloud Infrastructure Landscape**

The economics of cloud computing have undergone a drastic recalibration by mid-2026. Major Platform-as-a-Service (PaaS) providers have systematically eradicated their perpetual free compute tiers, transitioning to usage-based billing models to eliminate unprofitable workloads and cryptocurrency mining abuse. Evaluating the market reveals a highly constricted landscape for deployments demanding persistent, always-on execution.

| Cloud Provider | 2026 Free Tier Policy | Sleep Policy | Compatibility with NexCell |
| :---- | :---- | :---- | :---- |
| **Fly.io** | Eliminated. Offers a 2-hour or 7-day trial only21. | N/A (Pay-as-you-go) | Incompatible. Requires active billing for sustained deployment21. |
| **Railway** | Eliminated. Provides a one-time $5 credit trial6. | N/A (Credit exhaustion) | Incompatible. Credits deplete rapidly under continuous execution6. |
| **Render** | 750 compute hours per month, 512MB RAM24. | 15 minutes of inactivity24. | Incompatible. The 30-50 second cold start destroys Voice AI latency5. |
| **Koyeb** | Starter tier closed to new users following Mistral AI acquisition25. | N/A for new users | Incompatible. Free tier no longer accessible25. |
| **PandaStack** | 5 web services, 512MB RAM27. | Scale-to-zero enforcement27. | Incompatible. Preemptible nodes induce cold starts27. |
| **Oracle Cloud** | 2 ARM OCPUs, 12GB RAM29. | Always On | Highly Compatible. Massive memory allocation supports sub-processes29. |
| **Northflank** | 2 web services, 1 database31. | Always On | Highly Compatible. No forced sleep supports continuous WebRTC32. |
| **Zeabur** | Serverless plan, limited container execution33. | Auto-suspends containers34. | Marginal. Push toward serverless limits persistent background workers34. |
| **Hugging Face** | 2 vCPUs, 16GB RAM35. | 48 hours of inactivity35. | Compatible with architectural workarounds (single port constraint)35. |

This market analysis isolates three viable vectors capable of supporting the NexCell architecture without incurring financial cost: the Infrastructure-as-a-Service (IaaS) approach via Oracle Cloud, the Developer PaaS approach via Northflank, and the container modification approach via Hugging Face Docker Spaces.

## **3\. Tier 1 Architecture: Oracle Cloud Always Free (IaaS)**

Oracle Cloud Infrastructure (OCI) delivers the most formidable zero-cost hardware allocation available in the industry. Operating as a pure IaaS provider, OCI shifts the burden of orchestration and security to the developer, offering absolute architectural control over the NexCell deployment in exchange for increased operational complexity.

### **3.1 Hardware Capacity and Post-2026 Resource Adjustments**

Historically, Oracle provided an Always Free ARM-based Ampere A1 compute instance featuring 4 OCPUs and 24 GB of RAM15. In June 2026, Oracle silently instituted a policy adjustment, reducing this allocation for newly registered free-tier accounts to 2 OCPUs and 12 GB of RAM29.  
Despite this 50% reduction, the 12 GB memory allocation remains an anomaly in the free hosting market, exceeding the memory limits of competing platforms by several orders of magnitude. This abundance of RAM is critical for the NexCell deployment. The instantiation of the Python 3.11 runtime, the ASGI Uvicorn workers, and the initialization of the LiveKit agent sub-processes consume significant memory footprints. Furthermore, the 2 ARM OCPUs provide robust multi-threading capabilities, ensuring that the Groq STT ingestion and Gemini LLM reasoning loops do not encounter CPU contention bottlenecks.

### **3.2 Deployment Orchestration via Docker Compose**

Deploying the dual-service NexCell architecture on a bare-metal Oracle Virtual Machine (VM) requires a robust containerization strategy. Docker Compose serves as the optimal orchestrator, allowing the frontend server and the FastMCP tool server to operate in tandem within an isolated, reproducible environment.  
The deployment dictates the creation of multi-stage Dockerfiles for both services, leveraging the uv package manager for rapid dependency resolution18. The docker-compose.yml file must define the two services, mapping the internal container ports to the host VM to expose them to external traffic. The frontend Starlette server binds to port 8001, while the FastMCP server binds to port 8000\.  
To manage environment variables securely, Docker Compose integrates seamlessly with an .env file stored on the host VM. This file houses the LIVEKIT\_URL, LIVEKIT\_API\_KEY, LIVEKIT\_API\_SECRET, GOOGLE\_API\_KEY, GROQ\_API\_KEY, CARTESIA\_API\_KEY, and all SMTP credentials, injecting them directly into the containers at runtime without exposing sensitive data in the version-controlled repository.

### **3.3 Network Security and SSE Proxy Bypass**

Exposing ports 8000 and 8001 on Oracle Cloud involves a dual-layer security configuration. First, the developer must navigate the OCI dashboard to modify the Virtual Cloud Network (VCN). Stateful ingress rules must be appended to the Default Security List to explicitly permit TCP traffic on ports 8000 and 8001 from all IP addresses (0.0.0.0/0)15. Second, the local Linux firewall (typically iptables or firewalld on Oracle Linux or Ubuntu images) must be manually updated via SSH to accept connections on these specific ports15.  
For a production-resilient deployment, exposing the raw Uvicorn HTTP servers directly to the public internet is architecturally flawed. A highly recommended enhancement is the introduction of an Nginx reverse proxy container within the Docker Compose stack. The Nginx proxy listens on standard web ports (80 and 443\) and intelligently routes incoming traffic based on URL paths (e.g., routing /app to the Starlette frontend on port 8001, and /mcp to the FastMCP server on port 8000).  
Implementing Nginx on a self-managed Oracle VM provides the crucial advantage of overriding default buffering behaviors that disrupt FastMCP's Server-Sent Events. To ensure the LangGraph agent receives uninhibited data streams during tool execution, the Nginx configuration block governing the /mcp route must explicitly disable proxy buffering, proxy caching, and chunked transfer encoding11. By injecting the proxy\_buffering off; and proxy\_http\_version 1.1; directives, the reverse proxy honors the X-Accel-Buffering: no header, facilitating real-time bidirectional communication essential for complex LLM workflows14.

### **3.4 Outbound SMTP Configuration**

Oracle Cloud, akin to other hyperscalers, aggressively restricts outbound traffic on TCP Port 25 to mitigate the risk of the network being utilized for spam distribution15. The NexCell invoicing module must be explicitly programmed to interface with external mail relays (such as SendGrid or Brevo) utilizing secure, authenticated protocols. The SMTP\_PORT environment variable must be configured to 587 (STARTTLS) or 465 (Implicit SSL), ensuring the SMTP handshake successfully negotiates encrypted communication and bypasses the provider-level firewall blockade16.

## **4\. Tier 2 Architecture: Northflank Developer Sandbox (PaaS)**

For organizations seeking to minimize infrastructure administration overhead while retaining production-grade execution guarantees, the Northflank Developer Sandbox presents an exceptional Platform-as-a-Service (PaaS) alternative.

### **4.1 Kubernetes-Native Isolation and Sandbox Economics**

Northflank operates a sophisticated, Kubernetes-native control plane, abstracting the complexities of cluster management, pod scheduling, and horizontal scaling into an intuitive developer interface40. Unlike competitors such as Render or Railway, which heavily restrict free-tier capabilities, Northflank's Developer Sandbox tier provides a remarkable allocation tailored precisely to microservice architectures.  
The Sandbox plan includes two perpetually free web services and one free database, perfectly accommodating the NexCell frontend and FastMCP components31. Crucially, Northflank fundamentally rejects the industry-standard "scale-to-zero" methodology32. Applications deployed on the free tier remain constantly active, ensuring zero cold-start latency when a user initiates a LiveKit WebRTC session32.  
Container isolation is enforced via hardware-level sandboxing technologies including Firecracker microVMs, Kata Containers, and gVisor41. While the free tier imposes strict memory constraints—typically capping at 256MB to 512MB of RAM per container31—the stringent isolation guarantees that the Python 3.11 runtime operates without interference from noisy neighbors on the shared host nodes.

### **4.2 Automated Deployment and Environment Variable Injection**

Deploying the NexCell infrastructure on Northflank is driven entirely by Git-integration, eliminating the need for manual server provisioning. Northflank connects directly to the GitHub repository, automatically detecting source code modifications and triggering built-in CI/CD pipelines40.  
Because the dual-service architecture requires distinct execution commands, two separate Northflank web services are provisioned from the single repository. The deployment relies on a multi-stage Dockerfile optimized for the uv package manager. During configuration in the Northflank UI, the developer overrides the default Docker CMD for each service:

* The Frontend Service executes uv run src/frontend\_server.py.  
* The FastMCP Service executes uv run src/mcp\_server.py.

Environment variables are managed securely through Northflank's dedicated secret management interface31. The LIVEKIT\_URL, LIVEKIT\_API\_KEY, LIVEKIT\_API\_SECRET, GOOGLE\_API\_KEY, GROQ\_API\_KEY, CARTESIA\_API\_KEY, and all SMTP credentials are input into the UI as encrypted key-value pairs, which the platform securely injects into the containers during the build and runtime phases. This ensures strict compliance with security best practices by completely removing sensitive cryptographic material from the application source code.

### **4.3 Ingress Routing and Connection Longevity**

Northflank's proprietary ingress controllers are inherently optimized for modern network protocols, including HTTP/2, WebSockets, and gRPC44. This architectural sophistication provides a distinct advantage when managing the persistent connections required by the NexCell ecosystem.  
The FastMCP SSE tool server requires uninterrupted, long-lived HTTP streams to relay data back to the Gemini LLM. Northflank's routing mesh natively supports streaming responses without enforcing aggressive buffering caps that plague older PaaS implementations44. Provided the FastMCP application correctly asserts the Cache-Control: no-cache headers, Northflank facilitates seamless token streaming. Furthermore, the robust WebSocket support ensures the LiveKit agent worker maintains its vital command-and-control connection to LiveKit Cloud, instantly receiving and processing incoming voice dispatch events without premature connection termination.  
A critical consideration on Northflank involves deployment updates and container termination. LiveKit agents process voice sessions that can last several minutes. When a new version of the code is deployed, Northflank issues a SIGTERM signal to the existing container, instructing it to shut down. The LiveKit framework is designed to stop accepting new jobs upon receiving SIGTERM, but allows currently active voice sessions to conclude naturally1. To prevent active guest conversations from being abruptly severed during a rolling deployment, the Northflank service configuration must be adjusted to extend the termination grace period to a minimum of ten minutes, ensuring the agent has sufficient time to complete the conversation and disconnect gracefully.

## **5\. Tier 3 Architecture: Hugging Face Docker Spaces**

When the memory constraints of traditional PaaS platforms threaten the stability of asynchronous Python workers, Hugging Face Spaces provides an unconventional, yet highly capable, deployment vector. While primarily marketed as a platform for hosting machine learning demonstrations via Gradio or Streamlit, Hugging Face explicitly supports the deployment of arbitrary, user-defined Docker containers via their "Docker SDK" configuration37.

### **5.1 The Compute Anomaly and Hardware Constraints**

The defining characteristic of Hugging Face Spaces is its monumental hardware allocation for free users. A standard free Docker Space provisions 2 vCPUs paired with an exceptional 16 GB of RAM35. This immense memory capacity completely nullifies any concerns regarding Out-Of-Memory (OOM) errors during the orchestration of concurrent LiveKit agent sub-processes, providing vast operational headroom for complex cognitive pipelines and local Voice Activity Detection (VAD) algorithms.  
However, extracting this value requires navigating two severe architectural constraints imposed by the Hugging Face infrastructure:

1. **Single Port Binding:** Docker Spaces rigidly mandate that the containerized application expose only a single port to the external proxy routing mesh, universally defaulting to port 786045.  
2. **Inactivity Sleep Policy:** To conserve resources, Hugging Face automatically suspends free Spaces after approximately 48 hours of uninterrupted inactivity35.

### **5.2 The Monocontainer Orchestration Strategy**

To deploy the dual-service NexCell architecture within a system that strictly permits a single exposed port, the frontend server and the FastMCP tool server must be consolidated into a monolithic container utilizing internal proxy routing.  
The deployment necessitates a highly specialized Dockerfile. The file must include sdk: docker and app\_port: 7860 within the YAML front-matter of the repository's README.md to instruct the Hugging Face builder to expect a custom Docker environment37. Instead of relying on a standard Python execution command, the Docker ENTRYPOINT must launch a lightweight process supervisor, such as supervisord, or execute a custom bash script. This supervisor is responsible for simultaneously booting three internal processes:

1. The Starlette Frontend Server, bound internally to 127.0.0.1:8001.  
2. The FastMCP Tool Server, bound internally to 127.0.0.1:8000.  
3. A localized Nginx server, configured to listen on the externally exposed port 0.0.0.0:786045.

The internal Nginx configuration acts as a traffic dispatcher. It evaluates incoming requests from the Hugging Face proxy and routes them to the appropriate internal ASGI worker based on the URL path. Crucially, the Nginx configuration block dedicated to the FastMCP server must incorporate the proxy\_buffering off; and proxy\_http\_version 1.1; directives to preserve the integrity of the SSE tool-calling streams, preventing the Nginx instance from caching the asynchronous responses before they exit the container11.

### **5.3 Circumventing File System and Sleep Limitations**

Hugging Face enforces stringent security postures on container file systems, typically mounting the root directory as read-only. Applications are strictly permitted to perform write operations within the /tmp directory49. Within the NexCell ecosystem, any operation that generates temporary data—such as downloading audio chunks for Groq STT processing or assembling PDF invoices prior to SMTP dispatch—must be explicitly programmed to utilize the /tmp volume. It is critical to recognize that data stored in /tmp is strictly ephemeral and will be irrevocably destroyed upon container restart49.  
To mitigate the 48-hour inactivity sleep policy and preserve the sub-500ms latency required for instantaneous Voice AI interaction, a persistent heartbeat mechanism must be implemented35. Developers must utilize an external utility—such as a scheduled GitHub Actions workflow or a free synthetic monitoring service—to issue a simple HTTP GET request to the Space's health check endpoint every 24 hours. This automated ping satisfies the platform's activity threshold, preventing the container from entering a dormant state and guaranteeing that the LiveKit agent remains persistently warm and ready to orchestrate incoming webRTC streams. Environment variables, including API keys and SMTP credentials, are securely injected into the container via the "Secrets" panel within the Hugging Face Space settings UI, ensuring cryptographic material remains isolated from the public repository configuration.

## **6\. Advanced Integration and Operational Security Directives**

Regardless of the chosen hosting vector, the intersection of Voice AI, LLM orchestration, and persistent connections requires precise configuration to ensure stability, security, and performance.

### **6.1 Securing FastMCP Tool Execution via Starlette Middleware**

The FastMCP framework exposes powerful internal capabilities to external agents. In deployments on platforms offering public ingress routing (such as Northflank or Hugging Face), leaving the mcp\_server.py endpoint unauthenticated creates a critical security vulnerability. Malicious actors or unauthorized agents could discover the public URL and arbitrarily trigger tool execution, potentially executing Denial of Service attacks or spamming the SMTP invoice relay19.  
To secure the SSE endpoints, authentication must be implemented at the ASGI application layer. Because FastMCP is fundamentally built upon Starlette, developers can construct custom authentication logic using Starlette's Middleware class14. By wrapping the FastMCP application in custom middleware, every incoming HTTP request to the tool server can be evaluated for the presence of a valid cryptographic token.  
The implementation involves extracting the Authorization header from the incoming request. If the provided token does not match an expected API key stored securely within the environment variables, the middleware immediately halts execution and returns an HTTP 401 Unauthorized response, dropping the connection before the FastMCP application logic is ever invoked.

Python  
from fastmcp import FastMCP  
from starlette.middleware import Middleware  
from starlette.middleware.base import BaseHTTPMiddleware  
from starlette.responses import JSONResponse  
import os

class SecurityMiddleware(BaseHTTPMiddleware):  
    async def dispatch(self, request, call\_next):  
        token \= request.headers.get("Authorization")  
        if token \!= f"Bearer {os.getenv('MCP\_SECURE\_TOKEN')}":  
            return JSONResponse({"error": "Unauthorized Access"}, status\_code=401)  
        return await call\_next(request)

mcp \= FastMCP("NexCell Tools")  
http\_app \= mcp.http\_app(middleware=\[Middleware(SecurityMiddleware)\])

This paradigm ensures that the LangGraph orchestrator—configured to pass the corresponding bearer token in its client requests—remains the sole authorized entity capable of invoking the NexCell external tools14.

### **6.2 Application Coupling: The http\_app() Mounting Paradigm**

In scenarios where exposing a secondary port (Port 8000 for MCP) proves exceedingly complex or violates platform policies, the NexCell architecture can be refactored to eliminate the secondary server entirely.  
FastMCP provides the mcp.http\_app() method, which converts the tool server logic into a standard Starlette ASGI application13. Instead of running frontend\_server.py and mcp\_server.py as two disparate processes, the developer can mount the FastMCP ASGI application directly onto the primary Starlette frontend application.

Python  
\# frontend\_server.py  
from starlette.applications import Starlette  
from starlette.routing import Mount  
from src.mcp\_server import mcp \# Import the FastMCP instance

mcp\_asgi\_app \= mcp.http\_app(path="/mcp")

app \= Starlette(  
    routes=\[  
        Mount("/mcp", app=mcp\_asgi\_app),  
        \# ... other frontend UI routes ...  
    \],  
    lifespan=mcp\_asgi\_app.lifespan \# Critical for resource initialization  
)

This architectural convergence allows a single Python process running on Port 8001 to handle both the LiveKit worker orchestration and the FastMCP tool serving51. Crucially, the parent Starlette application must inherit and execute the lifespan context manager from the FastMCP application. Failing to link the lifespans will prevent the FastMCP server from correctly initializing its internal resources and event stores, resulting in catastrophic runtime failures during tool execution51.

### **6.3 Validating the Voice AI Latency Budget**

The deployment environment directly impacts the efficacy of the Voice AI conversational model. The NexCell architecture relies on a cascaded pipeline: Groq for ultra-fast Speech-to-Text transcription (targeting sub-300ms execution), Gemini for semantic reasoning, and Cartesia for Text-to-Speech generation (targeting sub-150ms Time-to-First-Byte)4.  
When analyzing deployment locations, it is imperative to align the geographic region of the hosting provider with the data centers utilized by LiveKit, Groq, Google, and Cartesia. Deploying the NexCell backend in a European data center while the API providers operate in US-East will introduce hundreds of milliseconds of geographic network propagation delay. This network latency aggregates across the STT, LLM, and TTS phases, exponentially increasing the delay before the guest hears a response53. Maintaining the strict sub-500ms conversational pacing necessitates co-locating the Oracle VM, Northflank Sandbox, or Hugging Face Space as close to the external API ingress points as physically possible.

## **7\. Strategic Conclusions**

The orchestration of real-time Voice AI applications introduces infrastructural complexities that fundamentally break traditional zero-cost hosting paradigms. The requirement for persistent, always-on asynchronous Python workers directly conflicts with the ubiquitous "scale-to-zero" economic models adopted by platforms like Render, Railway, and PandaStack to minimize idle compute costs. Furthermore, the reliance on Server-Sent Events for LangGraph tool orchestration exposes severe vulnerabilities when routed through aggressive reverse proxies that buffer network traffic.  
A rigorous evaluation of the 2026 cloud landscape isolates three definitive deployment blueprints capable of supporting the NexCell Voice Agent at zero cost:

1. **The Infrastructure-as-a-Service Blueprint (Oracle Cloud Always Free):** This approach offers absolute architectural sovereignty. The provision of 2 ARM OCPUs and 12 GB of RAM provides unparalleled hardware capacity, comfortably supporting high-concurrency LiveKit sub-processes and dual-service Docker Compose stacks without fear of memory starvation. By utilizing a self-managed Nginx proxy, developers gain total control over SSE buffering directives and outbound port configurations, ensuring flawless integration with FastMCP and secure SMTP relays. This is the optimal solution for teams possessing strong Linux administration and networking capabilities.  
2. **The Platform-as-a-Service Blueprint (Northflank Sandbox):** For organizations prioritizing deployment velocity and GitOps automation, Northflank delivers a highly sophisticated Kubernetes-native environment. By explicitly providing two free services that never sleep, the platform natively accommodates the split Starlette and FastMCP architecture. The platform abstracts away infrastructure management, providing secure environment variable injection and highly capable ingress routing that supports persistent WebRTC and SSE connections, making it the premier choice for developer experience.  
3. **The Monolithic Container Blueprint (Hugging Face Spaces):** When raw compute resources are paramount, the 16 GB of RAM offered by Hugging Face provides massive operational flexibility. While the platform imposes severe architectural constraints—mandating a single exposed port, a read-only filesystem, and enforcing a 48-hour sleep policy—these can be systematically circumvented using internal process supervisors, /tmp storage mapping, and external synthetic monitoring. This approach is highly effective for experimental deployments or architectures anticipating the future integration of heavy localized machine learning models.

To achieve production-grade stability across any of these environments, strict adherence to security and operational best practices is mandatory. The FastMCP endpoints must be aggressively secured via ASGI middleware to prevent unauthorized tool execution, and the container orchestration systems must be configured with extended termination grace periods to guarantee that active hotel guest conversations conclude elegantly during application updates. By executing these strategic imperatives, the NexCell infrastructure can operate persistently, securely, and with the ultra-low latency required for natural human-AI interaction, entirely free of ongoing hosting expenditures.

#### **Works cited**

1. Self-hosted deployments \- LiveKit Documentation, [https://docs.livekit.io/deploy/custom/deployments/](https://docs.livekit.io/deploy/custom/deployments/)  
2. How to use Django with Uvicorn, [https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/uvicorn/](https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/uvicorn/)  
3. Implementations — ASGI 3.0 documentation, [https://asgi.readthedocs.io/en/stable/implementations.html](https://asgi.readthedocs.io/en/stable/implementations.html)  
4. LiveKit for AI Agents: Production Architecture & Vendor Stack Guide \- Fora Soft, [https://www.forasoft.com/learn/livekit-for-ai-agents-guide](https://www.forasoft.com/learn/livekit-for-ai-agents-guide)  
5. Best Free Python Hosting — 6 Platforms Tested \[2026 Data\] \- SnapDeploy, [https://snapdeploy.dev/blog/host-python-web-app-free-2026-guide](https://snapdeploy.dev/blog/host-python-web-app-free-2026-guide)  
6. 7 Free Docker Hosting Platforms Tested (March 2026\) \- SnapDeploy, [https://snapdeploy.dev/blog/free-docker-hosting-2026-platforms-compared](https://snapdeploy.dev/blog/free-docker-hosting-2026-platforms-compared)  
7. The FastMCP Server, [https://gofastmcp.com/servers/server](https://gofastmcp.com/servers/server)  
8. Server-Sent Events in Next.js: Simpler Than WebSockets \- Matthews Wong, [https://www.matthewswong.com/en/blog/server-sent-events-nextjs-streaming/](https://www.matthewswong.com/en/blog/server-sent-events-nextjs-streaming/)  
9. Streaming AI Responses in Real-Time: How I Implemented Server-Sent Events in My FinPulse AI Assistant | by Shahzeb | Medium, [https://medium.com/@shahzebabro/streaming-ai-responses-in-real-time-how-i-implemented-server-sent-events-in-my-finpulse-ai-6bfd86c299fe](https://medium.com/@shahzebabro/streaming-ai-responses-in-real-time-how-i-implemented-server-sent-events-in-my-finpulse-ai-6bfd86c299fe)  
10. Server Sent Events are still not production ready after a decade. A lesson for me, a warning for you\! \- DEV Community, [https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie)  
11. fastmcp/docs/deployment/http.mdx at main \- GitHub, [https://github.com/jlowin/fastmcp/blob/main/docs/deployment/http.mdx](https://github.com/jlowin/fastmcp/blob/main/docs/deployment/http.mdx)  
12. jarthod/render-later \- GitHub, [https://github.com/jarthod/render-later](https://github.com/jarthod/render-later)  
13. FastAPI FastMCP, [https://gofastmcp.com/integrations/fastapi](https://gofastmcp.com/integrations/fastapi)  
14. HTTP Deployment \- FastMCP, [https://gofastmcp.com/deployment/http](https://gofastmcp.com/deployment/http)  
15. Oracle Cloud Free Tier vs Google Cloud Free Tier: 7 Brutal Truths in 2026, [https://freevps.edu.pl/blog/oracle-vs-google-cloud-free-tier-2026/](https://freevps.edu.pl/blog/oracle-vs-google-cloud-free-tier-2026/)  
16. Using an E-mail Address \- alwaysdata Documentation, [https://help.alwaysdata.com/en/docs/e-mails/use-an-e-mail-address/](https://help.alwaysdata.com/en/docs/e-mails/use-an-e-mail-address/)  
17. Login Information \- alwaysdata Documentation, [https://help.alwaysdata.com/en/docs/technical-specifications/login-details/](https://help.alwaysdata.com/en/docs/technical-specifications/login-details/)  
18. Build and deploy a remote MCP server on Cloud Run \- Google Cloud Documentation, [https://docs.cloud.google.com/run/docs/tutorials/deploy-remote-mcp-server](https://docs.cloud.google.com/run/docs/tutorials/deploy-remote-mcp-server)  
19. Build and Deploy a Remote MCP Server to Google Cloud Run in Under 10 Minutes, [https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes](https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes)  
20. Builds and Dockerfiles \- LiveKit Documentation, [https://docs.livekit.io/deploy/agents/builds/](https://docs.livekit.io/deploy/agents/builds/)  
21. Fly.io Free Tier 2026: What's Left After the Cuts? \- SaaS Price Pulse, [https://www.saaspricepulse.com/tools/flyio](https://www.saaspricepulse.com/tools/flyio)  
22. Fly.io Free Trial · Fly Docs, [https://fly.io/docs/about/free-trial/](https://fly.io/docs/about/free-trial/)  
23. Every Free Cloud Deploy Platform in 2026 — Ranked \[Full List\] \- SnapDeploy, [https://snapdeploy.dev/blog/free-cloud-deployment-platforms-2026-comparison](https://snapdeploy.dev/blog/free-cloud-deployment-platforms-2026-comparison)  
24. Platforms with a real free tier for developers in 2026 \- Render, [https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)  
25. What Are the Best Koyeb Alternatives for Dev Teams in 2026? \- Kuberns, [https://kuberns.com/blogs/koyeb-alternatives/](https://kuberns.com/blogs/koyeb-alternatives/)  
26. Zero-Cost SaaS: How I Deployed My Project with Koyeb.com | by Mehmet Cevheri Bozoğlan, [https://cevheri.medium.com/zero-cost-saas-how-i-deployed-my-project-with-koyeb-com-90518853a2ea](https://cevheri.medium.com/zero-cost-saas-how-i-deployed-my-project-with-koyeb-com-90518853a2ea)  
27. Best Budget Cloud Hosting for Developers 2026 — PandaStack Blog, [https://pandastack.io/blog/best-budget-cloud-hosting-2026](https://pandastack.io/blog/best-budget-cloud-hosting-2026)  
28. Best Cloud Platform for SaaS in 2026 — PandaStack Blog, [https://pandastack.io/blog/best-saas-hosting-2026](https://pandastack.io/blog/best-saas-hosting-2026)  
29. Oracle Cloud free tier 2026: 4 OCPU/24GB cut to 2 OCPU/12GB | TerminalBytes, [https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/)  
30. Oracle Cloud Free Tier | Oracle United Kingdom, [https://www.oracle.com/uk/cloud/free/](https://www.oracle.com/uk/cloud/free/)  
31. Northflank Review: Developer Platform, Pricing, GPU Workloads, BYOC, and Alternatives \- AI IDE List, [https://aiidelist.com/ide/northflank](https://aiidelist.com/ide/northflank)  
32. 7 Best Render alternatives for simple app hosting in 2026 | Blog \- Northflank, [https://northflank.com/blog/render-alternatives](https://northflank.com/blog/render-alternatives)  
33. Pricing \- Zeabur, [https://zeabur.com/pricing](https://zeabur.com/pricing)  
34. Changelogs: Free Plan Evolution: Say Hello to the Serverless Plan\! \- Zeabur, [https://zeabur.com/changelogs/say-hello-to-the-serverless-plan](https://zeabur.com/changelogs/say-hello-to-the-serverless-plan)  
35. 5 Free Ways to Host a Python Application \- KDnuggets, [https://www.kdnuggets.com/5-free-ways-to-host-a-python-application](https://www.kdnuggets.com/5-free-ways-to-host-a-python-application)  
36. Ask HN: What are you working on? (June 2026\) \- Hacker News, [https://news.ycombinator.com/item?id=48528779](https://news.ycombinator.com/item?id=48528779)  
37. Docker Spaces \- Hugging Face, [https://huggingface.co/docs/hub/spaces-sdks-docker](https://huggingface.co/docs/hub/spaces-sdks-docker)  
38. New Always Free Tier Limits (21-June-2026 \- Update from oracle support ) : r/oraclecloud, [https://www.reddit.com/r/oraclecloud/comments/1ubk2qy/new\_always\_free\_tier\_limits\_21june2026\_update/](https://www.reddit.com/r/oraclecloud/comments/1ubk2qy/new_always_free_tier_limits_21june2026_update/)  
39. Running LiveKit on AWS, [https://livekit.com/blog/running-livekit-on-aws](https://livekit.com/blog/running-livekit-on-aws)  
40. Northflank Review 2026 \- Cloud Computing \- European Purpose, [https://europeanpurpose.com/tool/northflank](https://europeanpurpose.com/tool/northflank)  
41. Best sandbox runners for AI agents and code execution in 2026 | Blog \- Northflank, [https://northflank.com/blog/best-sandbox-runners](https://northflank.com/blog/best-sandbox-runners)  
42. 6 Best Railway Alternatives in 2026 Compared \- Upsun, [https://upsun.com/blog/railway-alternatives/](https://upsun.com/blog/railway-alternatives/)  
43. 7 Fly.io Alternatives in 2026: Real Pricing After the Free Tier Died \- ExpressTech, [https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/](https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/)  
44. Vercel vs Northflank | Vercel Knowledge Base, [https://vercel.com/kb/guide/vercel-vs-northflank](https://vercel.com/kb/guide/vercel-vs-northflank)  
45. Effortlessly Build Machine Learning Apps with Hugging Face's Docker Spaces, [https://www.docker.com/blog/build-machine-learning-apps-with-hugging-faces-docker-spaces/](https://www.docker.com/blog/build-machine-learning-apps-with-hugging-faces-docker-spaces/)  
46. Dockerizing Your Project and Deploying to Hugging Face Spaces: A Full Guide \- Medium, [https://medium.com/@nwatch117/dockerizing-your-project-and-deploying-to-hugging-face-spaces-a-full-guide-b8d4b18c13d5](https://medium.com/@nwatch117/dockerizing-your-project-and-deploying-to-hugging-face-spaces-a-full-guide-b8d4b18c13d5)  
47. Deploying Python Applications to Hugging Face with Docker: A Step-by-Step Guide, [https://prabhukirankonda.medium.com/deploying-python-applications-to-hugging-face-with-docker-a-step-by-step-guide-3878575af231](https://prabhukirankonda.medium.com/deploying-python-applications-to-hugging-face-with-docker-a-step-by-step-guide-3878575af231)  
48. Space stuck on "Starting" badge despite app running fine on port 7860, [https://discuss.huggingface.co/t/space-stuck-on-starting-badge-despite-app-running-fine-on-port-7860/174315](https://discuss.huggingface.co/t/space-stuck-on-starting-badge-despite-app-running-fine-on-port-7860/174315)  
49. Deploying a FastAPI App on Hugging Face Spaces — and Handling All Its Restrictions | by Nasrin Mazaheri | Medium, [https://medium.com/@na.mazaheri/deploying-a-fastapi-app-on-hugging-face-spaces-and-handling-all-its-restrictions-d494d97a78fa](https://medium.com/@na.mazaheri/deploying-a-fastapi-app-on-hugging-face-spaces-and-handling-all-its-restrictions-d494d97a78fa)  
50. MCP servers – Connect Documentation Version 2026.06.1 \- Posit Docs, [https://docs.posit.co/connect/user/mcp-servers/](https://docs.posit.co/connect/user/mcp-servers/)  
51. from\_fastapi and mounting mcp in fastapi · Issue \#993 · PrefectHQ/fastmcp \- GitHub, [https://github.com/PrefectHQ/fastmcp/issues/993](https://github.com/PrefectHQ/fastmcp/issues/993)  
52. Provide custom lifespan to \`http\_app()\` · Issue \#1026 · PrefectHQ/fastmcp \- GitHub, [https://github.com/PrefectHQ/fastmcp/issues/1026](https://github.com/PrefectHQ/fastmcp/issues/1026)  
53. Testing LiveKit Voice Agents: Unit, Scenario, Load & Production Guide (2026) \- Hamming AI, [https://hamming.ai/resources/testing-livekit-voice-agents-complete-guide](https://hamming.ai/resources/testing-livekit-voice-agents-complete-guide)