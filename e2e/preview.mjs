import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.PORT || 4173);
const routes = new Map([
  ["/live-canvas", [new URL("live-canvas/index.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/live-canvas-picker.js", [new URL("../.unship/live-canvas/picker.js", import.meta.url), "text/javascript; charset=utf-8"]],
  ["/live-canvas-app.js", [new URL("../.unship/live-canvas/app.js", import.meta.url), "text/javascript; charset=utf-8"]],
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/") { response.writeHead(302, { Location: "/live-canvas" }); response.end(); return; }
  const route = routes.get(path);
  if (!route) { response.writeHead(404); response.end("Not found"); return; }
  try {
    const body = await readFile(route[0], "utf8");
    response.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    console.error(error);
    response.writeHead(500); response.end("Unable to load preview");
  }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  console.log(`Unship live Canvas test fixture: http://127.0.0.1:${server.address().port}`);
  console.log("Serving the current checkout. Refresh after editing. Ctrl+C to stop.");
});
