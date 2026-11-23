"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "../lib/analytics";

/* ═══════════════════════════════════════════════════════════════
   INTERACTIVE STORY — "Your stack. One quiet API change."
   The visitor picks an API they actually use, then steps through a
   short narrative: it works → the provider ships a breaking change →
   two outcomes (without vs with Breaklytix) → a clear next action.

   Every scenario is explicitly labeled an ILLUSTRATIVE example. Real
   alerts come from official provider changelogs once a repo is connected.
   No fake metrics, no invented customer claims.
   ═══════════════════════════════════════════════════════════════ */

type ProviderKey = "stripe" | "github" | "openai" | "twilio" | "sendgrid" | "aws";

const PROVIDERS: Record<
  ProviderKey,
  { name: string; color: string; snippet: string; change: string; file: string; fn: string }
> = {
  stripe: {
    name: "Stripe",
    color: "#635bff",
    snippet: 'await stripe.checkout.sessions.create({\n  mode: "payment",\n  line_items: [{ price, quantity: 1 }],\n});',
    change: "Checkout Sessions: legacy `subscription` params removed; `mode` now required.",
    file: "src/payments/checkout.ts",
    fn: "createCheckoutSession()",
  },
  github: {
    name: "GitHub",
    color: "#8b949e",
    snippet: 'const { data } = await octokit.rest.repos.getContent({\n  owner, repo, path: "package.json",\n});',
    change: "REST API: `getContent` response `encoding` field deprecated.",
    file: "src/github/sync.ts",
    fn: "fetchRepoFile()",
  },
  openai: {
    name: "OpenAI",
    color: "#10a37f",
    snippet: 'const res = await openai.chat.completions.create({\n  model: "gpt-4o",\n  messages: [{ role: "user", content: prompt }],\n});',
    change: "Chat Completions: `functions` param removed in favor of `tools`.",
    file: "src/ai/assistant.ts",
    fn: "runAssistant()",
  },
  twilio: {
    name: "Twilio",
    color: "#f22f46",
    snippet: 'await client.messages.create({\n  to, from: twilioNumber,\n  body: "Your code is 4821",\n});',
    change: "Messages API: `statusCallback` signature auth now enforced.",
    file: "src/notify/sms.ts",
    fn: "sendOtp()",
  },
  sendgrid: {
    name: "SendGrid",
    color: "#1a82e2",
    snippet: 'await sgMail.send({\n  to, from: "no-reply@yourapp.com",\n  subject: "Welcome", html,\n});',
    change: "Mail Send: legacy `api_key` header auth sunset.",
    file: "src/email/send.ts",
    fn: "sendWelcome()",
  },
  aws: {
    name: "AWS S3",
    color: "#ff9900",
    snippet: 'await s3.putObject({\n  Bucket: "uploads", Key: key, Body: file,\n}).promise();',
    change: "S3: path-style requests deprecated for new buckets.",
    file: "src/storage/upload.ts",
    fn: "uploadFile()",
  },
};

const ORDER: ProviderKey[] = ["stripe", "github", "openai", "twilio", "sendgrid", "aws"];
const STEPS = 5;

export default function InteractiveStory() {
  const [provider, setProvider] = useState<ProviderKey>("stripe");
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const p = PROVIDERS[provider];

  const pick = useCallback((k: ProviderKey) => {
    setProvider(k);
    setStep(0);
    setStarted(true);
    track("story_provider_selected", { provider: k });
  }, []);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(STEPS - 1, next));
      setStep(clamped);
      if (!started) {
        setStarted(true);
        track("story_started", { provider });
      }
      track("story_step_advanced", { provider, step: clamped });
      if (clamped === STEPS - 1) track("story_completed", { provider });
    },
    [provider, started]
  );

  // Keep the live region focused for screen readers without stealing focus.
  useEffect(() => {
    if (started && liveRef.current) liveRef.current.focus({ preventScroll: true });
  }, [step, started]);

  return (
    <section className="story-section" aria-labelledby="story-title">
      <style>{`
        .story-section { background: linear-gradient(180deg, #0a0a0b 0%, #101012 100%); padding: 84px 24px; color: #fff; }
        .story-inner { max-width: 920px; margin: 0 auto; }
        .story-kicker { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#c8f542; margin-bottom:14px; }
        .story-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; line-height: 1.18; margin: 0 0 12px; letter-spacing: -0.02em; }
        .story-sub { font-size: 16.5px; line-height: 1.65; color: rgba(255,255,255,0.66); margin: 0 0 28px; max-width: 640px; }
        .story-picker { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 26px; }
        .story-chip { display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:999px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.85); font-size:14px; font-weight:600; cursor:pointer; transition:all .18s ease; }
        .story-chip:hover { border-color: rgba(255,255,255,0.4); transform: translateY(-1px); }
        .story-chip[aria-pressed="true"] { background: rgba(200,245,66,0.22); border-color: #c8f542; color:#fff; box-shadow: 0 0 0 1px rgba(200,245,66,0.4); }
        .story-chip-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .story-stage { border:1px solid rgba(255,255,255,0.12); border-radius:18px; background:rgba(10,10,11,0.6); overflow:hidden; }
        .story-stage-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03); }
        .story-stage-label { font-size:12.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:rgba(255,255,255,0.55); }
        .story-dots { display:flex; gap:7px; }
        .story-dot { width:9px; height:9px; border-radius:50%; border:none; padding:0; cursor:pointer; background:rgba(255,255,255,0.2); transition:all .2s ease; }
        .story-dot[aria-current="true"] { background:#c8f542; transform:scale(1.25); }
        .story-dot.done { background:rgba(200,245,66,0.55); }
        .story-body { padding:26px 24px; min-height:280px; }
        .story-time { font-size:12.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-bottom:10px; }
        .story-h { font-size:21px; font-weight:800; margin:0 0 12px; line-height:1.3; }
        .story-p { font-size:15px; line-height:1.7; color:rgba(255,255,255,0.72); margin:0 0 16px; max-width:640px; }
        .story-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:13px; line-height:1.6; background:#0a0a0b; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px 18px; white-space:pre; overflow-x:auto; color:#d9f99d; }
        .story-card { border-radius:12px; padding:16px 18px; border:1px solid; font-size:14px; line-height:1.6; }
        .story-card.bad { background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.4); color:#ffb4b4; }
        .story-card.good { background:rgba(34,197,94,0.1); border-color:rgba(34,197,94,0.4); color:#a7f3c0; }
        .story-card.info { background:rgba(200,245,66,0.12); border-color:rgba(200,245,66,0.4); color:#e4ff7a; }
        .story-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12.5px; }
        .story-controls { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-top:1px solid rgba(255,255,255,0.08); }
        .story-btn { padding:11px 22px; border-radius:11px; font-size:14.5px; font-weight:700; cursor:pointer; border:1px solid transparent; transition:all .18s ease; }
        .story-btn-primary { background:linear-gradient(135deg,#c8f542,#a8d92e); color:#fff; }
        .story-btn-primary:hover { filter:brightness(1.1); transform:translateY(-1px); }
        .story-btn-ghost { background:transparent; color:rgba(255,255,255,0.7); border-color:rgba(255,255,255,0.18); }
        .story-btn-ghost:hover:not(:disabled) { border-color:rgba(255,255,255,0.4); color:#fff; }
        .story-btn:disabled { opacity:.35; cursor:not-allowed; }
        .story-count { font-size:13px; color:rgba(255,255,255,0.5); font-variant-numeric:tabular-nums; }
        .story-final { display:flex; flex-wrap:wrap; gap:14px; align-items:center; margin-top:6px; }
        .story-cta { display:inline-flex; align-items:center; gap:10px; padding:15px 28px; border-radius:12px; background:linear-gradient(135deg,#c8f542,#a8d92e); color:#fff; font-size:15.5px; font-weight:800; text-decoration:none; box-shadow:0 8px 30px rgba(200,245,66,0.35); transition:all .18s ease; }
        .story-cta:hover { transform:translateY(-2px); filter:brightness(1.08); }
        .story-cta-secondary { font-size:14px; color:rgba(255,255,255,0.7); text-decoration:underline; text-underline-offset:3px; }
        .story-note { font-size:12.5px; color:rgba(255,255,255,0.45); margin-top:18px; line-height:1.6; }
        .story-compare { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        @media (max-width: 640px) { .story-compare { grid-template-columns:1fr; } .story-body { padding:20px 16px; } }
        @media (prefers-reduced-motion: reduce) { .story-chip, .story-btn, .story-cta { transition:none; } }
      `}</style>

      <div className="story-inner">
        <div className="story-kicker">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
          Interactive · 60 seconds
        </div>
        <h2 id="story-title" className="story-title">
          Your stack. One quiet API change. Two very different outcomes.
        </h2>
        <p className="story-sub">
          Pick an API you actually use, then step through what happens when its provider ships a
          breaking change — with and without Breaklytix watching.
        </p>

        <div className="story-picker" role="group" aria-label="Choose the API you depend on">
          {ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className="story-chip"
              aria-pressed={provider === k}
              onClick={() => pick(k)}
            >
              <span className="story-chip-dot" style={{ background: PROVIDERS[k].color }} />
              {PROVIDERS[k].name}
            </button>
          ))}
        </div>

        <div className="story-stage">
          <div className="story-stage-head">
            <span className="story-stage-label">{p.name} scenario</span>
            <div className="story-dots" role="tablist" aria-label="Story steps">
              {Array.from({ length: STEPS }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`story-dot ${i < step ? "done" : ""}`}
                  aria-current={i === step}
                  aria-label={`Go to step ${i + 1}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </div>

          <div className="story-body" ref={liveRef} tabIndex={-1} aria-live="polite" style={{ outline: "none" }}>
            {step === 0 && (
              <div>
                <div className="story-time" style={{ color: "#34d399" }}>Day 0 · Monday, 9:00 AM</div>
                <h3 className="story-h">Everything works. Your {p.name} integration is happy.</h3>
                <p className="story-p">
                  This is the code your team shipped. It calls {p.name} exactly the way the docs said
                  to. Tests pass. Production is green. Nobody is thinking about the API today.
                </p>
                <div className="story-code">{p.snippet}</div>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="story-time" style={{ color: "#f59e0b" }}>Day 6 · The provider ships a change</div>
                <h3 className="story-h">{p.name} publishes a breaking change.</h3>
                <p className="story-p">
                  It lands in the official changelog — not in your inbox, not in your CI. Your code
                  still compiles. The break only shows up at runtime, in production.
                </p>
                <div className="story-card info">
                  <strong>{p.name} changelog</strong>
                  <br />
                  {p.change}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="story-time" style={{ color: "#f87171" }}>Without Breaklytix · 2:14 AM</div>
                <h3 className="story-h">Production breaks. You find out from a customer.</h3>
                <p className="story-p">
                  The deprecated call starts failing. On-call gets paged. Three hours of debugging
                  later, someone finds the changelog entry from six days ago.
                </p>
                <div className="story-card bad">
                  <span className="story-mono">
                    ERROR {p.file} → {p.fn}
                    <br />
                    {p.name} API request failed: breaking change in effect.
                    <br />
                    Incident opened · customers affected · 3h to root cause.
                  </span>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="story-time" style={{ color: "#34d399" }}>With Breaklytix · Day 6, minutes after publish</div>
                <h3 className="story-h">You already know — and exactly where it hits.</h3>
                <p className="story-p">
                  Breaklytix read the changelog, matched it to your detected {p.name} usage, and
                  pointed at the precise file and function. You fix it in a normal sprint, not at 2 AM.
                </p>
                <div className="story-card good">
                  <strong>Breaking change detected · HIGH risk</strong>
                  <br />
                  <span className="story-mono">
                    {p.file} → {p.fn}
                  </span>
                  <br />
                  Mapped to your code · official source linked · fix before deploy.
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="story-time" style={{ color: "#c8f542" }}>The difference</div>
                <h3 className="story-h">Same change. One team sleeps, one team pages.</h3>
                <div className="story-compare">
                  <div className="story-card bad">
                    <strong>Without monitoring</strong>
                    <br />
                    Surprise incident · 2 AM page · hours of debugging · customers hit first.
                  </div>
                  <div className="story-card good">
                    <strong>With Breaklytix</strong>
                    <br />
                    Early alert · exact file &amp; function · planned fix · no incident.
                  </div>
                </div>
                <div className="story-final">
                  <Link
                    href="/auth/github"
                    className="story-cta"
                    onClick={() => track("story_cta_click", { provider })}
                  >
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Connect GitHub — start free
                  </Link>
                  <a href="#get-started" className="story-cta-secondary" onClick={() => track("story_cta_click", { provider, variant: "scan" })}>
                    Or scan a public repo without an account →
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="story-controls">
            <button
              type="button"
              className="story-btn story-btn-ghost"
              onClick={() => go(step - 1)}
              disabled={step === 0}
            >
              ← Back
            </button>
            <span className="story-count">
              {step + 1} / {STEPS}
            </span>
            {step < STEPS - 1 ? (
              <button type="button" className="story-btn story-btn-primary" onClick={() => go(step + 1)}>
                {step === 0 ? "Start the story →" : "Next →"}
              </button>
            ) : (
              <button type="button" className="story-btn story-btn-ghost" onClick={() => go(0)}>
                ↺ Replay
              </button>
            )}
          </div>
        </div>

        <p className="story-note">
          Illustrative scenario. Your real alerts are generated from official provider changelogs and
          matched to the APIs detected in your connected repositories — not from examples like this one.
        </p>
      </div>
    </section>
  );
}
