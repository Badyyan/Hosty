import { Socket } from "net";
import { logger } from "./logger";

/**
 * Malware scanning hook (ClamAV INSTREAM protocol).
 *
 * When CLAMAV_HOST is unset the scan is a no-op (local dev). In production,
 * point it at a clamd sidecar/service. Files failing the scan abort the
 * upload before anything is persisted.
 */

export class MalwareDetectedError extends Error {
  constructor(public readonly signature: string) {
    super(`Upload rejected by malware scan: ${signature}`);
  }
}

export async function scanBuffer(data: Buffer, label: string): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return; // scanning disabled
  const port = Number(process.env.CLAMAV_PORT ?? 3310);

  const response = await new Promise<string>((resolve, reject) => {
    const socket = new Socket();
    let out = "";
    socket.setTimeout(30_000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("ClamAV scan timed out"));
    });
    socket.on("error", reject);
    socket.on("data", (d) => (out += d.toString()));
    socket.on("close", () => resolve(out));
    socket.connect(port, host, () => {
      socket.write("zINSTREAM\0");
      // stream in 64KB chunks, each prefixed with a 4-byte big-endian length
      const chunkSize = 64 * 1024;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.subarray(i, i + chunkSize);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.from([0, 0, 0, 0])); // terminator
    });
  });

  if (response.includes("FOUND")) {
    const signature = response.replace("stream:", "").replace("FOUND", "").trim();
    logger.warn("malware detected", { label, signature });
    throw new MalwareDetectedError(signature || "unknown signature");
  }
}
