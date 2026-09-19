import { Canvas } from "@react-three/fiber";
import { ChevronRight, Play, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InterrogationScene } from "./InterrogationScene";
import suspectImage from "../assets/suspect.png";
import deskImage from "../assets/interrogation-desk.png";
import lampImage from "../assets/hanging-lamp.png";
import monitorImage from "../assets/security-monitor.png";
import cameraImage from "../assets/security-camera.png";
import doorImage from "../assets/room-door.png";
import signImage from "../assets/people-lie-sign.png";
import photosImage from "../assets/evidence-photos.png";

// ── Popping letter animation component ───────────────────────────────────────
function PoppingText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`popping-text ${className}`}>
      {text.split("").map((char, i) => (
        <span
          key={i}
          className="pop-letter"
          style={{ animationDelay: `${i * 0.045}s` }}
        >
          {char === " " ? "\u00a0" : char}
        </span>
      ))}
    </span>
  );
}

// ── Suspect Info Panel ────────────────────────────────────────────────────────
function EvidencePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="evidence-overlay">
      <div className="evidence-card">
        {/* Header */}
        <div className="ev-header">
          <PoppingText text="// CASE FILE — SUSPECT PROFILE" />
          <button className="ev-close" onClick={onClose} aria-label="Close evidence panel">
            <X size={16} />
          </button>
        </div>

        {/* Top: Photo + basic info */}
        <div className="ev-top">
          <div className="ev-photo-wrap">
            <img src={suspectImage} alt="Adrian Vale" className="ev-photo" />
            <div className="ev-photo-label">SUSPECT #0019</div>
          </div>
          <div className="ev-bio">
            <div className="ev-field">
              <span className="ev-key">NAME</span>
              <PoppingText text="ADRIAN VALE" className="ev-val ev-name" />
            </div>
            <div className="ev-field">
              <span className="ev-key">ROLE</span>
              <PoppingText text="Lead Data Analyst, Aegis Forensic Analytics" className="ev-val" />
            </div>
            <div className="ev-field">
              <span className="ev-key">DOB</span>
              <PoppingText text="12 MAR 1982  |  AGE 44" className="ev-val" />
            </div>
            <div className="ev-field">
              <span className="ev-key">STATUS</span>
              <span className="ev-val ev-status">PERSON OF INTEREST</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="ev-divider" />

        {/* Case Summary */}
        <div className="ev-section-title">
          <PoppingText text="INCIDENT OVERVIEW" />
        </div>
        <p className="ev-body">
          On <strong>14 SEP 2026 at approx 21:40</strong>, forensic analyst
          Daniel Mercer was found dead in the <strong>sub-basement archive</strong> of Aegis Forensic Analytics.
          Cause of death: blunt force trauma consistent with a brass paperweight recovered on-scene.
          Vale was the <strong>last known person</strong> near the scene — his access card
          (#0890) swiped the sub-basement fire door at <strong>21:39</strong>, contradicting
          his alibi of leaving at 21:15.
        </p>

        {/* Key Evidence */}
        <div className="ev-section-title">
          <PoppingText text="KEY LEADS — FOLLOW THESE" />
        </div>
        <ul className="ev-leads">
          <li><span className="ev-bullet">▶</span> <PoppingText text="Access card #0890 — sub-basement at 21:39 (denied leaving at 21:15)" /></li>
          <li><span className="ev-bullet">▶</span> <PoppingText text="CCTV reflection — corridor B shows Vale's coat at 21:37" /></li>
          <li><span className="ev-bullet">▶</span> <PoppingText text="14-second call from Vale's phone to Daniel at 21:32" /></li>
          <li><span className="ev-bullet">▶</span> <PoppingText text="PROJECT_ECHO audit — wipe attempt from Vale's terminal at 21:28" /></li>
          <li><span className="ev-bullet">▶</span> <PoppingText text="Blue nitrile glove fragment inside the brass paperweight latch" /></li>
        </ul>

        <div className="ev-footer">
          <PoppingText text="ASK RELEVANT QUESTIONS ONLY — CASE-BASED INTERROGATION REQUIRED" />
        </div>
      </div>
    </div>
  );
}

// ── Confession Overlay ────────────────────────────────────────────────────────
function ConfessionOverlay({ response }: { response: string }) {
  return (
    <div className="confession-overlay">
      <div className="confession-card">
        <div className="confession-title">
          <PoppingText text="⚠ CONFESSION UNLOCKED — CASE SOLVED ⚠" />
        </div>
        <div className="confession-body">{response}</div>
        <div className="confession-sub">
          <PoppingText text="INTERROGATION COMPLETE — EVIDENCE SECURED" />
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export function InterrogationApp() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stress, setStress] = useState(0);
  const [time, setTime] = useState(14 * 60 + 37);
  const [prompts, setPrompts] = useState(15);
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState(
    "I'm Adrian Vale. I'm a contractor. What is this about? I left the site at 21:15."
  );
  const [status, setStatus] = useState("TRUTH ALWAYS SURFACES");
  const [loading, setLoading] = useState(false);
  const [evidenceRevealed, setEvidenceRevealed] = useState<string[]>([]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [confessed, setConfessed] = useState(false);
  const [confessionText, setConfessionText] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setTime((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Fetch initial game state on mount
  useEffect(() => {
    fetch("/api/state")
      .then((res) => res.json())
      .then((data) => {
        if (data.stress !== undefined) setStress(data.stress);
        if (data.prompts_left !== undefined) setPrompts(data.prompts_left);
        if (data.evidence_revealed) setEvidenceRevealed(data.evidence_revealed);
        if (data.status === "CONFESSION") {
          setConfessed(true);
        }
      })
      .catch((err) => console.warn("Could not load initial API state (is Python backend running?):", err));
  }, []);

  const sendQuestion = async () => {
    if (!question.trim() || prompts <= 0 || loading || confessed) return;

    const currentQ = question.trim();
    setQuestion("");
    setLoading(true);
    setStatus("ADRIAN IS THINKING...");

    try {
      const res = await fetch("/api/interrogate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentQ }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data.response || "No response received.");
      setStress(data.stress !== undefined ? data.stress : stress);
      setPrompts(data.prompts_left !== undefined ? data.prompts_left : prompts - 1);
      if (data.evidence_revealed) setEvidenceRevealed(data.evidence_revealed);

      if (data.confession || data.status === "CONFESSION") {
        setConfessed(true);
        setConfessionText(data.response || "");
        setStatus("CONFESSION UNLOCKED — CASE SOLVED!");
      } else if (data.delta > 10) {
        setStatus("MAJOR CONTRADICTION DETECTED");
      } else if (data.delta > 0) {
        setStatus("INCONSISTENCY DETECTED");
      } else {
        setStatus("ANALYZING RESPONSE...");
      }
    } catch (err) {
      console.error("API error:", err);
      setStatus("API ERROR - CHECK BACKEND");
    } finally {
      setLoading(false);
    }
  };

  const resetGame = async () => {
    setLoading(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      setStress(0);
      setPrompts(15);
      setResponse("Interrogation reset. Ask Adrian Vale your first question.");
      setStatus("TRUTH ALWAYS SURFACES");
      setEvidenceRevealed([]);
      setConfessed(false);
      setConfessionText("");
    } catch (err) {
      console.error("Reset failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const minutes = Math.floor(time / 60).toString().padStart(2, "0");
  const seconds = (time % 60).toString().padStart(2, "0");

  const moveScene = (event: React.PointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    stage.style.setProperty("--look-x", `${((event.clientX - bounds.left) / bounds.width - 0.5) * 2}`);
    stage.style.setProperty("--look-y", `${((event.clientY - bounds.top) / bounds.height - 0.5) * 2}`);
  };

  const handleNavClick = (action: string) => {
    if (action === "ASK QUESTION") {
      document.getElementById("question")?.focus();
    } else if (action === "SHOW EVIDENCE") {
      setShowEvidence(true);
    } else if (action === "END" || action === "RESET") {
      resetGame();
    }
  };

  // Stress color: green → amber → red
  const stressColor = stress >= 85 ? "var(--danger-live)" : stress >= 60 ? "#e6a817" : "var(--terminal)";

  return (
    <main className="interrogation-shell" onPointerMove={moveScene}>
      <div className="interrogation-stage" ref={stageRef}>
        <Canvas dpr={1} shadows flat camera={{ position: [0, 0.15, 8.7], fov: 48 }}>
          <InterrogationScene />
        </Canvas>

        <div className="room-props" aria-hidden="true">
          <img className="prop prop-door" src={doorImage} alt="" />
          <img className="prop prop-sign" src={signImage} alt="" />
          <img className="prop prop-camera" src={cameraImage} alt="" />
          <img className="prop prop-monitor" src={monitorImage} alt="" />
          <img className="prop prop-lamp" src={lampImage} alt="" />
          <img className="prop prop-suspect" src={suspectImage} alt="" />
          <img className="prop prop-desk" src={deskImage} alt="" />
          <img className="prop prop-photos" src={photosImage} alt="" />
        </div>

        <div className="crt-grain" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />

        {/* Stress-based screen flicker at BREAKING */}
        {stress >= 85 && <div className="breaking-flicker" aria-hidden="true" />}

        <header className="top-hud">
          <div className="brand-block">
            <div className="prompt-mark">PROMPT <span>×</span></div>
            <small>INTERROGATION PROTOCOL<br />v1.0.0</small>
          </div>
          <div className="stress-meter" aria-label={`Suspect stress level ${stress} percent`}>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{
                  width: `${stress}%`,
                  background: stressColor,
                  boxShadow: `0 0 8px ${stressColor}`,
                }}
              />
            </div>
          </div>
          <div className="stress-label" style={{ color: stressColor }}>
            SUSPECT STRESS LEVEL ({stress}%)
          </div>
        </header>

        <section className="dialog-panel response-panel">
          <div className="panel-title">// &nbsp; SUSPECT RESPONSE</div>
          <p>{loading ? "Adrian is thinking..." : response}</p>
          <button className="icon-control" aria-label="Replay suspect response" title="Replay response">
            <Play size={22} fill="currentColor" />
          </button>
        </section>

        <section className="dialog-panel question-panel">
          <label className="panel-title" htmlFor="question">// &nbsp; ENTER_INTERROGATION ...</label>
          <textarea
            id="question"
            value={question}
            disabled={loading || prompts <= 0 || confessed}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendQuestion();
              }
            }}
            placeholder={
              confessed
                ? "Case closed — Adrian confessed."
                : loading
                ? "Waiting for Adrian's answer..."
                : "Type your question here..."
            }
          />
          <button
            className="send-control"
            onClick={sendQuestion}
            disabled={loading || prompts <= 0 || confessed}
          >
            <Send size={22} fill="currentColor" /> {loading ? "SENDING..." : "SEND"}
          </button>
        </section>

        {/* Evidence Stack Widget */}
        <div
          className="evidence-stack"
          aria-label="Evidence files"
          onClick={() => setShowEvidence(true)}
          style={{ cursor: "pointer" }}
          title="View case file & suspect profile"
        >
          <div /><div /><div />
          <strong>EVIDENCE ({evidenceRevealed.length})</strong>
        </div>

        <nav className="case-actions" aria-label="Case actions">
          {["ASK QUESTION", "SHOW EVIDENCE", "ACCUSE", "END"].map((item, index) => (
            <button
              key={item}
              className={index === 0 ? "active" : ""}
              onClick={() => handleNavClick(item)}
            >
              {index === 0 && <ChevronRight size={18} fill="currentColor" />}
              {item}
            </button>
          ))}
        </nav>

        <footer className="bottom-hud">
          <div><b>PROMPT X</b><small>— {status}</small></div>
          <div className="session-stats">
            <span>TIME REMAINING&nbsp;&nbsp; {minutes}:{seconds}</span>
            <i />
            <span>PROMPTS LEFT&nbsp;&nbsp; {prompts}</span>
          </div>
        </footer>
      </div>

      {/* Evidence/Case File Panel */}
      {showEvidence && <EvidencePanel onClose={() => setShowEvidence(false)} />}

      {/* Confession Overlay */}
      {confessed && confessionText && <ConfessionOverlay response={confessionText} />}
    </main>
  );
}