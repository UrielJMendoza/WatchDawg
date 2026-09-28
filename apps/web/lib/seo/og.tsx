import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const DOTS: Array<[number, number, string, number]> = [
  [760, 250, "#d95926", 14], [800, 232, "#d95926", 9], [835, 300, "#d95926", 11], [700, 330, "#3987e5", 8],
  [905, 380, "#199e70", 12], [650, 240, "#3987e5", 7], [980, 300, "#199e70", 9], [870, 190, "#d95926", 7],
  [620, 400, "#199e70", 10], [760, 430, "#3987e5", 7], [940, 250, "#3987e5", 6], [720, 190, "#d95926", 6],
];

/** The WatchDawg share card: a stylised globe with a kicker, title and subtitle. */
export function ogCard({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#05080b", color: "#e6ecf2", position: "relative", fontFamily: "sans-serif" }}>
        <div
          style={{
            position: "absolute",
            left: 560,
            top: 60,
            width: 520,
            height: 520,
            borderRadius: 260,
            background: "radial-gradient(circle at 40% 35%, #13263a 0%, #0a1422 55%, #05080b 100%)",
            border: "1px solid #1d4466",
            display: "flex",
          }}
        />
        {DOTS.map(([x, y, c, r], i) => (
          <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, background: c, boxShadow: `0 0 ${r * 2}px ${c}` }} />
        ))}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px", width: 640 }}>
          <div style={{ fontSize: 22, letterSpacing: 10, color: "#7cc8f8", fontWeight: 700 }}>{kicker}</div>
          <div style={{ fontSize: title.length > 26 ? 50 : 60, fontWeight: 700, lineHeight: 1.08, marginTop: 18 }}>{title}</div>
          <div style={{ fontSize: 26, color: "#8a9aad", marginTop: 20, lineHeight: 1.35 }}>{subtitle}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
