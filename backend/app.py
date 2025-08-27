from pydantic import BaseModel
import json

from langchain_core.messages import HumanMessage

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agents import build_graph

app = FastAPI(title="Sherlock", version = "0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    user_query: str
    thread_id: str = "default"

graph = None
@app.on_event("startup")
async def startup():
    global graph
    graph = build_graph()
    print("Graph initialized")

@app.get("/")
async def healthcheck():
    return {"status": "running"}

@app.post("/chat")
async def chat(request: ChatRequest):
    async def generate():
        try:
            user_query = HumanMessage(content=request.user_query)
            initial_state = {
                "user_query": user_query,
                "is_data_valid": True,
                "is_safe": True,
                "router_result": None,
                "is_query_valid": True,
                "improved_query": None,
                "retrieval_result": [],
                "chat_stream": None,
            }
            config = {"configurable":{"thread_id":"default"}}
            got_response = False
            is_streaming = False

            is_streaming = False
            citations = []

            async for event in graph.astream_events(initial_state, config, version="v2"):
                event_type = event["event"]
                
                if event_type == "on_chain_end":
                    metadata = event.get("metadata", {})
                    node_name = metadata.get("langgraph_node") if isinstance(metadata, dict) else None
                    
                    event_name = event.get("name", "")
                    
                    if node_name == "data_validator" or event_name == "data_validator":
                        output = event.get("data", {}).get("output", {})
                        if isinstance(output, dict) and not output.get("is_data_valid", True):
                            yield f'data: {json.dumps({"done": False, "token": "I\'m sorry, but your query is too long. Please try with a shorter message."})}\n\n'
                            yield f'data: {json.dumps({"done": True, "citations": []})}\n\n'
                            return
                    
                    elif node_name == "safety_agent" or event_name == "safety_agent":
                        output = event.get("data", {}).get("output", {})
                        if isinstance(output, dict) and not output.get("is_safe", True):
                            yield f'data: {json.dumps({"done": False, "token": "I\'m sorry, but I can\'t answer this query."})}\n\n'
                            yield f'data: {json.dumps({"done": True, "citations": []})}\n\n'
                            return
                    
                    elif node_name == "router_agent" or event_name == "router_agent":
                        output = event.get("data", {}).get("output", {})
                        if isinstance(output, dict):
                            router_result = output.get("router_result")
                            if router_result and hasattr(router_result, 'route') and router_result.route == "off_topic":
                                yield f'data: {json.dumps({"done": False, "token": "I\'m sorry, but I can only answer queries related to Python programming."})}\n\n'
                                yield f'data: {json.dumps({"done": True, "citations": []})}\n\n'
                                return
                    
                    elif node_name == "chat_agent" or event_name == "chat_agent":
                        output = event.get("data", {}).get("output", {})
                        if isinstance(output, dict):
                            chat_stream = output.get("chat_stream", {})
                            if isinstance(chat_stream, dict):
                                citations = chat_stream.get("citations", [])
                            else:
                                citations = []
                            yield f'data: {json.dumps({"done": True, "citations": citations})}\n\n'
                            is_streaming = False
                    elif event_name == "LangGraph":
                        break
                
                elif event_type == "on_chain_start":
                    if event.get("metadata", {}).get("langgraph_node") == "chat_agent":
                        is_streaming = True
                
                elif event_type == "on_chat_model_stream" and is_streaming:
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield f'data: {json.dumps({"done": False, "token": chunk.content})}\n\n'
        except Exception as e:
            print(f"Error:\n: {str(e)}")
            yield f'data: {json.dumps({"error": str(e)})}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"}
    )


if __name__=="__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)