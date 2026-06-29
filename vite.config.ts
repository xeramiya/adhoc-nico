import { networkInterfaces } from "os";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  define: {
    __DEV_LAN_IP__: JSON.stringify(getLocalIp()),
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@radix-ui/themes",
      "@radix-ui/react-icons",
      "partysocket/react",
      "nanoid",
      "qrcode.react",
    ],
  },
});
