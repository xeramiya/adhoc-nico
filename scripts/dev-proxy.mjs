import { createServer } from "node:https";
import { request } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";

const PROXY_PORT = 3443;
const VITE_PORT = 5173;
const PARTY_PORT = 1999;
const CERT_DIR = new URL("../.cert", import.meta.url).pathname;

function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

function ensureCert() {
  const certPath = `${CERT_DIR}/cert.pem`;
  const keyPath = `${CERT_DIR}/key.pem`;
  if (existsSync(certPath) && existsSync(keyPath)) {
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  }
  mkdirSync(CERT_DIR, { recursive: true });
  const ip = getLocalIp();
  execSync(
    `openssl req -x509 -newkey rsa:2048 ` +
      `-keyout "${keyPath}" -out "${certPath}" -days 365 -nodes ` +
      `-subj "/CN=dev-proxy" ` +
      `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${ip}"`,
    { stdio: "pipe" },
  );
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

function proxyHttp(req, res, targetPort) {
  const proxyReq = request(
    {
      hostname: "localhost",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${targetPort}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => {
    res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxyReq);
}

function proxyWs(req, socket, targetPort) {
  const proxyReq = request({
    hostname: "localhost",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    let head = `HTTP/1.1 101 Switching Protocols\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      head += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    }
    head += "\r\n";
    socket.write(head);
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    socket.on("error", () => proxySocket.destroy());
    proxySocket.on("error", () => socket.destroy());
  });

  proxyReq.on("error", () => socket.destroy());
  proxyReq.end();
}

const { cert, key } = ensureCert();
const ip = getLocalIp();

const server = createServer({ cert, key }, (req, res) => {
  const target = req.url.startsWith("/parties/") ? PARTY_PORT : VITE_PORT;
  proxyHttp(req, res, target);
});

server.on("upgrade", (req, socket, _head) => {
  const target = req.url.startsWith("/parties/") ? PARTY_PORT : VITE_PORT;
  proxyWs(req, socket, target);
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`  ➜  HTTPS: https://localhost:${PROXY_PORT}/`);
  console.log(`  ➜  HTTPS: https://${ip}:${PROXY_PORT}/`);
});
