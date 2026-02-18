import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, CardContent, Divider, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { socket } from "../socket";
import SpectrumBar from "./SpectrumBar";

export default function Game({ roomState, onError }) {
  const { roomCode, game, you, players, settings, scoringBands } = roomState;
  const phase = game.phase;

  const me = useMemo(() => players.find((p) => p.isYou), [players]);
  const opp = useMemo(() => players.find((p) => !p.isYou), [players]);

  const [prompt, setPrompt] = useState(game.you.promptText || "");
  const [guess, setGuess] = useState(typeof game.you.guessValue === "number" ? game.you.guessValue : 50);

  const prevRoundRef = useRef(game.roundIndex);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const roundChanged = prevRoundRef.current !== game.roundIndex;
    const phaseChanged = prevPhaseRef.current !== phase;

    if (roundChanged || (phaseChanged && phase === "prompt")) setPrompt(game.you.promptText || "");
    if (roundChanged || (phaseChanged && phase === "guess"))
      setGuess(typeof game.you.guessValue === "number" ? game.you.guessValue : 50);

    prevRoundRef.current = game.roundIndex;
    prevPhaseRef.current = phase;
  }, [game.roundIndex, phase, game.you.promptText, game.you.guessValue]);

  const progress = useMemo(() => {
    const total = settings.seconds;
    const remaining = game.timerRemaining ?? 0;
    return total > 0 ? ((total - remaining) / total) * 100 : 0;
  }, [game.timerRemaining, settings.seconds]);

  const submitPrompt = () => {
    socket.emit("submitPrompt", { roomCode, text: prompt }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to submit.");
    });
  };

  const submitGuess = () => {
    socket.emit("submitGuess", { roomCode, guess }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to submit guess.");
    });
  };

  const next = () => {
    socket.emit("next", { roomCode }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to advance.");
    });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">
        Round {game.roundIndex + 1} / {game.totalRounds}
      </Typography>

      {(phase === "prompt" || phase === "guess") && (
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Time left: <b>{game.timerRemaining}s</b>
              </Typography>
              <LinearProgress variant="determinate" value={progress} />
            </Stack>
          </CardContent>
        </Card>
      )}

      {phase === "prompt" && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Your spectrum card (with target)</Typography>

              <SpectrumBar
                left={game.left}
                right={game.right}
                value={game.you.target ?? 50}
                disabled
                showTarget
                targetValue={game.you.target}
                showBands
                scoringBands={scoringBands}
                pointerLabel="Your target"
              />

              <Divider />

              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Type something that matches the target position shown above. Your opponent will see only your clue and
                the spectrum ends.
              </Typography>

              <TextField
                label="Your clue / answer"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                fullWidth
                disabled={game.you.promptSubmitted}
                inputProps={{ maxLength: 140 }}
              />

              <Button variant="contained" onClick={submitPrompt} disabled={game.you.promptSubmitted || !prompt.trim()}>
                {game.you.promptSubmitted ? "Submitted" : "Submit"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {phase === "guess" && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Guess {opp?.name || "Opponent"}’s target</Typography>

              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "rgba(255,255,255,0.06)" }}>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  <b>Their clue:</b> {game.opponent?.promptText || "(no clue submitted)"}
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Click or drag the pointer to where you think their target was.
              </Typography>

              <SpectrumBar
                left={game.left}
                right={game.right}
                value={guess}
                onChange={setGuess}
                disabled={game.you.guessSubmitted}
                showTarget={false}
                showBands={false}
                pointerLabel={game.you.guessSubmitted ? "Submitted" : "Your guess"}
              />

              <Button variant="contained" onClick={submitGuess} disabled={game.you.guessSubmitted}>
                {game.you.guessSubmitted ? "Guess Submitted" : "Submit Guess"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {phase === "reveal" && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Reveal</Typography>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,0.06)" }}>
                  <Typography variant="subtitle1">You scored</Typography>
                  <Typography variant="h4">{game.reveal?.yourPointsThisRound ?? 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    Total: <b>{me?.score ?? 0}</b>
                  </Typography>
                </Box>

                <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,0.06)" }}>
                  <Typography variant="subtitle1">{opp?.name || "Opponent"} scored</Typography>
                  <Typography variant="h4">{game.reveal?.oppPointsThisRound ?? 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    Total: <b>{opp?.score ?? 0}</b>
                  </Typography>
                </Box>
              </Stack>

              <Divider />

              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Your guess vs their target
                  </Typography>
                  <SpectrumBar
                    left={game.left}
                    right={game.right}
                    value={game.reveal?.yourGuessAgainstOppTarget?.guess ?? 50}
                    disabled
                    showTarget
                    targetValue={game.reveal?.yourGuessAgainstOppTarget?.target}
                    showBands
                    scoringBands={scoringBands}
                    pointerLabel="Your guess"
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Their guess vs your target
                  </Typography>
                  <SpectrumBar
                    left={game.left}
                    right={game.right}
                    value={game.reveal?.oppGuessAgainstYourTarget?.guess ?? 50}
                    disabled
                    showTarget
                    targetValue={game.reveal?.oppGuessAgainstYourTarget?.target}
                    showBands
                    scoringBands={scoringBands}
                    pointerLabel="Their guess"
                  />
                </Box>
              </Stack>

              <Divider />

              <Typography variant="subtitle1">Clues</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Your clue
                  </Typography>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "rgba(0,0,0,0.25)" }}>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{game.you.promptText || "(none)"}</Typography>
                  </Box>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {opp?.name || "Opponent"}’s clue
                  </Typography>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "rgba(0,0,0,0.25)" }}>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{game.opponent?.promptText || "(none)"}</Typography>
                  </Box>
                </Box>
              </Stack>

              <Divider />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                <Typography sx={{ flexGrow: 1 }}>
                  {me?.name}: <b>{me?.score ?? 0}</b> | {opp?.name || "Opponent"}: <b>{opp?.score ?? 0}</b>
                </Typography>

                {you.isHost ? (
                  <Button variant="contained" onClick={next}>
                    {game.roundIndex + 1 === game.totalRounds ? "Finish Game" : "Next Round"}
                  </Button>
                ) : (
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Waiting for host…
                  </Typography>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
