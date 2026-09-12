export default function NotFound() {
  return (
    <div
      style={{
        height: "100dvh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div>
        <p style={{ color: "var(--fg-mute)" }}>404 · No workspace here.</p>
        <a
          href="/"
          style={{
            display: "block",
            marginTop: 18,
            color: "var(--accent)",
            fontSize: 12,
          }}
        >
          Return to oma.os →
        </a>
      </div>
    </div>
  );
}
