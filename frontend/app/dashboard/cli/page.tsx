"use client";

import { useState, useEffect } from "react";

export default function CliPage() {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!mounted) return null;

  const commands = [
    { cmd: "git clone https://github.com/Hashirattari11/breaklytix.git", label: "Get the source", desc: "The CLI is currently installed from the project repository" },
    { cmd: "cd breaklytix/cli && npm install -g .", label: "Install globally", desc: "Requires Node.js 18 or newer" },
    { cmd: "breaklytix login", label: "Authenticate", desc: "Paste an API key generated in Settings → API Keys" },
    { cmd: "breaklytix scan", label: "Scan repository", desc: "Scan the current git repository for API usage" },
    { cmd: "breaklytix scan --dir ./path/to/project", label: "Scan a directory", desc: "Scan any local folder without a git repository" },
    { cmd: "breaklytix status", label: "Check status", desc: "List alerts returned by the Breaklytix API" },
    { cmd: "breaklytix watch", label: "Watch mode", desc: "Re-scan the current directory every 30 seconds" },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .cli-page { max-width: 900px; margin: 0 auto; padding: 32px 24px 64px; }
        .cli-hero { text-align: center; margin-bottom: 48px; }
        .cli-hero h1 { font-size: 32px; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.01em; }
        .cli-hero p { font-size: 16px; color: var(--muted); margin: 0; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.6; }
        .cli-terminal { background: #1a1a2e; border-radius: 14px; overflow: hidden; border: 1px solid #2d2d44; margin-bottom: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
        .cli-terminal-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #22223b; border-bottom: 1px solid #2d2d44; }
        .cli-terminal-dot { width: 12px; height: 12px; border-radius: 50%; }
        .cli-terminal-body { padding: 20px; font-family: var(--font-mono); font-size: 13px; line-height: 1.7; color: #e4e4e7; }
        .cli-cmd-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .cli-cmd-row:last-child { border-bottom: none; }
        .cli-cmd-text { color: #4ade80; font-weight: 600; }
        .cli-cmd-desc { color: #9ca3af; font-size: 12px; margin-top: 2px; }
        .cli-copy-btn { padding: 4px 10px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #9ca3af; font-size: 11px; cursor: pointer; transition: all 0.15s; font-family: var(--font-mono); }
        .cli-copy-btn:hover { background: rgba(255,255,255,0.15); color: white; }
        .cli-copy-btn.copied { background: rgba(74,222,128,0.2); color: #4ade80; border-color: rgba(74,222,128,0.3); }
        .cli-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 28px; margin-bottom: 24px; }
        .cli-section h2 { font-size: 18px; font-weight: 700; margin: 0 0 16px; }
        .cli-scan-input { display: flex; gap: 12px; margin-bottom: 16px; }
        .cli-scan-input input { flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); font-size: 14px; font-family: var(--font-mono); outline: none; transition: border-color 0.15s; }
        .cli-scan-input input:focus { border-color: var(--accent); }
        .cli-scan-output { background: #1a1a2e; border-radius: 10px; padding: 16px; font-family: var(--font-mono); font-size: 12px; color: #e4e4e7; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
        .cli-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
        .cli-feature-card { padding: 20px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; transition: transform 0.2s, border-color 0.2s; }
        .cli-feature-card:hover { transform: translateY(-2px); border-color: var(--accent); }
        .cli-feature-card h3 { font-size: 14px; font-weight: 700; margin: 0 0 6px; }
        .cli-feature-card p { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.5; }
        .cli-platform-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
        .cli-platform-card { padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; text-align: center; transition: transform 0.2s; cursor: pointer; }
        .cli-platform-card:hover { transform: translateY(-2px); border-color: var(--accent); }
        .cli-platform-card .icon { font-size: 28px; margin-bottom: 8px; }
        .cli-platform-card .name { font-size: 13px; font-weight: 600; }
        .cli-platform-card .cmd { font-size: 11px; color: var(--muted); font-family: var(--font-mono); margin-top: 4px; }
        @media (max-width: 768px) {
          .cli-feature-grid { grid-template-columns: 1fr; }
          .cli-platform-grid { grid-template-columns: 1fr; }
          .cli-scan-input { flex-direction: column; }
        }
      `}} />

      <div className="cli-page">
        {/* Hero */}
        <div className="cli-hero" style={{ animation: "fadeInUp 0.6s ease" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "var(--green-bg)", color: "var(--green)", fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
            CLI preview — install from source
          </div>
          <h1>Developer CLI</h1>
          <p>Scan your local codebase for third-party API usage and check alerts from your terminal. There is no published npm package yet, so install it from the project source below.</p>
        </div>

        {/* Install Terminal */}
        <div className="cli-terminal" style={{ animation: "fadeInUp 0.6s ease 0.1s both" }}>
          <div className="cli-terminal-header">
            <span className="cli-terminal-dot" style={{ background: "#ff5f57" }} />
            <span className="cli-terminal-dot" style={{ background: "#ffbd2e" }} />
            <span className="cli-terminal-dot" style={{ background: "#28ca42" }} />
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#8b8ba8", fontFamily: "var(--font-mono)" }}>terminal</span>
          </div>
          <div className="cli-terminal-body">
            {commands.map((c, i) => (
              <div key={i} className="cli-cmd-row">
                <div>
                  <div className="cli-cmd-text">$ {c.cmd}</div>
                  <div className="cli-cmd-desc">{c.desc}</div>
                </div>
                <button className={`cli-copy-btn ${copied === c.cmd ? "copied" : ""}`} onClick={() => copyCmd(c.cmd)}>
                  {copied === c.cmd ? "Copied!" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="cli-section" style={{ animation: "fadeInUp 0.6s ease 0.2s both" }}>
          <h2>Requirements</h2>
          <div className="cli-platform-grid">
            <div className="cli-platform-card">
              <div className="icon">🟢</div>
              <div className="name">Node.js 18+</div>
              <div className="cmd">node --version</div>
            </div>
            <div className="cli-platform-card">
              <div className="icon">📦</div>
              <div className="name">Git</div>
              <div className="cmd">git --version</div>
            </div>
            <div className="cli-platform-card">
              <div className="icon">💻</div>
              <div className="name">Linux, macOS, Windows</div>
              <div className="cmd">source install only</div>
            </div>
          </div>
        </div>

        {/* Local Scan */}
        <div className="cli-section" style={{ animation: "fadeInUp 0.6s ease 0.3s both" }}>
          <h2>Scan Local Directory</h2>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px" }}>
            Local scanning runs on your machine. From the folder you want to inspect, run:
          </p>
          <div className="cli-scan-output">$ breaklytix scan --dir .</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0" }}>
            The dashboard cannot read files from your computer. Use the CLI command above
            for a local scan; use <strong>Repositories</strong> to connect and monitor a
            GitHub repository.
          </p>
        </div>

        {/* Features */}
        <div className="cli-section" style={{ animation: "fadeInUp 0.6s ease 0.4s both" }}>
          <h2>CLI Features</h2>
          <div className="cli-feature-grid">
            {[
              { title: "API detection", desc: "Finds Stripe, Shopify, Twilio, SendGrid, and GitHub API usage in supported source files." },
              { title: "Local file scanning", desc: "Scans a directory on your machine without requiring a git repository. Symlinks and oversized files are skipped." },
              { title: "Secret redaction", desc: "Detected snippets are redacted before they are printed, so API keys are not copied into your terminal history." },
              { title: "Alert status", desc: "Lists the alerts the Breaklytix API returns for your account. Alert generation happens server-side." },
              { title: "Local watch mode", desc: "Re-scans the current directory every 30 seconds in the foreground. It is not a CI/CD integration." },
              { title: "Source install", desc: "The CLI is not on npm yet. The dashboard shows the supported source-install commands." },
            ].map((f, i) => (
              <div key={i} className="cli-feature-card">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Start */}
        <div className="cli-section" style={{ animation: "fadeInUp 0.6s ease 0.5s both" }}>
          <h2>Quick Start Guide</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { step: 1, title: "Install the CLI", desc: "Clone the project and run cd breaklytix/cli && npm install -g . (Node.js 18+)." },
              { step: 2, title: "Get your API key", desc: "Go to Settings → API Keys in the dashboard and generate a new key." },
              { step: 3, title: "Authenticate", desc: "Run breaklytix login and paste your API key when prompted. The key is validated before it is saved." },
              { step: 4, title: "Scan your project", desc: "Navigate to your project and run breaklytix scan — or breaklytix scan --dir ./path for any folder." },
              { step: 5, title: "Review results", desc: "Run breaklytix status to see alerts returned by the API for your account." },
            ].map((s) => (
              <div key={s.step} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), #8b5cf6)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
