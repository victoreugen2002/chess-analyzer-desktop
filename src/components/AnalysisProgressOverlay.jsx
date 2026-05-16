export default function AnalysisProgressOverlay({ show, depth, progress }) {
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(420px, calc(100vw - 40px))",
          padding: "24px",
          borderRadius: "18px",
          background: "rgba(18, 24, 38, 0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
          Analyzing game...
        </div>

        <div style={{ opacity: 0.75, marginBottom: "16px" }}>
          Depth {depth} · {progress}%
        </div>

        <div
          style={{
            height: "10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: "999px",
              background: "linear-gradient(90deg, #22c55e, #84cc16)",
              transition: "width 240ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
