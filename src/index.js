const path = require("path");
const https = require("https");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { CODES } = require("./consts");
const { getImageStreamByUrl } = require("./utils/download");
const { isJson } = require("./utils/isJson");
const { pipeline } = require("stream");

const app = express();
const server = createServer(app);
const io = new Server(server);

const { PORT = 3000 } = process.env;

// Ограничение потоков
const maxThreads = 2;
const byteRate = 1024 * 50; // 50 KB/s

const downloadQueue = new Map();

const processClientQueue = (clientId) => {
  const queue = Array.from(downloadQueue.get(clientId).values());
  const inProgress = queue.filter(
    (item) => item.status === "downloading"
  ).length;

  if (inProgress >= maxThreads) {
    return;
  }

  const toProcessImages = queue.filter((item) => item.status === "pending");

  if (toProcessImages.length === 0) {
    return;
  }

  const maxToProcess = maxThreads - inProgress;

  for (const item of toProcessImages.slice(0, maxToProcess)) {
    item.status = "downloading";

    const { url, socket } = item;

    const stream = getImageStreamByUrl({
      url,
      byteRate,
    });

    stream.on("data", (chunk) => {
      try {
        const decoder = new TextDecoder();
        const decodedChunk = JSON.parse(decoder.decode(chunk));

        if (decodedChunk.status === "downloading") {
          socket.emit("download-progress", url, decodedChunk.data);
        }

        if (decodedChunk.status === "downloaded") {
          socket.emit(
            "downloaded",
            url,
            "data:image/jpeg;base64," + decodedChunk.data.result
          );
        }
      } catch (e) {}
    });

    stream.on("end", () => {
      downloadQueue.get(clientId).delete(url);
      processClientQueue(clientId);
    });
  }
};

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  const clientId = socket.id;

  socket.on("search-by-code", (code) => {
    const images = CODES?.[code] ?? [];

    socket.emit("search-by-code-result", images);
  });

  socket.on("download-images", (images) => {
    if (!Array.isArray(images)) {
      return;
    }

    downloadQueue.set(
      clientId,
      new Map(
        images.map((url) => [
          url,
          {
            status: "pending",
            url,
            socket,
          },
        ])
      )
    );

    processClientQueue(clientId);
  });
});

server.listen(PORT, () => {
  console.log("server started at http://localhost:" + PORT);
});
