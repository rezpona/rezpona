// Turn a review into the topic labels the analytics page groups by.
//
// The reply engine already works out what a guest talked about in order to write
// back about it, so topics come from that same analysis rather than a second,
// separate keyword list that would disagree with it.
import { analyse } from "./reply-engine.js";

const TOPIC: Record<string, string> = {
  risotto: "Food", pasta: "Food", pizza: "Food", steak: "Food", burger: "Food",
  fish: "Food", dessert: "Food", breakfast: "Food", food: "Food",
  coffee: "Drinks", wine: "Drinks", cocktail: "Drinks",
  team: "Service", service: "Service",
  wait: "Wait time", table: "Wait time", queue: "Wait time",
  room: "Room", bed: "Room", bathroom: "Room", pool: "Room", spa: "Room",
  view: "Atmosphere", atmosphere: "Atmosphere", music: "Atmosphere",
  parking: "Location", location: "Location",
  cleanliness: "Cleanliness", price: "Value", value: "Value",
};

export function topicsOf(text: string): string[] {
  if (!text) return [];
  const a = analyse(text) as { praise: string[]; issues: string[]; all: string[] };
  const out: string[] = [];
  for (const id of a.praise.concat(a.issues, a.all)) {
    const t = TOPIC[id];
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  return out;
}
