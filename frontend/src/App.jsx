import { useState, useRef, useEffect } from "react";
import "./App.css";
import MessageContent from "./MessageContent";

const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "https://nova-chatbot-2.onrender.com")
  : "/api";
const STORAGE_KEY = "nova_active_conversation";

const suggestions = [
  "Explain machine learning simply",
  "Help me brainstorm a project",
  "Write a Python program",
  "Explain how the internet works",
];

function App() {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const bottomRef = useRef(null);

  // Restore the signed-in session first, then load only that user's chats.
  useEffect(() => {
    async function initialize() {
      try {
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });

        if (meResponse.status === 401) {
          setUser(null);
          setConversations([]);
          setMessages([]);
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        if (!meResponse.ok) {
          throw new Error("Could not verify your session.");
        }

        const currentUser = await meResponse.json();
        setUser(currentUser);

        const response = await fetch(`${API_URL}/conversations`, {
          credentials: "include",
        });
        if (!response.ok) {
          if (response.status === 401) {
            setUser(null);
            return;
          }
          throw new Error("Could not load saved conversations.");
        }

        const savedConversations = await response.json();
        setConversations(savedConversations);

        const storedId = localStorage.getItem(STORAGE_KEY);
        const savedId = storedId ? Number(storedId) : null;
        const selected = savedConversations.find(
          (conversation) => conversation.id === savedId
        );

        if (selected) {
          await loadConversation(selected.id);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        setError(err.message || "Unable to connect to the Nova AI backend.");
      } finally {
        setAuthLoading(false);
      }
    }

    initialize();
  }, []);

  // Keep the mobile navigation drawer accessible and prevent background scrolling.
  useEffect(() => {
    if (!sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") setSidebarOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sidebarOpen]);

  // Scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fetch the messages belonging to a saved conversation.
  async function loadConversation(id) {
    const response = await fetch(`${API_URL}/conversations/${id}`, { credentials: "include" });

    if (!response.ok) {
      throw new Error("Could not open this conversation.");
    }

    const conversation = await response.json();

    setActiveId(conversation.id);
    setMessages(conversation.messages);
    localStorage.setItem(STORAGE_KEY, String(conversation.id));
    setError("");
  }

  // Refresh the sidebar after creating, updating or deleting a chat.
  async function refreshConversations() {
    const response = await fetch(`${API_URL}/conversations`, { credentials: "include" });

    if (!response.ok) {
      throw new Error("Could not refresh conversation history.");
    }

    const savedConversations = await response.json();
    setConversations(savedConversations);
  }

  // Send a message and save it through the backend.
  
async function sendMessage(text = input) {
  const content = text.trim();

  if (!content || loading) return;

  const updatedMessages = [
    ...messages,
    { role: "user", content },
  ];
  let assistantReply = "";
  let streamFrameId = null;

  setMessages([
    ...updatedMessages,
    { role: "assistant", content: "" },
  ]);

  setInput("");
  setError("");
  setLoading(true);

  // Batch streamed text updates to at most one React update per animation frame.
  function scheduleStreamUpdate() {
    if (streamFrameId !== null) return;
    streamFrameId = window.requestAnimationFrame(() => {
      streamFrameId = null;
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: assistantReply },
      ]);
    });
  }

  function flushStreamUpdate() {
    if (streamFrameId !== null) {
      window.cancelAnimationFrame(streamFrameId);
      streamFrameId = null;
    }
    setMessages([
      ...updatedMessages,
      { role: "assistant", content: assistantReply },
    ]);
  }

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      credentials: "include",
      body: JSON.stringify({
        conversation_id: activeId,
        messages: updatedMessages.map(({ role, content }) => ({
          role,
          content,
        })),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "The message could not be sent.");
    }

    if (!response.body) {
      throw new Error("Streaming is not supported by this response.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamCompleted = false;

    async function processEvent(eventText) {
      const dataLines = eventText
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) return;

      const event = JSON.parse(dataLines.join("\n"));

      if (event.type === "chunk") {
        assistantReply += event.content;
        scheduleStreamUpdate();
      } else if (event.type === "done") {
        streamCompleted = true;

        setActiveId(event.conversation_id);
        localStorage.setItem(
          STORAGE_KEY,
          String(event.conversation_id)
        );

        await refreshConversations();
      } else if (event.type === "error") {
        throw new Error(event.message || "Response generation failed.");
      }
    }

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const eventText of events) {
        await processEvent(eventText);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      await processEvent(buffer);
    }

    if (!streamCompleted) {
      throw new Error(
        "The response stream ended before completion. Please check the conversation."
      );
    }
  
} catch (err) {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);

  setError(
    message || "Unable to reach Nova AI. Check the backend."
  );
} finally {
  // Preserve any text received even if the stream ends with an error.
  if (assistantReply) flushStreamUpdate();
  setLoading(false);
}

}


  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (authBusy) return;

    setAuthBusy(true);
    setError("");

    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      
      const meResponse = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });

      if (!meResponse.ok) {
        const meData = await meResponse.json().catch(() => ({}));
        throw new Error(
          `Session verification failed (${meResponse.status}): ${
            meData.detail || "Please try again."
          }`
        );
      }


      setUser(await meResponse.json());
      setAuthPassword("");
      setError("");

      const conversationsResponse = await fetch(`${API_URL}/conversations`, {
        credentials: "include",
      });
      if (!conversationsResponse.ok) {
        throw new Error("Signed in, but could not load conversations.");
      }
      setConversations(await conversationsResponse.json());
    } catch (err) {
      setError(err.message || "Could not sign in to Nova AI.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    if (loading || authBusy) return;
    setError("");
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not log out.");
      }

      setUser(null);
      setConversations([]);
      setMessages([]);
      setActiveId(null);
      setInput("");
      localStorage.removeItem(STORAGE_KEY);
      setAuthMode("login");
      setShowPassword(false);
      setSidebarOpen(false);
    } catch (err) {
      setError(err.message || "Could not log out.");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  // Start a blank chat. The database conversation is created
  // when the first message is sent.
  function startNewChat() {
    if (loading) return;

    setActiveId(null);
    setMessages([]);
    setInput("");
    setError("");
    setSidebarOpen(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function openConversation(id) {
    if (loading) return;

    try {
      setError("");
      await loadConversation(id);
      setSidebarOpen(false);
    } catch (err) {
      setError(err.message || "Could not open conversation.");
    }
  }

  async function renameConversation(conversation) {
    if (loading) return;
    const proposedTitle = window.prompt("Rename this conversation", conversation.title || "New chat");
    if (proposedTitle === null) return;
    const title = proposedTitle.trim();
    if (!title) {
      setError("Conversation title cannot be empty.");
      return;
    }
    if (title.length > 120) {
      setError("Keep conversation titles under 120 characters.");
      return;
    }

    try {
      setError("");
      const response = await fetch(`${API_URL}/conversations/${conversation.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not rename conversation.");
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, title: data.title || title } : item));
    } catch (err) {
      setError(err.message || "Could not rename conversation.");
    }
  }

  async function deleteConversation(id) {
    if (loading) return;

    const confirmed = window.confirm(
      "Delete this conversation and all its messages?"
    );

    if (!confirmed) return;

    try {
      setError("");

      const response = await fetch(
        `${API_URL}/conversations/${id}`,
        { method: "DELETE", credentials: "include" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Could not delete conversation.");
      }

      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        localStorage.removeItem(STORAGE_KEY);
      }

      await refreshConversations();
    } catch (err) {
      setError(err.message || "Could not delete conversation.");
    }
  }

  if (authLoading) {
    return (
      <main className="nova-loading-screen" role="status" aria-live="polite" aria-label="Loading Nova AI">
        <div className="loading-orbit loading-orbit-one" />
        <div className="loading-orbit loading-orbit-two" />
        <div className="loading-core"><span>✳</span></div>
        <div className="loading-brand">nova<span>.ai</span></div>
        <p className="loading-caption">A little spark of intelligence.</p>
        <div className="loading-progress"><span /></div>
        <p className="loading-status">Getting things ready<span className="loading-ellipsis">...</span></p>
      </main>
    );
  }

  if (!user) {
    const isRegister = authMode === "register";
    return (
      <div style={authStyles.page}>
        <section style={authStyles.card}>
          <div style={authStyles.brand}>✳ nova<span style={{ color: "#a78bfa" }}>.ai</span></div>
          <h1 style={authStyles.heading}>{isRegister ? "Create your account" : "Welcome back"}</h1>
          <p style={authStyles.muted}>
            {isRegister ? "Sign up to save your conversations and chat with Nova." : "Sign in to continue your conversations with Nova."}
          </p>
          <form onSubmit={handleAuthSubmit}>
            <label htmlFor="nova-email" style={authStyles.label}>Email address</label>
            <input
              id="nova-email"
              type="email"
              autoComplete="email"
              required
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="you@example.com"
              style={authStyles.input}
              disabled={authBusy}
            />
            <label htmlFor="nova-password" style={authStyles.label}>Password</label>
            <div style={authStyles.passwordWrap}>
              <input
                id="nova-password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 12 : 1}
                maxLength={128}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder={isRegister ? "At least 12 characters" : "Enter your password"}
                style={{ ...authStyles.input, paddingRight: "52px" }}
                disabled={authBusy}
              />
              <button
                type="button"
                style={authStyles.passwordToggle}
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                disabled={authBusy}
              >
                {showPassword ? "◉" : "◎"}
              </button>
            </div>
            {error && <p role="alert" style={{ ...authStyles.error, marginTop: 16 }}>{error}</p>}
            <button type="submit" style={{ ...authStyles.submit, opacity: authBusy ? 0.7 : 1 }} disabled={authBusy}>
              {authBusy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>
          <p style={authStyles.switchText}>
            {isRegister ? "Already have an account? " : "New to Nova AI? "}
            <button
              type="button"
              style={authStyles.switchButton}
              onClick={() => { setAuthMode(isRegister ? "login" : "register"); setShowPassword(false); setError(""); }}
              disabled={authBusy}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </button>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={`app${sidebarOpen ? " sidebar-visible" : ""}`}>
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside id="nova-sidebar" className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`} aria-label="Conversation navigation">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">✳</div>
            <span>
              nova<span className="brand-accent">.ai</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            ×
          </button>
        </div>

        <button className="new-chat" onClick={startNewChat}>
          <span>＋</span> New chat
        </button>

        <div className="history-heading-row">
          <div className="history-heading">YOUR CONVERSATIONS</div>
          <span className="history-count">{conversations.length}</span>
        </div>
        <label className="history-search" htmlFor="history-search-input">
          <span aria-hidden="true">⌕</span>
          <input
            id="history-search-input"
            type="search"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
          {historyQuery && <button type="button" onClick={() => setHistoryQuery("")} aria-label="Clear search">×</button>}
        </label>

        <div className="history-list">
          {conversations.length === 0 ? (
            <p className="history-empty">No saved conversations yet. Start a chat to see it here.</p>
          ) : conversations.filter((conversation) => (conversation.title || "").toLowerCase().includes(historyQuery.trim().toLowerCase())).length === 0 ? (
            <p className="history-empty">No conversations match “{historyQuery}”.</p>
          ) : (
            conversations.filter((conversation) => (conversation.title || "").toLowerCase().includes(historyQuery.trim().toLowerCase())).map((conversation) => (
              <div
                key={conversation.id}
                className={`history-item ${
                  activeId === conversation.id ? "active" : ""
                }`}
              >
                <button
                  className="history-open"
                  onClick={() => openConversation(conversation.id)}
                  disabled={loading}
                  title={conversation.title}
                >
                  <span className="history-icon">◷</span>
                  <span className="history-title">
                    {conversation.title}
                  </span>
                </button>

                <div className="history-actions">
                  <button
                    className="history-action"
                    onClick={() => renameConversation(conversation)}
                    disabled={loading}
                    aria-label={`Rename ${conversation.title}`}
                    title="Rename conversation"
                  >
                    ✎
                  </button>
                  <button
                    className="history-delete"
                    onClick={() => deleteConversation(conversation.id)}
                    disabled={loading}
                    aria-label={`Delete ${conversation.title}`}
                    title="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-bottom">
  <div className="avatar">
    {(user.email || "U").charAt(0).toUpperCase()}
  </div>

  <div className="account-details">
    <strong title={user.email}>{user.email}</strong>
    <p>Signed in</p>
  </div>

  <button
    type="button"
    className="signout-button"
    onClick={handleLogout}
    disabled={loading || authBusy}
    title="Sign out of Nova AI"
  >
    <span aria-hidden="true">↪</span>
    <span>Sign out</span>
  </button>
</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-leading topbar-title-group">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversation menu"
              aria-controls="nova-sidebar"
              aria-expanded={sidebarOpen}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="mobile-brand"><span className="mobile-brand-icon" aria-hidden="true">✳</span>Nova AI</span>
            <span className="desktop-label">General assistant</span>
          </div>
          <span className="model-label">AI Chat</span>
        </header>

        <section className="conversation">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✳</div>
              <p className="eyebrow">YOUR PERSONAL AI</p>

              <h1>
                Hey there. <span>What’s on your mind?</span>
              </h1>

              <p className="subtitle">
                Ask questions, explore ideas, or create something amazing.
                Let's figure it out together.
              </p>

              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="suggestion"
                    onClick={() => sendMessage(suggestion)}
                    disabled={loading}
                  >
                    <span>↗</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <article
                  key={message.id ?? `${message.role}-${index}`}
                  className={`message ${message.role}`}
                >
                  <div className="message-avatar">
                    {message.role === "assistant" ? "✳" : "Y"}
                  </div>

                  <div className="message-body">
                    <span className="message-author">
                      {message.role === "assistant" ? "Nova" : "You"}
                    </span>
                    <MessageContent
                      content={message.content}
                      isStreaming={loading && message.role === "assistant" && index === messages.length - 1}
                    />
                  </div>
                </article>
              ))}

              {loading && (
                <div className="message assistant">
                  <div className="message-avatar">✳</div>
                  <div className="message-body">
                    <span className="message-author">Nova</span>
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </section>

        <footer className="composer-area">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message Nova..."
              rows={1}
              maxLength={10000}
              disabled={loading}
            />

            <button
              type="submit"
              className="send-button"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>

          <p className="disclaimer">
            Nova AI can make mistakes. Verify important information.
          </p>
        </footer>
      </main>
    </div>
  );
}

const authStyles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#0b0b12",
    color: "#f8fafc",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    boxSizing: "border-box",
    padding: "32px",
    border: "1px solid #292938",
    borderRadius: "20px",
    background: "#13131d",
    boxShadow: "0 24px 80px rgba(0,0,0,.28)",
  },
  brand: { fontSize: "25px", fontWeight: 750, letterSpacing: "-1px", marginBottom: "24px" },
  heading: { fontSize: "27px", margin: "0 0 8px", letterSpacing: "-.7px" },
  muted: { color: "#a1a1b5", lineHeight: 1.5, margin: "0 0 24px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, margin: "16px 0 8px", color: "#d4d4e0" },
  passwordWrap: { position: "relative", width: "100%" },
  passwordToggle: {
    position: "absolute",
    top: 0,
    right: "5px",
    width: "42px",
    height: "100%",
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: "8px",
    background: "transparent",
    color: "#b9a2ff",
    fontSize: "20px",
    cursor: "pointer",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #353548",
    borderRadius: "10px",
    padding: "12px 13px",
    color: "#f8fafc",
    background: "#0d0d16",
    font: "inherit",
    outlineOffset: "2px",
  },
  error: { color: "#fca5a5", background: "#351b24", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" },
  submit: {
    width: "100%",
    marginTop: "22px",
    padding: "12px 16px",
    border: 0,
    borderRadius: "10px",
    background: "#8b5cf6",
    color: "white",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  switchText: { marginTop: "20px", color: "#a1a1b5", fontSize: "13px", textAlign: "center" },
  switchButton: { border: 0, background: "transparent", color: "#c4b5fd", cursor: "pointer", font: "inherit", fontWeight: 650 },
  logout: { border: "1px solid #3b3b4d", borderRadius: "8px", background: "transparent", color: "inherit", padding: "6px 9px", cursor: "pointer" },
};

export default App;
