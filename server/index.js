import express from "express";
import http from "http";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const app = express();
app.use(cors());

app.get("/", (_, res) => {
  res.type("text").send("Spectrum Target backend is running. Try /health");
});
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

/** -----------------------
 *  Difficulty => scoring bands (global rules)
 *  maxDiff is in 0..100 space.
 *  Anything outside all bands => 0 points.
 *  ----------------------*/
const DIFFICULTIES = {
  easy: [
    { maxDiff: 4, points: 5 },
    { maxDiff: 9, points: 4 },
    { maxDiff: 14, points: 3 },
    { maxDiff: 19, points: 2 },
    { maxDiff: 24, points: 1 }
  ],
  normal: [
    { maxDiff: 1, points: 5 },
    { maxDiff: 3, points: 4 },
    { maxDiff: 5, points: 3 },
    { maxDiff: 7, points: 2 },
    { maxDiff: 9, points: 1 }
  ],
  hard: [
    { maxDiff: 0, points: 5 },
    { maxDiff: 1, points: 4 },
    { maxDiff: 2, points: 3 },
    { maxDiff: 3, points: 2 },
    { maxDiff: 4, points: 1 }
  ]
};

const DEFAULT_DIFFICULTY = "normal";

function normalizeDifficulty(d) {
  return DIFFICULTIES[d] ? d : DEFAULT_DIFFICULTY;
}
function getScoringBands(difficulty) {
  return DIFFICULTIES[normalizeDifficulty(difficulty)];
}

/** -----------------------
 *  Global questions (shared across ALL rooms)
 *  Persisted to server/questions.json
 *  ----------------------*/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_FILE = path.join(__dirname, "questions.json");

const DEFAULT_QUESTIONS = [
  { id: "q1", left: "Wet food", right: "Dry food" },
  { id: "q2", left: "Messy", right: "Neat" },
  { id: "q3", left: "Underrated", right: "Overrated" },
  { id: "q4", left: "Casual", right: "Hardcore" },
  { id: "q5", left: "Cheap", right: "Expensive" },
  { id: "q6", left: "Introvert", right: "Extrovert" },
  { id: "q7", left: "Useful", right: "Useless" },
  { id: "q8", left: "Traditional", right: "Modern" },
  { id: "q9", left: "Friendly", right: "Hostile" },
  { id: "q10", left: "Healthy", right: "Unhealthy" }
];

function newQuestionId() {
  return "q_" + Math.random().toString(36).slice(2, 10);
}

function loadQuestions() {
  try {
    if (!fs.existsSync(QUESTIONS_FILE)) {
      fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(DEFAULT_QUESTIONS, null, 2));
      return DEFAULT_QUESTIONS.map((q) => ({ ...q }));
    }
    const raw = fs.readFileSync(QUESTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1) throw new Error("Invalid questions file");
    return parsed;
  } catch {
    return DEFAULT_QUESTIONS.map((q) => ({ ...q }));
  }
}

function saveQuestions(list) {
  try {
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Failed to save questions.json:", e);
  }
}

let globalQuestions = loadQuestions();

function pickSpectrumGlobal() {
  const list = globalQuestions?.length ? globalQuestions : DEFAULT_QUESTIONS;
  return list[Math.floor(Math.random() * list.length)];
}

/** -----------------------
 *  Rooms store (in-memory)
 *  ----------------------*/
const rooms = new Map(); // code -> room

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function scoreGuess(guess, target, difficulty) {
  const diff = Math.abs(guess - target);
  const bands = getScoringBands(difficulty);
  let best = 0;
  for (const b of bands) {
    if (diff <= b.maxDiff) best = Math.max(best, b.points);
  }
  return best; // 0 if outside all bands
}

function roomPlayersArray(room) {
  return Object.entries(room.players).map(([socketId, p]) => ({
    socketId,
    name: p.name,
    score: p.score
  }));
}

function isHost(room, socketId) {
  return room.hostSocketId === socketId;
}

function getOpponentId(room, socketId) {
  const ids = Object.keys(room.players);
  return ids.find((id) => id !== socketId) || null;
}

function getRoomViewForSocket(room, socketId) {
  const players = roomPlayersArray(room).map((p) => ({
    ...p,
    isHost: p.socketId === room.hostSocketId,
    isYou: p.socketId === socketId
  }));

  const base = {
    roomCode: room.code,
    status: room.status, // lobby | inGame | finished
    settings: room.settings,
    scoringBands: getScoringBands(room.settings.difficulty),
    questions: globalQuestions,
    players,
    you: {
      socketId,
      name: room.players[socketId]?.name ?? "Unknown",
      isHost: isHost(room, socketId)
    }
  };

  if (!room.game) return base;

  const g = room.game;
  const round = g.rounds[g.roundIndex];
  const oppId = getOpponentId(room, socketId);

  const view = {
    ...base,
    game: {
      roundIndex: g.roundIndex,
      totalRounds: g.rounds.length,
      phase: g.phase, // prompt | guess | reveal
      left: round.left,
      right: round.right,
      timerRemaining: g.timerRemaining,
      you: {
        target: g.phase === "prompt" ? round.targets[socketId] : undefined,
        promptText: round.prompts[socketId] ?? "",
        promptSubmitted: !!round.prompts[socketId],
        guessValue: round.guesses[socketId],
        guessSubmitted: typeof round.guesses[socketId] === "number"
      },
      opponent: oppId
        ? {
            name: room.players[oppId]?.name ?? "Opponent",
            promptText:
              g.phase === "guess" || g.phase === "reveal"
                ? (round.prompts[oppId] ?? "")
                : undefined,
            target: g.phase === "reveal" ? round.targets[oppId] : undefined,
            guessValue: g.phase === "reveal" ? round.guesses[oppId] : undefined
          }
        : null
    }
  };

  if (g.phase === "reveal" && oppId) {
    const yourPoints = round.points[socketId] ?? 0;
    const oppPoints = round.points[oppId] ?? 0;
    view.game.reveal = {
      yourPointsThisRound: yourPoints,
      oppPointsThisRound: oppPoints,
      yourGuessAgainstOppTarget: {
        guess: round.guesses[socketId],
        target: round.targets[oppId]
      },
      oppGuessAgainstYourTarget: {
        guess: round.guesses[oppId],
        target: round.targets[socketId]
      }
    };
  }

  return view;
}

function emitRoomState(room) {
  for (const socketId of Object.keys(room.players)) {
    io.to(socketId).emit("roomState", getRoomViewForSocket(room, socketId));
  }
}

function emitAllRoomsState() {
  for (const room of rooms.values()) emitRoomState(room);
}

function clearTimer(room) {
  if (room?.game?.timerId) {
    clearInterval(room.game.timerId);
    room.game.timerId = null;
  }
}

function onPhaseTimeout(room) {
  if (!room.game) return;
  if (room.game.phase === "prompt") startGuessPhase(room);
  else if (room.game.phase === "guess") startRevealPhase(room);
}

function startPhaseTimer(room) {
  clearTimer(room);
  room.game.timerRemaining = room.settings.seconds;

  room.game.timerId = setInterval(() => {
    room.game.timerRemaining -= 1;
    if (room.game.timerRemaining <= 0) {
      room.game.timerRemaining = 0;
      clearTimer(room);
      onPhaseTimeout(room);
      return;
    }
    emitRoomState(room);
  }, 1000);

  emitRoomState(room);
}

function startPromptPhase(room) {
  room.status = "inGame";
  room.game.phase = "prompt";
  startPhaseTimer(room);
}

function startGuessPhase(room) {
  room.game.phase = "guess";
  startPhaseTimer(room);
}

function startRevealPhase(room) {
  room.game.phase = "reveal";

  // Auto-fill missing guesses
  for (const pid of Object.keys(room.players)) {
    if (typeof room.game.rounds[room.game.roundIndex].guesses[pid] !== "number") {
      room.game.rounds[room.game.roundIndex].guesses[pid] = 50;
    }
  }

  // Score
  const round = room.game.rounds[room.game.roundIndex];
  const ids = Object.keys(room.players);
  if (ids.length === 2) {
    const [a, b] = ids;
    const aPoints = scoreGuess(round.guesses[a], round.targets[b], room.settings.difficulty);
    const bPoints = scoreGuess(round.guesses[b], round.targets[a], room.settings.difficulty);
    round.points[a] = aPoints;
    round.points[b] = bPoints;
    room.players[a].score += aPoints;
    room.players[b].score += bPoints;
  }

  clearTimer(room);
  emitRoomState(room);
}

function nextRoundOrFinish(room) {
  const g = room.game;
  if (!g) return;

  if (g.roundIndex < g.rounds.length - 1) {
    g.roundIndex += 1;
    g.phase = "prompt";
    startPromptPhase(room);
  } else {
    room.status = "finished";
    clearTimer(room);
    emitRoomState(room);
  }
}

function tryAdvanceIfAllSubmitted(room) {
  const g = room.game;
  if (!g) return;
  const round = g.rounds[g.roundIndex];
  const ids = Object.keys(room.players);
  if (ids.length !== 2) return;

  if (g.phase === "prompt") {
    const allPrompted = ids.every((id) => !!round.prompts[id]);
    if (allPrompted) {
      clearTimer(room);
      startGuessPhase(room);
    }
  } else if (g.phase === "guess") {
    const allGuessed = ids.every((id) => typeof round.guesses[id] === "number");
    if (allGuessed) {
      clearTimer(room);
      startRevealPhase(room);
    }
  }
}

function createNewGame(room) {
  // reset scores
  for (const pid of Object.keys(room.players)) room.players[pid].score = 0;

  // Shuffle questions to ensure no repeats within a game
  const availableQuestions = [...globalQuestions];
  // Fisher-Yates shuffle
  for (let i = availableQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableQuestions[i], availableQuestions[j]] = [availableQuestions[j], availableQuestions[i]];
  }

  // If more rounds than questions, cycle through the shuffled list
  const rounds = Array.from({ length: room.settings.rounds }, (_, i) => {
    const spec = availableQuestions[i % availableQuestions.length];
    return {
      left: spec.left,
      right: spec.right,
      targets: {},
      prompts: {},
      guesses: {},
      points: {}
    };
  });

  const playerIds = Object.keys(room.players);
  for (const r of rounds) {
    for (const pid of playerIds) {
      r.targets[pid] = Math.floor(Math.random() * 101);
    }
  }

  room.game = {
    rounds,
    roundIndex: 0,
    phase: "prompt",
    timerRemaining: room.settings.seconds,
    timerId: null
  };
}

/** -----------------------
 *  Socket handlers
 *  ----------------------*/
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, settings }, cb) => {
    try {
      const code = randomCode(5);

      const safeSettings = {
        rounds: clamp(parseInt(settings?.rounds ?? 3, 10), 1, 20),
        seconds: clamp(parseInt(settings?.seconds ?? 180, 10), 10, 600),
        difficulty: normalizeDifficulty(settings?.difficulty ?? DEFAULT_DIFFICULTY)
      };

      const room = {
        code,
        hostSocketId: socket.id,
        status: "lobby",
        settings: safeSettings,
        players: {
          [socket.id]: { name: name?.trim() || "Player 1", score: 0 }
        },
        game: null
      };

      rooms.set(code, room);
      socket.join(code);

      emitRoomState(room);
      cb?.({ ok: true, roomCode: code, roomState: getRoomViewForSocket(room, socket.id) });
    } catch {
      cb?.({ ok: false, error: "Failed to create room." });
    }
  });

  socket.on("joinRoom", ({ roomCode, name }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });

    if (Object.keys(room.players).length >= 2) {
      return cb?.({ ok: false, error: "Room is full (2 players max)." });
    }

    room.players[socket.id] = { name: name?.trim() || "Player 2", score: 0 };
    socket.join(code);

    if (room.status === "inGame") {
      clearTimer(room);
      room.status = "lobby";
      room.game = null;
      for (const pid of Object.keys(room.players)) room.players[pid].score = 0;
    }

    emitRoomState(room);
    cb?.({ ok: true, roomState: getRoomViewForSocket(room, socket.id) });
  });

  socket.on("updateSettings", ({ roomCode, settings }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!isHost(room, socket.id)) return cb?.({ ok: false, error: "Only the host can update settings." });
    if (room.status === "inGame") return cb?.({ ok: false, error: "Can't change settings during a game." });

    room.settings = {
      rounds: clamp(parseInt(settings?.rounds ?? room.settings.rounds, 10), 1, 20),
      seconds: clamp(parseInt(settings?.seconds ?? room.settings.seconds, 10), 10, 600),
      difficulty: normalizeDifficulty(settings?.difficulty ?? room.settings.difficulty)
    };

    emitRoomState(room);
    cb?.({ ok: true });
  });

  socket.on("startGame", ({ roomCode }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!isHost(room, socket.id)) return cb?.({ ok: false, error: "Only the host can start the game." });

    const ids = Object.keys(room.players);
    if (ids.length !== 2) return cb?.({ ok: false, error: "Need exactly 2 players to start." });

    if (!globalQuestions || globalQuestions.length < 1) {
      return cb?.({ ok: false, error: "No questions exist. Add at least 1 question first." });
    }

    createNewGame(room);
    startPromptPhase(room);
    cb?.({ ok: true });
  });

  socket.on("submitPrompt", ({ roomCode, text }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room?.game) return cb?.({ ok: false, error: "Game not started." });
    if (room.game.phase !== "prompt") return cb?.({ ok: false, error: "Not in prompt phase." });

    const round = room.game.rounds[room.game.roundIndex];
    round.prompts[socket.id] = (text ?? "").toString().slice(0, 140);

    emitRoomState(room);
    tryAdvanceIfAllSubmitted(room);
    cb?.({ ok: true });
  });

  socket.on("submitGuess", ({ roomCode, guess }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room?.game) return cb?.({ ok: false, error: "Game not started." });
    if (room.game.phase !== "guess") return cb?.({ ok: false, error: "Not in guess phase." });

    const g = clamp(parseInt(guess, 10), 0, 100);
    const round = room.game.rounds[room.game.roundIndex];
    round.guesses[socket.id] = g;

    emitRoomState(room);
    tryAdvanceIfAllSubmitted(room);
    cb?.({ ok: true });
  });

  socket.on("next", ({ roomCode }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room?.game) return cb?.({ ok: false, error: "No active game." });
    if (room.game.phase !== "reveal") return cb?.({ ok: false, error: "Not in reveal phase." });
    if (!isHost(room, socket.id)) return cb?.({ ok: false, error: "Only the host can advance." });

    nextRoundOrFinish(room);
    cb?.({ ok: true });
  });

  socket.on("backToLobby", ({ roomCode }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!isHost(room, socket.id)) return cb?.({ ok: false, error: "Only host." });

    clearTimer(room);
    room.status = "lobby";
    room.game = null;
    for (const pid of Object.keys(room.players)) room.players[pid].score = 0;

    emitRoomState(room);
    cb?.({ ok: true });
  });

  /** Global questions: editable by ANY player in the room (lobby only) */
  socket.on("addQuestion", ({ roomCode, left, right }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!room.players[socket.id]) return cb?.({ ok: false, error: "You are not in this room." });
    if (room.status === "inGame") return cb?.({ ok: false, error: "Can't edit questions during a game." });

    const L = (left ?? "").toString().trim().slice(0, 40);
    const R = (right ?? "").toString().trim().slice(0, 40);
    if (!L || !R) return cb?.({ ok: false, error: "Both ends are required." });

    const dup = globalQuestions.some(
      (q) => q.left.toLowerCase() === L.toLowerCase() && q.right.toLowerCase() === R.toLowerCase()
    );
    if (dup) return cb?.({ ok: false, error: "That question already exists." });

    globalQuestions.push({ id: newQuestionId(), left: L, right: R });
    saveQuestions(globalQuestions);

    emitAllRoomsState();
    cb?.({ ok: true });
  });

  socket.on("removeQuestion", ({ roomCode, id }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!room.players[socket.id]) return cb?.({ ok: false, error: "You are not in this room." });
    if (room.status === "inGame") return cb?.({ ok: false, error: "Can't edit questions during a game." });

    if (globalQuestions.length <= 1) {
      return cb?.({ ok: false, error: "Must keep at least 1 question." });
    }

    const before = globalQuestions.length;
    globalQuestions = globalQuestions.filter((q) => q.id !== id);
    if (globalQuestions.length === before) return cb?.({ ok: false, error: "Question not found." });

    saveQuestions(globalQuestions);
    emitAllRoomsState();
    cb?.({ ok: true });
  });

  socket.on("resetQuestions", ({ roomCode }, cb) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (!room.players[socket.id]) return cb?.({ ok: false, error: "You are not in this room." });
    if (room.status === "inGame") return cb?.({ ok: false, error: "Can't edit questions during a game." });

    globalQuestions = DEFAULT_QUESTIONS.map((q) => ({ ...q }));
    saveQuestions(globalQuestions);
    emitAllRoomsState();
    cb?.({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      if (!room.players[socket.id]) continue;

      delete room.players[socket.id];
      clearTimer(room);

      const remaining = Object.keys(room.players);
      if (remaining.length === 0) {
        rooms.delete(code);
        continue;
      }

      if (room.hostSocketId === socket.id) {
        room.hostSocketId = remaining[0];
      }

      room.status = "lobby";
      room.game = null;
      for (const pid of Object.keys(room.players)) room.players[pid].score = 0;

      emitRoomState(room);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
