import { createServer } from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";

require("dotenv").config();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const BASE_PROMPT = `
    Gere uma dica simples;
    A dica não pode conter a palavra;
    A dica não pode ser muito específica;
    A dica não pode ajudar a formar a palavra;
    A dica não pode ajudar demais;
    Exemplo: Quando a palavra for: "banana" a dica pode ser: "Uma fruta amarela que cresce em cachos.";
    Dito isso, gere uma dica para a palavra:
`;

export async function fetchHint(word: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `${BASE_PROMPT} "${word}"`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

interface Guess {
  guess: string;
  socketId: string;
}

let currentWord = "";

const fetchRandomWord = async () => {
  try {
    const response = await fetch("http://127.0.0.1:5000/random-word");
    const data: any = await response.json();
    currentWord = data.word;
    if (currentWord.length < 5) {
      fetchRandomWord();
    }
  } catch (error) {
    console.error("Erro ao buscar palavra aleatória:", error);
  }
};

let feedbacks: Record<string, Guess[]> = {};
let guessed = false;
let playersReady: Record<string, string> = {};
let playersCount = 0;
let hint = "";

io.on("connection", (socket) => {
  socket.on("join", () => {
    playersCount++;
    io.to("game").emit("players", playersCount);
    socket.join("game");
    socket.emit(
      "joined",
      feedbacks,
      guessed,
      Object.keys(playersReady).length,
      playersCount
    );
  });

  socket.on("ready", async (playerId) => {
    if (!playersReady[playerId]) {
      playersReady[playerId] = "ready";
    } else {
      delete playersReady[playerId];
    }

    if (Object.keys(playersReady).length === playersCount) {
      await fetchRandomWord();
      guessed = false;
      io.to("game").emit("start", currentWord);
      playersReady = {};
    }

    io.to("game").emit("ready", Object.keys(playersReady).length);
  });

  socket.on("reset", async () => {
    feedbacks = {};
    guessed = false;
    hint = "";
    await fetchRandomWord();
    io.to("game").emit("reseted");
    io.to("game").emit("start", currentWord);
  });

  socket.on("guess", ({ guess, socketId }: Guess) => {
    if (!feedbacks[socketId]) {
      feedbacks[socketId] = [];
    }

    feedbacks[socketId].push({
      guess,
      socketId,
    });

    const totalGuesses = Object.values(feedbacks).reduce(
      (acc, guesses) => acc + guesses.length,
      0
    );

    if (totalGuesses === 3) {
      fetchHint(currentWord).then((res) => {
        hint = res;
        io.to("game").emit("hint", hint);
      });
    }

    io.to("game").emit("word-guess", feedbacks);

    if (guess.toUpperCase() === currentWord.toUpperCase()) {
      io.to("game").emit("guessed", socketId);
      feedbacks = {};
      guessed = true;
      hint = "";
      return;
    }
  });

  socket.on("disconnect", () => {
    delete feedbacks[socket.id];
    socket.leave("game");
    playersCount--;
  });
});

httpServer.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
