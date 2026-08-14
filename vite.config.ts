import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function resolveLocalApiProxy(value = process.env.VITE_API_PROXY): string {
  const target = value || 'http://127.0.0.1:3000'
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    throw new Error('VITE_API_PROXY_LOCAL_INVALID')
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '3000' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_API_PROXY_LOCAL_INVALID')
  }
  return parsed.origin
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __CRM_PREVIEW_BUILD__: JSON.stringify({
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      CRM01C1A_EXPECTED_GIT_SHA: process.env.CRM01C1A_EXPECTED_GIT_SHA,
      VERCEL_URL: process.env.VERCEL_URL,
    }),
  },
  plugins: [inspectAttr(), react()],
  server: {
    proxy: {
      '/api': {
        target: resolveLocalApiProxy(),
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("lucide-react")) return "icons";
            return "vendor";
          }
        },
      },
    },
  },
});
