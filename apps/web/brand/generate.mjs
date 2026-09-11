import { markPath } from "./geometry.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
writeFileSync(
  new URL("app/icon.svg", root),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#f4f3ed"/><path d="${markPath}" fill="#202820" fill-rule="nonzero"/></svg>\n`,
);
const file = new URL("public/brand/orbit.svg", root);
let svg = readFileSync(file, "utf8");
svg = svg.replace(
  /<path d="[^"]+" fill="#8f391d"[^>]*\/>/,
  `<path d="${markPath}" fill="#8f391d" transform="translate(-114 -122) scale(2.4)" fill-rule="nonzero"/>`,
);
svg = svg.replace(
  /<path d="[^"]+" fill="url\(#orange\)"(?: transform="[^"]*")? fill-rule="(?:evenodd|nonzero)"[^>]*\/>/,
  `<path d="${markPath}" fill="url(#orange)" transform="translate(-120 -130) scale(2.4)" fill-rule="nonzero" stroke="#ffb18c" stroke-width=".4"/>`,
);
writeFileSync(file, svg);
