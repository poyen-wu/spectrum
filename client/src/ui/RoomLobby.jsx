import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import { socket } from "../socket";

export default function RoomLobby({ roomState, onError }) {
  const { roomCode, players, settings, you, status, questions = [] } = roomState;

  const [rounds, setRounds] = useState(settings.rounds);
  const [seconds, setSeconds] = useState(settings.seconds);
  const [difficulty, setDifficulty] = useState(settings.difficulty ?? "normal");

  useEffect(() => {
    setRounds(settings.rounds);
    setSeconds(settings.seconds);
    setDifficulty(settings.difficulty ?? "normal");
  }, [settings.rounds, settings.seconds, settings.difficulty]);

  const [newLeft, setNewLeft] = useState("");
  const [newRight, setNewRight] = useState("");

  const canStart = useMemo(() => players?.length === 2 && you?.isHost, [players, you]);

  const updateSettings = () => {
    socket.emit("updateSettings", { roomCode, settings: { rounds, seconds, difficulty } }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to update settings.");
    });
  };

  const startGame = () => {
    socket.emit("startGame", { roomCode }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to start.");
    });
  };

  const backToLobby = () => {
    socket.emit("backToLobby", { roomCode }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to return to lobby.");
    });
  };

  const addQuestion = () => {
    socket.emit("addQuestion", { roomCode, left: newLeft, right: newRight }, (res) => {
      if (!res?.ok) return onError(res?.error || "Failed to add question.");
      setNewLeft("");
      setNewRight("");
    });
  };

  const removeQuestion = (id) => {
    socket.emit("removeQuestion", { roomCode, id }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to remove question.");
    });
  };

  const resetQuestions = () => {
    socket.emit("resetQuestions", { roomCode }, (res) => {
      if (!res?.ok) onError(res?.error || "Failed to reset questions.");
    });
  };

  const editingQuestionsDisabled = status === "inGame";

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{status === "finished" ? "Game Finished" : "Lobby"}</Typography>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography>
              Room code: <b>{roomCode}</b>
            </Typography>

            <Divider />

            <Typography variant="h6">Players</Typography>
            <Stack spacing={1}>
              {players.map((p) => (
                <Box
                  key={p.socketId}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 2,
                    p: 1,
                    borderRadius: 2,
                    bgcolor: "rgba(255,255,255,0.06)"
                  }}
                >
                  <span>
                    {p.name} {p.isHost ? <b>(Host)</b> : ""} {p.isYou ? <b>(You)</b> : ""}
                  </span>
                  <span>
                    Score: <b>{p.score}</b>
                  </span>
                </Box>
              ))}
            </Stack>

            <Divider />

            <Typography variant="h6">Settings (host only)</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                type="number"
                label="Rounds"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                inputProps={{ min: 1, max: 20 }}
                disabled={!you.isHost || status === "inGame"}
                fullWidth
              />
              <TextField
                type="number"
                label="Seconds per phase"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                inputProps={{ min: 10, max: 600 }}
                disabled={!you.isHost || status === "inGame"}
                fullWidth
              />
            </Stack>

            <FormControl fullWidth disabled={!you.isHost || status === "inGame"}>
              <InputLabel id="difficulty-label">Difficulty</InputLabel>
              <Select
                labelId="difficulty-label"
                label="Difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <MenuItem value="easy">Easy</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="hard">Hard</MenuItem>
              </Select>
            </FormControl>

            {you.isHost && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button variant="outlined" onClick={updateSettings}>
                  Save Settings
                </Button>

                {status === "finished" ? (
                  <Button variant="outlined" onClick={backToLobby}>
                    Reset Scores (Back to Lobby)
                  </Button>
                ) : status === "lobby" ? (
                  <Button variant="contained" onClick={startGame} disabled={!canStart}>
                    Start Game
                  </Button>
                ) : null}
              </Stack>
            )}

            {!you.isHost && (
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Waiting for host to start…
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
              spacing={1}
            >
              <Typography variant="h6">Global Questions ({questions.length})</Typography>

              <Button
                variant="outlined"
                startIcon={<RestoreIcon />}
                onClick={resetQuestions}
                disabled={editingQuestionsDisabled}
              >
                Reset to default
              </Button>
            </Stack>

            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              These questions are global (shared across all rooms). Either player can edit them (lobby only).
            </Typography>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Left end"
                value={newLeft}
                onChange={(e) => setNewLeft(e.target.value)}
                disabled={editingQuestionsDisabled}
                fullWidth
                inputProps={{ maxLength: 40 }}
              />
              <TextField
                label="Right end"
                value={newRight}
                onChange={(e) => setNewRight(e.target.value)}
                disabled={editingQuestionsDisabled}
                fullWidth
                inputProps={{ maxLength: 40 }}
              />
              <Box sx={{ minWidth: { md: 180 } }}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={addQuestion}
                  disabled={editingQuestionsDisabled || !newLeft.trim() || !newRight.trim()}
                  sx={{ height: "100%" }}
                >
                  Add
                </Button>
              </Box>
            </Stack>

            <Divider />

            <List dense disablePadding>
              {questions.map((q) => (
                <ListItem
                  key={q.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => removeQuestion(q.id)}
                      disabled={editingQuestionsDisabled || questions.length <= 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                  sx={{ borderRadius: 2, bgcolor: "rgba(255,255,255,0.04)", mb: 1 }}
                >
                  <ListItemText
                    primary={`${q.left}  ↔  ${q.right}`}
                    secondary={q.id}
                    secondaryTypographyProps={{ sx: { opacity: 0.6 } }}
                  />
                </ListItem>
              ))}
            </List>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
