import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from "@mui/material";
import { socket } from "../socket";

export default function Home({ name, setName, setRoomState, onError }) {
  const [roomCode, setRoomCode] = useState("");
  const [rounds, setRounds] = useState(3);
  const [seconds, setSeconds] = useState(180);
  const [difficulty, setDifficulty] = useState("normal");

  const createRoom = () => {
    socket.emit("createRoom", { name, settings: { rounds, seconds, difficulty } }, (res) => {
      if (!res?.ok) return onError(res?.error || "Could not create room.");
      if (res.roomState) setRoomState(res.roomState);
    });
  };

  const joinRoom = () => {
    socket.emit("joinRoom", { roomCode, name }, (res) => {
      if (!res?.ok) return onError(res?.error || "Could not join room.");
      if (res.roomState) setRoomState(res.roomState);
    });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Play</Typography>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alex"
              fullWidth
            />

            <Divider />

            <Typography variant="h6">Create a room</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                type="number"
                label="Rounds"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                inputProps={{ min: 1, max: 20 }}
                fullWidth
              />
              <TextField
                type="number"
                label="Seconds per phase"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                inputProps={{ min: 10, max: 600 }}
                fullWidth
              />
            </Stack>

            <FormControl fullWidth>
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

            <Button variant="contained" onClick={createRoom} disabled={!name.trim()}>
              Create Room
            </Button>

            <Divider />

            <Typography variant="h6">Join a room</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABCDE"
                fullWidth
              />
              <Box sx={{ minWidth: { sm: 200 } }}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={joinRoom}
                  disabled={!name.trim() || roomCode.trim().length < 4}
                  sx={{ height: "100%" }}
                >
                  Join
                </Button>
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
