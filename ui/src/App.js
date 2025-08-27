import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, ChevronDown, ChevronRight, Send, Hash, X, Bot, MoreVertical, Loader2, Code, CheckCircle, AlertCircle, List } from 'lucide-react';

// Simple Markdown renderer component
const MarkdownRenderer = ({ content }) => {
  const renderMarkdown = (text) => {
    if (!text) return null;
    
    // Split into lines for processing
    const lines = text.split('\n');
    const elements = [];
    let currentList = [];
    let currentListType = null;
    let codeBlock = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    
    const flushList = () => {
      if (currentList.length > 0) {
        const ListComponent = currentListType === 'ol' ? 'ol' : 'ul';
        elements.push(
          <ListComponent key={elements.length} className={currentListType === 'ol' ? 'list-decimal ml-6 my-2' : 'list-disc ml-6 my-2'}>
            {currentList.map((item, idx) => (
              <li key={idx} className="mb-1">{renderInline(item)}</li>
            ))}
          </ListComponent>
        );
        currentList = [];
        currentListType = null;
      }
    };
    
    const renderInline = (text) => {
      // Handle inline code
      text = text.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>');
      
      // Handle bold
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
      text = text.replace(/__([^_]+)__/g, '<strong class="font-semibold">$1</strong>');
      
      // Handle italic
      text = text.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
      text = text.replace(/_([^_]+)_/g, '<em class="italic">$1</em>');
      
      // Handle links
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
      
      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    };
    
    lines.forEach((line, index) => {
      // Check for code block start/end
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeBlock = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <div key={elements.length} className="my-3">
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                {codeLanguage && (
                  <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400 flex items-center justify-between">
                    <span>{codeLanguage}</span>
                    <Code size={12} />
                  </div>
                )}
                <pre className="p-3 overflow-x-auto">
                  <code className="text-sm text-gray-100 font-mono">
                    {codeBlock.join('\n')}
                  </code>
                </pre>
              </div>
            </div>
          );
          codeLanguage = '';
        }
        return;
      }
      
      if (inCodeBlock) {
        codeBlock.push(line);
        return;
      }
      
      // Headers
      if (line.startsWith('# ')) {
        flushList();
        elements.push(<h1 key={elements.length} className="text-xl font-bold mt-4 mb-2">{renderInline(line.slice(2))}</h1>);
      } else if (line.startsWith('## ')) {
        flushList();
        elements.push(<h2 key={elements.length} className="text-lg font-bold mt-3 mb-2">{renderInline(line.slice(3))}</h2>);
      } else if (line.startsWith('### ')) {
        flushList();
        elements.push(<h3 key={elements.length} className="text-base font-bold mt-2 mb-1">{renderInline(line.slice(4))}</h3>);
      }
      // Lists
      else if (line.match(/^\d+\.\s/)) {
        if (currentListType !== 'ol') {
          flushList();
          currentListType = 'ol';
        }
        currentList.push(line.replace(/^\d+\.\s/, ''));
      } else if (line.match(/^[-*+]\s/)) {
        if (currentListType !== 'ul') {
          flushList();
          currentListType = 'ul';
        }
        currentList.push(line.replace(/^[-*+]\s/, ''));
      }
      // Blockquote
      else if (line.startsWith('> ')) {
        flushList();
        elements.push(
          <blockquote key={elements.length} className="border-l-4 border-gray-300 pl-4 my-2 italic text-gray-600">
            {renderInline(line.slice(2))}
          </blockquote>
        );
      }
      // Horizontal rule
      else if (line.match(/^---+$/) || line.match(/^\*\*\*+$/) || line.match(/^___+$/)) {
        flushList();
        elements.push(<hr key={elements.length} className="my-4 border-gray-300" />);
      }
      // Regular paragraph
      else if (line.trim()) {
        flushList();
        elements.push(<p key={elements.length} className="mb-2">{renderInline(line)}</p>);
      }
    });
    
    flushList();
    return elements;
  };
  
  return <div className="markdown-content">{renderMarkdown(content)}</div>;
};

// Quirky loading messages component
const LoadingIndicator = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    "🔍 Detective mode: ON",
    "🕵️ Investigating the archives...",
    "📚 Speed-reading through messages...",
    "🔎 Following the digital breadcrumbs...",
    "💭 Connecting the dots...",
    "🗂️ Rifling through the filing cabinet...",
    "🧩 Piecing together the puzzle...",
    "☕ Quick coffee break... just kidding!",
    "🎯 Zeroing in on the answer...",
    "🔬 Analyzing conversation patterns..."
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex items-center gap-2 text-gray-500 text-sm italic">
      <Loader2 size={14} className="animate-spin" />
      <span>{messages[messageIndex]}</span>
    </div>
  );
};

const SlackClone = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('clojurians-clojure');
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [chatbotInput, setChatbotInput] = useState('');
  const [chatbotMessages, setChatbotMessages] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState(new Set());
  const [xmlLoaded, setXmlLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatbotMessages]);

  // Channels list 
  const channels = [
    { id: 'clojurians-clojure', name: 'clojurians-clojure', active: true },
    { id: 'general', name: 'general', active: false },
    { id: 'random', name: 'random', active: false },
    { id: 'announcements', name: 'announcements', active: false }
  ];

  // Sample XML data (limited to prevent UI issues)
  const sampleXML = `<slack>
  <team_domain>clojurians</team_domain>
  <channel_name>help</channel_name>
  <message conversation_id="1">
    <ts>2018-12-31T00:08:47.720400</ts>
    <user>Kandra</user>
    <text>Ok</text>
  </message>
  <message conversation_id="2">
    <ts>2018-12-31T00:21:49.721700</ts>
    <user>Nevada</user>
    <text>Hello Guys i need help

The issue is: I want to set up "AdminLTE-2.4.5" theme+CRUD in Django App at front-side...</text>
  </message>
  <message conversation_id="2">
    <ts>2018-12-31T04:55:39.724100</ts>
    <user>Sharolyn</user>
    <text>i have same "connection.ini" files in different folder...</text>
  </message>
  <message conversation_id="2">
    <ts>2018-12-31T05:33:48.726200</ts>
    <user>Rubie</user>
    <text>Morning this hopefully should be an easy one for someone...</text>
  </message>
</slack>`;

  // Parse XML file with size limit
  const parseXMLContent = (xmlContent) => {
    console.log('=== Starting XML Parse ===');
    console.log('Content type:', typeof xmlContent);
    console.log('Content length:', xmlContent.length);
    
    try {
      // Limit content size to prevent UI issues (e.g., 1MB)
      const MAX_CONTENT_LENGTH = 1000000;
      if (xmlContent.length > MAX_CONTENT_LENGTH) {
        console.warn('XML content truncated due to size limit');
        xmlContent = xmlContent.substring(0, MAX_CONTENT_LENGTH);
      }

      const parser = new DOMParser();
      console.log('Parsing XML...');
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      // Check for parse errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        console.error('XML parse error found:', parseError.textContent);
        // Try to parse anyway
      }
      
      console.log('Looking for message tags...');
      const messageElements = xmlDoc.getElementsByTagName('message');
      console.log('Found message elements:', messageElements.length);
      
      // Also try different tag names in case of namespace issues
      if (messageElements.length === 0) {
        console.log('No "message" tags found, trying other approaches...');
        console.log('Root element:', xmlDoc.documentElement?.tagName);
        console.log('All child nodes:', xmlDoc.documentElement?.childNodes.length);
      }
      
      const parsedMessages = [];
      
      // Limit number of messages to prevent performance issues
      const MAX_MESSAGES = 1000;
      const messageCount = Math.min(messageElements.length, MAX_MESSAGES);
      console.log(`Processing ${messageCount} messages...`);
      
      for (let i = 0; i < messageCount; i++) {
        const msg = messageElements[i];
        const conversationId = msg.getAttribute('conversation_id');
        const ts = msg.getElementsByTagName('ts')[0]?.textContent;
        const user = msg.getElementsByTagName('user')[0]?.textContent;
        const text = msg.getElementsByTagName('text')[0]?.textContent;
        
        if (i < 3) {
          console.log(`Message ${i}:`, { conversationId, ts, user, text: text?.substring(0, 50) });
        }
        
        if (ts && user && text) {
          const timestamp = new Date(ts);
          parsedMessages.push({
            id: `msg-${i}`,
            conversationId,
            timestamp,
            user,
            text: text.substring(0, 5000), // Limit message length
            formattedTime: timestamp.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            }),
            formattedDate: timestamp.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })
          });
        } else if (i < 10) {
          console.warn(`Skipping message ${i} - missing data:`, { ts: !!ts, user: !!user, text: !!text });
        }
      }
      
      console.log(`Successfully parsed ${parsedMessages.length} messages`);
      return parsedMessages;
    } catch (error) {
      console.error('Error in parseXMLContent:', error);
      console.error('Stack trace:', error.stack);
      return [];
    }
  };

  // Load XML on mount
  useEffect(() => {
    const loadXML = async () => {
      setIsLoading(true);
      let loadedMessages = [];
      let dataSource = 'sample';

      // Method 1: Try fetch with different approaches
      try {
        console.log('=== Starting XML Load Process ===');
        console.log('Current URL:', window.location.href);
        
        // Try different URL formats
        const urls = [
          '/data.xml',
          './data.xml',
          'data.xml',
          `${window.location.origin}/data.xml`,
          `${process.env.PUBLIC_URL}/data.xml`
        ];
        
        for (const url of urls) {
          try {
            console.log(`Trying URL: ${url}`);
            const response = await fetch(url);
            console.log(`Response for ${url}:`, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers.get('content-type'),
              ok: response.ok
            });
            
            if (response.ok) {
              const fileContent = await response.text();
              console.log('Successfully fetched! Content length:', fileContent.length);
              console.log('First 500 chars:', fileContent.substring(0, 500));
              
              // Check if it's actually XML
              if (fileContent.includes('<slack>') || fileContent.includes('<?xml')) {
                loadedMessages = parseXMLContent(fileContent);
                console.log('Parsed messages:', loadedMessages);
                
                if (loadedMessages.length > 0) {
                  dataSource = 'file';
                  console.log('Successfully loaded from file!');
                  break;
                }
              } else {
                console.error('File content does not appear to be XML');
              }
            }
          } catch (err) {
            console.log(`Failed to fetch ${url}:`, err.message);
          }
        }
      } catch (error) {
        console.error('Error in XML loading process:', error);
      }
      
      // Use sample XML if no external file or empty results
      if (loadedMessages.length === 0) {
        console.log('=== Using sample XML data ===');
        loadedMessages = parseXMLContent(sampleXML);
      }
      
      // Set state after parsing is complete
      console.log('=== Final Results ===');
      console.log('Final message count:', loadedMessages.length);
      console.log('Data source:', dataSource);
      console.log('First message:', loadedMessages[0]);
      
      setMessages(loadedMessages);
      setXmlLoaded(dataSource === 'file');
      setIsLoading(false);
    };

    loadXML();
  }, []);

  // Show loading screen while data is being loaded
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#4a154b] mx-auto mb-4" />
          <p className="text-gray-600">Loading Slack data...</p>
        </div>
      </div>
    );
  }

  // Group messages by conversation
  const groupedMessages = messages.reduce((acc, msg) => {
    if (!acc[msg.conversationId]) {
      acc[msg.conversationId] = [];
    }
    acc[msg.conversationId].push(msg);
    return acc;
  }, {});

  // Filter messages based on search
  const filteredThreads = Object.entries(groupedMessages).filter(([_, thread]) =>
    thread.some(msg => 
      msg.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.user.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Toggle thread expansion
  const toggleThread = (conversationId) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(conversationId)) {
      newExpanded.delete(conversationId);
    } else {
      newExpanded.add(conversationId);
    }
    setExpandedThreads(newExpanded);
  };

  // UPDATED: Streaming chatbot functionality with markdown support
  const sendChatbotMessage = async () => {
    if (!chatbotInput.trim() || isStreaming) return;

    const messageText = chatbotInput.trim();
    const threadId = `thread-${Date.now()}`; // Generate unique thread ID

    // Add user message
    const userMessage = {
      id: Date.now(),
      text: messageText,
      isUser: true,
      timestamp: new Date()
    };

    setChatbotMessages(prev => [...prev, userMessage]);
    setChatbotInput('');
    setIsStreaming(true);

    // Add placeholder for bot response
    const botMessageId = Date.now() + 1;
    const botMessage = {
      id: botMessageId,
      text: '',
      isUser: false,
      timestamp: new Date(),
      conversationIds: [],
      isStreaming: true
    };

    setChatbotMessages(prev => [...prev, botMessage]);

    try {
      // Call your FastAPI streaming endpoint
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_query: messageText,
          thread_id: threadId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let citations = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                // Handle error
                console.error('Stream error:', data.error);
                setChatbotMessages(prev => 
                  prev.map(msg => 
                    msg.id === botMessageId 
                      ? { ...msg, text: '⚠️ Sorry, an error occurred. Please try again.', isStreaming: false }
                      : msg
                  )
                );
                setIsStreaming(false);
                return;
              }

              if (data.token) {
                // Append token to the accumulated text
                accumulatedText += data.token;
                
                // Update the bot message with accumulated text
                setChatbotMessages(prev => 
                  prev.map(msg => 
                    msg.id === botMessageId 
                      ? { ...msg, text: accumulatedText }
                      : msg
                  )
                );
              }

              if (data.done) {
                // Stream complete
                if (data.citations) {
                  citations = data.citations;
                }
                
                // Final update with citations
                setChatbotMessages(prev => 
                  prev.map(msg => 
                    msg.id === botMessageId 
                      ? { 
                          ...msg, 
                          text: accumulatedText || '✅ I found some relevant information in the channel.',
                          conversationIds: citations,
                          isStreaming: false 
                        }
                      : msg
                  )
                );
                setIsStreaming(false);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      
      // Update message with error
      setChatbotMessages(prev => 
        prev.map(msg => 
          msg.id === botMessageId 
            ? { 
                ...msg, 
                text: '🔌 **Connection Error**\n\nI couldn\'t connect to the server. Please make sure the backend is running on `http://localhost:8000`.',
                isStreaming: false 
              }
            : msg
        )
      );
      setIsStreaming(false);
    }
  };

  const scrollToConversation = (conversationId) => {
    setActiveThread(conversationId);
    setExpandedThreads(new Set([...expandedThreads, conversationId]));
    setTimeout(() => {
      const element = document.getElementById(`thread-${conversationId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Get user avatar color
  const getUserColor = (user) => {
    const colors = ['#e01e5a', '#2eb67d', '#ecb22e', '#36c5f0', '#e01563', '#4a154b'];
    let hash = 0;
    for (let i = 0; i < user.length; i++) {
      hash = user.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[#3f0e40] text-gray-100 flex flex-col">
        <div className="p-4 border-b border-purple-900/30">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            Clojurians Workspace
          </h1>
          <p className="text-xs text-purple-200 mt-1">
            {xmlLoaded ? 'XML loaded' : 'Using sample data'} • {messages.length} messages
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2">
            <div className="text-xs font-semibold text-purple-200 mb-1 px-3">Channels</div>
            {channels.map(channel => (
              <button
                key={channel.id}
                onClick={() => channel.active && setSelectedChannel(channel.id)}
                className={`w-full text-left px-3 py-1 rounded flex items-center gap-2 transition-colors ${
                  selectedChannel === channel.id
                    ? 'bg-[#1164a3] text-white'
                    : channel.active
                    ? 'hover:bg-purple-900/30 text-gray-300'
                    : 'text-gray-500 cursor-not-allowed opacity-50'
                }`}
                disabled={!channel.active}
              >
                <Hash size={16} className="opacity-70" />
                <span className="text-sm">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header - Fixed structure */}
        <div className="bg-white border-b border-gray-300 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash size={18} className="text-gray-600" />
            <h2 className="text-lg font-bold text-gray-900">clojurians-clojure</h2>
          </div>
          
          <div className="flex-1 max-w-2xl mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="Search in clojurians-clojure"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white border border-transparent focus:border-blue-500"
              />
            </div>
          </div>
          
          <button
            onClick={() => setIsChatbotOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors relative"
            title="Open SHERLOCK Assistant"
          >
            <Bot size={20} className="text-gray-600" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-5 py-4">
            {filteredThreads.length === 0 ? (
              <div className="text-center text-gray-500 mt-20">
                {searchTerm ? 'No messages found' : 'No messages in this channel'}
              </div>
            ) : (
              <div className="space-y-0">
                {filteredThreads.map(([conversationId, thread]) => {
                  const isExpanded = expandedThreads.has(conversationId);
                  const firstMessage = thread[0];
                  const replyCount = thread.length - 1;
                  const lastReply = thread[thread.length - 1];
                  
                  return (
                    <div
                      key={conversationId}
                      id={`thread-${conversationId}`}
                      className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                        activeThread === conversationId ? 'bg-blue-50' : ''
                      }`}
                    >
                      {/* First Message */}
                      <div className="px-5 py-3">
                        <div className="flex gap-3">
                          <div 
                            className="w-9 h-9 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ backgroundColor: getUserColor(firstMessage.user) }}
                          >
                            {firstMessage.user[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="font-bold text-gray-900">{firstMessage.user}</span>
                              <span className="text-xs text-gray-500">{firstMessage.formattedTime}</span>
                            </div>
                            <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                              {firstMessage.text}
                            </div>
                            
                            {/* Thread indicator */}
                            {replyCount > 0 && (
                              <button
                                onClick={() => toggleThread(conversationId)}
                                className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium group"
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
                                <span className="text-gray-500 text-xs">
                                  Last reply {lastReply.formattedDate} at {lastReply.formattedTime}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Thread Replies */}
                      {isExpanded && replyCount > 0 && (
                        <div className="bg-gray-50 border-t border-gray-200">
                          <div className="px-5 py-3 space-y-3">
                            {thread.slice(1).map(msg => (
                              <div key={msg.id} className="flex gap-3 pl-12">
                                <div 
                                  className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                  style={{ backgroundColor: getUserColor(msg.user) }}
                                >
                                  {msg.user[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-2 mb-1">
                                    <span className="font-bold text-gray-900 text-sm">{msg.user}</span>
                                    <span className="text-xs text-gray-500">{msg.formattedTime}</span>
                                  </div>
                                  <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.text}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chatbot Sidebar */}
      {isChatbotOpen && (
        <div className="fixed inset-0 bg-black/20 z-50" onClick={() => setIsChatbotOpen(false)}>
          <div 
            className="absolute right-0 top-0 h-full w-[450px] bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chatbot Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-[#4a154b] to-[#611f69] text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Bot size={24} />
                SHERLOCK 🕵️
              </h3>
              <button
                onClick={() => setIsChatbotOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat Messages */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {chatbotMessages.length === 0 ? (
                <div className="text-center mt-10">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full mb-4">
                    <Bot size={40} className="text-[#4a154b]" />
                  </div>
                  <p className="text-gray-700 font-medium mb-2">I'm SHERLOCK, your Slack detective!</p>
                  <p className="text-gray-500 text-sm">Ask me anything about the Clojurians channel. I can help you find relevant discussions, summarize threads, and uncover hidden insights!</p>
                  <div className="mt-6 space-y-2">
                    <p className="text-xs text-gray-400">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <span className="px-3 py-1 bg-white rounded-full text-xs text-gray-600 border border-gray-200">What are people discussing?</span>
                      <span className="px-3 py-1 bg-white rounded-full text-xs text-gray-600 border border-gray-200">Find threads about Django</span>
                      <span className="px-3 py-1 bg-white rounded-full text-xs text-gray-600 border border-gray-200">Who needs help?</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatbotMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                    >
                      <div
                        className={`max-w-[85%] ${
                          msg.isUser 
                            ? 'bg-gradient-to-r from-[#1164a3] to-[#0d7ea2] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-md' 
                            : 'bg-white border border-gray-200 text-gray-800 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm'
                        }`}
                      >
                        {msg.isUser ? (
                          <div className="text-sm">{msg.text}</div>
                        ) : (
                          <>
                            {msg.isStreaming ? (
                              <LoadingIndicator />
                            ) : (
                              <div className="text-sm">
                                <MarkdownRenderer content={msg.text} />
                              </div>
                            )}
                            {msg.conversationIds && msg.conversationIds.length > 0 && !msg.isStreaming && (
                              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                                <p className="text-xs text-gray-500 font-medium mb-2">📍 Referenced Threads:</p>
                                {msg.conversationIds.map(id => (
                                  <button
                                    key={id}
                                    onClick={() => {
                                      scrollToConversation(id);
                                      setIsChatbotOpen(false);
                                    }}
                                    className="block w-full text-left px-3 py-2 bg-gradient-to-r from-gray-50 to-blue-50 hover:from-gray-100 hover:to-blue-100 rounded-lg text-sm text-gray-700 transition-all transform hover:scale-[1.02] group"
                                  >
                                    <span className="flex items-center gap-2">
                                      <MessageSquare size={14} className="text-blue-600" />
                                      <span className="group-hover:text-blue-700">View Thread #{id}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatbotInput}
                  onChange={(e) => setChatbotInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isStreaming && sendChatbotMessage()}
                  placeholder={isStreaming ? "SHERLOCK is investigating..." : "Ask SHERLOCK anything..."}
                  disabled={isStreaming}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1164a3] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 transition-all"
                />
                <button
                  onClick={sendChatbotMessage}
                  disabled={!chatbotInput.trim() || isStreaming}
                  className="px-4 py-2.5 bg-gradient-to-r from-[#007a5a] to-[#00a874] hover:from-[#148567] hover:to-[#00b87a] disabled:from-gray-300 disabled:to-gray-400 text-white rounded-lg transition-all flex items-center shadow-md hover:shadow-lg transform hover:scale-105 disabled:scale-100"
                >
                  {isStreaming ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SlackClone;