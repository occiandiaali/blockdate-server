const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const io = new Server(server, {
  cors: { origin: "*" },
});

// Track active rooms
const rooms = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", ({ roomId, playerName, gender, budget }) => {
    //const room = rooms[roomId] || { players: [], timer: null, countdown: 300 };
    const room = rooms[roomId] || { players: [], timer: null, countdown: 120 }; // 2 minutes for testing

    if (room.players.length >= 2) {
      socket.emit("roomFull", {
        message: "This room is already at maximum capacity (2 players).",
      });
      return;
    }

    // Add player with gender preference and initial 3D transform
    const playerObj = {
      id: socket.id,
      name: playerName || "Anonymous",
      gender: gender || "female",
      budget: budget || 0,
      transform: {
        x: room.players.length === 0 ? -1.5 : 1.5,
        y: 1.0,
        z: 1.5,
        rotY: 0,
      },
    };

    room.players.push(playerObj);
    rooms[roomId] = room;
    socket.join(roomId);

    console.log(
      `[${roomId}] Player ${playerName} (${socket.id}) joined as ${gender} - Budget: ${playerObj.budget}. Total: ${room.players.length}`,
    );

    // Notify all clients in the room of updated player list
    io.to(roomId).emit("roomState", {
      players: room.players,
      roomId: roomId,
    });

    // Start 5-minute (300s) synced timer when second player enters
    if (room.players.length === 2 && !room.timer) {
      io.to(roomId).emit("dateStarted", { countdown: room.countdown });

      room.timer = setInterval(() => {
        room.countdown--;
        io.to(roomId).emit("timerUpdate", room.countdown);

        if (room.countdown <= 0) {
          io.to(roomId).emit("meetingEnded");

          clearInterval(room.timer);
          delete rooms[roomId];
        }
      }, 1000);
    }
  });

  // Real-time movement & transform relay
  socket.on("playerMove", ({ roomId, transform }) => {
    const room = rooms[roomId];
    if (room) {
      const p = room.players.find((player) => player.id === socket.id);
      if (p) p.transform = transform;
      socket.to(roomId).emit("playerMoved", { id: socket.id, transform });
    }
  });

  // Relay chat & speech bubbles (typewriter effect)
  socket.on("speechMessage", ({ roomId, text }) => {
    socket.to(roomId).emit("speechMessage", { id: socket.id, text });
  });

  // Explicit Leave
  socket.on("leaveRoom", ({ roomId, playerName }) => {
    handlePlayerExit(socket, roomId, playerName);
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players.some((p) => p.id === socket.id)) {
        handlePlayerExit(socket, roomId);
      }
    }
  });
});

function handlePlayerExit(socket, roomId, playerName = "") {
  const room = rooms[roomId];
  if (room) {
    room.players = room.players.filter((p) => p.id !== socket.id);
    socket.leave(roomId);
    socket.to(roomId).emit("playerLeft", { id: socket.id, playerName });

    if (room.players.length === 0) {
      console.log(`Room ${roomId} is empty, clearing timer and deleting room.`);
      //  if (room.timer) clearInterval(room.timer);
      clearInterval(room.timer);
      delete rooms[roomId];
      //console.log(`[${roomId}] Room empty. Timer cleared and room destroyed.`);
      console.log(`Timer cleared and room destroyed.`);
    }
  }

  //   for (const [roomId, room] of Object.entries(rooms)) {
  //     room.players = room.players.filter((p) => p.id !== socket.id);
  //     io.to(roomId).emit("playerJoined", room.players);
  //     if (room.players.length === 0) {
  //       console.log(`Room ${roomId} is empty, clearing timer and deleting room.`);
  //       clearInterval(room.timer);
  //       delete rooms[roomId];
  //     }
  //   }
}

server.listen(port, () => {
  console.log(
    `Socket.io Voxel Love Server running on http://localhost:${port}`,
  );
});
