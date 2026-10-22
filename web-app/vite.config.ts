import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"
// single-file build: one self-contained index.html (easy static deploy)
export default defineConfig({ plugins: [react(), tailwindcss(), viteSingleFile()], build: { assetsInlineLimit: 100_000_000 }, resolve: { alias: { "@": path.resolve(__dirname, "./src") } } })
