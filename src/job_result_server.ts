import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_errors.js";
import { recordScheduledResult } from "./marketplace_handoff.js";

const port = Number(process.env.PORT ?? 3000);

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/scheduled-job-results") {
    json(response, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    json(response, 200, { ok: true, decision: await recordScheduledResult(body) });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      json(response, 400, { ok: false, error: "Invalid scheduled job result" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { ok: false, error: error.message, code: error.code });
      return;
    }
    json(response, 502, { ok: false, error: "Job result could not be recorded" });
  }
}).listen(port, () => console.log(`Job result service listening on http://localhost:${port}`));
