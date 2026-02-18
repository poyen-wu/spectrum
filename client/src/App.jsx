import React, { useEffect, useMemo, useState } from "react";
import { AppBar, Box, Container, Toolbar, Typography, Chip, Snackbar, Alert } from "@mui/material";
import { socket } from "./socket";
import Home from "./ui/Home";
import RoomLobby from "./ui/RoomLobby";
import Game from "./ui/Game";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [roomState, setRoomState] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomState = (s) => setRoomState(s);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomState", onRoomState);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomState", onRoomState);
    };
  }, []);

  const status = roomState?.status ?? "home";

  const content = useMemo(() => {
    if (!roomState) {
      return <Home name={name} setName={setName} setRoomState={setRoomState} onError={setError} />;
    }
    if (status === "lobby" || status === "finished") return <RoomLobby roomState={roomState} onError={setError} />;
    if (status === "inGame") return <Game roomState={roomState} onError={setError} />;
    return <Home name={name} setName={setName} setRoomState={setRoomState} onError={setError} />;
  }, [roomState, status, name]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Spectrum Target (2‑Player)
          </Typography>
          {roomState?.roomCode && <Chip label={`Room: ${roomState.roomCode}`} />}
          <Chip color={connected ? "success" : "default"} label={connected ? "Connected" : "Offline"} variant="outlined" />
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 3, flexGrow: 1 }}>{content}</Container>

      <Snackbar open={!!error} autoHideDuration={4500} onClose={() => setError("")}>
        <Alert severity="error" onClose={() => setError("")} sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
