import { defineCloudflareConfig } from "@opennextjs/cloudflare"

const config = defineCloudflareConfig({})

// OpenNext's Cloudflare adapter requires a webpack build, not Turbopack.
// Next.js 16 defaults `next build` to Turbopack, so we force webpack here.
// `defineCloudflareConfig` doesn't expose buildCommand, so we set it on the result.
;(config as any).buildCommand = "next build --webpack"

export default config
