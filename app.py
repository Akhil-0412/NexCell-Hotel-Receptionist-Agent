import subprocess
import sys
import time
import os
import gradio as gr
import spaces

@spaces.GPU
def allocate_gpu():
    return "GPU allocated successfully!"

with gr.Blocks() as demo:
    gr.Markdown("# Olivia Backend is running.")
    gr.Markdown("The frontend is hosted on Vercel. This space just runs the Voice Worker and MCP Server in the background.")
    btn = gr.Button("Ping GPU (Internal Use)")
    out = gr.Textbox()
    btn.click(allocate_gpu, outputs=out)

def main():
    print("[Orchestrator] Starting MCP Server...", flush=True)
    mcp_process = subprocess.Popen([sys.executable, "src/mcp_server.py"])
    
    print("[Orchestrator] Waiting for MCP Server to initialize...", flush=True)
    time.sleep(5)
    
    print("[Orchestrator] Starting Voice Worker...", flush=True)
    voice_process = subprocess.Popen([sys.executable, "src/voice_server.py", "dev"])
    
    port = int(os.environ.get("PORT", 7860))
    print(f"[Orchestrator] Starting Gradio Healthcheck Server on port {port}...", flush=True)
    demo.launch(server_name="0.0.0.0", server_port=port)

if __name__ == "__main__":
    main()
