/**
 * The Activitats content for the tester ground (RAPP-885): the categories and
 * the activities the four test players share. Everything is fictional. Dates
 * are days relative to the run, so the data reads right whenever it is loaded.
 *
 * Times are UTC, the database time: 17:00 is 18:00 in Barcelona in winter.
 */

import type { Translated } from '../../lib/ground';

export type CategoryKey =
  'entrenaments' | 'cursos' | 'cultura' | 'feina' | 'idiomes' | 'sortides' | 'trobades';

export interface CategoryData {
  readonly key: CategoryKey;
  readonly name: Translated;
  readonly icon:
    | 'dumbbell'
    | 'graduation-cap'
    | 'theater'
    | 'briefcase-business'
    | 'languages'
    | 'footprints'
    | 'users';
  readonly color: 'primary' | 'secondary' | 'accent' | 'chart-1' | 'chart-2' | 'chart-3';
}

/** Every icon of the app's catalog once, in the order the filters show them. */
export const CATEGORIES: readonly CategoryData[] = [
  {
    key: 'entrenaments',
    icon: 'dumbbell',
    color: 'primary',
    name: {
      ca: 'Entrenaments',
      es: 'Entrenamientos',
      en: 'Training',
      fr: 'Entraînements',
      ar: 'التدريبات',
      fa: 'تمرین‌ها',
    },
  },
  {
    key: 'cursos',
    icon: 'graduation-cap',
    color: 'secondary',
    name: {
      ca: 'Cursos i tallers',
      es: 'Cursos y talleres',
      en: 'Courses and workshops',
      fr: 'Cours et ateliers',
      ar: 'الدورات وورش العمل',
      fa: 'دوره‌ها و کارگاه‌ها',
    },
  },
  {
    key: 'cultura',
    icon: 'theater',
    color: 'accent',
    name: {
      ca: 'Activitats culturals',
      es: 'Actividades culturales',
      en: 'Cultural activities',
      fr: 'Activités culturelles',
      ar: 'الأنشطة الثقافية',
      fa: 'فعالیت‌های فرهنگی',
    },
  },
  {
    key: 'feina',
    icon: 'briefcase-business',
    color: 'chart-1',
    name: {
      ca: 'Inserció laboral',
      es: 'Inserción laboral',
      en: 'Finding work',
      fr: 'Insertion professionnelle',
      ar: 'الإدماج المهني',
      fa: 'ورود به بازار کار',
    },
  },
  {
    key: 'idiomes',
    icon: 'languages',
    color: 'chart-2',
    name: {
      ca: "Classes d'idiomes",
      es: 'Clases de idiomas',
      en: 'Language classes',
      fr: 'Cours de langues',
      ar: 'دروس اللغة',
      fa: 'کلاس‌های زبان',
    },
  },
  {
    key: 'sortides',
    icon: 'footprints',
    color: 'chart-3',
    name: {
      ca: 'Sortides',
      es: 'Salidas',
      en: 'Outings',
      fr: 'Sorties',
      ar: 'الرحلات',
      fa: 'گردش‌ها',
    },
  },
  {
    key: 'trobades',
    icon: 'users',
    color: 'secondary',
    name: {
      ca: 'Trobades',
      es: 'Encuentros',
      en: 'Get-togethers',
      fr: 'Rencontres',
      ar: 'لقاءات',
      fa: 'دورهمی‌ها',
    },
  },
];

export type SignupState = 'interested' | 'confirmed' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'excused';

/**
 * When an activity was published. `old` is before the testers joined, so it
 * never says "Nou". `recent` is after they joined and before the record of
 * what is seen started, which also counts as seen. A number is minutes before
 * the run: new to every tester who has not dealt with it. Keep these small:
 * on a database where the record of what is seen started minutes earlier,
 * anything published before that start counts as seen.
 */
export type Published = 'old' | 'recent' | number;

export interface ActivityData {
  readonly key: string;
  readonly category: CategoryKey;
  readonly title: Translated;
  readonly description: Translated;
  readonly location: string;
  /** Day of the first session, relative to the run. */
  readonly day: number;
  /** UTC start time. */
  readonly time: string;
  readonly minutes: number;
  /** Weekly sessions in all, or one session when absent. */
  readonly weeklyCount?: number;
  readonly maxParticipants: number | null;
  readonly signupMode: 'none' | 'interest' | 'confirm';
  readonly published: Published;
  /** How many companions answered, in the activity's own signup state. */
  readonly companions: number;
  /** Sign-ups of the testers by tester number (1 to 4). */
  readonly testers?: Readonly<Partial<Record<1 | 2 | 3 | 4, SignupState>>>;
  /** Attendance per tester for a past session, by tester number. */
  readonly attendance?: Readonly<Record<1 | 2 | 3 | 4, AttendanceStatus>>;
}

export const ACTIVITIES: readonly ActivityData[] = [
  // Past activities, with attendance in "La meva assistència".
  {
    key: 'amistos',
    category: 'entrenaments',
    title: {
      ca: 'Partit amistós de tardor',
      es: 'Partido amistoso de otoño',
      en: 'Autumn friendly match',
      fr: "Match amical d'automne",
      ar: 'مباراة ودية في الخريف',
      fa: 'مسابقه دوستانه پاییزی',
    },
    description: {
      ca: "Partit amistós contra un equip convidat del barri. Porta la samarreta de l'equip i aigua.",
      es: 'Partido amistoso contra un equipo invitado del barrio. Trae la camiseta del equipo y agua.',
      en: 'A friendly match against a guest team from the neighbourhood. Bring your kit and water.',
      fr: "Match amical contre une équipe invitée du quartier. Apporte le maillot de l'équipe et de l'eau.",
      ar: 'مباراة ودية ضد فريق ضيف من الحي. أحضري قميص الفريق والماء.',
      fa: 'مسابقه دوستانه با یک تیم مهمان از محله. پیراهن تیم و آب همراه بیاور.',
    },
    location: 'Camp municipal',
    day: -20,
    time: '10:00',
    minutes: 120,
    maxParticipants: 22,
    signupMode: 'confirm',
    published: 'old',
    companions: 6,
    testers: { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed', 4: 'confirmed' },
    attendance: { 1: 'present', 2: 'present', 3: 'present', 4: 'present' },
  },
  {
    key: 'primers-auxilis',
    category: 'cursos',
    title: {
      ca: 'Taller de primers auxilis',
      es: 'Taller de primeros auxilios',
      en: 'First aid workshop',
      fr: 'Atelier de premiers secours',
      ar: 'ورشة الإسعافات الأولية',
      fa: 'کارگاه کمک‌های اولیه',
    },
    description: {
      ca: 'Aprendrem què fer davant una lesió al camp i com demanar ajuda. Sessió pràctica amb una infermera voluntària.',
      es: 'Aprenderemos qué hacer ante una lesión en el campo y cómo pedir ayuda. Sesión práctica con una enfermera voluntaria.',
      en: 'We will learn what to do when someone is injured on the pitch and how to call for help. A hands-on session with a volunteer nurse.',
      fr: "Nous apprendrons quoi faire en cas de blessure sur le terrain et comment demander de l'aide. Séance pratique avec une infirmière bénévole.",
      ar: 'سنتعلم ما يجب فعله عند حدوث إصابة في الملعب وكيف نطلب المساعدة. جلسة عملية مع ممرضة متطوعة.',
      fa: 'یاد می‌گیریم هنگام آسیب‌دیدگی در زمین چه کنیم و چطور کمک بخواهیم. جلسه عملی با یک پرستار داوطلب.',
    },
    location: 'Sala polivalent',
    day: -12,
    time: '16:30',
    minutes: 120,
    maxParticipants: 15,
    signupMode: 'confirm',
    published: 'old',
    companions: 4,
    testers: { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed', 4: 'confirmed' },
    attendance: { 1: 'present', 2: 'excused', 3: 'absent', 4: 'present' },
  },
  {
    key: 'sopar',
    category: 'trobades',
    title: {
      ca: 'Sopar de germanor',
      es: 'Cena de hermandad',
      en: 'Shared dinner',
      fr: 'Dîner convivial',
      ar: 'عشاء الأخوة',
      fa: 'شام دوستانه',
    },
    description: {
      ca: 'Cadascuna porta un plat del seu país i el compartim. Les famílies també hi són benvingudes.',
      es: 'Cada una trae un plato de su país y lo compartimos. Las familias también son bienvenidas.',
      en: 'Everyone brings a dish from her country and we share it. Families are welcome too.',
      fr: 'Chacune apporte un plat de son pays et nous le partageons. Les familles sont aussi les bienvenues.',
      ar: 'تحضر كل واحدة طبقاً من بلدها ونتشاركه. العائلات مرحب بها أيضاً.',
      fa: 'هر کس غذایی از کشور خودش می‌آورد و با هم می‌خوریم. خانواده‌ها هم خوش آمدند.',
    },
    location: 'Centre cívic del barri',
    day: -4,
    time: '18:30',
    minutes: 150,
    maxParticipants: null,
    signupMode: 'interest',
    published: 'old',
    companions: 6,
    testers: { 1: 'interested', 2: 'interested', 3: 'interested', 4: 'interested' },
    attendance: { 1: 'present', 2: 'present', 3: 'present', 4: 'absent' },
  },

  // The weekly training, published before the testers joined: never "Nou".
  {
    key: 'entrenament-setmanal',
    category: 'entrenaments',
    title: {
      ca: 'Entrenament setmanal',
      es: 'Entrenamiento semanal',
      en: 'Weekly training',
      fr: 'Entraînement hebdomadaire',
      ar: 'التدريب الأسبوعي',
      fa: 'تمرین هفتگی',
    },
    description: {
      ca: 'Escalfament, exercicis amb pilota i partidet final. Porta roba esportiva, botes i aigua.',
      es: 'Calentamiento, ejercicios con balón y partidillo final. Trae ropa deportiva, botas y agua.',
      en: 'Warm-up, ball drills and a short match to finish. Bring sports clothes, boots and water.',
      fr: "Échauffement, exercices avec ballon et petit match pour finir. Apporte une tenue de sport, des crampons et de l'eau.",
      ar: 'إحماء وتمارين بالكرة ومباراة قصيرة في النهاية. أحضري ملابس رياضية وحذاء كرة وماء.',
      fa: 'گرم کردن، تمرین با توپ و یک بازی کوتاه در پایان. لباس ورزشی، کفش فوتبال و آب بیاور.',
    },
    location: 'Camp municipal',
    day: -33,
    time: '17:30',
    minutes: 90,
    weeklyCount: 11,
    maxParticipants: null,
    signupMode: 'none',
    published: 'old',
    companions: 0,
  },
  {
    key: 'entrenament-tecnica',
    category: 'entrenaments',
    title: {
      ca: 'Entrenament de tècnica',
      es: 'Entrenamiento de técnica',
      en: 'Skills training',
      fr: 'Entraînement technique',
      ar: 'تدريب المهارات',
      fa: 'تمرین تکنیک',
    },
    description: {
      ca: 'Passades, control i xut a porteria en grups petits. Obert a tots els nivells.',
      es: 'Pases, control y tiro a portería en grupos pequeños. Abierto a todos los niveles.',
      en: 'Passing, ball control and shooting in small groups. Open to every level.',
      fr: 'Passes, contrôle et tirs au but en petits groupes. Ouvert à tous les niveaux.',
      ar: 'تمرير واستلام وتسديد على المرمى في مجموعات صغيرة. مفتوح لجميع المستويات.',
      fa: 'پاس، کنترل توپ و شوت به دروازه در گروه‌های کوچک. برای همه سطح‌ها.',
    },
    location: 'Camp municipal',
    day: -30,
    time: '17:30',
    minutes: 90,
    weeklyCount: 11,
    maxParticipants: null,
    signupMode: 'none',
    published: 'old',
    companions: 0,
  },

  // Upcoming activities.
  {
    // The earliest upcoming one: Inici shows it to a tester with no sign-up.
    key: 'taller-cuina',
    category: 'cultura',
    title: {
      ca: 'Taller de cuina del món',
      es: 'Taller de cocina del mundo',
      en: 'World cooking workshop',
      fr: 'Atelier de cuisine du monde',
      ar: 'ورشة طبخ من العالم',
      fa: 'کارگاه آشپزی از سراسر دنیا',
    },
    description: {
      ca: "Cuinarem plegades receptes de tres països i després sopem juntes. Els ingredients els porta l'equip tècnic.",
      es: 'Cocinaremos juntas recetas de tres países y después cenamos juntas. Los ingredientes los trae el equipo técnico.',
      en: 'We will cook recipes from three countries together and then eat together. The staff bring the ingredients.',
      fr: "Nous cuisinerons ensemble des recettes de trois pays, puis nous dînerons ensemble. L'équipe technique apporte les ingrédients.",
      ar: 'سنطبخ معاً وصفات من ثلاثة بلدان ثم نتناول العشاء معاً. يحضر الطاقم الفني المكونات.',
      fa: 'با هم غذاهایی از سه کشور می‌پزیم و بعد با هم شام می‌خوریم. مواد لازم را کادر فنی می‌آورد.',
    },
    location: 'Cuina del centre cívic',
    day: 1,
    time: '16:00',
    minutes: 150,
    maxParticipants: 15,
    signupMode: 'interest',
    published: 8,
    companions: 4,
  },
  {
    // Testers 2 and 4 start signed up: Inici shows this one to them.
    key: 'conversa-catala',
    category: 'idiomes',
    title: {
      ca: 'Grup de conversa en català',
      es: 'Grupo de conversación en catalán',
      en: 'Catalan conversation group',
      fr: 'Groupe de conversation en catalan',
      ar: 'مجموعة محادثة باللغة الكتالانية',
      fa: 'گروه گفت‌وگو به زبان کاتالان',
    },
    description: {
      ca: 'Practiquem el català parlant de coses del dia a dia, amb berenar. No cal cap nivell.',
      es: 'Practicamos el catalán hablando de cosas del día a día, con merienda. No hace falta nivel.',
      en: 'We practise Catalan by talking about everyday things, with a snack. No level needed.',
      fr: 'Nous pratiquons le catalan en parlant du quotidien, autour d’un goûter. Aucun niveau requis.',
      ar: 'نتدرب على الكتالانية بالحديث عن أمور الحياة اليومية مع وجبة خفيفة. لا يلزم أي مستوى.',
      fa: 'با صحبت درباره کارهای روزمره و کمی خوراکی، کاتالان تمرین می‌کنیم. هیچ سطحی لازم نیست.',
    },
    location: 'Aula de formació',
    day: 3,
    time: '16:00',
    minutes: 90,
    maxParticipants: 12,
    signupMode: 'confirm',
    published: 'recent',
    companions: 3,
    testers: { 2: 'confirmed', 4: 'confirmed' },
  },
  {
    key: 'portes-obertes',
    category: 'trobades',
    title: {
      ca: 'Jornada de portes obertes al camp',
      es: 'Jornada de puertas abiertas en el campo',
      en: 'Open day at the pitch',
      fr: 'Journée portes ouvertes au terrain',
      ar: 'يوم مفتوح في الملعب',
      fa: 'روز درهای باز در زمین فوتبال',
    },
    description: {
      ca: 'Un matí per jugar amb amigues i famílies. Vine quan vulguis, no cal inscripció.',
      es: 'Una mañana para jugar con amigas y familias. Ven cuando quieras, no hace falta inscripción.',
      en: 'A morning to play with friends and families. Come whenever you like, no sign-up needed.',
      fr: 'Une matinée pour jouer avec des amies et des familles. Viens quand tu veux, sans inscription.',
      ar: 'صباح للعب مع الصديقات والعائلات. تعالي متى شئت، لا حاجة للتسجيل.',
      fa: 'یک صبح برای بازی با دوستان و خانواده‌ها. هر وقت خواستی بیا، ثبت‌نام لازم نیست.',
    },
    location: 'Camp municipal',
    day: 6,
    time: '09:00',
    minutes: 180,
    maxParticipants: null,
    signupMode: 'none',
    published: 7,
    companions: 0,
  },
  {
    // Every place is taken by the companions.
    key: 'platja',
    category: 'sortides',
    title: {
      ca: 'Sortida a la platja',
      es: 'Salida a la playa',
      en: 'Trip to the beach',
      fr: 'Sortie à la plage',
      ar: 'رحلة إلى الشاطئ',
      fa: 'گردش به ساحل',
    },
    description: {
      ca: 'Anem juntes amb tren, juguem a futbol platja i dinem a la sorra. Porta crema solar i esmorzar.',
      es: 'Vamos juntas en tren, jugamos a fútbol playa y comemos en la arena. Trae crema solar y almuerzo.',
      en: 'We travel together by train, play beach football and have lunch on the sand. Bring sun cream and a snack.',
      fr: 'Nous y allons ensemble en train, nous jouons au foot sur la plage et déjeunons sur le sable. Apporte de la crème solaire et un en-cas.',
      ar: 'نذهب معاً بالقطار ونلعب كرة القدم الشاطئية ونتناول الغداء على الرمل. أحضري واقي الشمس ووجبة خفيفة.',
      fa: 'با هم با قطار می‌رویم، فوتبال ساحلی بازی می‌کنیم و روی شن ناهار می‌خوریم. کرم ضدآفتاب و خوراکی بیاور.',
    },
    location: "Punt de trobada a l'estació",
    day: 8,
    time: '08:30',
    minutes: 360,
    maxParticipants: 6,
    signupMode: 'confirm',
    published: 6,
    companions: 6,
  },
  {
    // Testers 2 and 4 start interested here.
    key: 'drets-laborals',
    category: 'feina',
    title: {
      ca: 'Xerrada sobre drets laborals',
      es: 'Charla sobre derechos laborales',
      en: 'Talk on workers’ rights',
      fr: 'Causerie sur les droits du travail',
      ar: 'حديث عن حقوق العمل',
      fa: 'گفت‌وگو درباره حقوق کار',
    },
    description: {
      ca: 'Una advocada voluntària explica contractes, nòmines i on demanar ajuda. Hi haurà temps per a preguntes.',
      es: 'Una abogada voluntaria explica contratos, nóminas y dónde pedir ayuda. Habrá tiempo para preguntas.',
      en: 'A volunteer lawyer explains contracts, payslips and where to ask for help. There will be time for questions.',
      fr: "Une avocate bénévole explique les contrats, les fiches de paie et où demander de l'aide. Il y aura du temps pour les questions.",
      ar: 'محامية متطوعة تشرح العقود وقسائم الراتب وأين تطلبين المساعدة. سيكون هناك وقت للأسئلة.',
      fa: 'یک وکیل داوطلب درباره قرارداد، فیش حقوقی و جاهایی که می‌شود کمک گرفت توضیح می‌دهد. برای پرسش هم وقت هست.',
    },
    location: 'Sala polivalent',
    day: 10,
    time: '16:30',
    minutes: 90,
    maxParticipants: null,
    signupMode: 'interest',
    published: 5,
    companions: 2,
    testers: { 2: 'interested', 4: 'interested' },
  },
  {
    // Four weekly sessions: one card per session, "Nou" on the first only.
    key: 'curs-informatica',
    category: 'cursos',
    title: {
      ca: "Curs d'informàtica bàsica",
      es: 'Curso de informática básica',
      en: 'Basic computer course',
      fr: "Cours d'informatique de base",
      ar: 'دورة أساسيات الحاسوب',
      fa: 'دوره مقدماتی کامپیوتر',
    },
    description: {
      ca: 'Quatre sessions per fer servir el correu, omplir formularis en línia i demanar cita prèvia.',
      es: 'Cuatro sesiones para usar el correo, rellenar formularios en línea y pedir cita previa.',
      en: 'Four sessions on using email, filling in online forms and booking appointments.',
      fr: 'Quatre séances pour utiliser la messagerie, remplir des formulaires en ligne et prendre rendez-vous.',
      ar: 'أربع جلسات لاستخدام البريد الإلكتروني وتعبئة النماذج عبر الإنترنت وحجز المواعيد.',
      fa: 'چهار جلسه برای کار با ایمیل، پر کردن فرم‌های آنلاین و گرفتن وقت قبلی.',
    },
    location: 'Aula de formació',
    day: 12,
    time: '16:00',
    minutes: 120,
    weeklyCount: 4,
    maxParticipants: 10,
    signupMode: 'confirm',
    published: 4,
    companions: 3,
  },
  {
    // Testers 1 and 3 start with a cancelled sign-up here.
    key: 'museu',
    category: 'cultura',
    title: {
      ca: 'Visita guiada al museu',
      es: 'Visita guiada al museo',
      en: 'Guided museum visit',
      fr: 'Visite guidée du musée',
      ar: 'زيارة موجهة إلى المتحف',
      fa: 'بازدید راهنمادار از موزه',
    },
    description: {
      ca: "Visita amb una guia a l'exposició sobre la història del futbol femení. L'entrada és gratuïta.",
      es: 'Visita con una guía a la exposición sobre la historia del fútbol femenino. La entrada es gratuita.',
      en: 'A guided visit to the exhibition on the history of women’s football. Entry is free.',
      fr: "Visite guidée de l'exposition sur l'histoire du football féminin. L'entrée est gratuite.",
      ar: 'زيارة مع مرشدة إلى معرض تاريخ كرة القدم النسائية. الدخول مجاني.',
      fa: 'بازدید همراه راهنما از نمایشگاه تاریخ فوتبال زنان. ورود رایگان است.',
    },
    location: 'Museu de la ciutat',
    day: 16,
    time: '15:30',
    minutes: 120,
    maxParticipants: 20,
    signupMode: 'confirm',
    published: 3,
    companions: 5,
    testers: { 1: 'cancelled', 3: 'cancelled' },
  },
  {
    key: 'curriculum',
    category: 'feina',
    title: {
      ca: 'Taller per preparar el currículum',
      es: 'Taller para preparar el currículum',
      en: 'CV writing workshop',
      fr: 'Atelier pour préparer son CV',
      ar: 'ورشة لإعداد السيرة الذاتية',
      fa: 'کارگاه آماده کردن رزومه',
    },
    description: {
      ca: "Preparem el currículum pas a pas i practiquem una entrevista de feina. Porta'l si ja en tens un.",
      es: 'Preparamos el currículum paso a paso y practicamos una entrevista de trabajo. Tráelo si ya tienes uno.',
      en: 'We write the CV step by step and practise a job interview. Bring yours if you already have one.',
      fr: "Nous préparons le CV pas à pas et nous simulons un entretien d'embauche. Apporte le tien si tu en as déjà un.",
      ar: 'نعدّ السيرة الذاتية خطوة بخطوة ونتدرب على مقابلة عمل. أحضري سيرتك إن كانت لديك.',
      fa: 'رزومه را قدم به قدم آماده می‌کنیم و مصاحبه کاری را تمرین می‌کنیم. اگر رزومه داری، همراه بیاور.',
    },
    location: 'Aula de formació',
    day: 19,
    time: '16:30',
    minutes: 120,
    maxParticipants: 10,
    signupMode: 'confirm',
    published: 2,
    companions: 1,
  },
  {
    key: 'torneig',
    category: 'entrenaments',
    title: {
      ca: 'Torneig solidari de futbol',
      es: 'Torneo solidario de fútbol',
      en: 'Charity football tournament',
      fr: 'Tournoi de football solidaire',
      ar: 'بطولة كرة قدم تضامنية',
      fa: 'مسابقات فوتبال خیریه',
    },
    description: {
      ca: 'Torneig de matí amb equips mixtos de tot el barri. Ens repartim en equips el mateix dia.',
      es: 'Torneo de mañana con equipos mixtos de todo el barrio. Nos repartimos en equipos el mismo día.',
      en: 'A morning tournament with mixed teams from across the neighbourhood. We split into teams on the day.',
      fr: 'Tournoi du matin avec des équipes mixtes de tout le quartier. Les équipes se forment le jour même.',
      ar: 'بطولة صباحية بفرق مختلطة من كل الحي. نتوزع على الفرق في اليوم نفسه.',
      fa: 'مسابقه صبحگاهی با تیم‌های مختلط از سراسر محله. تیم‌ها همان روز مشخص می‌شوند.',
    },
    location: 'Camp municipal',
    day: 24,
    time: '09:00',
    minutes: 300,
    maxParticipants: 40,
    signupMode: 'confirm',
    published: 1,
    companions: 6,
  },
];
