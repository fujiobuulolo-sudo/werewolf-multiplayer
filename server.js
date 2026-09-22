const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🐺 Werewolf Server aktif!");
});

const rooms = {};

function randomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function sendState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const state = {
    name: room.name,
    code: room.code,
    phase: room.phase,
    night: room.night,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      isHost: p.isHost
    }))
  };

  io.to(roomCode).emit("state", state);
}

io.on("connection", socket => {

  socket.on("createRoom", (data, callback) => {

    const code =
      data.roomCode?.trim().toUpperCase() ||
      randomCode();

    if (rooms[code]) {
      return callback({ error: "Kode room sudah dipakai." });
    }

    if (!data.name?.trim()) {
      return callback({ error: "Nama harus diisi." });
    }

    rooms[code] = {
      name: data.roomName || "Werewolf",
      code,
      phase: "lobby",
      night: 0,
      players: []
    };

    const player = {
      id: socket.id,
      name: data.name.trim(),
      alive: true,
      isHost: true
    };

    rooms[code].players.push(player);

    socket.join(code);
    socket.roomCode = code;

    callback({ ok: true, code });

    sendState(code);
  });

  socket.on("joinRoom", (data, callback) => {

    const code = data.code?.trim().toUpperCase();
    const room = rooms[code];

    if (!room) {
      return callback({ error: "Room tidak ditemukan." });
    }

    if (room.phase !== "lobby") {
      return callback({ error: "Game sudah dimulai." });
    }

    if (room.players.length >= 8) {
      return callback({ error: "Room sudah penuh (8 pemain)." });
    }

    if (!data.name?.trim()) {
      return callback({ error: "Nama harus diisi." });
    }

    room.players.push({
      id: socket.id,
      name: data.name.trim(),
      alive: true,
      isHost: false
    });

    socket.join(code);
    socket.roomCode = code;

    callback({ ok: true });

    sendState(code);
  });

  socket.on("startGame", callback => {

    const code = socket.roomCode;
    const room = rooms[code];

    if (!room) {
      return callback?.({ error: "Room tidak ditemukan." });
    }

    const host = room.players.find(p => p.id === socket.id);

    if (!host?.isHost) {
      return callback?.({ error: "Hanya host yang bisa memulai." });
    }

    if (room.players.length !== 8) {
      return callback?.({
        error: "Game membutuhkan tepat 8 pemain."
      });
    }

    room.phase = "night";
    room.night = 1;

    sendState(code);

    io.to(code).emit("announcement", "🌙 Malam pertama dimulai!");
  });

  socket.on("moderatorPhase", phase => {

    const code = socket.roomCode;
    const room = rooms[code];

    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);

    if (!player?.isHost) return;

    room.phase = phase;

    if (phase === "night") {
      room.night++;
    }

    sendState(code);

    io.to(code).emit(
      "announcement",
      phase === "morning"
        ? "☀️ Pagi telah tiba!"
        : phase === "voting"
        ? "🗳️ Voting dimulai!"
        : "🌙 Malam dimulai!"
    );
  });

  socket.on("disconnect", () => {

    const code = socket.roomCode;
    const room = rooms[code];

    if (!room) return;

    room.players = room.players.filter(
      p => p.id !== socket.id
    );

    if (room.players.length === 0) {
      delete rooms[code];
      return;
    }

    if (!room.players.some(p => p.isHost)) {
      room.players[0].isHost = true;
    }

    sendState(code);
  });

});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🐺 Werewolf server berjalan di port ${PORT}`);
});
