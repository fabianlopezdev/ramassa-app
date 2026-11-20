/**
 * The words of the Comunitat tab for the tester ground (RAPP-885): forum
 * categories, posts and replies, gallery captions and stories. All people are
 * fictional and every text is plainly dummy content for a test.
 *
 * A forum post or a caption is one player's own words, so it is written in the
 * language that player would use. A category name and a story are shown to
 * every player, so they carry the six app languages.
 */

import type { ImageName, Translated } from '../../lib/ground';

/** Who wrote a thing: a companion (`player:N`) or the team member (`team:1`). */
export type AuthorKey =
  'team:1' | 'player:1' | 'player:2' | 'player:3' | 'player:4' | 'player:5' | 'player:6';

export interface ForumCategorySeed {
  readonly slug: string;
  readonly name: Translated;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
}

export const FORUM_CATEGORIES: readonly ForumCategorySeed[] = [
  {
    slug: 'general',
    name: { ca: 'General', es: 'General', en: 'General', fr: 'Général', ar: 'عام', fa: 'عمومی' },
    icon: 'chat',
    color: 'neutral',
    sortOrder: 10,
  },
  {
    slug: 'futbol',
    name: {
      ca: 'Entrenaments i partits',
      es: 'Entrenamientos y partidos',
      en: 'Training and matches',
      fr: 'Entraînements et matchs',
      ar: 'التدريبات والمباريات',
      fa: 'تمرین‌ها و مسابقه‌ها',
    },
    icon: 'football',
    color: 'primary',
    sortOrder: 20,
  },
  {
    slug: 'feina',
    name: {
      ca: 'Feina i formació',
      es: 'Trabajo y formación',
      en: 'Work and courses',
      fr: 'Travail et formation',
      ar: 'العمل والتدريب',
      fa: 'کار و آموزش',
    },
    icon: 'briefcase',
    color: 'secondary',
    sortOrder: 30,
  },
  {
    slug: 'habitatge',
    name: {
      ca: 'Casa i barri',
      es: 'Casa y barrio',
      en: 'Home and neighbourhood',
      fr: 'Logement et quartier',
      ar: 'السكن والحي',
      fa: 'خانه و محله',
    },
    icon: 'buildings',
    color: 'info',
    sortOrder: 40,
  },
  {
    slug: 'recomanacions',
    name: {
      ca: 'Recomanacions',
      es: 'Recomendaciones',
      en: 'Recommendations',
      fr: 'Recommandations',
      ar: 'توصيات',
      fa: 'پیشنهادها',
    },
    icon: 'lightbulb',
    color: 'primary',
    sortOrder: 50,
  },
];

export interface ReplySeed {
  readonly key: string;
  readonly author: AuthorKey;
  readonly content: string;
  /** Minutes before the run for a new reply, or days before it for an old one. */
  readonly minutesAgo?: number;
  readonly daysAgo?: number;
}

export interface PostSeed {
  readonly key: string;
  readonly category: string;
  readonly author: AuthorKey;
  readonly content: string;
  /** Only the team member's posts carry an image: the stored keys sit under her id. */
  readonly image?: ImageName;
  readonly pinned?: boolean;
  readonly minutesAgo?: number;
  readonly daysAgo?: number;
  readonly replies: readonly ReplySeed[];
}

/**
 * Ten posts by the companions and the team member. Seven are dated minutes
 * before the run, so they are new for every tester; three are older and count
 * as seen.
 *
 * Every new thing is at most a quarter of an hour old: a database counts news
 * only from the moment the tab-news migration ran on it, and on a database
 * migrated shortly before the run anything older would already count as seen.
 */
export const FORUM_POSTS: readonly PostSeed[] = [
  {
    key: 'welcome',
    category: 'general',
    author: 'team:1',
    pinned: true,
    image: 'forum-01',
    daysAgo: 12,
    content:
      'Benvingudes al fòrum! Aquest és un espai per ajudar-nos entre companyes: compartir consells, preguntar dubtes i explicar com va la setmana. Escriviu en la llengua que vulgueu. Si alguna cosa no us agrada, la podeu reportar i l’equip tècnic la revisarà.',
    replies: [
      {
        key: 'welcome-1',
        author: 'player:1',
        daysAgo: 11,
        content: 'Gràcies Júlia! Molt bona idea.',
      },
      {
        key: 'welcome-2',
        author: 'player:4',
        daysAgo: 10,
        content: 'Merci, c’est super d’avoir un espace à nous.',
      },
    ],
  },
  {
    key: 'boots',
    category: 'futbol',
    author: 'player:1',
    minutesAgo: 13,
    content:
      'Algú té unes botes de la talla 38 que ja no faci servir? Les meves s’han trencat al partit de diumenge 😅',
    replies: [
      {
        key: 'boots-1',
        author: 'player:5',
        minutesAgo: 11,
        content: 'Yo tengo unas del 38 casi nuevas, te las llevo el jueves.',
      },
      {
        key: 'boots-2',
        author: 'team:1',
        minutesAgo: 10,
        content: 'Al magatzem també en tenim algunes. Demana-les a l’entrenament i les mirem.',
      },
    ],
  },
  {
    key: 'park',
    category: 'habitatge',
    author: 'player:2',
    minutesAgo: 12,
    content:
      'سلام دخترها! یک پارک خیلی قشنگ کنار رودخانه پیدا کردم، برای پیک‌نیک بعد از تمرین عالی است. کسی می‌آید شنبه؟',
    replies: [
      {
        key: 'park-1',
        author: 'player:6',
        minutesAgo: 9,
        content: 'Moi je viens samedi ! J’apporte des fruits.',
      },
    ],
  },
  {
    key: 'cv',
    category: 'feina',
    author: 'player:3',
    daysAgo: 6,
    content:
      'Does anyone know a place where I can print my CV for free? The library near the station was closed this week.',
    replies: [
      {
        key: 'cv-1',
        author: 'player:1',
        daysAgo: 6,
        content: 'A la biblioteca del barri nou pots imprimir 10 pàgines gratis.',
      },
      {
        key: 'cv-2',
        author: 'team:1',
        daysAgo: 5,
        content:
          'També ho pots fer al local abans de l’entrenament de dimarts. Avisa’ns i t’ho deixem preparat.',
      },
      {
        key: 'cv-3',
        author: 'player:3',
        daysAgo: 5,
        content: 'Thank you both! I will come on Tuesday.',
      },
    ],
  },
  {
    key: 'match-photos',
    category: 'futbol',
    author: 'team:1',
    image: 'forum-02',
    minutesAgo: 11,
    content:
      'Quin partit dissabte! Moltes gràcies a totes per l’energia. Aquí teniu una foto del final. La resta són a la Galeria.',
    replies: [
      {
        key: 'match-photos-1',
        author: 'player:4',
        minutesAgo: 8,
        content: 'On a trop bien joué ! Vivement le prochain match.',
      },
      {
        key: 'match-photos-2',
        author: 'player:1',
        minutesAgo: 6,
        content: 'كانت مباراة رائعة! شكراً للجميع ❤️',
      },
      {
        key: 'match-photos-3',
        author: 'player:2',
        minutesAgo: 4,
        content: 'عالی بود! ممنون جولیا',
      },
    ],
  },
  {
    key: 'bike',
    category: 'recomanacions',
    author: 'player:5',
    minutesAgo: 9,
    content:
      '¿Alguien sabe dónde comprar una bici de segunda mano a buen precio? Quiero ir en bici a los entrenamientos.',
    replies: [
      {
        key: 'bike-1',
        author: 'player:3',
        minutesAgo: 5,
        content: 'There is a repair shop on the main square that sells used bikes. Ask for Marta.',
      },
    ],
  },
  {
    key: 'recipe',
    category: 'general',
    author: 'player:6',
    daysAgo: 4,
    content:
      'Merci pour le goûter de vendredi ! Plusieurs filles m’ont demandé la recette du gâteau au yaourt, je la partage ici bientôt.',
    replies: [
      {
        key: 'recipe-1',
        author: 'player:5',
        daysAgo: 4,
        content: '¡Sí, por favor! Estaba buenísimo.',
      },
      { key: 'recipe-2', author: 'player:2', daysAgo: 3, content: 'خیلی خوشمزه بود، ممنون هاوا!' },
    ],
  },
  {
    key: 'thursday',
    category: 'futbol',
    author: 'team:1',
    image: 'forum-03',
    minutesAgo: 7,
    content:
      'Recordatori: aquest dijous l’entrenament comença a les 18.30 al camp gran. Porteu aigua i roba d’abric per després.',
    replies: [
      { key: 'thursday-1', author: 'player:6', minutesAgo: 3, content: 'D’acord, hi seré!' },
    ],
  },
  {
    key: 'course',
    category: 'feina',
    author: 'player:1',
    minutesAgo: 5,
    content:
      'He començat un curs de cuina al centre cívic, dos matins per setmana. Encara hi ha places, si a algú li interessa us passo el contacte.',
    replies: [
      {
        key: 'course-1',
        author: 'player:4',
        minutesAgo: 3,
        content: 'Ça m’intéresse ! Tu peux m’envoyer le contact ?',
      },
      {
        key: 'course-2',
        author: 'player:5',
        minutesAgo: 2,
        content: 'A mí también, ¡gracias Samira!',
      },
    ],
  },
  {
    key: 'language-swap',
    category: 'general',
    author: 'player:3',
    minutesAgo: 2,
    content:
      'Who wants to do a language swap after training? I can help with English and I would love to practise Catalan.',
    replies: [],
  },
];

export interface GallerySeed {
  readonly image: ImageName;
  readonly author: AuthorKey;
  readonly caption: string;
  readonly minutesAgo?: number;
  readonly daysAgo?: number;
}

/** Twelve photos: nine new, three older. */
export const GALLERY_ITEMS: readonly GallerySeed[] = [
  {
    image: 'gallery-01',
    author: 'team:1',
    minutesAgo: 14,
    caption: 'Escalfament abans del partit de dissabte',
  },
  {
    image: 'gallery-02',
    author: 'team:1',
    minutesAgo: 13,
    caption: 'L’equip complet després del partit',
  },
  {
    image: 'gallery-03',
    author: 'player:4',
    minutesAgo: 12,
    caption: 'Les filles à l’entraînement du mardi',
  },
  {
    image: 'gallery-04',
    author: 'player:1',
    minutesAgo: 10,
    caption: 'Entrenament sota la pluja 🌧️',
  },
  {
    image: 'gallery-05',
    author: 'team:1',
    minutesAgo: 8,
    caption: 'Berenar de divendres al local',
  },
  {
    image: 'gallery-06',
    author: 'player:5',
    minutesAgo: 7,
    caption: '¡Qué bonito el atardecer en el campo!',
  },
  { image: 'gallery-07', author: 'player:2', minutesAgo: 5, caption: 'تمرین پنالتی' },
  {
    image: 'gallery-08',
    author: 'team:1',
    minutesAgo: 4,
    caption: 'Les noves samarretes de la temporada',
  },
  {
    image: 'gallery-09',
    author: 'player:3',
    minutesAgo: 2,
    caption: 'Stretching after a long session',
  },
  {
    image: 'gallery-10',
    author: 'team:1',
    daysAgo: 5,
    caption: 'Torneig de tardor: el nostre racó',
  },
  {
    image: 'gallery-11',
    author: 'player:6',
    daysAgo: 8,
    caption: 'Pique-nique au parc après le match',
  },
  {
    image: 'gallery-12',
    author: 'player:1',
    daysAgo: 14,
    caption: 'El primer dia de la temporada',
  },
];

export interface StorySeed {
  readonly key: string;
  readonly author: AuthorKey;
  /** The language she wrote it in; the team member translated the rest. */
  readonly language: 'ca' | 'es' | 'en' | 'fr' | 'ar' | 'fa';
  readonly image: ImageName;
  readonly minutesAgo?: number;
  readonly daysAgo?: number;
  readonly title: Translated;
  readonly paragraphs: Readonly<Record<keyof Translated, readonly string[]>>;
}

/** Four published stories: three new, one older. */
export const STORIES: readonly StorySeed[] = [
  {
    key: 'first-training',
    author: 'player:5',
    language: 'es',
    image: 'story-01',
    minutesAgo: 12,
    title: {
      ca: 'El meu primer entrenament',
      es: 'Mi primer entrenamiento',
      en: 'My first training session',
      fr: 'Mon premier entraînement',
      ar: 'تدريبي الأول',
      fa: 'اولین تمرین من',
    },
    paragraphs: {
      ca: [
        'El primer dia no coneixia ningú i no sabia ni com es deia el camp. Vaig arribar d’hora i em vaig quedar a la grada mirant com les altres escalfaven.',
        'Una companya em va portar una pilota i em va dir que m’hi posés. Al cap de deu minuts ja rèiem totes juntes. Ara és el moment de la setmana que espero amb més ganes.',
      ],
      es: [
        'El primer día no conocía a nadie y ni siquiera sabía cómo se llamaba el campo. Llegué pronto y me quedé en la grada mirando cómo calentaban las demás.',
        'Una compañera me trajo un balón y me dijo que me uniera. A los diez minutos ya nos reíamos todas juntas. Ahora es el momento de la semana que más espero.',
      ],
      en: [
        'On the first day I did not know anyone and I did not even know the name of the pitch. I arrived early and stayed in the stands watching the others warm up.',
        'One of the girls brought me a ball and told me to join in. Ten minutes later we were all laughing together. Now it is the moment of the week I look forward to most.',
      ],
      fr: [
        'Le premier jour, je ne connaissais personne et je ne savais même pas le nom du terrain. Je suis arrivée tôt et je suis restée dans les tribunes à regarder les autres s’échauffer.',
        'Une coéquipière m’a apporté un ballon et m’a dit de venir. Dix minutes plus tard, on riait toutes ensemble. Maintenant, c’est le moment de la semaine que j’attends le plus.',
      ],
      ar: [
        'في اليوم الأول لم أكن أعرف أحداً، ولم أكن أعرف حتى اسم الملعب. وصلت مبكراً وبقيت في المدرجات أشاهد الأخريات وهن يقمن بالإحماء.',
        'أحضرت لي إحدى الزميلات كرة وقالت لي أن أنضم إليهن. بعد عشر دقائق كنا نضحك جميعاً معاً. الآن هذه هي اللحظة التي أنتظرها أكثر من غيرها في الأسبوع.',
      ],
      fa: [
        'روز اول هیچ‌کس را نمی‌شناختم و حتی اسم زمین را هم نمی‌دانستم. زود رسیدم و روی سکوها نشستم و گرم کردن بقیه را تماشا کردم.',
        'یکی از هم‌تیمی‌ها برایم توپ آورد و گفت بیا با ما. ده دقیقه بعد همه با هم می‌خندیدیم. حالا این لحظه‌ای از هفته است که بیشتر از همه منتظرش هستم.',
      ],
    },
  },
  {
    key: 'words',
    author: 'player:2',
    language: 'fa',
    image: 'story-02',
    minutesAgo: 8,
    title: {
      ca: 'Les paraules que he après al camp',
      es: 'Las palabras que he aprendido en el campo',
      en: 'The words I learned on the pitch',
      fr: 'Les mots que j’ai appris sur le terrain',
      ar: 'الكلمات التي تعلمتها في الملعب',
      fa: 'کلمه‌هایی که در زمین یاد گرفتم',
    },
    paragraphs: {
      ca: [
        '«Passa!», «xuta!», «molt bé!». Les meves primeres paraules en català les vaig aprendre jugant a futbol amb les meves companyes.',
        'Cada entrenament n’aprenc una de nova. Ara, quan vaig a comprar, ja puc dir bon dia i donar les gràcies. I quan m’equivoco, les companyes m’ajuden rient.',
      ],
      es: [
        '«¡Pasa!», «¡chuta!», «¡muy bien!». Mis primeras palabras en catalán las aprendí jugando a fútbol con mis compañeras.',
        'En cada entrenamiento aprendo una nueva. Ahora, cuando voy a comprar, ya puedo decir buenos días y dar las gracias. Y cuando me equivoco, mis compañeras me ayudan riendo.',
      ],
      en: [
        '"Pass!", "shoot!", "well done!". I learned my first words in Catalan while playing football with my teammates.',
        'At every session I learn a new one. Now when I go shopping I can say good morning and thank you. And when I make a mistake, the girls help me with a laugh.',
      ],
      fr: [
        '« Passe ! », « tire ! », « très bien ! ». J’ai appris mes premiers mots en catalan en jouant au football avec mes coéquipières.',
        'À chaque entraînement, j’en apprends un nouveau. Maintenant, quand je fais les courses, je peux dire bonjour et merci. Et quand je me trompe, les filles m’aident en riant.',
      ],
      ar: [
        '«مرّري!»، «سدّدي!»، «أحسنتِ!». تعلمت كلماتي الأولى بالكاتالانية وأنا ألعب كرة القدم مع زميلاتي.',
        'في كل تدريب أتعلم كلمة جديدة. الآن عندما أذهب للتسوق أستطيع أن أقول صباح الخير وشكراً. وعندما أخطئ، تساعدني الزميلات وهن يضحكن.',
      ],
      fa: [
        '«پاس بده!»، «شوت کن!»، «آفرین!». اولین کلمه‌های کاتالانی را وقتی با هم‌تیمی‌هایم فوتبال بازی می‌کردم یاد گرفتم.',
        'هر تمرین یک کلمه‌ی تازه یاد می‌گیرم. حالا وقتی خرید می‌روم می‌توانم صبح بخیر و ممنون بگویم. و وقتی اشتباه می‌کنم، هم‌تیمی‌ها با خنده کمکم می‌کنند.',
      ],
    },
  },
  {
    key: 'first-goal',
    author: 'player:4',
    language: 'fr',
    image: 'story-03',
    minutesAgo: 4,
    title: {
      ca: 'El meu primer gol',
      es: 'Mi primer gol',
      en: 'My first goal',
      fr: 'Mon premier but',
      ar: 'هدفي الأول',
      fa: 'اولین گل من',
    },
    paragraphs: {
      ca: [
        'Era el torneig de tardor i perdíem per un gol. Quedaven cinc minuts i jo estava molt cansada. La Samira em va fer una passada llarga i vaig xutar sense pensar.',
        'La pilota va entrar per l’escaire. Totes van córrer a abraçar-me. Encara recordo la cara de les meves companyes en aquell moment.',
      ],
      es: [
        'Era el torneo de otoño y perdíamos por un gol. Quedaban cinco minutos y yo estaba muy cansada. Samira me hizo un pase largo y chuté sin pensar.',
        'El balón entró por la escuadra. Todas corrieron a abrazarme. Todavía recuerdo la cara de mis compañeras en ese momento.',
      ],
      en: [
        'It was the autumn tournament and we were one goal down. There were five minutes left and I was very tired. Samira played me a long pass and I shot without thinking.',
        'The ball went into the top corner. Everyone ran to hug me. I still remember my teammates’ faces at that moment.',
      ],
      fr: [
        'C’était le tournoi d’automne et on perdait d’un but. Il restait cinq minutes et j’étais très fatiguée. Samira m’a fait une longue passe et j’ai tiré sans réfléchir.',
        'Le ballon est entré dans la lucarne. Toutes ont couru me prendre dans leurs bras. Je me souviens encore du visage de mes coéquipières à ce moment-là.',
      ],
      ar: [
        'كانت بطولة الخريف وكنا متأخرات بهدف. بقيت خمس دقائق وكنت متعبة جداً. مرّرت لي سميرة كرة طويلة فسدّدت دون تفكير.',
        'دخلت الكرة في الزاوية العليا. ركضت الجميع لعناقي. ما زلت أتذكر وجوه زميلاتي في تلك اللحظة.',
      ],
      fa: [
        'مسابقات پاییزی بود و یک گل عقب بودیم. پنج دقیقه مانده بود و خیلی خسته بودم. سمیرا یک پاس بلند به من داد و بدون فکر شوت زدم.',
        'توپ به گوشه‌ی بالای دروازه رفت. همه دویدند تا بغلم کنند. هنوز چهره‌ی هم‌تیمی‌هایم در آن لحظه را به یاد دارم.',
      ],
    },
  },
  {
    key: 'sundays',
    author: 'player:3',
    language: 'en',
    image: 'story-04',
    daysAgo: 6,
    title: {
      ca: 'Els diumenges al parc',
      es: 'Los domingos en el parque',
      en: 'Sundays in the park',
      fr: 'Les dimanches au parc',
      ar: 'أيام الأحد في الحديقة',
      fa: 'یکشنبه‌ها در پارک',
    },
    paragraphs: {
      ca: [
        'Després dels partits, algunes de nosaltres ens quedem al parc. Cadascuna porta alguna cosa de menjar del seu país i ho compartim sobre una manta.',
        'Així he tastat el thieboudienne de la Fatou i les arepes de la Carolina. El futbol ens va unir, però ara també som amigues fora del camp.',
      ],
      es: [
        'Después de los partidos, algunas nos quedamos en el parque. Cada una trae algo de comer de su país y lo compartimos sobre una manta.',
        'Así he probado el thieboudienne de Fatou y las arepas de Carolina. El fútbol nos unió, pero ahora también somos amigas fuera del campo.',
      ],
      en: [
        'After the matches, some of us stay in the park. Each of us brings some food from home and we share it on a blanket.',
        'That is how I tasted Fatou’s thieboudienne and Carolina’s arepas. Football brought us together, and now we are friends off the pitch too.',
      ],
      fr: [
        'Après les matchs, certaines d’entre nous restent au parc. Chacune apporte un plat de son pays et on partage tout sur une couverture.',
        'C’est comme ça que j’ai goûté le thieboudienne de Fatou et les arepas de Carolina. Le football nous a réunies, et maintenant nous sommes aussi amies en dehors du terrain.',
      ],
      ar: [
        'بعد المباريات، تبقى بعضنا في الحديقة. تحضر كل واحدة طعاماً من بلدها ونتشاركه على بطانية.',
        'هكذا تذوقت طبق الثيبوديان من فاتو والأريباس من كارولينا. جمعتنا كرة القدم، والآن صرنا صديقات خارج الملعب أيضاً.',
      ],
      fa: [
        'بعد از مسابقه‌ها، بعضی از ما در پارک می‌مانیم. هر کس غذایی از کشور خودش می‌آورد و روی یک پتو با هم می‌خوریم.',
        'این‌طوری تیبودین فاتو و آرپاهای کارولینا را چشیدم. فوتبال ما را کنار هم آورد و حالا بیرون از زمین هم با هم دوستیم.',
      ],
    },
  },
];

/** The knowledge category the stories sit in. It holds no guide, so Guies never shows it. */
export const STORY_CATEGORY = {
  slug: 'comunitat-histories',
  name: {
    ca: 'Històries',
    es: 'Historias',
    en: 'Stories',
    fr: 'Histoires',
    ar: 'قصص',
    fa: 'داستان‌ها',
  } satisfies Translated,
  icon: 'heart',
  sortOrder: 900,
} as const;
