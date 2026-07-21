import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const localApiToken = process.env.VELO_LOCAL_API_TOKEN || "";
const localApiProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
  configure(proxy) {
    proxy.on("proxyReq", (proxyRequest) => {
      if (localApiToken) proxyRequest.setHeader("x-velo-local-token", localApiToken);
    });
  },
};

export default defineConfig({
  // The current Vite/browser combination does not execute React's refresh
  // preamble reliably. Disable Fast Refresh so the application can mount;
  // ordinary Vite reloads still apply source changes.
  plugins: [react({ fastRefresh: false })],
  server: {
    // Keep the development proxy private. LAN sharing must be an explicit,
    // separately hardened deployment rather than the default dev workflow.
    host: "127.0.0.1",
    headers: {
      // Vite injects an inline React-refresh preamble in development. Set a
      // nonce- or hash-based CSP in the production static-file host instead.
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
    proxy: {
      "/api": localApiProxy,
      "/renders": localApiProxy,
    },
  },
});
