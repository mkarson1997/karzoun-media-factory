export type GeneratedPromptRow = {
  id: string;
  channel: 'GENERAL' | 'KIDS_CHANNEL_ONLY';
  category: string;
  duration_seconds: number;
  concept: string;
  prompt: string;
};

type CategorySpec = {
  category: string;
  subjects: string[];
  settings: string[];
  action: string;
  visualStyle: string;
};

const general: CategorySpec[] = [
  {
    category: 'Tiny Worlds',
    subjects: ['clockwork bakery','miniature harbor','pocket jungle','ant-sized airport','matchbox city','tiny repair shop','micro aquarium','desk-drawer village','teacup carnival','shoebox observatory'],
    settings: ['inside a forgotten attic','under a rainy window','inside a giant library','beneath a city sidewalk','inside an old train station'],
    action: 'reveals a hidden daily routine that escalates into one delightful surprise',
    visualStyle: 'macro cinematography, tactile miniature materials, shallow depth of field, rich practical lighting'
  },
  {
    category: 'Satisfying Transformations',
    subjects: ['rusted bicycle','abandoned room','cracked ceramic dragon','dusty arcade cabinet','old wooden desk','neglected garden corner','broken toy robot','weathered suitcase','scratched metal sign','forgotten fountain'],
    settings: ['in a calm workshop','on a sunlit rooftop','inside a glass studio','in a cozy garage','in a minimalist restoration lab'],
    action: 'transforms step by step from worn-out to astonishingly polished with visually satisfying reveals',
    visualStyle: 'clean macro details, precise motion, crisp texture changes, cinematic before-and-after reveals'
  },
  {
    category: 'Impossible Machines',
    subjects: ['cloud-harvesting machine','moonlight vending machine','dream-sorting conveyor','rainbow printing press','gravity-free coffee maker','memory projector','weather orchestra','star-polishing factory','shadow recycling machine','time-folding elevator'],
    settings: ['inside a retro-future factory','on a floating platform','in a neon laboratory','under a glass dome','inside a whimsical mechanical city'],
    action: 'demonstrates an impossible function through a clear cause-and-effect chain before a clever final twist',
    visualStyle: 'high-detail speculative machinery, readable mechanical motion, cinematic lighting, original industrial design'
  },
  {
    category: 'Food Fantasy',
    subjects: ['lava ramen bowl','crystal fruit market','cloud pancake stack','planet-sized dumpling','neon sushi train','chocolate construction site','ice-cream mountain railway','tiny pizza metropolis','floating tea ceremony','gemstone candy workshop'],
    settings: ['in a fantasy night market','inside a surreal kitchen','on a floating island','in a miniature food city','inside a glowing culinary laboratory'],
    action: 'turns food preparation into a fast visual adventure with an unexpected but appetizing final reveal',
    visualStyle: 'stylized food cinematography, glossy textures, steam and particles, playful scale, appetizing color contrast'
  },
  {
    category: 'Animals & Nature',
    subjects: ['curious red panda','clever octopus','tiny desert fox','patient beaver','hummingbird explorer','sea turtle navigator','otter inventor','raven problem-solver','capybara traveler','penguin architect'],
    settings: ['in a magical wetland','across a dramatic coastline','inside a lush rain forest','through a snowy valley','around a peaceful mountain lake'],
    action: 'solves a harmless environmental puzzle using believable animal behavior and a warm visual payoff',
    visualStyle: 'cinematic nature documentary look, expressive but natural animal motion, golden-hour light, no humanization costumes'
  },
  {
    category: 'Micro Mysteries',
    subjects: ['missing museum key','flickering apartment light','mysterious train ticket','sealed glass bottle','vanishing street mural','unclaimed red umbrella','strange elevator button','midnight bakery bell','silent antique radio','locked rooftop greenhouse'],
    settings: ['in a rain-soaked old town','inside a quiet museum','around a late-night station','in a cozy apartment block','through a foggy pedestrian street'],
    action: 'unfolds as a visual mystery with three clues, one false assumption, and a satisfying non-violent answer',
    visualStyle: 'moody cinematic suspense without horror, clear clue close-ups, motivated camera movement, warm ending'
  },
  {
    category: 'Space & Science',
    subjects: ['rogue ice moon','tiny black hole model','solar storm observer','alien ocean simulation','asteroid mining prototype','terraforming greenhouse','orbital repair drone','deep-space radio signal','comet laboratory','Mars dust experiment'],
    settings: ['inside a near-future research station','aboard an original orbital laboratory','on a scientifically plausible alien landscape','inside a planetary simulation chamber','at a remote desert observatory'],
    action: 'explains one surprising science idea visually, separating fact from speculation, then ends on a memorable scale comparison',
    visualStyle: 'scientifically grounded cinematic visualization, clean instrumentation, realistic lighting, elegant infographics without tiny text'
  },
  {
    category: 'History Reimagined',
    subjects: ['ancient courier route','medieval market morning','early printing workshop','historic lighthouse shift','old caravan rest stop','traditional shipyard day','ancient water system','historic glassmaking studio','early observatory night','old postal station'],
    settings: ['during one busy workday','at sunrise before the crowds','during a sudden weather change','on an important delivery day','during preparations for a local festival'],
    action: 'reconstructs an ordinary historical process with material detail and a compelling human-scale story, without inventing famous-person dialogue',
    visualStyle: 'museum-quality historical reconstruction, authentic materials and tools, cinematic natural light, no modern objects'
  },
  {
    category: 'Comedy POV',
    subjects: ['overconfident delivery robot','confused smart fridge','dramatic office printer','tiny household drone','perfectionist robot waiter','sleepy alarm clock AI','competitive cleaning robot','awkward translation earbud','too-helpful smart mirror','nervous autonomous suitcase'],
    settings: ['during a normal Monday morning','at a busy family dinner','inside a small creative studio','during a calm hotel check-in','on an ordinary grocery run'],
    action: 'creates escalating situational comedy from one simple misunderstanding and lands on a clean visual punchline',
    visualStyle: 'fast visual comedy, expressive object motion, sharp reaction framing, polished modern commercial look'
  },
  {
    category: 'Visual Puzzles',
    subjects: ['impossible staircase room','mirror maze clue','moving shadow puzzle','color-changing doorway','rotating city block','perspective bridge illusion','hidden-object workshop','pattern-lock garden','gravity room challenge','three-door logic test'],
    settings: ['inside a bright puzzle gallery','in a surreal city courtyard','inside a minimalist studio','at a playful science museum','on a geometric floating platform'],
    action: 'presents a fair visual puzzle in the first seconds, gives progressive clues, then reveals the solution clearly at the end',
    visualStyle: 'clean geometric design, high visual readability, controlled camera, satisfying reveal, no misleading microscopic details'
  },
  {
    category: 'Future Cities',
    subjects: ['vertical farm district','car-free delivery network','flood-resilient neighborhood','desert cooling street','modular rooftop village','robotic recycling hub','solar night market','autonomous ferry terminal','underground logistics tunnel','urban wildlife corridor'],
    settings: ['in a plausible city of 2045','during rush hour','during an extreme-weather day','on a quiet weekend morning','during a citywide sustainability test'],
    action: 'shows how one future-city system works from citizen problem to infrastructure response and measurable benefit',
    visualStyle: 'credible near-future urban design, readable infrastructure, diverse anonymous crowds, cinematic architectural visualization'
  },
  {
    category: 'Emotional Mini Stories',
    subjects: ['lost handwritten recipe','worn-out camera','forgotten park bench note','old voicemail recorder','childhood paper boat','returned library book','unopened postcard','repaired music box','shared umbrella','small neighborhood plant'],
    settings: ['on a rainy afternoon','during a quiet train ride','in a small neighborhood','before a family gathering','during an ordinary workday'],
    action: 'tells a complete gentle story through visual actions rather than melodrama and closes with a hopeful human connection',
    visualStyle: 'grounded cinematic storytelling, natural performances, intimate details, soft practical lighting, restrained emotion'
  },
  {
    category: 'Travel Fantasy',
    subjects: ['floating lantern village','cliffside glass railway','hidden waterfall town','desert mirror hotel','forest canopy tram','ice-cave café','volcanic island library','underwater observation hostel','mountain cloud market','aurora hot-spring village'],
    settings: ['at sunrise','during a gentle storm','at blue hour','during a local night festival','on a quiet off-season day'],
    action: 'takes the viewer through an original impossible destination as if it were a premium 45-second travel itinerary with one signature reveal',
    visualStyle: 'cinematic destination film, wide establishing shots, immersive moving camera, believable architecture, no real brand imitation'
  }
];

const kids: CategorySpec[] = [
  {
    category: 'Kids Animal Adventures',
    subjects: ['brave little turtle','curious baby elephant','gentle fox cub','playful penguin','friendly otter','tiny giraffe','cheerful koala','young dolphin','helpful rabbit','small red panda'],
    settings: ['in a colorful forest','beside a sparkling river','on a sunny island','in a friendly snowy village','inside a bright flower meadow'],
    action: 'solves a simple friendly problem with teamwork and ends with a clear kindness lesson',
    visualStyle: 'original soft 3D cartoon look, rounded shapes, bright balanced colors, expressive friendly faces'
  },
  {
    category: 'Kids Tiny Heroes',
    subjects: ['mini firefighter team','little garden helpers','tiny rescue builders','small lighthouse crew','pocket-size city cleaners','mini bridge engineers','little park rangers','tiny bakery helpers','small weather team','mini train-station crew'],
    settings: ['in a cheerful toy-like town','inside a bright miniature city','around a colorful community park','in a sunny coastal village','inside a friendly fantasy workshop'],
    action: 'handles a safe age-appropriate community challenge using cooperation, planning, and no dangerous imitation',
    visualStyle: 'original preschool-friendly 3D animation, chunky shapes, readable action, warm colors, no realistic emergencies'
  },
  {
    category: 'Kids Colors & Shapes',
    subjects: ['runaway blue circle','sleepy yellow star','dancing red triangle','green square explorer','purple moon puzzle','orange spiral train','rainbow shape garden','pattern-building blocks','color-mixing clouds','shape-sorting robots'],
    settings: ['inside a magical playroom','on a bright learning island','inside a friendly shape city','in a colorful cloud world','around a playful toy railway'],
    action: 'turns one simple color or shape concept into an interactive call-and-response game with a joyful final recap',
    visualStyle: 'high-contrast educational animation, large simple forms, uncluttered backgrounds, gentle motion, clear visual hierarchy'
  },
  {
    category: 'Kids Science',
    subjects: ['bouncing light beam','growing seed','floating paper boat','rain cloud cycle','magnet treasure hunt','shadow changing size','ice cube melting','bubble shape experiment','sound-wave drum','moon phase lanterns'],
    settings: ['inside a cheerful science room','in a sunny backyard lab','inside a colorful discovery museum','at a safe kitchen table experiment','in a friendly outdoor classroom'],
    action: 'demonstrates one accurate beginner science idea with safe observations, simple narration, and one question for the child to answer',
    visualStyle: 'friendly educational 3D/2D hybrid, clear cause-and-effect visuals, large objects, no dangerous experiments'
  },
  {
    category: 'Kids Bedtime Magic',
    subjects: ['sleepy moon mail carrier','little cloud gardener','star lantern keeper','dream train conductor','gentle night whale','pillow castle caretaker','tiny comet painter','quiet forest lanterns','yawning rainbow bridge','soft snow-globe village'],
    settings: ['under a calm starry sky','inside a cozy dream world','above a quiet sleeping town','in a glowing nighttime forest','on a peaceful cloud island'],
    action: 'follows a calm miniature bedtime task with low-stakes wonder and ends on a soothing visual loop',
    visualStyle: 'soft original bedtime animation, slow gentle camera, warm moonlight, muted jewel colors, no scares or sudden flashes'
  },
  {
    category: 'Kids Kindness & Sharing',
    subjects: ['two friends and one kite','three animals and one picnic','new child at the playground','broken toy shared repair','rainy-day umbrella team','community garden basket','missing crayon box','small birthday surprise','library book helper','lost mitten return'],
    settings: ['in a cheerful neighborhood','at a colorful schoolyard','inside a cozy community room','at a sunny playground','in a friendly little village'],
    action: 'shows a relatable social problem, models kind words and sharing, and resolves it without shaming any character',
    visualStyle: 'warm child-friendly animation, expressive body language, simple staging, inclusive original characters'
  },
  {
    category: 'Kids Vehicle Adventures',
    subjects: ['little blue bus','friendly fire truck','tiny delivery train','smiling street sweeper','small ferry boat','bright rescue helicopter','little tractor','friendly recycling truck','tiny mountain tram','small airport tug'],
    settings: ['around a colorful toy-like city','through a sunny countryside','inside a friendly transport town','around a bright harbor','through a gentle snowy village'],
    action: 'completes a safe helpful transport mission while teaching one simple sequencing, counting, or teamwork idea',
    visualStyle: 'original toy-like 3D animation, rounded vehicles, clear road safety cues, bright daylight, no crashes or danger'
  }
];

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makePrompt(spec: CategorySpec, subject: string, setting: string, duration: number, kidsMode: boolean) {
  const audience = kidsMode
    ? 'Audience: children roughly 4-8 with a parent-safe, wholesome tone. Never use frightening injuries, dangerous imitation, bullying, manipulative urgency, copyrighted characters, logos, or realistic peril.'
    : 'Audience: broad general entertainment. Keep it original, brand-safe, non-graphic, and free of copyrighted characters, celebrity likenesses, logos, watermarks, or copied creator footage.';
  const pacing = kidsMode
    ? 'Use clear visual beats every 2-3 seconds, readable staging, simple narration, and enough breathing room for comprehension.'
    : 'Use a strong visual beat roughly every 1.5-2.5 seconds while preserving continuity and avoiding chaotic cuts.';

  return `Create one original ${duration}-second vertical 9:16 YouTube Short about ${subject} ${setting}. Story goal: ${spec.action}. ${audience} Visual direction: ${spec.visualStyle}. Open with an instantly understandable visual hook in the first 1.5 seconds. Build a complete beginning, escalation, payoff, and final loopable image. ${pacing} Use varied close-up, medium, tracking, and establishing shots only when motivated. Add concise natural voiceover if useful, readable burned-in captions in safe margins, purposeful sound design, and music that does not overpower narration. Keep character/object continuity consistent across every shot. End with a satisfying reveal or question that makes the last frame connect naturally back to the first. No filler, black frames, malformed anatomy, unreadable text, random scene changes, watermarks, UI overlays, or fake engagement claims.`;
}

function rowsForSpecs(specs: CategorySpec[], channel: GeneratedPromptRow['channel'], startIndex: number) {
  const rows: GeneratedPromptRow[] = [];
  let id = startIndex;
  for (const spec of specs) {
    if (spec.subjects.length !== 10 || spec.settings.length !== 5) throw new Error(`${spec.category} must define exactly 10 subjects and 5 settings`);
    for (const subject of spec.subjects) {
      for (const setting of spec.settings) {
        const duration = 30 + ((id * 17 + 11) % 30);
        const concept = `${subject} ${setting}`;
        rows.push({
          id: `KMF-${String(id).padStart(4, '0')}`,
          channel,
          category: spec.category,
          duration_seconds: duration,
          concept,
          prompt: makePrompt(spec, subject, setting, duration, channel === 'KIDS_CHANNEL_ONLY')
        });
        id++;
      }
    }
  }
  return rows;
}

export function generatePromptBank(): GeneratedPromptRow[] {
  const generalRows = rowsForSpecs(general, 'GENERAL', 1);
  const kidsRows = rowsForSpecs(kids, 'KIDS_CHANNEL_ONLY', generalRows.length + 1);
  const rows = [...generalRows, ...kidsRows];
  if (rows.length !== 1000) throw new Error(`Expected exactly 1000 prompts, generated ${rows.length}`);
  return rows;
}

export function promptBankToCsv(rows = generatePromptBank()) {
  const header = ['id','channel','category','duration_seconds','concept','prompt'];
  return [header.join(','), ...rows.map((row) => [
    row.id,
    row.channel,
    row.category,
    row.duration_seconds,
    row.concept,
    row.prompt
  ].map(escapeCsv).join(','))].join('\n') + '\n';
}

export function promptBankStats(rows = generatePromptBank()) {
  const byChannel = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.channel] = (acc[row.channel] ?? 0) + 1;
    return acc;
  }, {});
  const byCategory = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + 1;
    return acc;
  }, {});
  return { total: rows.length, byChannel, byCategory };
}
