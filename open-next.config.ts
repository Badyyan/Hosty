import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config for Cloudflare Workers.
 * Default config: no incremental-cache binding required (the app's pages are
 * either static or fully dynamic). To enable ISR caching later, add an R2
 * incremental cache per https://opennext.js.org/cloudflare/caching.
 */
export default defineCloudflareConfig();
