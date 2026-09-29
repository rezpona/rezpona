// GENERATED FILE - do not edit.
// Produced from /assets/reply-engine.js by `node sync-engine.js`.
// The dashboard and the autopilot must word replies identically, so both sides
// come from that single source. Edit the browser file, then re-run the script.
// deno-lint-ignore-file
// @ts-nocheck

/* Rezpona reply engine
 *
 * Writes a reply to a Google review the way a busy owner actually writes one:
 * short, specific, and different every time.
 *
 *   RezponaReply.generate({ rating, comment, venue, author, signature })
 *
 * Design rules (this is the product's whole differentiator):
 *   1. NO em dashes, ever. They are the single clearest "a machine wrote this" tell.
 *   2. Vary the SHAPE, not just the words. A real person sometimes writes one line
 *      and sometimes three, so we randomise which parts appear at all.
 *   3. Say the thing back. If the guest mentions the risotto, the reply says risotto.
 *   4. No corporate filler: "we strive", "rest assured", "valued guest", "thrilled".
 *   5. Reply in the language the guest used.
 */

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const maybe = (p) => Math.random() < p;          // include a part only sometimes

  /* ============================================================
     1. LANGUAGE DETECTION
     ============================================================ */
  const STOP = {
    sr: ['hvala','jako','veoma','osoblje','konobar','ali','hrana','kafa','bilo','super','ukusno','ćemo','nije','smo','sve','baš'],
    de: ['und','das','sehr','nicht','freundlich','essen','personal','danke','wieder','war','lecker','sind','ist','für'],
    it: ['molto','personale','cibo','grazie','però','abbiamo','ottimo','tavolo','buono','siamo','che','non','una'],
    es: ['muy','comida','gracias','pero','personal','camarero','bueno','volveremos','estaba','una','fue','nos'],
    fr: ['très','personnel','merci','mais','était','service','bon','accueil','repas','nous','une','avec'],
    pt: ['muito','comida','obrigado','mas','foi','pessoal','quarto','ótimo','uma','está'],
    nl: ['heel','het','was','niet','vriendelijk','kamer','eten','personeel','maar','erg','lekker'],
    pl: ['bardzo','obsługa','pokój','jedzenie','ale','dziękuję','było','świetnie','polecam','nie'],
    cs: ['velmi','obsluha','pokoj','jídlo','ale','děkuji','bylo','skvělé','doporučuji','jsme'],
    sk: ['veľmi','obsluha','izba','jedlo','ale','ďakujem','bolo','skvelé','odporúčam','sme'],
    sl: ['zelo','ampak','osebje','priporočam','prijazno','sem','lahko','prosim','soba'],
    hu: ['nagyon','személyzet','szoba','étel','köszönöm','volt','kiszolgálás','ajánlom','nem'],
    ro: ['foarte','personalul','mâncarea','camera','mulțumesc','dar','serviciul','recomand','este'],
    tr: ['çok','personel','oda','yemek','teşekkür','ama','güzel','harika','servis','bir'],
    sq: ['shumë','stafi','dhoma','ushqimi','faleminderit','por','ishte','shërbimi','nuk'],
    sv: ['mycket','personalen','rummet','maten','tack','men','var','utmärkt','inte','och'],
    no: ['veldig','personalet','rommet','maten','takk','men','var','utmerket','ikke','og'],
    da: ['meget','personalet','værelset','maden','tak','men','var','fremragende','ikke','og'],
    fi: ['erittäin','henkilökunta','huone','ruoka','kiitos','mutta','oli','erinomainen','ei'],
    et: ['väga','personal','tuba','toit','aitäh','aga','oli','suurepärane','ei'],
    lv: ['ļoti','personāls','istaba','ēdiens','paldies','bet','bija','lieliski','nav'],
    lt: ['labai','personalas','kambarys','maistas','ačiū','bet','buvo','puikiai','ne'],
    id: ['sangat','staf','kamar','makanan','terima','tapi','enak','pelayanan','tidak'],
    vi: ['rất','nhân','phòng','cảm','nhưng','tuyệt','dịch','ngon','không'],
    en: ['the','and','was','very','great','food','staff','service','good','thank','we','with'],
  };

  /* Google hands back a machine translation stapled to the review:
   *
   *   (Translated by Google) A solid place... (Original) Lugar sólido...
   *
   * Left alone, the detector reads the English half and answers a Spanish guest
   * in English, which is exactly the thing a guest notices. Everything downstream
   * should see only what the person actually wrote, so this runs before language
   * detection and before the wording analysis.
   *
   * The markers arrive in the caller's locale, so the Google Business Profile API
   * gives us the English ones; the others are here because the same text reaches
   * us through other paths too. The check is deliberately loose: if no marker is
   * found the text is returned untouched.
   */
  const ORIGINAL_RE = new RegExp(
    '\\((?:Original|Originale|Original text|Originalni tekst|Оригинал)\\)\\s*([\\s\\S]+)$',
    'i',
  );
  const TRANSLATED_RE = new RegExp(
    '^\\s*\\((?:Translated by Google|Traduit par Google|Übersetzt von Google|' +
    'Tradotto da Google|Traducido por Google|Prevedeno s Googleom)\\)\\s*',
    'i',
  );

  function originalText(text) {
    const s = text || '';
    const m = s.match(ORIGINAL_RE);
    if (m && m[1].trim()) return m[1].trim();
    // Translated, but Google gave no original half: strip the marker at least.
    return s.replace(TRANSLATED_RE, '').trim() || s;
  }

  function detect(text) {
    const s = originalText(text);
    // Scripts are unambiguous, so check them first.
    if (/[가-힣]/.test(s)) return 'ko';
    if (/[぀-ヿ]/.test(s)) return 'ja';
    if (/[一-鿿]/.test(s)) return 'zh';
    if (/[฀-๿]/.test(s)) return 'th';
    if (/[ऀ-ॿ]/.test(s)) return 'hi';
    if (/[؀-ۿ]/.test(s)) return 'ar';
    if (/[֐-׿]/.test(s)) return 'he';
    if (/[Ͱ-Ͽ]/.test(s)) return 'el';

    const t = ' ' + s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';

    if (/[Ѐ-ӿ]/.test(s)) {
      const CYR = {
        uk: ['та','що','дуже','дякую','але','було'],
        bg: ['много','благодаря','но','беше','храна','обслужване'],
        mk: ['многу','фала','ама','беше','храна','услуга'],
        sr: ['хвала','али','било','особље','соба','врло'],
        ru: ['очень','спасибо','но','было','отлично','еда'],
      };
      let b = 'ru', sc = 0;
      for (const l in CYR) { let c = 0; CYR[l].forEach(w => { if (t.includes(' ' + w + ' ')) c++; }); if (c > sc) { sc = c; b = l; } }
      return b;
    }

    const score = {};
    for (const l in STOP) { let c = 0; STOP[l].forEach(w => { if (t.includes(' ' + w + ' ')) c++; }); score[l] = c; }
    let best = 'en', top = score.en || 0;
    for (const l in score) { if (l !== 'en' && score[l] > top) { top = score[l]; best = l; } }

    // Diacritics settle the close calls between neighbours.
    if (/[ćđ]/.test(t)) best = 'sr';
    if (/[ąęłńśźż]/.test(t)) best = 'pl';
    if (/[ăâîșț]/.test(t) && best !== 'tr') best = 'ro';
    if (/[őű]/.test(t)) best = 'hu';
    if (/[ğış]/.test(t) && /[çö]/.test(t)) best = 'tr';
    return best;
  }

  /* ============================================================
     2. WHAT DID THE GUEST ACTUALLY TALK ABOUT?
     ============================================================ */
  const ITEMS = [
    [['risotto','rižot','rizot'], 'risotto'],
    [['pasta','spaghetti','carbonara','tagliatelle','pastu','nudeln','pâtes'], 'pasta'],
    [['pizza','pizzu'], 'pizza'],
    [['steak','biftek','bistecca','filete','ribeye'], 'steak'],
    [['burger','burgeri'], 'burger'],
    [['dessert','cake','tiramisu','desert','kolač','torta','nachtisch','dolce','postre'], 'dessert'],
    [['coffee','espresso','cappuccino','latte','kafa','kafu','kava','kaffee','caffè','café'], 'coffee'],
    [['wine','vino','wein','vin','prosecco'], 'wine'],
    [['breakfast','doručak','frühstück','colazione','desayuno'], 'breakfast'],
    [['room','suite','bed','soba','sobu','krevet','zimmer','camera','habitación','chambre'], 'room'],
    [['view','pogled','aussicht','vista','vue'], 'view'],
    [['pool','bazen','piscina','piscine'], 'pool'],
    [['spa','wellness'], 'spa'],
    [['atmosphere','ambiance','ambience','vibe','atmosfera','ambijent','atmosphäre','ambiente'], 'atmosphere'],
    [['staff','waiter','waitress','server','team','barista','osoblje','konobar','personal','bedienung','cameriere','camarero','serveur'], 'team'],
    [['service','usluga','uslugu','servizio','servicio'], 'service'],
    [['wait','waited','queue','čekanje','čekali','warten','gewartet','attesa','espera','attente'], 'wait'],
    [['reservation','booking','booked','table','sto','rezervacija','tisch','tavolo','mesa'], 'table'],
    [['clean','dirty','spotless','čisto','prljav','sauber','schmutzig','pulito','sporco','limpio','propre'], 'cleanliness'],
    [['price','value','expensive','cijena','cena','skupo','preis','prezzo','precio','prix'], 'value'],
    [['food','meal','dish','taste','hrana','hranu','jelo','ukus','essen','cibo','comida','cuisine'], 'food'],
  ];

  // A plain substring test is not safe here: "vin" (wine) hides inside "having",
  // and "spa" inside "space". So a keyword must start a word. Long keywords may
  // still carry an inflected ending ("hran" matches "hrana" and "hranu"), while
  // short ones have to match the whole word.
  const wordCache = new Map();
  function hasWord(text, key) {
    let re = wordCache.get(key);
    if (!re) {
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tail = key.length <= 4 ? '(?![\\p{L}])' : '';
      re = new RegExp('(^|[^\\p{L}])' + esc + tail, 'iu');
      wordCache.set(key, re);
    }
    return re.test(text);
  }

  function findItems(text) {
    const t = (text || '').toLowerCase();
    const out = [];
    for (const [keys, id] of ITEMS) {
      if (out.includes(id)) continue;
      for (const k of keys) { if (hasWord(t, k)) { out.push(id); break; } }
    }
    return out;
  }

  /* ============================================================
     3. SENTIMENT (with negation, so "not good" is not a compliment)
     ============================================================ */
  const POS = ['great','amazing','excellent','love','loved','perfect','best','delicious','wonderful','fantastic','lovely','nice','good','friendly','recommend','cosy','cozy','tasty','superb','brilliant',
    'odlič','izvrs','sjajn','ukus','ljubaz','divn','preporu','super','savrš','prijat','vrhuns','dobr','čist','predivn',
    'gut','lecker','freundlich','toll','schön','perfekt','empfehl','sauber','wunderbar','hervorrag',
    'ottim','buon','squisit','gentil','consigl','delizios','perfett','accogli','meravigli',
    'excelent','delicios','amable','recomien','perfect','maravillos','encant','estupend',
    'délici','aimable','recommand','parfait','chaleureux','merveilleux','agréable'];

  const NEG = ['bad','terrible','awful','worst','horrible','disappointing','disappointed','slow','cold','rude','dirty','poor','mediocre','overpriced','bland','ignored','noisy','avoid',
    'loš','grozn','užasn','razočar','spor','hladn','bezobraz','prljav','skup','bljutav','katastrof','očajn','presporo','predugo',
    'schlecht','furchtbar','enttäuscht','langsam','kalt','unfreundlich','schmutzig','teuer',
    'terribile','pessim','delus','lento','freddo','scortese','sporco','caro',
    'malo','terrible','pésim','decepcion','lento','frío','grosero','sucio','caro',
    'mauvais','terrible','déçu','lent','froid','impoli','sale','cher'];

  const NEGATORS = new Set(['ne','nije','nisu','nismo','nisam','nikako','nimalo','bez','not','no','never','without','nicht','kein','keine','nie','ohne','non','mai','senza','nao','não','nunca','sem','niet','geen','nooit','nie','nu','nem','inte','ikke','ei','не','нет','δεν','değil']);

  const UNIV_POS = ['super','perfect','wow','😍','🥰','👍','❤','♥','💯','🔥','😊','⭐','5/5','10/10'];
  const UNIV_NEG = ['👎','😡','🤮','💩','😞','0/5','1/5'];

  function analyse(raw) {
    const text = originalText(raw);
    const t = text.toLowerCase();
    const clauses = text.split(/\s+(?:but|however|although|ali|aber|ma|però|pero|mais)\s+|[;.]\s+/i);
    let p = 0, n = 0;
    const praise = [], issues = [];

    clauses.forEach((c) => {
      const lc = c.toLowerCase();
      const toks = lc.split(/[^\p{L}'']+/u).filter(Boolean);
      const negated = toks.some((w) => NEGATORS.has(w)) || /n['']t\b/.test(lc);

      let cp = 0, cn = 0;
      POS.forEach((w) => { if (lc.includes(w)) { negated ? cn++ : cp++; } });
      NEG.forEach((w) => { if (lc.includes(w) && !negated) cn++; });
      UNIV_POS.forEach((w) => { if (lc.includes(w)) { negated ? cn++ : cp++; } });
      UNIV_NEG.forEach((w) => { if (lc.includes(w)) cn++; });

      // "We waited 40 minutes" carries no negative adjective, but nobody writes it
      // as a compliment. Same for queues and things arriving cold.
      if (!negated && (/\b\d{2,}\s*(min|minut)/.test(lc) ||
          /(long|forever|ages)\s+(wait|queue|time)|waited\s+\d|still waiting|predugo|presporo|zu lange|troppo tempo|mucho tiempo|trop long/.test(lc))) cn++;

      p += cp; n += cn;
      const found = findItems(c);
      if (cn > cp) found.forEach((i) => { if (!issues.includes(i)) issues.push(i); });
      else if (cp > 0) found.forEach((i) => { if (!praise.includes(i)) praise.push(i); });
    });

    const all = findItems(text);
    return { p, n, praise, issues, all, text: t };
  }

  /* ============================================================
     4. HOW EACH LANGUAGE NAMES THINGS
     Serbian entries are accusative so they slot into "pohvalili X".
     ============================================================ */
  const NOUN = {
    en: { risotto:'the risotto', pasta:'the pasta', pizza:'the pizza', steak:'the steak', burger:'the burger', dessert:'dessert', coffee:'the coffee', wine:'the wine', breakfast:'breakfast', room:'the room', view:'the view', pool:'the pool', spa:'the spa', atmosphere:'the atmosphere', team:'the team', service:'the service', wait:'the wait', table:'the table', cleanliness:'how clean it was', value:'the price', food:'the food' },
    sr: { risotto:'rižoto', pasta:'pastu', pizza:'pizzu', steak:'biftek', burger:'burger', dessert:'desert', coffee:'kafu', wine:'vino', breakfast:'doručak', room:'sobu', view:'pogled', pool:'bazen', spa:'spa', atmosphere:'ambijent', team:'osoblje', service:'uslugu', wait:'čekanje', table:'sto', cleanliness:'čistoću', value:'cenu', food:'hranu' },
    de: { risotto:'das Risotto', pasta:'die Pasta', pizza:'die Pizza', steak:'das Steak', burger:'der Burger', dessert:'der Nachtisch', coffee:'der Kaffee', wine:'der Wein', breakfast:'das Frühstück', room:'das Zimmer', view:'die Aussicht', pool:'der Pool', spa:'der Spa', atmosphere:'die Atmosphäre', team:'das Team', service:'der Service', wait:'die Wartezeit', table:'der Tisch', cleanliness:'die Sauberkeit', value:'der Preis', food:'das Essen' },
    it: { risotto:'il risotto', pasta:'la pasta', pizza:'la pizza', steak:'la bistecca', burger:'il burger', dessert:'il dolce', coffee:'il caffè', wine:'il vino', breakfast:'la colazione', room:'la camera', view:'la vista', pool:'la piscina', spa:'la spa', atmosphere:"l'atmosfera", team:'il team', service:'il servizio', wait:"l'attesa", table:'il tavolo', cleanliness:'la pulizia', value:'il prezzo', food:'il cibo' },
    es: { risotto:'el risotto', pasta:'la pasta', pizza:'la pizza', steak:'el filete', burger:'la hamburguesa', dessert:'el postre', coffee:'el café', wine:'el vino', breakfast:'el desayuno', room:'la habitación', view:'las vistas', pool:'la piscina', spa:'el spa', atmosphere:'el ambiente', team:'el equipo', service:'el servicio', wait:'la espera', table:'la mesa', cleanliness:'la limpieza', value:'el precio', food:'la comida' },
    fr: { risotto:'le risotto', pasta:'les pâtes', pizza:'la pizza', steak:'le steak', burger:'le burger', dessert:'le dessert', coffee:'le café', wine:'le vin', breakfast:'le petit-déjeuner', room:'la chambre', view:'la vue', pool:'la piscine', spa:'le spa', atmosphere:"l'ambiance", team:"l'équipe", service:'le service', wait:"l'attente", table:'la table', cleanliness:'la propreté', value:'le prix', food:'la cuisine' },
  };

  const AND = { en:'and', sr:'i', de:'und', it:'e', es:'y', fr:'et' };

  function nameThings(ids, lang) {
    const map = NOUN[lang]; if (!map) return '';
    // One thing only: two subjects would break verb agreement in most of these
    // languages, and a person naming a single dish reads more naturally anyway.
    const names = ids.map((i) => map[i]).filter(Boolean);
    return names[0] || '';
  }

  /* ============================================================
     5. THE WORDS
     Each bucket holds SHORT fragments. The assembler decides how many
     to use, so the same review never produces the same shape twice.
     ============================================================ */
  const RICH = {
    en: {
      thanksPos: ['Thank you so much!', 'Thanks for this, really.', 'What a nice thing to read, thank you!', 'Thanks a lot for taking the time.', 'This made our morning, thank you!'],
      gladItem: ['So glad you enjoyed {x}.', 'Really pleased {x} worked for you.', 'Happy to hear {x} landed well.', 'Glad {x} hit the spot.'],
      gladPlain: ['Really glad you had a good time.', 'Happy it all came together for you.', 'Glad you enjoyed it.'],
      passOn: ['I will pass this on to the team.', 'The team will be glad to hear it.', 'Passing this straight to the kitchen.'],
      comeBack: ['Hope to see you again soon.', 'See you next time!', 'Come back soon.', 'We will be here whenever you fancy it.'],

      sorry: ['I am sorry about this.', 'Sorry to read this.', 'That is really not good enough, sorry.', 'Apologies, this is not how it should have gone.'],
      sorryItem: ['Sorry about {x}, that is on us.', '{X} should not have let you down.', 'You are right about {x}, we got that wrong.'],
      fixing: ['I have spoken to the team about it.', 'We are sorting it out.', 'It is being looked at today.', 'I am looking into what happened.'],
      reachOut: ['If you get in touch I would like to make it right.', 'Drop us a line and I will sort it out.', 'Please reach out so I can put this right.'],

      thanksMix: ['Thanks for the honest review.', 'Appreciate you being straight with us.', 'Thanks for the balanced feedback.'],
      mixGood: ['Glad {x} was good.', 'Happy {x} worked out.'],
      mixBad: ['You are right about {x}, we are on it.', 'Fair point on {x}, we are working on it.', 'Noted on {x}, that needs fixing.'],
      mixBack: ['Hope you will give us another go.', 'Would be good to get it fully right next time.', 'Come back and let us do better.'],
    },

    sr: {
      thanksPos: ['Hvala vam puno!', 'Hvala na lepim rečima!', 'Baš nam je drago, hvala!', 'Hvala što ste izdvojili vreme.', 'Ovo nam je ulepšalo dan, hvala!'],
      gladItem: ['Drago mi je što ste pohvalili {x}.', 'Baš mi je drago da ste izdvojili {x}.', 'Lepo je čuti da ste pohvalili {x}.'],
      gladPlain: ['Drago nam je što vam je bilo lepo.', 'Radujemo se što je sve bilo kako treba.', 'Drago nam je da ste uživali.'],
      passOn: ['Preneću ekipi.', 'Osoblju će biti drago da čuje.', 'Prosleđujem kuhinji.'],
      comeBack: ['Vidimo se uskoro!', 'Očekujemo vas ponovo.', 'Navratite nam opet.', 'Tu smo kad god poželite.'],

      sorry: ['Žao mi je zbog ovoga.', 'Izvinjavamo se, ovo nije uobičajeno za nas.', 'Nije trebalo tako da bude, izvinite.'],
      sorryItem: ['Žao mi je zbog {x}, to je naš propust.', 'U pravu ste za {x}, tu smo pogrešili.'],
      fixing: ['Razgovarao sam sa timom o tome.', 'Već radimo na tome.', 'Proveravamo šta se desilo.'],
      reachOut: ['Javite nam se da to ispravimo.', 'Kontaktirajte nas, rado ćemo nadoknaditi.', 'Pišite nam pa da rešimo.'],

      thanksMix: ['Hvala na iskrenoj recenziji.', 'Cenimo što ste otvoreni.', 'Hvala što ste podelili utisak.'],
      mixGood: ['Drago mi je da je {x} bilo dobro.', 'Lepo je čuti za {x}.'],
      mixBad: ['U pravu ste za {x}, radimo na tome.', 'Primedbu na {x} smo zabeležili.'],
      mixBack: ['Nadam se da ćete nam dati još jednu priliku.', 'Svratite opet, biće bolje.'],
    },

    de: {
      thanksPos: ['Vielen Dank!', 'Danke für die netten Worte!', 'Das freut uns sehr, danke!', 'Danke, dass Sie sich die Zeit genommen haben.'],
      gladItem: ['Schön, dass {x} überzeugt hat.', 'Freut mich, dass {x} gepasst hat.', 'Besonders schön, dass {x} gut angekommen ist.'],
      gladPlain: ['Schön, dass es Ihnen gefallen hat.', 'Freut uns, dass alles gepasst hat.', 'Toll, dass der Besuch rundum gestimmt hat.'],
      passOn: ['Ich gebe das gern ans Team weiter.', 'Das Team wird sich freuen.'],
      comeBack: ['Bis bald!', 'Wir freuen uns auf Ihren nächsten Besuch.', 'Schauen Sie gern wieder vorbei.'],

      sorry: ['Das tut mir leid.', 'Entschuldigen Sie bitte.', 'So sollte es nicht laufen, sorry.'],
      sorryItem: ['{X} hätte so nicht sein dürfen, das tut mir leid.', 'Dass {x} nicht gepasst hat, ist unser Fehler.', '{X} war nicht in Ordnung, da haben Sie völlig recht.'],
      fixing: ['Ich habe mit dem Team gesprochen.', 'Wir kümmern uns darum.', 'Wir gehen dem nach.'],
      reachOut: ['Melden Sie sich gern, dann mache ich es wieder gut.', 'Schreiben Sie uns, wir finden eine Lösung.'],

      thanksMix: ['Danke für die ehrliche Rückmeldung.', 'Danke, dass Sie offen sind.', 'Danke für das ausgewogene Feedback.'],
      mixGood: ['Schön, dass {x} gut war.', 'Freut mich, dass {x} gestimmt hat.'],
      mixBad: ['{X} muss besser werden, da haben Sie recht.', 'Dass {x} nicht überzeugt hat, nehmen wir mit.'],
      mixBack: ['Ich hoffe, Sie geben uns noch eine Chance.', 'Beim nächsten Mal machen wir es besser.'],
    },

    it: {
      thanksPos: ['Grazie mille!', 'Grazie per le belle parole!', 'Che piacere leggere questo, grazie!', 'Grazie per aver trovato il tempo.'],
      gladItem: ['Sono contento che {x} vi sia piaciuto.', 'Felice che {x} abbia convinto.'],
      gladPlain: ['Sono felice che vi siate trovati bene.', 'Contento che sia andato tutto bene.'],
      passOn: ['Lo dirò al team.', 'Il team sarà contento di saperlo.'],
      comeBack: ['A presto!', 'Vi aspettiamo di nuovo.', 'Tornate a trovarci.'],

      sorry: ['Mi dispiace molto.', 'Ci scusiamo, non doveva andare così.'],
      sorryItem: ['Mi dispiace per {x}, è colpa nostra.', 'Avete ragione su {x}, abbiamo sbagliato.'],
      fixing: ['Ne ho parlato con il team.', 'Ci stiamo lavorando.'],
      reachOut: ['Scriveteci, vorrei rimediare.', 'Contattateci e sistemiamo la cosa.'],

      thanksMix: ['Grazie per la recensione sincera.', 'Apprezzo la vostra franchezza.'],
      mixGood: ['Sono contento che {x} sia andato bene.', 'Bene che {x} vi sia piaciuto.'],
      mixBad: ['Avete ragione su {x}, ci stiamo lavorando.', 'Su {x} dobbiamo migliorare, avete ragione.'],
      mixBack: ['Spero ci darete un\'altra occasione.'],
    },

    es: {
      thanksPos: ['¡Muchas gracias!', '¡Gracias por las bonitas palabras!', '¡Qué alegría leer esto, gracias!', 'Gracias por dedicar un momento.'],
      gladItem: ['Me alegra que {x} os gustara.', 'Contento de que {x} funcionara.'],
      gladPlain: ['Me alegra que lo pasarais bien.', 'Contento de que todo saliera bien.'],
      passOn: ['Se lo diré al equipo.', 'Al equipo le hará ilusión saberlo.'],
      comeBack: ['¡Hasta pronto!', 'Os esperamos de nuevo.', 'Volved cuando queráis.'],

      sorry: ['Lo siento mucho.', 'Pedimos disculpas, no debería haber pasado.'],
      sorryItem: ['Siento lo de {x}, es cosa nuestra.', 'Tenéis razón con {x}, nos equivocamos.'],
      fixing: ['Lo he hablado con el equipo.', 'Estamos en ello.'],
      reachOut: ['Escribidnos y lo arreglo.', 'Poneos en contacto y lo compensamos.'],

      thanksMix: ['Gracias por la reseña sincera.', 'Agradezco vuestra franqueza.'],
      mixGood: ['Me alegra que {x} estuviera bien.', 'Bien que {x} os gustara.'],
      mixBad: ['Tenéis razón con {x}, estamos trabajando en ello.', 'En {x} tenemos que mejorar, lleváis razón.'],
      mixBack: ['Espero que nos deis otra oportunidad.'],
    },

    fr: {
      thanksPos: ['Merci beaucoup !', 'Merci pour ces gentils mots !', 'Quel plaisir de lire ça, merci !', 'Merci d\'avoir pris le temps.'],
      gladItem: ['Ravi que {x} vous ait plu.', 'Content que {x} ait fait mouche.'],
      gladPlain: ['Ravi que vous ayez passé un bon moment.', 'Content que tout se soit bien passé.'],
      passOn: ['Je transmets à l\'équipe.', 'L\'équipe sera contente de l\'entendre.'],
      comeBack: ['À bientôt !', 'Au plaisir de vous revoir.', 'Repassez quand vous voulez.'],

      sorry: ['Je suis désolé.', 'Navré, cela n\'aurait pas dû se passer ainsi.'],
      sorryItem: ['Désolé pour {x}, c\'est de notre faute.', 'Vous avez raison sur {x}, nous avons raté.'],
      fixing: ['J\'en ai parlé à l\'équipe.', 'Nous y travaillons.'],
      reachOut: ['Écrivez-nous, j\'aimerais réparer ça.', 'Contactez-nous et on arrange ça.'],

      thanksMix: ['Merci pour cet avis honnête.', 'J\'apprécie votre franchise.'],
      mixGood: ['Content que {x} ait été réussi.', 'Ravi que {x} vous ait plu.'],
      mixBad: ['Vous avez raison sur {x}, on s\'en occupe.', 'Sur {x} nous devons faire mieux, vous avez raison.'],
      mixBack: ['J\'espère que vous nous laisserez une autre chance.'],
    },
  };

  /* Short, natural replies for languages without the full grammar model.
     Kept deliberately simple so they stay correct. */
  const SIMPLE = {
    pt: { pos:['Muito obrigado! Ficamos felizes que tenha gostado. Até breve!','Obrigado pelas palavras gentis! Esperamos vê-lo em breve.'], mix:['Obrigado pelo comentário sincero. Já falámos com a equipa. Esperamos vê-lo de novo.','Agradecemos a honestidade. Vamos melhorar isso.'], neg:['Lamento muito. Não foi como devia ter sido. Contacte-nos e resolvemos.','Peço desculpa por isto. Já estamos a tratar do assunto.'] },
    nl: { pos:['Hartelijk dank! Fijn dat het is bevallen. Tot snel!','Dank je wel voor de mooie woorden. Graag tot ziens.'], mix:['Bedankt voor de eerlijke feedback. We pakken het op.','Dank je, goede punten. Daar gaan we mee aan de slag.'], neg:['Het spijt me. Zo hoort het niet te gaan. Neem contact op, dan los ik het op.','Onze excuses. We kijken er meteen naar.'] },
    pl: { pos:['Bardzo dziękujemy! Cieszymy się, że było udanie. Do zobaczenia!','Dziękujemy za miłe słowa. Zapraszamy ponownie.'], mix:['Dziękujemy za szczerą opinię. Pracujemy nad tym.','Dzięki za uwagi, bierzemy je pod uwagę.'], neg:['Bardzo przepraszam. Tak być nie powinno. Proszę o kontakt, naprawimy to.','Przepraszamy za tę sytuację. Już się tym zajmujemy.'] },
    cs: { pos:['Moc děkujeme! Jsme rádi, že se líbilo. Na shledanou!','Děkujeme za milá slova. Těšíme se příště.'], mix:['Děkujeme za upřímnou recenzi. Pracujeme na tom.','Díky za připomínky, bereme je vážně.'], neg:['Moc se omlouvám. Takhle to nemělo být. Ozvěte se, napravíme to.','Omlouváme se. Už to řešíme.'] },
    sk: { pos:['Ďakujeme pekne! Sme radi, že sa páčilo. Dovidenia!','Ďakujeme za milé slová. Tešíme sa nabudúce.'], mix:['Ďakujeme za úprimnú recenziu. Pracujeme na tom.','Vďaka za pripomienky, berieme ich vážne.'], neg:['Veľmi sa ospravedlňujem. Takto to nemalo byť. Ozvite sa, napravíme to.','Ospravedlňujeme sa. Už to riešime.'] },
    sl: { pos:['Najlepša hvala! Veseli nas, da je bilo lepo. Se vidimo!','Hvala za lepe besede. Vabljeni spet.'], mix:['Hvala za iskreno oceno. Delamo na tem.','Hvala za pripombe, jih upoštevamo.'], neg:['Zelo mi je žal. Tako ne bi smelo biti. Javite se, popravimo.','Opravičujemo se. Že urejamo.'] },
    hu: { pos:['Nagyon köszönjük! Örülünk, hogy jól érezte magát. Viszlát!','Köszönjük a kedves szavakat. Várjuk vissza.'], mix:['Köszönjük az őszinte véleményt. Dolgozunk rajta.','Köszönjük az észrevételeket, komolyan vesszük.'], neg:['Nagyon sajnálom. Ennek nem így kellett volna lennie. Keressen meg, rendbe hozzuk.','Elnézést kérünk. Már intézkedünk.'] },
    ro: { pos:['Mulțumim mult! Ne bucurăm că v-a plăcut. Pe curând!','Mulțumim pentru cuvintele frumoase. Vă așteptăm.'], mix:['Mulțumim pentru sinceritate. Lucrăm la asta.','Mulțumim pentru observații, le luăm în serios.'], neg:['Îmi pare foarte rău. Nu așa trebuia să fie. Contactați-ne și reparăm.','Ne cerem scuze. Ne ocupăm deja.'] },
    tr: { pos:['Çok teşekkürler! Beğenmenize sevindik. Görüşmek üzere!','Güzel sözleriniz için teşekkürler. Yine bekleriz.'], mix:['Dürüst yorumunuz için teşekkürler. Üzerinde çalışıyoruz.','Geri bildiriminiz için sağ olun, dikkate alıyoruz.'], neg:['Çok üzgünüm. Böyle olmamalıydı. Bize ulaşın, telafi edelim.','Özür dileriz. Hemen ilgileniyoruz.'] },
    sq: { pos:['Faleminderit shumë! Gëzohemi që ju pëlqeu. Shihemi!','Faleminderit për fjalët e mira. Ju presim përsëri.'], mix:['Faleminderit për sinqeritetin. Po punojmë për këtë.','Faleminderit për vërejtjet, i marrim seriozisht.'], neg:['Më vjen shumë keq. Nuk duhej të ndodhte kështu. Na kontaktoni, do ta ndreqim.','Kërkojmë ndjesë. Po e trajtojmë tashmë.'] },
    sv: { pos:['Tack så mycket! Kul att ni trivdes. Vi ses!','Tack för de fina orden. Välkomna åter.'], mix:['Tack för den ärliga recensionen. Vi jobbar på det.','Tack för synpunkterna, vi tar dem på allvar.'], neg:['Jag är verkligen ledsen. Så ska det inte gå till. Hör av er så löser vi det.','Vi ber om ursäkt. Vi tittar på det direkt.'] },
    no: { pos:['Tusen takk! Hyggelig at dere trivdes. Vi ses!','Takk for de fine ordene. Velkommen tilbake.'], mix:['Takk for den ærlige tilbakemeldingen. Vi jobber med det.','Takk for innspillene, vi tar dem på alvor.'], neg:['Jeg er lei meg. Slik skal det ikke være. Ta kontakt så ordner vi det.','Vi beklager. Vi ser på det med en gang.'] },
    da: { pos:['Mange tak! Dejligt at I hyggede jer. Vi ses!','Tak for de pæne ord. Velkommen igen.'], mix:['Tak for den ærlige anmeldelse. Vi arbejder på det.','Tak for input, vi tager det alvorligt.'], neg:['Det er jeg ked af. Sådan skal det ikke være. Skriv til os, så retter vi op.','Vi undskylder. Vi kigger på det med det samme.'] },
    fi: { pos:['Kiitos paljon! Kiva että viihdyitte. Nähdään!','Kiitos ystävällisistä sanoista. Tervetuloa uudelleen.'], mix:['Kiitos rehellisestä palautteesta. Työstämme asiaa.','Kiitos huomioista, otamme ne vakavasti.'], neg:['Olen pahoillani. Näin ei pitänyt käydä. Ottakaa yhteyttä, korjataan asia.','Pahoittelemme. Selvitämme asiaa heti.'] },
    et: { pos:['Suur aitäh! Rõõm, et meeldis. Näeme!','Aitäh lahkete sõnade eest. Tulge jälle.'], mix:['Aitäh ausa tagasiside eest. Tegeleme sellega.','Aitäh märkuste eest, võtame neid tõsiselt.'], neg:['Mul on väga kahju. Nii ei tohiks olla. Võtke ühendust, teeme korda.','Vabandame. Tegeleme sellega kohe.'] },
    lv: { pos:['Liels paldies! Priecājamies, ka patika. Uz redzēšanos!','Paldies par jaukajiem vārdiem. Gaidīsim atkal.'], mix:['Paldies par godīgo atsauksmi. Strādājam pie tā.','Paldies par piezīmēm, ņemam vērā.'], neg:['Man ļoti žēl. Tā nedrīkstēja būt. Sazinieties, un mēs to izlabosim.','Atvainojamies. Jau risinām.'] },
    lt: { pos:['Labai ačiū! Džiaugiamės, kad patiko. Iki!','Ačiū už gražius žodžius. Laukiame vėl.'], mix:['Ačiū už nuoširdų atsiliepimą. Dirbame prie to.','Ačiū už pastabas, vertiname jas.'], neg:['Labai atsiprašau. Taip neturėjo būti. Susisiekite, ir mes tai ištaisysime.','Atsiprašome. Jau sprendžiame.'] },
    id: { pos:['Terima kasih banyak! Senang Anda menikmatinya. Sampai jumpa!','Terima kasih atas kata-kata baiknya. Ditunggu kembali.'], mix:['Terima kasih atas masukan jujurnya. Sedang kami perbaiki.','Terima kasih, catatan Anda kami perhatikan.'], neg:['Saya mohon maaf. Seharusnya tidak begitu. Hubungi kami, akan kami perbaiki.','Mohon maaf. Kami sedang menanganinya.'] },
    vi: { pos:['Cảm ơn bạn rất nhiều! Rất vui vì bạn hài lòng. Hẹn gặp lại!','Cảm ơn những lời tốt đẹp. Mong được đón bạn lần nữa.'], mix:['Cảm ơn góp ý thẳng thắn. Chúng tôi đang cải thiện.','Cảm ơn bạn, chúng tôi ghi nhận.'], neg:['Tôi rất xin lỗi. Lẽ ra không nên như vậy. Hãy liên hệ để chúng tôi khắc phục.','Thành thật xin lỗi. Chúng tôi đang xử lý.'] },
    el: { pos:['Ευχαριστούμε πολύ! Χαιρόμαστε που το απολαύσατε. Τα λέμε!','Ευχαριστούμε για τα καλά λόγια. Σας περιμένουμε ξανά.'], mix:['Ευχαριστούμε για την ειλικρινή κριτική. Το δουλεύουμε.','Ευχαριστούμε για τις παρατηρήσεις, τις λαμβάνουμε σοβαρά.'], neg:['Λυπάμαι πολύ. Δεν έπρεπε να γίνει έτσι. Επικοινωνήστε μαζί μας να το διορθώσουμε.','Ζητούμε συγγνώμη. Το εξετάζουμε ήδη.'] },
    ru: { pos:['Большое спасибо! Рады, что вам понравилось. До встречи!','Спасибо за тёплые слова. Будем рады видеть снова.'], mix:['Спасибо за честный отзыв. Работаем над этим.','Спасибо за замечания, учтём.'], neg:['Мне очень жаль. Так быть не должно. Напишите нам, всё исправим.','Приносим извинения. Уже разбираемся.'] },
    uk: { pos:['Дуже дякуємо! Раді, що сподобалось. До зустрічі!','Дякуємо за теплі слова. Чекаємо знову.'], mix:['Дякуємо за чесний відгук. Працюємо над цим.','Дякуємо за зауваження, врахуємо.'], neg:['Мені дуже прикро. Так не мало бути. Напишіть нам, виправимо.','Перепрошуємо. Вже розбираємось.'] },
    bg: { pos:['Благодарим много! Радваме се, че ви хареса. До скоро!','Благодарим за милите думи. Заповядайте пак.'], mix:['Благодарим за честния отзив. Работим по въпроса.','Благодарим за бележките, вземаме ги предвид.'], neg:['Много съжалявам. Не трябваше да е така. Свържете се с нас и ще го оправим.','Извиняваме се. Вече се занимаваме с това.'] },
    mk: { pos:['Ви благодариме многу! Драго ни е што уживавте. Се гледаме!','Благодариме за убавите зборови. Ве очекуваме повторно.'], mix:['Благодариме за искрената рецензија. Работиме на тоа.','Благодариме за забелешките, ги земаме предвид.'], neg:['Многу ми е жал. Не требаше така. Контактирајте нè за да поправиме.','Се извинуваме. Веќе се занимаваме со тоа.'] },
    ar: { pos:['شكرًا جزيلًا! سعداء أن الزيارة أعجبتكم. إلى اللقاء!','شكرًا لكلماتكم الطيبة. ننتظركم مجددًا.'], mix:['شكرًا على صراحتكم. نعمل على تحسين ذلك.','شكرًا لملاحظاتكم، نأخذها على محمل الجد.'], neg:['أعتذر بشدة. لم يكن يجب أن يحدث هذا. تواصلوا معنا لنصحح الأمر.','نعتذر. نحن نعالج الأمر الآن.'] },
    he: { pos:['תודה רבה! שמחים שנהניתם. להתראות!','תודה על המילים החמות. נשמח לראותכם שוב.'], mix:['תודה על הביקורת הכנה. אנחנו עובדים על זה.','תודה על ההערות, לוקחים אותן ברצינות.'], neg:['אני מצטער מאוד. זה לא היה אמור לקרות. צרו קשר ונתקן.','אנו מתנצלים. כבר מטפלים בזה.'] },
    zh: { pos:['非常感谢！很高兴您喜欢，期待再次光临！','谢谢您的好评，欢迎再来。'], mix:['谢谢您的坦诚反馈，我们正在改进。','感谢建议，我们会认真对待。'], neg:['非常抱歉，本不该如此。请联系我们，让我们弥补。','向您道歉，我们正在处理。'] },
    ja: { pos:['ありがとうございます！お楽しみいただけて嬉しいです。またお待ちしております。','温かいお言葉をありがとうございます。またのお越しを。'], mix:['率直なご意見ありがとうございます。改善に努めます。','ご指摘ありがとうございます。真摯に受け止めます。'], neg:['大変申し訳ありません。あってはならないことでした。ご連絡いただければ対応いたします。','お詫び申し上げます。すぐに確認いたします。'] },
    ko: { pos:['정말 감사합니다! 즐거우셨다니 기쁩니다. 또 뵙겠습니다!','따뜻한 말씀 감사합니다. 다시 모시겠습니다.'], mix:['솔직한 후기 감사합니다. 개선하고 있습니다.','의견 감사합니다. 진지하게 받아들이겠습니다.'], neg:['정말 죄송합니다. 이래서는 안 되는 일이었습니다. 연락 주시면 바로잡겠습니다.','사과드립니다. 지금 확인하고 있습니다.'] },
    th: { pos:['ขอบคุณมากครับ! ดีใจที่ประทับใจ แล้วพบกันใหม่!','ขอบคุณสำหรับคำชม รอต้อนรับอีกครั้งนะครับ'], mix:['ขอบคุณสำหรับความเห็นตรงไปตรงมา เรากำลังปรับปรุงครับ','ขอบคุณครับ เรารับไว้พิจารณา'], neg:['ต้องขออภัยอย่างยิ่งครับ ไม่ควรเกิดขึ้นเลย ติดต่อเรามาเพื่อแก้ไขนะครับ','ขออภัยครับ เรากำลังตรวจสอบอยู่'] },
    hi: { pos:['बहुत बहुत धन्यवाद! आपको अच्छा लगा, यह जानकर खुशी हुई। फिर मिलेंगे!','आपके अच्छे शब्दों के लिए धन्यवाद। फिर से आइए।'], mix:['ईमानदार समीक्षा के लिए धन्यवाद। हम इस पर काम कर रहे हैं।','सुझावों के लिए धन्यवाद, हम इन्हें गंभीरता से लेंगे।'], neg:['मुझे बहुत खेद है। ऐसा नहीं होना चाहिए था। हमसे संपर्क करें, हम ठीक करेंगे।','क्षमा चाहते हैं। हम देख रहे हैं।'] },
  };

  /* ============================================================
     6. ASSEMBLY
     The shape is randomised so replies never fall into a pattern.
     ============================================================ */
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* A Google reviewer is often not a person: "Mind Fuel", "TRW TRW", "UO & MA
   * L.L.C". Addressing a company as "Mind," reads worse than not using a name at
   * all, and the two mistakes are not symmetrical: a missing name goes unnoticed,
   * a wrong one does not. So this leans towards silence whenever the display name
   * carries any signal of not being a person's.
   */
  const ORG_WORDS = new RegExp(
    '^(?:llc|l\\.l\\.c|ltd|inc|co|corp|gmbh|bv|srl|sarl|doo|d\\.o\\.o|oy|ab|as|kft|sp|sro|' +
    'group|holdings?|studio|studios|media|agency|agencija|solutions|services|systems|labs?|' +
    'team|crew|official|store|shop|cafe|restaurant|hotel|travel|tours|fuel|fitness|gym)$',
    'i',
  );

  function firstName(author) {
    const raw = String(author || '').trim();
    if (!raw) return '';

    const tokens = raw.split(/\s+/);
    if (tokens.length > 2) return '';                       // "UO & MA L.L.C"
    if (/[0-9@_/&|.]/.test(raw)) return '';                 // handles, initials, punctuation
    if (tokens.some((t) => ORG_WORDS.test(t))) return '';   // "Mind Fuel"

    // A repeated token is a placeholder, not a name: "TRW TRW".
    if (tokens.length === 2 && tokens[0].toLowerCase() === tokens[1].toLowerCase()) return '';
    // All caps across the whole name reads as a brand: "TRW TRW", "ACME".
    if (raw === raw.toUpperCase() && /\p{L}{2,}/u.test(raw)) return '';

    const first = tokens[0];
    if (first.length < 2 || first.length > 20) return '';
    if (!/^\p{Lu}\p{Ll}+$/u.test(first)) return '';         // "Marco" yes, "mARCO" or "MM" no
    return first;
  }

  function buildRich(lang, mood, a, author) {
    const L = RICH[lang];
    const parts = [];

    // When a clause was neutral we fall back to "whatever they mentioned", but the
    // same thing must never be praised and criticised in one reply.
    const praiseIds = a.praise.length ? a.praise : a.all;
    const issueIds  = a.issues.length ? a.issues
                                      : a.all.filter((i) => praiseIds.indexOf(i) === -1);
    const praiseStr = nameThings(praiseIds, lang);
    const issueStr  = nameThings(issueIds, lang);

    // {x} lowercase in the middle of a sentence, {X} capitalised at the start of one.
    const fill = (tpl, thing) => tpl.replace(/\{x\}/g, thing).replace(/\{X\}/g, capFirst(thing));

    // "Glad you liked the team. The team will be glad to hear it." reads badly,
    // so skip the hand-off line when the praise IS the team.
    const praisedTeam = a.praise.includes('team') || a.praise.includes('service');

    if (mood === 'pos') {
      parts.push(pick(L.thanksPos));
      if (praiseStr && maybe(0.85)) {
        parts.push(fill(pick(L.gladItem), praiseStr));
      } else if (maybe(0.6)) {
        parts.push(pick(L.gladPlain));
      }
      if (praiseStr && !praisedTeam && maybe(0.35)) parts.push(pick(L.passOn));
      if (maybe(0.7)) parts.push(pick(L.comeBack));

    } else if (mood === 'neg') {
      if (issueStr && maybe(0.75)) {
        parts.push(fill(pick(L.sorryItem), issueStr));
      } else {
        parts.push(pick(L.sorry));
      }
      if (maybe(0.6)) parts.push(pick(L.fixing));
      parts.push(pick(L.reachOut));            // always give them a way back

    } else {
      parts.push(pick(L.thanksMix));
      if (praiseStr && maybe(0.7)) parts.push(fill(pick(L.mixGood), praiseStr));
      if (issueStr && maybe(0.9)) parts.push(fill(pick(L.mixBad), issueStr));
      if (maybe(0.6)) parts.push(pick(L.mixBack));
    }

    // A bare "Thanks!" reads as brushed off, so make sure there are at least two beats.
    if (parts.length < 2) parts.push(pick(mood === 'pos' ? L.comeBack : mood === 'neg' ? L.reachOut : L.mixBack));

    let out = parts.join(' ');
    // Greet by name now and then, the way a person would.
    if (author && maybe(0.4)) {
      const first = firstName(author);
      if (first) out = first + ', ' + out.charAt(0).toLowerCase() + out.slice(1);
    }
    return out;
  }

  function buildSimple(lang, mood) {
    const S = SIMPLE[lang];
    if (!S) return null;
    return pick(S[mood] || S.mix);
  }

  /* ============================================================
     7. PUBLIC API
     ============================================================ */
  function generate({ rating, comment = '', venue = 'restaurant', author = '', signature = '' } = {}) {
    let lang = detect(comment);
    if (lang === 'hr' || lang === 'bs') lang = 'sr';

    const a = analyse(comment);

    // Stars lead; the text breaks ties and overrides when they disagree.
    let mood;
    if (rating == null) mood = a.n > a.p ? 'neg' : (a.p > a.n ? 'pos' : 'mix');
    else if (rating >= 4) mood = (a.n > a.p + 1) ? 'mix' : 'pos';
    else if (rating === 3) mood = 'mix';
    else mood = 'neg';

    let text = RICH[lang] ? buildRich(lang, mood, a, author) : buildSimple(lang, mood);
    if (!text) text = buildRich('en', mood, a, author);

    if (signature && signature.trim()) text += '\n\n' + signature.trim();
    return text;
  }

export { generate, detect, analyse };
