// Minimal S3-compatible stub (path-style) for local dev and E2E tests when
// MinIO/Docker isn't available. Supports: PUT object, GET object (with
// Range), DELETE object, POST ?delete (batch), GET ?list-type=2 (list).
// No auth checks -- never expose beyond localhost.
//
//   node tools/s3-stub.js            # listens on :9100
//   S3_STUB_PORT=9200 S3_STUB_ROOT=/tmp/x node tools/s3-stub.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.S3_STUB_ROOT || "/tmp/hosty-s3";
const PORT = Number(process.env.S3_STUB_PORT || 9100);
fs.mkdirSync(ROOT, { recursive: true });

function keyToFile(url) {
  const [p] = url.split("?");
  const parts = decodeURIComponent(p).split("/").filter(Boolean); // bucket/key...
  const safe = parts.filter((s) => s !== ".." && s !== ".");
  return path.join(ROOT, ...safe);
}

const server = http.createServer((req, res) => {
  const [pathname, query = ""] = req.url.split("?");
  if (pathname === "/__health") {
    res.writeHead(200);
    return res.end("ok");
  }
  const file = keyToFile(req.url);

  if (req.method === "PUT") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const q = new URLSearchParams(query);
    if (q.get("uploadId") && q.get("partNumber")) {
      const ws = fs.createWriteStream(`${file}.__mpu-${q.get("uploadId")}.part${q.get("partNumber")}`);
      req.pipe(ws);
      ws.on("finish", () => {
        res.writeHead(200, { ETag: `"part-${q.get("partNumber")}"` });
        res.end();
      });
      return;
    }
    // server-side copy (x-amz-copy-source: /bucket/key)
    const copySource = req.headers["x-amz-copy-source"];
    if (copySource) {
      const src = keyToFile("/" + decodeURIComponent(String(copySource)).replace(/^\//, ""));
      try {
        fs.copyFileSync(src, file);
        const meta = { contentType: req.headers["content-type"] || "application/octet-stream" };
        fs.writeFileSync(file + ".meta", JSON.stringify(meta));
        res.writeHead(200, { "Content-Type": "application/xml" });
        return res.end('<?xml version="1.0"?><CopyObjectResult><ETag>"stub"</ETag></CopyObjectResult>');
      } catch {
        res.writeHead(404, { "Content-Type": "application/xml" });
        return res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
      }
    }
    const meta = { contentType: req.headers["content-type"] || "application/octet-stream" };
    const ws = fs.createWriteStream(file);
    req.pipe(ws);
    ws.on("finish", () => {
      fs.writeFileSync(file + ".meta", JSON.stringify(meta));
      res.writeHead(200, { ETag: '"stub"' });
      res.end();
    });
    return;
  }

  if (req.method === "GET" && query.includes("list-type=2")) {
    const params = new URLSearchParams(query);
    const prefix = params.get("prefix") || "";
    const bucketDir = keyToFile(pathname);
    const results = [];
    (function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) walk(fp);
        else if (!e.name.endsWith(".meta")) results.push(path.relative(bucketDir, fp));
      }
    })(bucketDir);
    const keys = results.filter((k) => k.startsWith(prefix));
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(
      `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${keys
        .map((k) => `<Contents><Key>${k}</Key></Contents>`)
        .join("")}</ListBucketResult>`
    );
    return;
  }

  if (req.method === "POST" && new URLSearchParams(query).has("uploads")) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const uploadId = Math.random().toString(36).slice(2, 14);
    const meta = { contentType: req.headers["content-type"] || "application/octet-stream" };
    fs.writeFileSync(`${file}.__mpu-${uploadId}.meta`, JSON.stringify(meta));
    res.writeHead(200, { "Content-Type": "application/xml" });
    return res.end(`<?xml version="1.0"?><InitiateMultipartUploadResult><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`);
  }

  // multipart complete: POST ?uploadId=…
  if (req.method === "POST" && new URLSearchParams(query).get("uploadId")) {
    const uploadId = new URLSearchParams(query).get("uploadId");
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const dir = path.dirname(file);
      const base = path.basename(file);
      const parts = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(`${base}.__mpu-${uploadId}.part`))
        .sort((a, b) => Number(a.split(".part")[1]) - Number(b.split(".part")[1]));
      const out = fs.createWriteStream(file);
      for (const p of parts) out.write(fs.readFileSync(path.join(dir, p)));
      out.end(() => {
        const metaFile = `${file}.__mpu-${uploadId}.meta`;
        fs.renameSync(metaFile, file + ".meta");
        for (const p of parts) fs.unlinkSync(path.join(dir, p));
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(`<?xml version="1.0"?><CompleteMultipartUploadResult><Key>${base}</Key></CompleteMultipartUploadResult>`);
      });
    });
    return;
  }

  if (req.method === "POST" && query.includes("delete")) {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const keys = [...body.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
      const bucketDir = keyToFile(pathname);
      for (const k of keys) {
        try { fs.unlinkSync(path.join(bucketDir, k)); fs.unlinkSync(path.join(bucketDir, k) + ".meta"); } catch {}
      }
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0"?><DeleteResult>${keys.map((k) => `<Deleted><Key>${k}</Key></Deleted>`).join("")}</DeleteResult>`);
    });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "application/xml" });
      res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
      return;
    }
    const meta = JSON.parse(fs.readFileSync(file + ".meta", "utf8"));
    const stat = fs.statSync(file);
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": meta.contentType,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": meta.contentType, "Content-Length": stat.size, ETag: '"stub"' });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    }
    return;
  }

  if (req.method === "DELETE") {
    try { fs.unlinkSync(file); fs.unlinkSync(file + ".meta"); } catch {}
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(501);
  res.end();
});

server.listen(PORT, () => console.log(`s3 stub on :${PORT}`));
