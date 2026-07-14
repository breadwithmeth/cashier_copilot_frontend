import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    host: "0.0.0.0",
  },
});
