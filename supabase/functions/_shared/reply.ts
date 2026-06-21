// Server-side reply generator (mirror of /assets/reply-engine.js) used by autopilot.
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const STOP: Record<string, string[]> = {
  sr: ["hvala","jako","veoma","osoblje","konobar","ali","hrana","kafa","odlično","preporučujem","bilo","super","ukusno","ćemo"],
  de: ["und","das","sehr","nicht","freundlich","essen","personal","danke","wieder","war","lecker"],
  it: ["molto","personale","cibo","grazie","però","abbiamo","ottimo","tavolo","buono","siamo"],
  es: ["muy","comida","gracias","pero","personal","camarero","bueno","volveremos","estaba"],
  fr: ["très","personnel","merci","mais","était","service","bon","accueil","repas"],
  en: ["the","and","was","very","great","food","staff","service","good","thank"],
};
function detect(text: string): string {
  const t = " " + (text || "").toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ") + " ";
  if (/[ćčđšž]/.test(t)) return "sr";
  let best = "en", score = 0;
  for (const l in STOP) { let c = 0; STOP[l].forEach((w) => { if (t.includes(" " + w + " ")) c++; }); if (c > score) { score = c; best = l; } }
  return best;
}

const T: Record<string, any> = {
  en: { venueTeam: { restaurant: "the kitchen and floor team", hotel: "the front desk and housekeeping team", cafe: "the whole crew" },
    pos: ["Thank you so much for the kind words — it genuinely made our day! We're thrilled you enjoyed your visit and we can't wait to welcome you back.","What a lovely review, thank you! We're so glad everything lived up to expectations and we look forward to seeing you again soon."],
    mix: ["Thank you for the honest and balanced feedback. We're glad parts of your visit stood out, and we've shared your notes with {team} so we keep improving. We'd love to welcome you back."],
    neg: ["We're truly sorry your experience fell short — this isn't the standard we hold ourselves to. Thank you for the honest feedback; please reach out so we can make it right."] },
  sr: { venueTeam: { restaurant: "kuhinju i osoblje u sali", hotel: "recepciju i osoblje", cafe: "celu ekipu" },
    pos: ["Mnogo vam hvala na lepim rečima — zaista ste nam ulepšali dan! Presrećni smo što ste uživali i jedva čekamo da vas ponovo ugostimo.","Kakva divna recenzija, hvala vam! Drago nam je što je sve bilo na nivou i radujemo se vašoj sledećoj poseti."],
    mix: ["Hvala vam na iskrenoj i odmerenoj recenziji. Drago nam je što su pojedini delovi posete bili dobri, a vaše napomene smo preneli {team} kako bismo bili još bolji. Voleli bismo da vas ponovo ugostimo."],
    neg: ["Iskreno nam je žao što vaše iskustvo nije bilo na nivou — to nije standard koji želimo. Hvala na iskrenosti; javite nam se da sve ispravimo."] },
  de: { venueTeam: { restaurant: "die Küche und das Serviceteam", hotel: "die Rezeption und das Housekeeping-Team", cafe: "das ganze Team" },
    pos: ["Vielen Dank für die netten Worte — das hat uns wirklich gefreut! Wir freuen uns, dass es Ihnen gefallen hat, und können es kaum erwarten, Sie wieder begrüßen zu dürfen."],
    mix: ["Vielen Dank für das ehrliche und ausgewogene Feedback. Einiges hat Sie überzeugt, und Ihre Hinweise haben wir an {team} weitergegeben. Wir würden uns freuen, Sie wieder bei uns zu sehen."],
    neg: ["Es tut uns aufrichtig leid, dass Ihr Erlebnis nicht überzeugt hat — das ist nicht unser Anspruch. Danke für Ihre Offenheit; bitte melden Sie sich, damit wir es wiedergutmachen können."] },
  it: { venueTeam: { restaurant: "la cucina e la sala", hotel: "la reception e il team", cafe: "tutto il team" },
    pos: ["Grazie mille per le belle parole — ci avete davvero rallegrato la giornata! Siamo felicissimi che vi siate trovati bene e non vediamo l'ora di rivedervi."],
    mix: ["Grazie per il feedback sincero ed equilibrato. Siamo contenti che alcuni aspetti vi siano piaciuti e abbiamo condiviso le vostre note con {team}. Ci farebbe piacere riavervi."],
    neg: ["Ci dispiace sinceramente che l'esperienza non sia stata all'altezza — non è il nostro standard. Grazie per la franchezza; contattateci direttamente così possiamo rimediare."] },
  es: { venueTeam: { restaurant: "la cocina y el equipo de sala", hotel: "la recepción y el equipo", cafe: "todo el equipo" },
    pos: ["¡Muchísimas gracias por tus amables palabras, nos has alegrado el día! Nos encanta que disfrutaras y deseamos volver a recibirte pronto."],
    mix: ["Gracias por tu reseña sincera y equilibrada. Nos alegra que algunas cosas destacaran y hemos compartido tus comentarios con {team}. Nos encantaría volver a verte."],
    neg: ["Sentimos de verdad que tu experiencia no estuviera a la altura — no es nuestro estándar. Gracias por tu sinceridad; escríbenos directamente para poder solucionarlo."] },
  fr: { venueTeam: { restaurant: "la cuisine et l'équipe de salle", hotel: "la réception et l'équipe", cafe: "toute l'équipe" },
    pos: ["Merci beaucoup pour ces mots gentils — vous avez illuminé notre journée ! Ravis que vous ayez apprécié, nous avons hâte de vous revoir."],
    mix: ["Merci pour cet avis honnête et équilibré. Certains points vous ont plu et nous avons transmis vos remarques à {team}. Nous serions ravis de vous accueillir à nouveau."],
    neg: ["Nous sommes sincèrement désolés que votre expérience n'ait pas été à la hauteur — ce n'est pas notre standard. Merci de votre franchise ; contactez-nous directement pour que nous puissions y remédier."] },
};

export function generateReply(
  { rating, comment = "", venue = "restaurant", signature = "" }:
  { rating: number | null; comment?: string; venue?: string; signature?: string },
): string {
  let lang = detect(comment);
  if (lang === "hr" || lang === "bs") lang = "sr";
  const L = T[lang] || T.en;
  const team = (L.venueTeam && L.venueTeam[venue]) || T.en.venueTeam[venue] || "our team";
  let bucket: "pos" | "mix" | "neg";
  if (rating == null) bucket = comment ? "mix" : "pos";
  else if (rating >= 4) bucket = "pos";
  else if (rating === 3) bucket = "mix";
  else bucket = "neg";
  let text = (pick(L[bucket]) as string).replace("{team}", team);
  if (signature && signature.trim()) text += "\n\n" + signature.trim();
  return text;
}
