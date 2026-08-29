import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  cp(new URL("../index.html", import.meta.url), new URL("index.html", outputDirectory)),
  cp(new URL("../styles.css", import.meta.url), new URL("styles.css", outputDirectory)),
  cp(new URL("../.nojekyll", import.meta.url), new URL(".nojekyll", outputDirectory)),
  cp(new URL("../src/", import.meta.url), new URL("src/", outputDirectory), { recursive: true })
]);

console.log("GitHub Pages site built in dist/");
