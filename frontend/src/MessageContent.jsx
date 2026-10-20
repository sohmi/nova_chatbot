import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./MessageContent.css";

function CodeBlock({ language, code }) {
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access may be unavailable in some browser contexts.
    }
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language || "code"}</span>
        <button type="button" onClick={copyCode} className="copy-code">
          Copy code
        </button>
      </div>

      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "16px",
          background: "#a9adbd",
          fontSize: "13px",
          lineHeight: 1.65,
          overflowX: "auto",
        }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function MessageContent({ content = "", isStreaming = false }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // The custom code renderer provides its own container.
            return <>{children}</>;
          },

          code({ className, children, ...props }) {
            const match = /language-([\w+#.-]+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");

            // Fenced code blocks generally have a language class.
            // The newline check also supports unlabeled code blocks.
            const isBlock = Boolean(match) || String(children).includes("\n");

            if (isBlock) {
              // Avoid repeatedly running syntax highlighting on incomplete code.
              // The final render restores the normal highlighted code block.
              if (isStreaming) {
                return (
                  <pre className="streaming-code">
                    <code>{code}</code>
                  </pre>
                );
              }

              return (
                <CodeBlock
                  language={match?.[1]?.toLowerCase() || ""}
                  code={code}
                />
              );
            }

            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
