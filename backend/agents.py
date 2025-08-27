import os

from typing import List, Literal, TypedDict
import asyncio

from pydantic import BaseModel
import instructor
from groq import AsyncGroq

from langchain_core.messages import (
    AIMessage,
    BaseMessage, 
    HumanMessage,
    SystemMessage
)
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from retrieval import VectorSearch
from prompt_manager import PromptManager

# Prompt Manager
prompt_manager = PromptManager(
    prompt_dir="prompts",
    environment=os.getenv("ENVIRONMENT", "production")
)

# Data Models
class RouterRoutes(BaseModel):
    route: Literal["retrieval", "non_retrieval", "off_topic"]
    confidence: Literal["low", "medium", "high"]

class ChatStream(TypedDict):
    status: Literal["streaming", "completed"]
    token: str
    citations: List[str]

class GraphState(TypedDict):
    user_query: BaseMessage
    is_data_valid: bool
    is_safe: bool
    messages: List[BaseMessage]
    full_history: List[BaseMessage]
    router_result: RouterRoutes
    is_query_valid: bool
    improved_query: BaseMessage
    retrieval_result: List[dict]
    chat_stream: ChatStream
    num_compressions: int = 0

# Data Validator
class DataValidator:
    def __init__(self, prompt_manager: PromptManager):
        config = prompt_manager.get_model_config('data_validator')
        self.character_multiplier = config.get('character_multiplier', 0.25)
        self.word_multiplier = config.get('word_multiplier', 1.3)
        self.max_tokens = config.get('max_tokens', 4000)

    async def is_valid(self, state: GraphState):
        print("data valid", state)
        user_prompt = state['user_query'].content
        character_estimate = len(user_prompt) * self.character_multiplier
        word_estimate = len(user_prompt.split()) * self.word_multiplier
        total_tokens = (character_estimate + word_estimate) // 2
        state["is_data_valid"] = total_tokens <= self.max_tokens
        return state

# Safety Agent
class SafetyAgent:
    def __init__(self, prompt_manager: PromptManager):
        config = prompt_manager.get_model_config('safety_agent')
        self.model_id = config.get('model_id', 'meta-llama/llama-prompt-guard-2-86m')
        self.temperature = config.get('temperature', 0)
        self.max_completion_tokens = config.get('max_completion_tokens', 1)
        self.top_p = config.get('top_p', 1)
        self.safety_threshold = config.get('safety_threshold', 0.8)
        self.model = AsyncGroq()

    async def is_safe(self, state: GraphState):
        user_prompt = state['user_query'].content
        response = await self.model.chat.completions.create(
            model=self.model_id,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            temperature=self.temperature,
            max_completion_tokens=self.max_completion_tokens,
            top_p=self.top_p
        )
        state["is_safe"] = float(response.choices[0].message.content) < self.safety_threshold
        print("safety", state)
        return state

# Router Agent
class RouterAgent:
    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager
        config = prompt_manager.get_model_config('router_agent')
        self.model_id = config.get('model_id', 'gemma2-9b-it')
        self.temperature = config.get('temperature', 0)
        self.model = instructor.from_groq(AsyncGroq())

    async def route(self, state: GraphState):
        print("router in", state)
        user_query = state['user_query'].content
        old_messages = state.get("messages", [])
        history = self._build_history(old_messages)
        
        system_prompt = self.prompt_manager.get_prompt('router_agent', 'system_prompt')
        user_prompt_template = self.prompt_manager.get_prompt('router_agent', 'user_prompt_template')
        
        user_prompt = user_prompt_template.format(
            history=history, 
            user_query=user_query
        )
        
        response = await self.model.chat.completions.create(
            model=self.model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_model=RouterRoutes,
            max_retries=3,
            temperature=self.temperature
        )
        
        state["router_result"] = response
        state["is_query_valid"] = response.route != "off_topic"
        print("router out", state)
        return state
    
    def _build_history(self, messages):
        history = ""
        if not messages:
            return history
        for message in messages:
            if isinstance(message, HumanMessage):
                history += f"<human>{message.content}</human>\n"
            elif isinstance(message, AIMessage):
                history += f"<assistant>{message.content}</assistant>\n"
            else:
                history += f"<previous-conversation>{message.content}</previous-conversation>\n"
        return history

# QA Agent 
class ChatAgent:
    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager
        config = prompt_manager.get_model_config('chat_agent')
        self.model_id = config.get('model_id', 'moonshotai/kimi-k2-instruct')
        
        system_prompt = prompt_manager.get_prompt('chat_agent', 'system_prompt')
        user_prompt = prompt_manager.get_prompt('chat_agent', 'user_prompt_template')
        
        self.chat_prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt), 
            ("human", user_prompt)
        ])
        self.model = ChatGroq(model=self.model_id)

    async def generate(self, state: GraphState):
        print("chat in", state)
        context = ''
        citations = [] 
        if state['router_result'].route == 'retrieval':
            context, citations = self._parse_retreived_documents(state['retrieval_result'])
        
        generate_chain = self.chat_prompt_template | self.model
        chat_stream = ChatStream(
            status="streaming",
            token="",
            citations=citations
        )
        state["chat_stream"] = chat_stream
        full_response = ""
        
        async for chunk in generate_chain.astream({
            "context": context,
            "user_query": state['improved_query'].content
        }):
            if chunk.content:
                full_response += chunk.content
                state["chat_stream"]["token"] = chunk.content
        
        state["chat_stream"]["status"] = "completed"
        messages = state.get("messages", [])
        messages.append(state["user_query"])
        messages.append(AIMessage(content=full_response))
        state["messages"] = messages
        print("chat out", state)
        return state
    
    def _parse_retreived_documents(self, documents):
        text = ''
        indices = []
        for idx, document in enumerate(documents):
            text += f"{idx+1}. {document['text']}\n"
            indices.append(str(document['id']))
        return text, indices

# Context Builder Agent
class ContextBuilderAgent:
    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager
        config = prompt_manager.get_model_config('context_builder')
        self.model_id = config.get('model_id', 'moonshotai/kimi-k2-instruct')
        
        system_prompt = prompt_manager.get_prompt('context_builder', 'system_prompt')
        user_prompt = prompt_manager.get_prompt('context_builder', 'user_prompt_template')
        
        self.chat_prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt), 
            ("human", user_prompt)
        ])
        self.model = ChatGroq(model=self.model_id)

    async def generate(self, state: GraphState):
        old_messages = state.get("messages", [])
        history = self._build_history(old_messages)
        paraphrase_chain = self.chat_prompt_template | self.model
        result = await paraphrase_chain.ainvoke({
            "history": history, 
            "user_query": state["user_query"].content
        })
        state["improved_query"] = HumanMessage(content=result.content)
        print("context builder out", state)
        return state

    def _build_history(self, messages):
        history = ""
        if not messages:
            return history
        for message in messages:
            if isinstance(message, HumanMessage):
                history += f"<human>{message.content}</human>\n"
            elif isinstance(message, AIMessage):
                history += f"<assistant>{message.content}</assistant>\n"
            else:
                history += f"<previous-conversation>{message.content}</previous-conversation>\n"
        return history

# Memory Manager
class MemoryManagerAgent:
    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager
        config = prompt_manager.get_model_config('memory_manager')
        self.model_id = config.get('model_id', 'moonshotai/kimi-k2-instruct')
        
        system_prompt = prompt_manager.get_prompt('memory_manager', 'system_prompt')
        user_prompt = prompt_manager.get_prompt('memory_manager', 'user_prompt_template')
        
        self.chat_prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt), 
            ("human", user_prompt)
        ])
        self.model = ChatGroq(model=self.model_id)

    async def generate(self, state: GraphState):
        old_messages = state.get("messages", [])
        history = self._build_history(old_messages)
        summarization_chain = self.chat_prompt_template | self.model
        result = await summarization_chain.ainvoke({"history": history})
        
        full_history = state.get("full_history", [])
        full_history.extend(state.get("messages", []))
        state["full_history"] = full_history
        state["messages"] = [SystemMessage(content=result.content)]
        num_compressions = state.get("num_compressions", 0) + 1
        state["num_compressions"] = num_compressions
        return state

    def _build_history(self, messages):
        history = ""
        if not messages:
            return history
        for message in messages:
            if isinstance(message, HumanMessage):
                history += f"<human>{message.content}</human>\n"
            elif isinstance(message, AIMessage):
                history += f"<assistant>{message.content}</assistant>\n"
            else:
                history += f"<previous-conversation>{message.content}</previous-conversation>\n"
        return history

class RetrievalAgent:
    def __init__(self):
        self.vector_search = VectorSearch()

    async def retrieve(self, state: GraphState):
        state["retrieval_result"] = await asyncio.to_thread(
            self.vector_search.query,
            state["improved_query"].content
        )
        return state

# Steering functions
def is_data_valid_steer(state: GraphState):
    if not state["is_data_valid"]:
        return "end"
    else:
        return "safety_agent"

def is_safe_steer(state: GraphState):
    if not state["is_safe"]:
        return "end"
    else:
        return "router_agent"

def category_router_steer(state: GraphState):
    if not state["is_query_valid"]:
        return "end"
    else:
        return "context_builder_agent"
    
def retrieval_non_retrieval_steer(state: GraphState):
    if state["router_result"].route == "non_retrieval":
        return "non_retrieval"
    else:
        return "retrieval"

def memory_management_steer(state: GraphState, max_messages=16):
    if not len(state.get("messages", [])) > max_messages:
        return "end"
    else:
        return "memory_management_agent"

def build_graph():
    # Initialize prompt manager
    prompt_mgr = PromptManager()
    
    # Graph Building
    checkpoint_save_dir = "checkpoint"
    # checkpoint_file_name = "chat_history.sqlite"
    DATA_VALIDATOR = "data_validator"
    SAFETY_AGENT = "safety_agent"
    ROUTER_AGENT = "router_agent"
    CHAT_AGENT = "chat_agent"
    CONTEXT_BUILDER_AGENT = "context_builder_agent"
    MEMORY_MANAGEMENT_AGENT = "memory_management_agent"
    RETRIEVAL_AGENT = "retrieval_agent"

    # Initialize agents with prompt manager
    data_validator = DataValidator(prompt_mgr)
    safety_agent = SafetyAgent(prompt_mgr)
    router_agent = RouterAgent(prompt_mgr)
    chat_agent = ChatAgent(prompt_mgr)
    context_builder_agent = ContextBuilderAgent(prompt_mgr)
    memory_management_agent = MemoryManagerAgent(prompt_mgr)
    retrieval_agent = RetrievalAgent()

    graph = StateGraph(GraphState)
    graph.add_node(DATA_VALIDATOR, data_validator.is_valid)
    graph.add_node(SAFETY_AGENT, safety_agent.is_safe)
    graph.add_node(ROUTER_AGENT, router_agent.route)
    graph.add_node(CHAT_AGENT, chat_agent.generate)
    graph.add_node(CONTEXT_BUILDER_AGENT, context_builder_agent.generate)
    graph.add_node(MEMORY_MANAGEMENT_AGENT, memory_management_agent.generate)
    graph.add_node(RETRIEVAL_AGENT, retrieval_agent.retrieve)

    graph.add_conditional_edges(
        DATA_VALIDATOR,
        is_data_valid_steer,
        {
            "end": END,
            "safety_agent": SAFETY_AGENT
        }
    )
    graph.add_conditional_edges(
        SAFETY_AGENT,
        is_safe_steer,
        {
            "end": END,
            "router_agent": ROUTER_AGENT
        }
    )

    graph.add_conditional_edges(
        ROUTER_AGENT,
        category_router_steer,
        {
            "end": END,
            "context_builder_agent": CONTEXT_BUILDER_AGENT
        }
    )
    graph.add_conditional_edges(
        CONTEXT_BUILDER_AGENT,
        retrieval_non_retrieval_steer,
        {
            "non_retrieval": CHAT_AGENT,
            "retrieval": RETRIEVAL_AGENT
        }
    )

    graph.add_edge(RETRIEVAL_AGENT, CHAT_AGENT)
    graph.add_conditional_edges(
        CHAT_AGENT, 
        memory_management_steer,
        {
            "end": END,
            "memory_management_agent": MEMORY_MANAGEMENT_AGENT
        }
    )
    graph.add_edge(MEMORY_MANAGEMENT_AGENT, END)
    graph.set_entry_point(DATA_VALIDATOR)

    os.makedirs(checkpoint_save_dir, exist_ok=True)
    # sql_conn = await aiosqlite.connect(os.path.join(checkpoint_save_dir, checkpoint_file_name))
    # checkpointer = AsyncSqliteSaver(sql_conn)
    checkpointer = MemorySaver()

    app = graph.compile(checkpointer=checkpointer)
    return app

def draw_graph():
    from langchain_core.runnables.graph import MermaidDrawMethod

    graph_save_dir = "artifacts"
    graph_filename = "graph.png"

    image_data = build_graph().get_graph().draw_mermaid_png(
        draw_method=MermaidDrawMethod.API,
    )
    with open(os.path.join(graph_save_dir, graph_filename), "wb") as f:
        f.write(image_data)