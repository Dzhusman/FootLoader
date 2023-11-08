const util = require("util");
const https = require("https");
const { pipeline, Readable } = require("stream");

const getImageStreamByUrl = (options) => {
  const { url, byteRate } = options || {};

  let totalBytesProceed = 0;
  const timeBeforeStart = Date.now();
  const chunks = [];
  const readable = new Readable({
    read() {},
  });

  https.get(url, (stream) => {
    const fileSize = Number(stream.headers["content-length"]);

    stream.on("data", (chunk) => {
      chunks.push(chunk);
      totalBytesProceed += chunk.length;

      readable.push(
        JSON.stringify({
          status: "downloading",
          data: {
            total: fileSize,
            proceeded: totalBytesProceed,
          },
        })
      );

      // Sleep to throttle towards desired transfer speed
      const sleepMs = Math.max(
        0,
        (totalBytesProceed / byteRate) * 1000 - Date.now() + timeBeforeStart
      );

      if (sleepMs > 0) {
        stream.pause();
        setTimeout(() => {
          stream.resume();
        }, sleepMs);
      }
    });

    stream.on("end", () => {
      const base64 = Buffer.concat(chunks).toString("base64");

      readable.push(
        JSON.stringify({
          status: "downloaded",
          data: {
            total: fileSize,
            proceeded: totalBytesProceed,
            result: base64,
          },
        })
      );

      readable.push(null);
    });
  });

  return readable;
};

module.exports = {
  getImageStreamByUrl,
};
