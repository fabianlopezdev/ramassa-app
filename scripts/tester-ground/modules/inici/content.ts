/**
 * Tester ground, Inici (RAPP-885): the dummy texts of the avisos, the forms
 * and the surveys, in the six app languages. All fictional.
 */

import type { Translated } from '../../lib/ground';

export type AvisCategory = 'info' | 'training' | 'social' | 'urgent';

export interface Avis {
  readonly key: string;
  readonly category: AvisCategory;
  /**
   * Minutes before the run for a new one; days before the run for one she has
   * seen. A new one is only a few minutes old, because what was published
   * before the tab-news record started on that database counts as seen, and on
   * staging that record started on the day of the run.
   */
  readonly age: { readonly minutes: number } | { readonly days: number };
  readonly isPinned: boolean;
  readonly image: 'avis-01' | 'avis-02' | 'avis-03' | null;
  readonly title: Translated;
  readonly body: Translated;
  readonly imageAlt?: Translated;
}

export const AVISOS: readonly Avis[] = [
  {
    key: 'field-change',
    category: 'urgent',
    age: { minutes: 2 },
    isPinned: false,
    image: null,
    title: {
      ca: 'Dijous entrenem al camp 2',
      es: 'El jueves entrenamos en el campo 2',
      en: 'On Thursday we train on pitch 2',
      fr: 'Jeudi, on s’entraîne sur le terrain 2',
      ar: 'يوم الخميس نتدرب في الملعب 2',
      fa: 'پنجشنبه در زمین شماره ۲ تمرین می‌کنیم',
    },
    body: {
      ca: 'Aquest dijous el camp 1 està en obres. L’entrenament es fa al camp 2, a la mateixa hora. L’entrada és per la porta del costat del pàrquing.',
      es: 'Este jueves el campo 1 está en obras. El entrenamiento es en el campo 2, a la misma hora. La entrada es por la puerta junto al aparcamiento.',
      en: 'This Thursday pitch 1 is closed for works. Training is on pitch 2 at the usual time. Use the gate next to the car park.',
      fr: 'Ce jeudi, le terrain 1 est en travaux. L’entraînement a lieu sur le terrain 2, à la même heure. L’entrée se fait par la porte à côté du parking.',
      ar: 'هذا الخميس الملعب 1 مغلق بسبب أعمال صيانة. التدريب في الملعب 2 في الموعد نفسه. الدخول من الباب المجاور لموقف السيارات.',
      fa: 'این پنجشنبه زمین شماره ۱ در حال تعمیر است. تمرین در زمین شماره ۲ و در همان ساعت همیشگی برگزار می‌شود. ورود از دری است که کنار پارکینگ قرار دارد.',
    },
  },
  {
    key: 'new-kit',
    category: 'info',
    age: { minutes: 3 },
    isPinned: false,
    image: 'avis-01',
    title: {
      ca: 'Ja pots recollir la nova equipació',
      es: 'Ya puedes recoger la nueva equipación',
      en: 'The new kit is ready to collect',
      fr: 'La nouvelle tenue est prête à être récupérée',
      ar: 'يمكنكِ الآن استلام الطقم الجديد',
      fa: 'لباس ورزشی جدید آماده‌ی تحویل است',
    },
    body: {
      ca: 'La samarreta, els pantalons i les mitges de la temporada ja han arribat. Passa a recollir-les abans o després de l’entrenament. Si no saps la teva talla, l’equip tècnic t’ajuda a provar-la.',
      es: 'La camiseta, los pantalones y las medias de la temporada ya han llegado. Pasa a recogerlos antes o después del entrenamiento. Si no sabes tu talla, el equipo técnico te ayuda a probártela.',
      en: 'This season’s shirt, shorts and socks have arrived. Collect them before or after training. If you are not sure of your size, the staff will help you try it on.',
      fr: 'Le maillot, le short et les chaussettes de la saison sont arrivés. Viens les récupérer avant ou après l’entraînement. Si tu ne connais pas ta taille, l’équipe technique t’aide à l’essayer.',
      ar: 'وصل القميص والسروال والجوارب الخاصة بهذا الموسم. تعالي لاستلامها قبل التدريب أو بعده. إذا لم تعرفي مقاسك، سيساعدك الفريق الفني في تجربته.',
      fa: 'پیراهن، شورت و جوراب این فصل رسیده است. قبل یا بعد از تمرین برای گرفتن آن‌ها بیایید. اگر سایزتان را نمی‌دانید، کادر فنی در امتحان کردن آن به شما کمک می‌کند.',
    },
    imageAlt: {
      ca: 'Samarretes de l’equip plegades sobre una taula',
      es: 'Camisetas del equipo dobladas sobre una mesa',
      en: 'Team shirts folded on a table',
      fr: 'Maillots de l’équipe pliés sur une table',
      ar: 'قمصان الفريق مطوية على طاولة',
      fa: 'پیراهن‌های تیم که روی میز تا شده‌اند',
    },
  },
  {
    key: 'goalkeeping',
    category: 'training',
    age: { minutes: 4 },
    isPinned: false,
    image: 'avis-02',
    title: {
      ca: 'Sessió de porteria oberta a totes',
      es: 'Sesión de portería abierta a todas',
      en: 'Goalkeeping session open to everyone',
      fr: 'Séance de gardiennage ouverte à toutes',
      ar: 'حصة حراسة مرمى مفتوحة للجميع',
      fa: 'جلسه‌ی دروازه‌بانی برای همه آزاد است',
    },
    body: {
      ca: 'Dimarts, mitja hora abans de l’entrenament, fem una sessió de porteria. No cal experiència. Porta guants si en tens; si no, te’n deixem uns.',
      es: 'El martes, media hora antes del entrenamiento, hacemos una sesión de portería. No hace falta experiencia. Trae guantes si tienes; si no, te prestamos unos.',
      en: 'On Tuesday, half an hour before training, we run a goalkeeping session. No experience needed. Bring gloves if you have them; if not, we will lend you a pair.',
      fr: 'Mardi, une demi-heure avant l’entraînement, on fait une séance de gardiennage. Aucune expérience n’est nécessaire. Apporte des gants si tu en as ; sinon, on t’en prête.',
      ar: 'يوم الثلاثاء، قبل التدريب بنصف ساعة، ننظم حصة لحراسة المرمى. لا تحتاجين إلى خبرة. أحضري قفازات إن كانت لديك، وإلا سنعيرك زوجًا.',
      fa: 'سه‌شنبه، نیم ساعت قبل از تمرین، یک جلسه‌ی دروازه‌بانی داریم. به تجربه نیازی نیست. اگر دستکش دارید بیاورید؛ اگر ندارید، به شما قرض می‌دهیم.',
    },
    imageAlt: {
      ca: 'Una portera atura una pilota durant un entrenament',
      es: 'Una portera para un balón durante un entrenamiento',
      en: 'A goalkeeper saves a ball during training',
      fr: 'Une gardienne arrête un ballon pendant un entraînement',
      ar: 'حارسة مرمى تصد كرة أثناء التدريب',
      fa: 'یک دروازه‌بان در حین تمرین توپ را مهار می‌کند',
    },
  },
  {
    key: 'team-dinner',
    category: 'social',
    age: { minutes: 5 },
    isPinned: false,
    image: 'avis-03',
    title: {
      ca: 'Sopar de companyes aquest divendres',
      es: 'Cena de compañeras este viernes',
      en: 'Team dinner this Friday',
      fr: 'Dîner entre coéquipières ce vendredi',
      ar: 'عشاء مع الزميلات هذه الجمعة',
      fa: 'شام دوستانه‌ی هم‌تیمی‌ها این جمعه',
    },
    body: {
      ca: 'Divendres a les 20:00 sopem juntes al local de l’associació. Cadascuna porta un plat del seu país, si vol. Hi haurà opcions vegetarianes i sense porc.',
      es: 'El viernes a las 20:00 cenamos juntas en el local de la asociación. Cada una trae un plato de su país, si quiere. Habrá opciones vegetarianas y sin cerdo.',
      en: 'On Friday at 20:00 we have dinner together at the association’s hall. Bring a dish from your country if you like. There will be vegetarian and pork-free options.',
      fr: 'Vendredi à 20 h, on dîne ensemble au local de l’association. Chacune apporte un plat de son pays, si elle le souhaite. Il y aura des options végétariennes et sans porc.',
      ar: 'يوم الجمعة الساعة 20:00 نتناول العشاء معًا في مقر الجمعية. يمكن لكل واحدة أن تحضر طبقًا من بلدها إن أرادت. ستكون هناك خيارات نباتية وخالية من لحم الخنزير.',
      fa: 'جمعه ساعت ۲۰:۰۰ در سالن انجمن با هم شام می‌خوریم. اگر دوست دارید، یک غذا از کشور خودتان بیاورید. غذای گیاهی و بدون گوشت خوک هم خواهد بود.',
    },
    imageAlt: {
      ca: 'Una taula llarga parada per sopar',
      es: 'Una mesa larga preparada para cenar',
      en: 'A long table set for dinner',
      fr: 'Une longue table dressée pour le dîner',
      ar: 'طاولة طويلة معدّة للعشاء',
      fa: 'یک میز بلند که برای شام چیده شده است',
    },
  },
  {
    key: 'welcome',
    category: 'info',
    age: { days: 40 },
    isPinned: true,
    image: null,
    title: {
      ca: 'Benvinguda a la nova temporada',
      es: 'Bienvenida a la nueva temporada',
      en: 'Welcome to the new season',
      fr: 'Bienvenue dans la nouvelle saison',
      ar: 'أهلًا بكِ في الموسم الجديد',
      fa: 'به فصل جدید خوش آمدید',
    },
    body: {
      ca: 'Comencem una temporada nova a AE Ramassà. Aquí trobaràs els avisos de l’equip tècnic: canvis d’horari, activitats i trobades. Si tens dubtes, escriu-nos pel xat.',
      es: 'Empezamos una temporada nueva en AE Ramassà. Aquí encontrarás los avisos del equipo técnico: cambios de horario, actividades y encuentros. Si tienes dudas, escríbenos por el chat.',
      en: 'A new season starts at AE Ramassà. Here you will find the notices from the staff: schedule changes, activities and gatherings. If you have questions, write to us in the chat.',
      fr: 'Une nouvelle saison commence à l’AE Ramassà. Tu trouveras ici les avis de l’équipe technique : changements d’horaire, activités et rencontres. Si tu as des questions, écris-nous dans le chat.',
      ar: 'يبدأ موسم جديد في AE Ramassà. ستجدين هنا إعلانات الفريق الفني: تغييرات المواعيد والأنشطة واللقاءات. إذا كانت لديك أسئلة، اكتبي لنا في الدردشة.',
      fa: 'فصل جدیدی در AE Ramassà شروع می‌شود. اطلاعیه‌های کادر فنی را اینجا پیدا می‌کنید: تغییر ساعت‌ها، فعالیت‌ها و دیدارها. اگر سؤالی دارید، در گفتگو برای ما بنویسید.',
    },
  },
  {
    key: 'water-reminder',
    category: 'training',
    age: { days: 35 },
    isPinned: false,
    image: null,
    title: {
      ca: 'Recordatori: porta aigua i roba de recanvi',
      es: 'Recordatorio: trae agua y ropa de recambio',
      en: 'Reminder: bring water and a change of clothes',
      fr: 'Rappel : apporte de l’eau et des vêtements de rechange',
      ar: 'تذكير: أحضري الماء وملابس إضافية',
      fa: 'یادآوری: آب و لباس اضافه همراه داشته باشید',
    },
    body: {
      ca: 'Als entrenaments porta sempre una ampolla d’aigua i roba per canviar-te. Els vestidors tenen dutxa i taquilles.',
      es: 'A los entrenamientos trae siempre una botella de agua y ropa para cambiarte. Los vestuarios tienen ducha y taquillas.',
      en: 'Always bring a water bottle and clothes to change into for training. The changing rooms have showers and lockers.',
      fr: 'Pour les entraînements, apporte toujours une bouteille d’eau et des vêtements pour te changer. Les vestiaires ont des douches et des casiers.',
      ar: 'أحضري دائمًا زجاجة ماء وملابس للتبديل إلى التدريبات. في غرف تبديل الملابس دشّ وخزائن.',
      fa: 'برای تمرین همیشه یک بطری آب و لباس برای تعویض بیاورید. رختکن‌ها دوش و کمد دارند.',
    },
  },
];

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'yes_no'
  | 'yes_no_maybe'
  | 'single_choice'
  | 'multiple_choice'
  | 'number'
  | 'date';

export interface FormQuestion {
  readonly key: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly label: Translated;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly options?: readonly { readonly key: string; readonly label: Translated }[];
}

export interface Form {
  readonly key: string;
  /** The Fitxa section the questions belong to. */
  readonly section: 'sizes' | 'support';
  readonly mandatory: 'optional' | 'required_from_date';
  /** Days from the run, only with `required_from_date`. */
  readonly deadlineInDays?: number;
  /** She put it off with "Ara no": it waits in her later list. */
  readonly isPutOff: boolean;
  readonly name: Translated;
  readonly screenTitle: Translated;
  readonly questions: readonly FormQuestion[];
}

const YES_NO_OPTIONS = {
  yes: {
    ca: 'Sí',
    es: 'Sí',
    en: 'Yes',
    fr: 'Oui',
    ar: 'نعم',
    fa: 'بله',
  },
  no: { ca: 'No', es: 'No', en: 'No', fr: 'Non', ar: 'لا', fa: 'خیر' },
} as const;

export const FORMS: readonly Form[] = [
  {
    key: 'kit-sizes',
    section: 'sizes',
    mandatory: 'optional',
    isPutOff: false,
    name: {
      ca: 'Talles de l’equipació',
      es: 'Tallas de la equipación',
      en: 'Kit sizes',
      fr: 'Tailles de la tenue',
      ar: 'مقاسات الطقم',
      fa: 'سایز لباس ورزشی',
    },
    screenTitle: {
      ca: 'La teva talla',
      es: 'Tu talla',
      en: 'Your size',
      fr: 'Ta taille',
      ar: 'مقاسك',
      fa: 'سایز شما',
    },
    questions: [
      {
        key: 'shirt',
        type: 'single_choice',
        required: true,
        label: {
          ca: 'Quina talla de samarreta fas servir?',
          es: '¿Qué talla de camiseta usas?',
          en: 'What shirt size do you wear?',
          fr: 'Quelle taille de maillot portes-tu ?',
          ar: 'ما مقاس القميص الذي ترتدينه؟',
          fa: 'چه سایز پیراهنی می‌پوشید؟',
        },
        options: ['XS', 'S', 'M', 'L', 'XL'].map((size) => ({
          key: size,
          label: { ca: size, es: size, en: size, fr: size, ar: size, fa: size },
        })),
      },
      {
        key: 'shoe',
        type: 'number',
        required: true,
        settings: { integer: true, min: 34, max: 46 },
        label: {
          ca: 'Quin número de bota calces?',
          es: '¿Qué número de bota calzas?',
          en: 'What boot size do you take (EU)?',
          fr: 'Quelle pointure de chaussures portes-tu (EU) ?',
          ar: 'ما مقاس حذائك الرياضي (أوروبي)؟',
          fa: 'سایز کفش ورزشی شما چند است (اروپایی)؟',
        },
      },
      {
        key: 'has-boots',
        type: 'yes_no',
        required: false,
        label: {
          ca: 'Ja tens botes de futbol?',
          es: '¿Ya tienes botas de fútbol?',
          en: 'Do you already have football boots?',
          fr: 'As-tu déjà des chaussures de foot ?',
          ar: 'هل لديكِ حذاء كرة قدم؟',
          fa: 'آیا کفش فوتبال دارید؟',
        },
      },
      {
        key: 'kit-note',
        type: 'long_text',
        required: false,
        label: {
          ca: 'Necessites res més per jugar còmoda?',
          es: '¿Necesitas algo más para jugar cómoda?',
          en: 'Do you need anything else to play comfortably?',
          fr: 'As-tu besoin d’autre chose pour jouer à l’aise ?',
          ar: 'هل تحتاجين إلى أي شيء آخر لتلعبي براحة؟',
          fa: 'برای راحت بازی کردن به چیز دیگری نیاز دارید؟',
        },
      },
    ],
  },
  {
    key: 'spring-tournament',
    section: 'support',
    mandatory: 'required_from_date',
    deadlineInDays: 21,
    isPutOff: false,
    name: {
      ca: 'Torneig de primavera',
      es: 'Torneo de primavera',
      en: 'Spring tournament',
      fr: 'Tournoi de printemps',
      ar: 'بطولة الربيع',
      fa: 'مسابقات بهاره',
    },
    screenTitle: {
      ca: 'La teva disponibilitat',
      es: 'Tu disponibilidad',
      en: 'When you can come',
      fr: 'Tes disponibilités',
      ar: 'الأوقات المناسبة لكِ',
      fa: 'زمان‌هایی که می‌توانید بیایید',
    },
    questions: [
      {
        key: 'will-play',
        type: 'yes_no_maybe',
        required: true,
        label: {
          ca: 'Vols jugar el torneig de primavera?',
          es: '¿Quieres jugar el torneo de primavera?',
          en: 'Would you like to play in the spring tournament?',
          fr: 'Veux-tu jouer le tournoi de printemps ?',
          ar: 'هل تريدين اللعب في بطولة الربيع؟',
          fa: 'آیا می‌خواهید در مسابقات بهاره بازی کنید؟',
        },
      },
      {
        key: 'days',
        type: 'multiple_choice',
        required: false,
        label: {
          ca: 'Quins dies pots venir?',
          es: '¿Qué días puedes venir?',
          en: 'Which days can you come?',
          fr: 'Quels jours peux-tu venir ?',
          ar: 'ما الأيام التي يمكنك الحضور فيها؟',
          fa: 'چه روزهایی می‌توانید بیایید؟',
        },
        options: [
          {
            key: 'saturday_morning',
            label: {
              ca: 'Dissabte al matí',
              es: 'Sábado por la mañana',
              en: 'Saturday morning',
              fr: 'Samedi matin',
              ar: 'صباح السبت',
              fa: 'صبح شنبه',
            },
          },
          {
            key: 'saturday_afternoon',
            label: {
              ca: 'Dissabte a la tarda',
              es: 'Sábado por la tarde',
              en: 'Saturday afternoon',
              fr: 'Samedi après-midi',
              ar: 'مساء السبت',
              fa: 'بعدازظهر شنبه',
            },
          },
          {
            key: 'sunday_morning',
            label: {
              ca: 'Diumenge al matí',
              es: 'Domingo por la mañana',
              en: 'Sunday morning',
              fr: 'Dimanche matin',
              ar: 'صباح الأحد',
              fa: 'صبح یکشنبه',
            },
          },
        ],
      },
      {
        key: 'arrival',
        type: 'date',
        required: false,
        label: {
          ca: 'Des de quin dia pots començar a entrenar per al torneig?',
          es: '¿Desde qué día puedes empezar a entrenar para el torneo?',
          en: 'From which day can you start training for the tournament?',
          fr: 'À partir de quel jour peux-tu t’entraîner pour le tournoi ?',
          ar: 'من أي يوم يمكنك البدء في التدريب للبطولة؟',
          fa: 'از چه روزی می‌توانید برای مسابقات تمرین کنید؟',
        },
      },
      {
        key: 'position',
        type: 'short_text',
        required: false,
        label: {
          ca: 'En quina posició t’agrada jugar?',
          es: '¿En qué posición te gusta jugar?',
          en: 'Which position do you like to play?',
          fr: 'À quel poste aimes-tu jouer ?',
          ar: 'في أي مركز تحبين اللعب؟',
          fa: 'دوست دارید در چه پستی بازی کنید؟',
        },
      },
    ],
  },
  {
    key: 'season-party',
    section: 'support',
    mandatory: 'optional',
    isPutOff: true,
    name: {
      ca: 'Idees per a la festa de final de temporada',
      es: 'Ideas para la fiesta de final de temporada',
      en: 'Ideas for the end of season party',
      fr: 'Idées pour la fête de fin de saison',
      ar: 'أفكار لحفلة نهاية الموسم',
      fa: 'ایده‌هایی برای جشن پایان فصل',
    },
    screenTitle: {
      ca: 'La festa',
      es: 'La fiesta',
      en: 'The party',
      fr: 'La fête',
      ar: 'الحفلة',
      fa: 'جشن',
    },
    questions: [
      {
        key: 'coming',
        type: 'single_choice',
        required: true,
        label: {
          ca: 'Vindràs a la festa?',
          es: '¿Vendrás a la fiesta?',
          en: 'Will you come to the party?',
          fr: 'Viendras-tu à la fête ?',
          ar: 'هل ستأتين إلى الحفلة؟',
          fa: 'آیا به جشن می‌آیید؟',
        },
        options: [
          { key: 'yes', label: YES_NO_OPTIONS.yes },
          { key: 'no', label: YES_NO_OPTIONS.no },
        ],
      },
      {
        key: 'with-family',
        type: 'yes_no',
        required: false,
        label: {
          ca: 'Vindràs amb la família?',
          es: '¿Vendrás con la familia?',
          en: 'Will you bring your family?',
          fr: 'Viendras-tu avec ta famille ?',
          ar: 'هل ستحضرين مع عائلتك؟',
          fa: 'آیا با خانواده‌تان می‌آیید؟',
        },
      },
      {
        key: 'idea',
        type: 'long_text',
        required: false,
        label: {
          ca: 'Què t’agradaria que hi hagués a la festa?',
          es: '¿Qué te gustaría que hubiera en la fiesta?',
          en: 'What would you like to have at the party?',
          fr: 'Qu’aimerais-tu trouver à la fête ?',
          ar: 'ماذا تحبين أن يكون في الحفلة؟',
          fa: 'دوست دارید در جشن چه چیزی باشد؟',
        },
      },
    ],
  },
];

export type SurveyQuestionType = 'rating' | 'multiple_choice' | 'yes_no' | 'free_text';

export interface SurveyQuestion {
  readonly key: string;
  readonly type: SurveyQuestionType;
  readonly required: boolean;
  readonly prompt: Translated;
  readonly options?: readonly { readonly id: string; readonly label: Translated }[];
}

export interface Survey {
  readonly key: string;
  readonly minutesAgo: number;
  readonly title: Translated;
  readonly questions: readonly SurveyQuestion[];
  /** Her saved answers when she has started it ("Continua"), by question key. */
  readonly startedAnswers?: Readonly<Record<string, number | string | boolean>>;
}

export const SURVEYS: readonly Survey[] = [
  {
    key: 'training-feel',
    minutesAgo: 30,
    title: {
      ca: 'Com et sents als entrenaments?',
      es: '¿Cómo te sientes en los entrenamientos?',
      en: 'How do you feel at training?',
      fr: 'Comment te sens-tu aux entraînements ?',
      ar: 'كيف تشعرين في التدريبات؟',
      fa: 'در تمرین‌ها چه حسی دارید؟',
    },
    questions: [
      {
        key: 'rating',
        type: 'rating',
        required: true,
        prompt: {
          ca: 'Com valores els entrenaments d’aquest mes?',
          es: '¿Cómo valoras los entrenamientos de este mes?',
          en: 'How would you rate this month’s training?',
          fr: 'Comment évalues-tu les entraînements de ce mois ?',
          ar: 'كيف تقيّمين تدريبات هذا الشهر؟',
          fa: 'به تمرین‌های این ماه چه امتیازی می‌دهید؟',
        },
      },
      {
        key: 'best',
        type: 'multiple_choice',
        required: true,
        prompt: {
          ca: 'Què és el que més t’agrada?',
          es: '¿Qué es lo que más te gusta?',
          en: 'What do you enjoy most?',
          fr: 'Qu’est-ce que tu préfères ?',
          ar: 'ما أكثر ما تحبينه؟',
          fa: 'از چه چیزی بیشتر لذت می‌برید؟',
        },
        options: [
          {
            id: 'matches',
            label: {
              ca: 'Els partidets',
              es: 'Los partidillos',
              en: 'The small games',
              fr: 'Les petits matchs',
              ar: 'المباريات القصيرة',
              fa: 'بازی‌های کوتاه',
            },
          },
          {
            id: 'teammates',
            label: {
              ca: 'Estar amb les companyes',
              es: 'Estar con las compañeras',
              en: 'Being with my teammates',
              fr: 'Être avec mes coéquipières',
              ar: 'التواجد مع زميلاتي',
              fa: 'بودن با هم‌تیمی‌ها',
            },
          },
          {
            id: 'skills',
            label: {
              ca: 'Aprendre tècnica',
              es: 'Aprender técnica',
              en: 'Learning skills',
              fr: 'Apprendre la technique',
              ar: 'تعلّم المهارات',
              fa: 'یادگرفتن مهارت‌ها',
            },
          },
        ],
      },
      {
        key: 'schedule',
        type: 'yes_no',
        required: true,
        prompt: {
          ca: 'L’horari actual et va bé?',
          es: '¿El horario actual te va bien?',
          en: 'Does the current schedule suit you?',
          fr: 'L’horaire actuel te convient-il ?',
          ar: 'هل يناسبك الموعد الحالي؟',
          fa: 'آیا برنامه‌ی فعلی برایتان مناسب است؟',
        },
      },
      {
        key: 'comment',
        type: 'free_text',
        required: false,
        prompt: {
          ca: 'Vols dir-nos alguna cosa més?',
          es: '¿Quieres decirnos algo más?',
          en: 'Is there anything else you would like to tell us?',
          fr: 'Veux-tu nous dire autre chose ?',
          ar: 'هل تريدين أن تخبرينا بشيء آخر؟',
          fa: 'آیا می‌خواهید چیز دیگری به ما بگویید؟',
        },
      },
    ],
  },
  {
    key: 'open-day',
    minutesAgo: 50,
    title: {
      ca: 'La jornada de portes obertes',
      es: 'La jornada de puertas abiertas',
      en: 'The open day',
      fr: 'La journée portes ouvertes',
      ar: 'يوم الأبواب المفتوحة',
      fa: 'روز درهای باز',
    },
    questions: [
      {
        key: 'rating',
        type: 'rating',
        required: true,
        prompt: {
          ca: 'Com valores la jornada de portes obertes?',
          es: '¿Cómo valoras la jornada de puertas abiertas?',
          en: 'How would you rate the open day?',
          fr: 'Comment évalues-tu la journée portes ouvertes ?',
          ar: 'كيف تقيّمين يوم الأبواب المفتوحة؟',
          fa: 'به روز درهای باز چه امتیازی می‌دهید؟',
        },
      },
      {
        key: 'brought-friend',
        type: 'yes_no',
        required: true,
        prompt: {
          ca: 'Hi vas portar alguna amiga?',
          es: '¿Llevaste a alguna amiga?',
          en: 'Did you bring a friend?',
          fr: 'As-tu amené une amie ?',
          ar: 'هل أحضرتِ صديقة معك؟',
          fa: 'آیا دوستی را با خود آوردید؟',
        },
      },
      {
        key: 'activity',
        type: 'multiple_choice',
        required: true,
        prompt: {
          ca: 'Quina activitat va agradar més?',
          es: '¿Qué actividad gustó más?',
          en: 'Which activity was the favourite?',
          fr: 'Quelle activité a le plus plu ?',
          ar: 'أي نشاط كان الأكثر إعجابًا؟',
          fa: 'کدام فعالیت بیشتر مورد پسند بود؟',
        },
        options: [
          {
            id: 'penalties',
            label: {
              ca: 'El concurs de penals',
              es: 'El concurso de penaltis',
              en: 'The penalty contest',
              fr: 'Le concours de penaltys',
              ar: 'مسابقة ركلات الجزاء',
              fa: 'مسابقه‌ی پنالتی',
            },
          },
          {
            id: 'mixed_game',
            label: {
              ca: 'El partit mixt',
              es: 'El partido mixto',
              en: 'The mixed game',
              fr: 'Le match mixte',
              ar: 'المباراة المختلطة',
              fa: 'بازی مختلط',
            },
          },
          {
            id: 'snack',
            label: {
              ca: 'El berenar',
              es: 'La merienda',
              en: 'The snack',
              fr: 'Le goûter',
              ar: 'الوجبة الخفيفة',
              fa: 'عصرانه',
            },
          },
        ],
      },
      {
        key: 'next-time',
        type: 'free_text',
        required: false,
        prompt: {
          ca: 'Què canviaries per a la propera vegada?',
          es: '¿Qué cambiarías para la próxima vez?',
          en: 'What would you change next time?',
          fr: 'Que changerais-tu la prochaine fois ?',
          ar: 'ماذا ستغيرين في المرة القادمة؟',
          fa: 'دفعه‌ی بعد چه چیزی را تغییر می‌دهید؟',
        },
      },
    ],
    startedAnswers: { rating: 4, 'brought-friend': true },
  },
];

/** The audience the two surveys are sent to: the four testers, by name. */
export const SURVEY_GROUP_NAME = 'Proves de l’aplicació (Inici)';
