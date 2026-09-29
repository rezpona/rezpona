// Server-side reply generator used by autopilot.
//
// This used to be a hand-maintained copy of the browser engine, and it drifted:
// six languages instead of thirty-seven, and every template carried an em dash,
// which is the single clearest tell that a reply was not typed by a person. A
// guest would have seen one wording in the dashboard and a different one on
// Google. So the wording now comes from ONE source: ./reply-engine.js, generated
// from /assets/reply-engine.js by `node sync-engine.js` at the repo root.
//
// Do not add wording here. Edit the browser engine and re-run that script.
// The generated module is plain JS, so TypeScript infers its parameter shape from
// the destructuring defaults and misses `rating`, which has none. Declaring the
// call signature here is what the rest of the codebase type-checks against.
import { generate as rawGenerate } from "./reply-engine.js";

const generate = rawGenerate as (opts: {
  rating?: number | null;
  comment?: string;
  venue?: string;
  author?: string;
  signature?: string;
}) => string;

export function generateReply(
  { rating, comment = "", venue = "restaurant", author = "", signature = "" }:
  { rating: number | null; comment?: string; venue?: string; author?: string; signature?: string },
): string {
  return generate({ rating, comment, venue, author, signature });
}
