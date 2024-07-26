import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("join", ({ room }) => {
    socket.join(room);
  });

  socket.on("guess", ({ guess, word, socketId }) => {
    if (guess.toUpperCase() === word.toUpperCase()) {
      io.to("game").emit("guessed", { guess, socketId });
      return;
    }

    io.to("game").emit("word-guess", { guess, socketId });
  });
});

httpServer.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
