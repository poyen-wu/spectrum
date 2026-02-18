import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";

const FALLBACK_SCORE_BANDS = [
  { maxDiff: 1, points: 5 },
  { maxDiff: 3, points: 4 },
  { maxDiff: 5, points: 3 },
  { maxDiff: 7, points: 2 },
  { maxDiff: 9, points: 1 }
];

const BAND_COLORS = {
  5: "#2e7d32",
  4: "#66bb6a",
  3: "#fdd835",
  2: "#fb8c00",
  1: "#e53935"
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function scoreAt(pos, target, scoringBands) {
  if (typeof target !== "number") return 0;
  const diff = Math.abs(pos - target);

  let best = 0;
  for (const b of scoringBands || []) {
    if (diff <= b.maxDiff) best = Math.max(best, b.points);
  }
  return best; // 0 if outside all bands
}

function buildScoreSegments(target, scoringBands) {
  if (typeof target !== "number") return [];
  const segs = [];
  let start = 0;
  let curScore = scoreAt(0, target, scoringBands);

  for (let x = 1; x <= 100; x++) {
    const s = scoreAt(x, target, scoringBands);
    if (s !== curScore) {
      segs.push({ from: start, to: x, score: curScore });
      start = x;
      curScore = s;
    }
  }
  segs.push({ from: start, to: 101, score: curScore });
  return segs;
}

export default function SpectrumBar({
  left,
  right,
  value = 50,
  onChange,
  disabled = false,
  showTarget = false,
  targetValue,
  showBands = true,
  pointerLabel,
  scoringBands = FALLBACK_SCORE_BANDS
}) {
  const theme = useTheme();
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const safeValue = clamp(Math.round(value), 0, 100);

  const segments = useMemo(() => {
    if (!showBands || !showTarget) return [];
    return buildScoreSegments(targetValue, scoringBands);
  }, [showBands, showTarget, targetValue, scoringBands]);

  const setFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    const v = clamp(Math.round(pct), 0, 100);
    onChange?.(v);
  };

  const onPointerDown = (e) => {
    if (disabled || !onChange) return;
    e.preventDefault();
    setDragging(true);
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    setFromClientX(x);
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const x = e.touches?.[0]?.clientX ?? e.clientX;
      setFromClientX(x);
    };
    const onUp = () => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" sx={{ gap: 2 }}>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {left}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {right}
        </Typography>
      </Stack>

      <Box
        ref={trackRef}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        sx={{
          position: "relative",
          height: { xs: 56, sm: 64 },
          borderRadius: 3,
          overflow: "hidden",
          cursor: disabled ? "default" : "pointer",
          userSelect: "none",
          touchAction: "none",
          border: `1px solid ${theme.palette.divider}`,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 100%)"
        }}
      >
        {/* Paint only scoring regions (score > 0). Most of the bar stays neutral. */}
        {segments
          .filter((seg) => seg.score > 0)
          .map((seg, idx) => (
            <Box
              key={idx}
              sx={{
                position: "absolute",
                left: `${seg.from}%`,
                width: `${seg.to - seg.from}%`,
                top: 0,
                bottom: 0,
                bgcolor: BAND_COLORS[seg.score],
                opacity: 0.55
              }}
            />
          ))}

        {[0, 25, 50, 75, 100].map((t) => (
          <Box
            key={t}
            sx={{
              position: "absolute",
              left: `${t}%`,
              top: 0,
              bottom: 0,
              width: 1,
              bgcolor: "rgba(255,255,255,0.10)"
            }}
          />
        ))}

        {showTarget && typeof targetValue === "number" && (
          <Box
            sx={{
              position: "absolute",
              left: `${clamp(targetValue, 0, 100)}%`,
              top: 0,
              bottom: 0,
              width: 3,
              transform: "translateX(-50%)",
              bgcolor: theme.palette.secondary.main,
              boxShadow: `0 0 0 2px rgba(0,0,0,0.25)`
            }}
          />
        )}

        {/* Pointer */}
        <Box
          sx={{
            position: "absolute",
            left: `${safeValue}%`,
            top: 0,
            bottom: 0,
            transform: "translateX(-50%)",
            pointerEvents: "none"
          }}
        >

          <Box
            sx={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 2,
              transform: "translateX(-50%)",
              bgcolor: disabled ? "rgba(255,255,255,0.55)" : theme.palette.primary.main
            }}
          />

          <Box
            sx={{
              position: "absolute",
              left: "50%",
              bottom: 6,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: `12px solid ${
                disabled ? "rgba(255,255,255,0.70)" : theme.palette.primary.main
              }`,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))"
            }}
          />
        </Box>

      </Box>

      {/* Legend */}
      {showTarget && showBands && typeof targetValue === "number" && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", opacity: 0.9 }}>
          {[5, 4, 3, 2, 1].map((s) => (
            <Stack key={s} direction="row" spacing={0.75} alignItems="center">
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: 0.75,
                  bgcolor: BAND_COLORS[s],
                  opacity: 0.8
                }}
              />
              <Typography variant="caption">{s}pt</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
