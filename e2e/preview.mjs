import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 4173);
const routes = new Map([
  ["/live-canvas", [new URL("live-canvas/index.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/live-canvas-picker.js", [new URL("../.unship/live-canvas/picker.js", import.meta.url), "text/javascript; charset=utf-8"]],
  ["/live-canvas-app.js", [new URL("../.unship/live-canvas/app.js", import.meta.url), "text/javascript; charset=utf-8"]],
  ["/", [new URL("playground.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/motion", [new URL("motion-study.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/canvas", [new URL("canvas-fixture.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/unship-picker.js", [new URL("../src/picker/unship-picker.js", import.meta.url), "text/javascript; charset=utf-8"]]
]);
const server = createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, "http://localhost").pathname);
  if (!route) { response.writeHead(404); response.end("Not found"); return; }
  try {
    let body = await readFile(route[0], "utf8");
    if (route[1].startsWith("text/html")) {
      const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
      body = body.replaceAll("__UNSHIP_VERSION__", pkg.version);
    }
    response.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    console.error(error);
    response.writeHead(500); response.end("Unable to load preview");
  }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  console.log(`Unship playground: http://127.0.0.1:${server.address().port}`);
  console.log(`Fixture: ${fileURLToPath(new URL("playground.html", import.meta.url))}`);
  console.log("Serving the current checkout. Refresh after editing. Ctrl+C to stop.");
});
