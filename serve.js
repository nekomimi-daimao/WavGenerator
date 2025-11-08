// deno --allow-net --allow-read --watch=. serve.js
// http://localhost:4410/

import { serveDir } from "jsr:@std/http@1";

Deno.serve({ port: 4410 }, request => serveDir(request, { fsRoot: "./docs", urlRoot: ""}));
