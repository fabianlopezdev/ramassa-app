/**
 * Ajuda › Guies for the tester ground (RAPP-885): four guide categories and
 * ten guides with a body in the editor's block format (paragraphs and steps)
 * in every app language. They give general orientation in plain words and
 * always point to the staff for her own case.
 */

import { LANGS, type ImageName, type Lang, type Translated } from '../../lib/ground';

const t = (ca: string, es: string, en: string, fr: string, ar: string, fa: string): Translated => ({
  ca,
  es,
  en,
  fr,
  ar,
  fa,
});

type Block =
  | { readonly type: 'paragraph'; readonly text: Translated }
  | { readonly type: 'step'; readonly title: Translated; readonly text: Translated };

const p = (text: Translated): Block => ({ type: 'paragraph', text });
const step = (title: Translated, text: Translated): Block => ({ type: 'step', title, text });

type StoredBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'step'; title: string; text: string; imageUrl: null; imageAlt: null };

/** The stored body: one list of blocks per language, the same shape in each. */
export function storedBody(blocks: readonly Block[]): Record<Lang, StoredBlock[]> {
  return Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      blocks.map((block): StoredBlock =>
        block.type === 'paragraph'
          ? { type: 'paragraph', text: block.text[lang] }
          : {
              type: 'step',
              title: block.title[lang],
              text: block.text[lang],
              imageUrl: null,
              imageAlt: null,
            },
      ),
    ]),
  ) as Record<Lang, StoredBlock[]>;
}

export interface GuideCategorySeed {
  readonly slug: string;
  readonly name: Translated;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
}

/** The four guide categories, each with its own colour (RAPP-868). */
export const GUIDE_CATEGORIES: readonly GuideCategorySeed[] = [
  {
    slug: 'rights-asylum',
    name: t(
      'Drets i asil',
      'Derechos y asilo',
      'Rights and asylum',
      'Droits et asile',
      'الحقوق واللجوء',
      'حقوق و پناهندگی',
    ),
    icon: 'scale',
    color: 'indigo',
    sortOrder: 10,
  },
  {
    slug: 'digital-literacy',
    name: t(
      'Alfabetització digital',
      'Alfabetización digital',
      'Digital literacy',
      'Compétences numériques',
      'المهارات الرقمية',
      'سواد دیجیتال',
    ),
    icon: 'laptop',
    color: 'sky',
    sortOrder: 20,
  },
  {
    slug: 'gender-equality',
    name: t(
      'Igualtat de gènere',
      'Igualdad de género',
      'Gender equality',
      'Égalité de genre',
      'المساواة بين الجنسين',
      'برابری جنسیتی',
    ),
    icon: 'venus',
    color: 'purple',
    sortOrder: 30,
  },
  {
    slug: 'general-resources',
    name: t(
      'Recursos generals',
      'Recursos generales',
      'General resources',
      'Ressources générales',
      'موارد عامة',
      'منابع عمومی',
    ),
    icon: 'book-open',
    color: 'teal',
    sortOrder: 40,
  },
];

export interface GuideSeed {
  readonly key: string;
  readonly category: string;
  readonly contentType: 'article' | 'tutorial';
  readonly published: { readonly minutesAgo: number } | { readonly daysAgo: number };
  readonly title: Translated;
  readonly body: readonly Block[];
  readonly image?: ImageName;
}

export const GUIDES: readonly GuideSeed[] = [
  // Drets i asil -----------------------------------------------------------------------
  {
    key: 'rights-international-protection',
    category: 'rights-asylum',
    contentType: 'article',
    published: { minutesAgo: 2 },
    image: 'guide-01',
    title: t(
      'Què vol dir protecció internacional',
      'Qué significa protección internacional',
      'What international protection means',
      'Ce que signifie la protection internationale',
      'ماذا تعني الحماية الدولية',
      'حمایت بین‌المللی یعنی چه',
    ),
    body: [
      p(
        t(
          'La protecció internacional és el nom general que reben l’asil i altres formes de protecció per a persones que han hagut de marxar del seu país perquè hi corrien perill. Aquesta guia explica les idees bàsiques amb paraules senzilles.',
          'La protección internacional es el nombre general que reciben el asilo y otras formas de protección para personas que han tenido que dejar su país porque corrían peligro. Esta guía explica las ideas básicas con palabras sencillas.',
          'International protection is the general name for asylum and other forms of protection for people who had to leave their country because they were in danger. This guide explains the basic ideas in simple words.',
          "La protection internationale est le nom général de l'asile et des autres formes de protection pour les personnes qui ont dû quitter leur pays parce qu'elles y étaient en danger. Ce guide explique les idées de base avec des mots simples.",
          'الحماية الدولية هي الاسم العام للجوء ولأشكال الحماية الأخرى للأشخاص الذين اضطروا إلى مغادرة بلدهم لأنهم كانوا في خطر. يشرح هذا الدليل الأفكار الأساسية بكلمات بسيطة.',
          'حمایت بین‌المللی نام کلی پناهندگی و دیگر شکل‌های حمایت از کسانی است که به خاطر خطر مجبور به ترک کشورشان شده‌اند. این راهنما ایده‌های اصلی را با کلمات ساده توضیح می‌دهد.',
        ),
      ),
      p(
        t(
          'Cada història és diferent. Les persones que estudien la teva sol·licitud volen entendre per què vas marxar i què et podria passar si tornessis. Per això és important explicar-ho amb calma i de manera ordenada.',
          'Cada historia es diferente. Las personas que estudian tu solicitud quieren entender por qué te fuiste y qué te podría pasar si volvieras. Por eso es importante explicarlo con calma y de forma ordenada.',
          'Every story is different. The people who study your application want to understand why you left and what could happen to you if you went back. That is why it helps to explain it calmly and in order.',
          "Chaque histoire est différente. Les personnes qui étudient ta demande veulent comprendre pourquoi tu es partie et ce qui pourrait t'arriver si tu revenais. C'est pourquoi il est important de l'expliquer calmement et dans l'ordre.",
          'كل قصة مختلفة. يريد الأشخاص الذين يدرسون طلبك أن يفهموا لماذا غادرتِ وما الذي قد يحدث لك إذا عدتِ. لذلك من المهم أن تشرحي ذلك بهدوء وبترتيب.',
          'هر داستانی متفاوت است. کسانی که درخواستت را بررسی می‌کنند می‌خواهند بفهمند چرا رفتی و اگر برگردی چه ممکن است برایت پیش بیاید. برای همین مهم است که آن را آرام و مرتب توضیح دهی.',
        ),
      ),
      p(
        t(
          'Mentre esperes una resposta tens drets: pots rebre atenció sanitària, aprendre l’idioma i participar en activitats com les del Projecte. Guarda sempre una còpia dels papers que et donin.',
          'Mientras esperas una respuesta tienes derechos: puedes recibir atención sanitaria, aprender el idioma y participar en actividades como las del Proyecto. Guarda siempre una copia de los papeles que te den.',
          'While you wait for an answer you have rights: you can receive health care, learn the language and take part in activities like the ones in the Project. Always keep a copy of the papers you are given.',
          "Pendant que tu attends une réponse, tu as des droits : tu peux recevoir des soins, apprendre la langue et participer à des activités comme celles du Projet. Garde toujours une copie des papiers qu'on te donne.",
          'أثناء انتظار الرد لديك حقوق: يمكنك تلقي الرعاية الصحية وتعلم اللغة والمشاركة في أنشطة مثل أنشطة المشروع. احتفظي دائماً بنسخة من الأوراق التي تُعطى لك.',
          'تا وقتی منتظر پاسخ هستی حقوقی داری: می‌توانی خدمات درمانی بگیری، زبان یاد بگیری و در فعالیت‌هایی مثل فعالیت‌های پروژه شرکت کنی. همیشه یک نسخه از کاغذهایی که به تو می‌دهند نگه دار.',
        ),
      ),
      p(
        t(
          'Aquesta guia només orienta. Per a la teva situació concreta, parla amb una advocada o demana a l’equip tècnic que t’ajudi a trobar-ne una.',
          'Esta guía solo orienta. Para tu situación concreta, habla con una abogada o pide al equipo técnico que te ayude a encontrar una.',
          'This guide is only for orientation. For your own situation, talk to a lawyer or ask the staff to help you find one.',
          "Ce guide sert seulement à t'orienter. Pour ta situation précise, parle avec une avocate ou demande à l'équipe technique de t'aider à en trouver une.",
          'هذا الدليل للتوجيه فقط. بالنسبة لوضعك الخاص، تحدثي مع محامية أو اطلبي من الفريق الفني مساعدتك في إيجاد واحدة.',
          'این راهنما فقط برای آشنایی است. برای وضعیت خودت با یک وکیل صحبت کن یا از کادر فنی بخواه در پیدا کردن وکیل کمکت کنند.',
        ),
      ),
    ],
  },
  {
    key: 'rights-lawyer-appointment',
    category: 'rights-asylum',
    contentType: 'tutorial',
    published: { minutesAgo: 7 },
    image: 'guide-02',
    title: t(
      'Com preparar una cita amb una advocada',
      'Cómo preparar una cita con una abogada',
      'How to prepare for a meeting with a lawyer',
      'Comment préparer un rendez-vous avec une avocate',
      'كيف تستعدين لموعد مع محامية',
      'چطور برای قرار با وکیل آماده شوی',
    ),
    body: [
      p(
        t(
          'Una cita amb una advocada passa ràpid. Si la prepares abans, aprofitaràs millor el temps i sortiràs amb les idees més clares.',
          'Una cita con una abogada pasa rápido. Si la preparas antes, aprovecharás mejor el tiempo y saldrás con las ideas más claras.',
          'A meeting with a lawyer goes by quickly. If you prepare it beforehand, you will use the time better and leave with clearer ideas.',
          'Un rendez-vous avec une avocate passe vite. Si tu le prépares avant, tu profiteras mieux du temps et tu repartiras avec des idées plus claires.',
          'يمر الموعد مع المحامية بسرعة. إذا استعددتِ له مسبقاً ستستفيدين من الوقت أكثر وتخرجين بأفكار أوضح.',
          'قرار با وکیل زود تمام می‌شود. اگر از قبل آماده شوی، از وقت بهتر استفاده می‌کنی و با ذهنی روشن‌تر بیرون می‌آیی.',
        ),
      ),
      step(
        t(
          'Reuneix els teus papers',
          'Reúne tus papeles',
          'Gather your papers',
          'Rassemble tes papiers',
          'اجمعي أوراقك',
          'مدارکت را جمع کن',
        ),
        t(
          'Posa en una carpeta el passaport o el document que tinguis, els papers que t’hagin donat a les oficines i qualsevol carta que hagis rebut. Si pots, fes-ne fotos amb el mòbil.',
          'Pon en una carpeta el pasaporte o el documento que tengas, los papeles que te hayan dado en las oficinas y cualquier carta que hayas recibido. Si puedes, hazles fotos con el móvil.',
          'Put your passport or whatever document you have, the papers you were given at offices and any letters you received into one folder. If you can, take photos of them with your phone.',
          'Mets dans un dossier ton passeport ou le document que tu as, les papiers reçus dans les bureaux et toutes les lettres reçues. Si tu peux, prends-les en photo avec ton téléphone.',
          'ضعي في ملف واحد جواز سفرك أو أي وثيقة لديك، والأوراق التي أُعطيت لك في المكاتب، وأي رسالة وصلتك. وإن استطعتِ صوّريها بهاتفك.',
          'گذرنامه یا هر مدرکی که داری، کاغذهایی که در اداره‌ها به تو داده‌اند و هر نامه‌ای که گرفته‌ای را در یک پوشه بگذار. اگر می‌توانی با گوشی از آن‌ها عکس بگیر.',
        ),
      ),
      step(
        t(
          'Escriu les teves preguntes',
          'Escribe tus preguntas',
          'Write down your questions',
          'Écris tes questions',
          'اكتبي أسئلتك',
          'پرسش‌هایت را بنویس',
        ),
        t(
          'Apunta en un paper o al mòbil què vols saber. Començar per la pregunta més important t’assegura que no se t’oblida.',
          'Apunta en un papel o en el móvil qué quieres saber. Empezar por la pregunta más importante te asegura que no se te olvida.',
          'Note on paper or on your phone what you want to know. Starting with the most important question makes sure you do not forget it.',
          "Note sur un papier ou sur ton téléphone ce que tu veux savoir. Commencer par la question la plus importante t'assure de ne pas l'oublier.",
          'دوّني على ورقة أو على الهاتف ما تريدين معرفته. البدء بالسؤال الأهم يضمن ألا تنسيه.',
          'روی کاغذ یا گوشی بنویس چه می‌خواهی بدانی. اگر با مهم‌ترین پرسش شروع کنی، مطمئن می‌شوی فراموشش نمی‌کنی.',
        ),
      ),
      step(
        t(
          'Demana interpretació si la necessites',
          'Pide interpretación si la necesitas',
          'Ask for an interpreter if you need one',
          'Demande une interprète si tu en as besoin',
          'اطلبي مترجمة إذا احتجتِ',
          'اگر لازم داری مترجم بخواه',
        ),
        t(
          'Tens dret a entendre bé el que et diuen. Si no estàs segura de l’idioma, avisa abans de la cita perquè hi hagi una intèrpret o una persona de confiança que t’ajudi.',
          'Tienes derecho a entender bien lo que te dicen. Si no estás segura del idioma, avisa antes de la cita para que haya una intérprete o una persona de confianza que te ayude.',
          'You have the right to understand clearly what you are told. If you are not sure about the language, say so before the meeting so an interpreter or someone you trust can help.',
          "Tu as le droit de bien comprendre ce qu'on te dit. Si tu n'es pas sûre de la langue, préviens avant le rendez-vous pour qu'une interprète ou une personne de confiance puisse t'aider.",
          'من حقك أن تفهمي جيداً ما يُقال لك. إذا لم تكوني متأكدة من اللغة، أخبريهم قبل الموعد لكي تحضر مترجمة أو شخص تثقين به لمساعدتك.',
          'حق داری آنچه به تو می‌گویند را خوب بفهمی. اگر به زبان مطمئن نیستی، پیش از قرار خبر بده تا مترجم یا فردی مورد اعتماد کمکت کند.',
        ),
      ),
    ],
  },
  {
    key: 'rights-at-work',
    category: 'rights-asylum',
    contentType: 'article',
    published: { daysAgo: 38 },
    image: 'guide-03',
    title: t(
      'Els teus drets com a treballadora',
      'Tus derechos como trabajadora',
      'Your rights as a worker',
      'Tes droits en tant que travailleuse',
      'حقوقك كعاملة',
      'حقوق تو به عنوان یک کارگر',
    ),
    body: [
      p(
        t(
          'Quan treballes tens drets, encara que sigui una feina de poques hores. Conèixer-los t’ajuda a fer preguntes i a demanar ajuda quan alguna cosa no va bé.',
          'Cuando trabajas tienes derechos, aunque sea un trabajo de pocas horas. Conocerlos te ayuda a hacer preguntas y a pedir ayuda cuando algo no va bien.',
          'When you work you have rights, even in a job of only a few hours. Knowing them helps you ask questions and get help when something is wrong.',
          "Quand tu travailles, tu as des droits, même pour un travail de quelques heures. Les connaître t'aide à poser des questions et à demander de l'aide quand quelque chose ne va pas.",
          'عندما تعملين لديك حقوق، حتى لو كان عملاً لساعات قليلة. معرفتها تساعدك على طرح الأسئلة وطلب المساعدة عندما لا يسير شيء على ما يرام.',
          'وقتی کار می‌کنی حقوقی داری، حتی اگر کارت فقط چند ساعت باشد. شناختن آن‌ها کمکت می‌کند سؤال بپرسی و وقتی چیزی درست نیست کمک بخواهی.',
        ),
      ),
      p(
        t(
          'Tens dret a saber quant cobraràs i quines hores faràs, a descansar, i a rebre un document que mostri el que has cobrat. Ningú no et pot tractar malament per ser dona o per venir d’un altre país.',
          'Tienes derecho a saber cuánto cobrarás y qué horas harás, a descansar y a recibir un documento que muestre lo que has cobrado. Nadie te puede tratar mal por ser mujer o por venir de otro país.',
          'You have the right to know how much you will be paid and what hours you will work, to rest, and to get a document showing what you were paid. Nobody may treat you badly for being a woman or for coming from another country.',
          "Tu as le droit de savoir combien tu seras payée et quels horaires tu feras, de te reposer et de recevoir un document qui montre ce que tu as touché. Personne ne peut te maltraiter parce que tu es une femme ou que tu viens d'un autre pays.",
          'من حقك أن تعرفي كم ستتقاضين وما ساعات عملك، وأن ترتاحي، وأن تحصلي على وثيقة تبيّن ما تقاضيته. لا يحق لأحد أن يسيء معاملتك لأنك امرأة أو لأنك من بلد آخر.',
          'حق داری بدانی چقدر حقوق می‌گیری و چه ساعت‌هایی کار می‌کنی، استراحت کنی و سندی بگیری که نشان دهد چقدر دریافت کرده‌ای. هیچ‌کس حق ندارد به خاطر زن بودن یا اهل کشور دیگری بودن با تو بدرفتاری کند.',
        ),
      ),
      p(
        t(
          'Si tens dubtes sobre la teva feina, a la secció Serveis trobaràs llocs on t’orienten sense cost. També en pots parlar amb l’equip tècnic.',
          'Si tienes dudas sobre tu trabajo, en la sección Servicios encontrarás lugares donde te orientan sin coste. También puedes hablarlo con el equipo técnico.',
          'If you have questions about your job, in the Services section you will find places that guide you free of charge. You can also talk to the staff.',
          "Si tu as des questions sur ton travail, dans la section Services tu trouveras des lieux qui t'orientent gratuitement. Tu peux aussi en parler avec l'équipe technique.",
          'إذا كانت لديك أسئلة حول عملك، ستجدين في قسم الخدمات أماكن ترشدك مجاناً. يمكنك أيضاً التحدث مع الفريق الفني.',
          'اگر درباره کارت سؤالی داری، در بخش خدمات جاهایی پیدا می‌کنی که رایگان راهنمایی‌ات می‌کنند. می‌توانی با کادر فنی هم صحبت کنی.',
        ),
      ),
    ],
  },

  // Alfabetització digital ------------------------------------------------------------
  {
    key: 'digital-create-email',
    category: 'digital-literacy',
    contentType: 'tutorial',
    published: { minutesAgo: 8 },
    image: 'guide-04',
    title: t(
      'Crear un correu electrònic pas a pas',
      'Crear un correo electrónico paso a paso',
      'Create an email address step by step',
      'Créer une adresse e-mail pas à pas',
      'إنشاء بريد إلكتروني خطوة بخطوة',
      'ساختن ایمیل قدم به قدم',
    ),
    body: [
      p(
        t(
          'Molts tràmits i ofertes de feina demanen una adreça de correu electrònic. En deu minuts en pots tenir una al mòbil.',
          'Muchos trámites y ofertas de trabajo piden una dirección de correo electrónico. En diez minutos puedes tener una en el móvil.',
          'Many forms and job offers ask for an email address. In ten minutes you can have one on your phone.',
          "Beaucoup de démarches et d'offres d'emploi demandent une adresse e-mail. En dix minutes, tu peux en avoir une sur ton téléphone.",
          'تطلب الكثير من المعاملات وعروض العمل عنوان بريد إلكتروني. في عشر دقائق يمكنك الحصول على واحد على هاتفك.',
          'بسیاری از کارهای اداری و آگهی‌های کار نشانی ایمیل می‌خواهند. در ده دقیقه می‌توانی یکی روی گوشی‌ات داشته باشی.',
        ),
      ),
      step(
        t(
          'Obre l’aplicació de correu',
          'Abre la aplicación de correo',
          'Open the email app',
          "Ouvre l'application de messagerie",
          'افتحي تطبيق البريد',
          'برنامه ایمیل را باز کن',
        ),
        t(
          'Busca l’aplicació de correu que ja porta el teu mòbil i toca l’opció per crear un compte nou.',
          'Busca la aplicación de correo que ya trae tu móvil y toca la opción para crear una cuenta nueva.',
          'Find the email app that already comes with your phone and tap the option to create a new account.',
          "Cherche l'application de messagerie déjà installée sur ton téléphone et touche l'option pour créer un nouveau compte.",
          'ابحثي عن تطبيق البريد الموجود في هاتفك واضغطي على خيار إنشاء حساب جديد.',
          'برنامه ایمیلی را که روی گوشی‌ات هست پیدا کن و گزینه ساختن حساب جدید را بزن.',
        ),
      ),
      step(
        t(
          'Tria un nom fàcil',
          'Elige un nombre fácil',
          'Choose an easy name',
          'Choisis un nom facile',
          'اختاري اسماً سهلاً',
          'یک نام ساده انتخاب کن',
        ),
        t(
          'Fes servir el teu nom i cognom, sense dibuixos ni paraules estranyes. Les empreses llegiran aquesta adreça.',
          'Usa tu nombre y apellido, sin dibujos ni palabras raras. Las empresas leerán esta dirección.',
          'Use your first name and surname, with no emojis or odd words. Employers will read this address.',
          'Utilise ton prénom et ton nom, sans dessins ni mots bizarres. Les entreprises liront cette adresse.',
          'استخدمي اسمك واسم عائلتك، دون رموز أو كلمات غريبة. ستقرأ الشركات هذا العنوان.',
          'از نام و نام خانوادگی‌ات استفاده کن، بدون شکلک یا کلمه‌های عجیب. کارفرماها این نشانی را می‌خوانند.',
        ),
      ),
      step(
        t(
          'Guarda la contrasenya en un lloc segur',
          'Guarda la contraseña en un lugar seguro',
          'Keep your password somewhere safe',
          'Garde ton mot de passe en lieu sûr',
          'احفظي كلمة المرور في مكان آمن',
          'رمز عبور را جای امنی نگه دار',
        ),
        t(
          'Escriu una contrasenya llarga que només sàpigues tu i apunta-la en un paper que guardis a casa. No la comparteixis amb ningú.',
          'Escribe una contraseña larga que solo sepas tú y apúntala en un papel que guardes en casa. No la compartas con nadie.',
          'Write a long password that only you know and note it on a paper you keep at home. Do not share it with anyone.',
          'Écris un mot de passe long que toi seule connais et note-le sur un papier que tu gardes chez toi. Ne le partage avec personne.',
          'اكتبي كلمة مرور طويلة لا يعرفها أحد غيرك، ودوّنيها على ورقة تحتفظين بها في البيت. لا تشاركيها مع أحد.',
          'رمز عبوری طولانی بنویس که فقط خودت بدانی و آن را روی کاغذی یادداشت کن که در خانه نگه می‌داری. آن را به کسی نگو.',
        ),
      ),
    ],
  },
  {
    key: 'digital-video-calls',
    category: 'digital-literacy',
    contentType: 'tutorial',
    published: { daysAgo: 33 },
    image: 'guide-05',
    title: t(
      'Fer videotrucades amb el mòbil',
      'Hacer videollamadas con el móvil',
      'Making video calls on your phone',
      'Faire des appels vidéo avec ton téléphone',
      'إجراء مكالمات الفيديو بالهاتف',
      'تماس تصویری با گوشی',
    ),
    body: [
      p(
        t(
          'Les videotrucades serveixen per parlar amb la família i també per a algunes entrevistes i cites. Aquests consells t’ajuden que tot surti bé.',
          'Las videollamadas sirven para hablar con la familia y también para algunas entrevistas y citas. Estos consejos te ayudan a que todo salga bien.',
          'Video calls are useful to talk to your family and also for some interviews and appointments. These tips help everything go well.',
          'Les appels vidéo servent à parler avec ta famille et aussi pour certains entretiens et rendez-vous. Ces conseils t’aident à ce que tout se passe bien.',
          'تفيد مكالمات الفيديو في التحدث مع العائلة وأيضاً في بعض المقابلات والمواعيد. تساعدك هذه النصائح على أن يسير كل شيء بشكل جيد.',
          'تماس تصویری برای حرف زدن با خانواده و همین‌طور برای بعضی مصاحبه‌ها و قرارها به کار می‌آید. این نکته‌ها کمک می‌کنند همه چیز خوب پیش برود.',
        ),
      ),
      step(
        t(
          'Busca un bon lloc',
          'Busca un buen sitio',
          'Find a good spot',
          'Trouve un bon endroit',
          'ابحثي عن مكان مناسب',
          'جای مناسبی پیدا کن',
        ),
        t(
          'Posa’t en un lloc tranquil, amb llum al davant i no darrere teu.',
          'Ponte en un lugar tranquilo, con luz delante y no detrás de ti.',
          'Sit somewhere quiet, with the light in front of you rather than behind you.',
          'Installe-toi dans un endroit calme, avec la lumière devant toi plutôt que derrière.',
          'اجلسي في مكان هادئ، مع الضوء أمامك لا خلفك.',
          'در جایی آرام بنشین، طوری که نور جلوی تو باشد و پشت سرت نباشد.',
        ),
      ),
      step(
        t(
          'Prova el so',
          'Prueba el sonido',
          'Test the sound',
          'Teste le son',
          'جرّبي الصوت',
          'صدا را امتحان کن',
        ),
        t(
          'Abans de començar, comprova que se senti bé. Uns auriculars ajuden molt si hi ha soroll.',
          'Antes de empezar, comprueba que se oiga bien. Unos auriculares ayudan mucho si hay ruido.',
          'Before starting, check that the sound is clear. Earphones help a lot if it is noisy.',
          "Avant de commencer, vérifie qu'on entend bien. Des écouteurs aident beaucoup s'il y a du bruit.",
          'قبل البدء تأكدي من وضوح الصوت. تساعد السماعات كثيراً إذا كان هناك ضجيج.',
          'پیش از شروع مطمئن شو صدا خوب شنیده می‌شود. اگر سروصدا هست، هدفون خیلی کمک می‌کند.',
        ),
      ),
      step(
        t(
          'Carrega el mòbil',
          'Carga el móvil',
          'Charge your phone',
          'Charge ton téléphone',
          'اشحني هاتفك',
          'گوشی را شارژ کن',
        ),
        t(
          'Una videotrucada gasta molta bateria i dades. Si pots, connecta’t a una wifi.',
          'Una videollamada gasta mucha batería y datos. Si puedes, conéctate a una wifi.',
          'A video call uses a lot of battery and data. If you can, connect to wifi.',
          'Un appel vidéo consomme beaucoup de batterie et de données. Si tu peux, connecte-toi à un wifi.',
          'تستهلك مكالمة الفيديو الكثير من البطارية والبيانات. اتصلي بشبكة واي فاي إن استطعتِ.',
          'تماس تصویری باتری و اینترنت زیادی مصرف می‌کند. اگر می‌توانی به وای‌فای وصل شو.',
        ),
      ),
    ],
  },

  // Igualtat de gènere -----------------------------------------------------------------
  {
    key: 'gender-feeling-unsafe',
    category: 'gender-equality',
    contentType: 'article',
    published: { minutesAgo: 9 },
    image: 'guide-06',
    title: t(
      'Si et sents en perill',
      'Si te sientes en peligro',
      'If you feel unsafe',
      'Si tu te sens en danger',
      'إذا شعرتِ بالخطر',
      'اگر احساس خطر می‌کنی',
    ),
    body: [
      p(
        t(
          'Ningú no té dret a fer-te mal, a controlar-te ni a fer-te por, tampoc la teva parella o algú de la teva família. Si et passa, no és culpa teva.',
          'Nadie tiene derecho a hacerte daño, a controlarte ni a darte miedo, tampoco tu pareja o alguien de tu familia. Si te pasa, no es culpa tuya.',
          'Nobody has the right to hurt you, control you or frighten you, including your partner or someone in your family. If it happens to you, it is not your fault.',
          "Personne n'a le droit de te faire du mal, de te contrôler ou de te faire peur, ni ton partenaire ni quelqu'un de ta famille. Si cela t'arrive, ce n'est pas ta faute.",
          'لا يحق لأحد أن يؤذيك أو يتحكم بك أو يخيفك، ولا حتى شريكك أو أحد أفراد عائلتك. إذا حدث لك ذلك فليس ذنبك.',
          'هیچ‌کس حق ندارد به تو آسیب بزند، کنترلت کند یا بترساندت، حتی همسرت یا کسی از خانواده‌ات. اگر این اتفاق برایت می‌افتد، تقصیر تو نیست.',
        ),
      ),
      p(
        t(
          'Si estàs en perill ara mateix, truca al número d’emergències. És gratuït, funciona sense saldo i t’hi poden atendre en diversos idiomes.',
          'Si estás en peligro ahora mismo, llama al número de emergencias. Es gratuito, funciona sin saldo y te pueden atender en varios idiomas.',
          'If you are in danger right now, call the emergency number. It is free, works without credit and they can help you in several languages.',
          "Si tu es en danger maintenant, appelle le numéro d'urgence. C'est gratuit, ça fonctionne sans crédit et on peut te répondre dans plusieurs langues.",
          'إذا كنت في خطر الآن، اتصلي برقم الطوارئ. الاتصال مجاني ويعمل دون رصيد ويمكنهم مساعدتك بعدة لغات.',
          'اگر همین حالا در خطری، با شماره اضطراری تماس بگیر. رایگان است، بدون شارژ کار می‌کند و می‌توانند به چند زبان کمکت کنند.',
        ),
      ),
      p(
        t(
          'Si no és una urgència però vols parlar-ne, pots escriure a l’equip tècnic des de Contacte. T’escoltaran sense jutjar-te i t’ajudaran a trobar un servei especialitzat, al teu ritme.',
          'Si no es una urgencia pero quieres hablarlo, puedes escribir al equipo técnico desde Contacto. Te escucharán sin juzgarte y te ayudarán a encontrar un servicio especializado, a tu ritmo.',
          'If it is not an emergency but you want to talk about it, you can write to the staff from Contact. They will listen without judging you and help you find a specialised service, at your own pace.',
          "Si ce n'est pas une urgence mais que tu veux en parler, tu peux écrire à l'équipe technique depuis Contact. Elle t'écoutera sans te juger et t'aidera à trouver un service spécialisé, à ton rythme.",
          'إذا لم تكن حالة طارئة لكنك تريدين الحديث، يمكنك الكتابة إلى الفريق الفني من قسم التواصل. سيستمعون إليك دون أحكام ويساعدونك في إيجاد خدمة متخصصة، على وتيرتك.',
          'اگر وضعیت اضطراری نیست ولی می‌خواهی درباره‌اش حرف بزنی، می‌توانی از بخش تماس به کادر فنی پیام بدهی. بدون قضاوت به حرفت گوش می‌دهند و با سرعت خودت کمکت می‌کنند یک خدمت تخصصی پیدا کنی.',
        ),
      ),
      p(
        t(
          'Si algú t’explica que ho està passant malament, escolta-la, creu-la i recorda-li que pot demanar ajuda.',
          'Si alguien te cuenta que lo está pasando mal, escúchala, créela y recuérdale que puede pedir ayuda.',
          'If someone tells you she is going through this, listen to her, believe her and remind her that she can ask for help.',
          "Si quelqu'une te confie qu'elle traverse cela, écoute-la, crois-la et rappelle-lui qu'elle peut demander de l'aide.",
          'إذا أخبرتك امرأة أنها تمر بذلك، استمعي إليها وصدّقيها وذكّريها بأنها تستطيع طلب المساعدة.',
          'اگر کسی به تو گفت چنین شرایطی دارد، به حرفش گوش بده، باورش کن و یادش بینداز که می‌تواند کمک بخواهد.',
        ),
      ),
    ],
  },
  {
    key: 'gender-football-is-yours',
    category: 'gender-equality',
    contentType: 'article',
    published: { minutesAgo: 12 },
    image: 'guide-07',
    title: t(
      'El futbol també és teu',
      'El fútbol también es tuyo',
      'Football belongs to you too',
      'Le football est aussi à toi',
      'كرة القدم لك أيضاً',
      'فوتبال مال تو هم هست',
    ),
    body: [
      p(
        t(
          'Durant molts anys es va dir que el futbol era cosa d’homes. Avui milers de dones juguen arreu del món, i cada entrenament del Projecte en forma part.',
          'Durante muchos años se dijo que el fútbol era cosa de hombres. Hoy miles de mujeres juegan en todo el mundo, y cada entrenamiento del Proyecto forma parte de ello.',
          'For many years people said football was for men. Today thousands of women play all over the world, and every training session of the Project is part of that.',
          "Pendant de nombreuses années, on a dit que le football était une affaire d'hommes. Aujourd'hui, des milliers de femmes jouent partout dans le monde, et chaque entraînement du Projet en fait partie.",
          'لسنوات طويلة قيل إن كرة القدم للرجال. اليوم تلعب آلاف النساء في كل أنحاء العالم، وكل تدريب في المشروع جزء من ذلك.',
          'سال‌ها گفته می‌شد فوتبال کار مردان است. امروز هزاران زن در سراسر جهان بازی می‌کنند و هر تمرین پروژه بخشی از همین است.',
        ),
      ),
      p(
        t(
          'Jugar en equip ajuda a sentir-se més forta, a conèixer companyes i a cuidar la salut. No cal tenir experiència: només ganes de passar-ho bé i respecte per les altres.',
          'Jugar en equipo ayuda a sentirse más fuerte, a conocer compañeras y a cuidar la salud. No hace falta tener experiencia: solo ganas de pasarlo bien y respeto por las demás.',
          'Playing in a team helps you feel stronger, meet teammates and look after your health. You do not need experience: only the wish to have fun and respect for the others.',
          "Jouer en équipe aide à se sentir plus forte, à rencontrer des coéquipières et à prendre soin de sa santé. Pas besoin d'expérience : seulement l'envie de s'amuser et le respect des autres.",
          'اللعب ضمن فريق يساعدك على الشعور بقوة أكبر والتعرف على زميلات والاهتمام بصحتك. لا تحتاجين إلى خبرة: فقط الرغبة في الاستمتاع واحترام الأخريات.',
          'بازی گروهی کمک می‌کند احساس قدرت بیشتری کنی، با هم‌تیمی‌ها آشنا شوی و از سلامتت مراقبت کنی. تجربه لازم نیست: فقط میل به خوش گذراندن و احترام به دیگران.',
        ),
      ),
      p(
        t(
          'Si algun dia algú et diu que aquest no és el teu lloc, recorda que el camp és de totes. I si et passa durant una activitat, explica-ho a l’equip tècnic.',
          'Si algún día alguien te dice que este no es tu lugar, recuerda que el campo es de todas. Y si te pasa durante una actividad, cuéntaselo al equipo técnico.',
          'If one day someone tells you this is not your place, remember that the pitch belongs to all of us. And if it happens during an activity, tell the staff.',
          "Si un jour quelqu'un te dit que ce n'est pas ta place, rappelle-toi que le terrain appartient à toutes. Et si cela arrive pendant une activité, raconte-le à l'équipe technique.",
          'إذا قال لك أحد يوماً إن هذا ليس مكانك، تذكّري أن الملعب للجميع. وإذا حدث ذلك أثناء نشاط، أخبري الفريق الفني.',
          'اگر روزی کسی گفت اینجا جای تو نیست، یادت باشد زمین بازی مال همه است. و اگر در یک فعالیت چنین اتفاقی افتاد، به کادر فنی بگو.',
        ),
      ),
    ],
  },

  // Recursos generals ------------------------------------------------------------------
  {
    key: 'general-public-transport',
    category: 'general-resources',
    contentType: 'tutorial',
    published: { minutesAgo: 10 },
    image: 'guide-08',
    title: t(
      'Moure’t amb transport públic',
      'Moverte en transporte público',
      'Getting around by public transport',
      'Te déplacer en transports en commun',
      'التنقل بالمواصلات العامة',
      'رفت‌وآمد با حمل‌ونقل عمومی',
    ),
    body: [
      p(
        t(
          'Amb tren i autobús pots arribar als entrenaments, a les classes i a les cites. Aquests passos t’ajuden a planificar un trajecte.',
          'Con tren y autobús puedes llegar a los entrenamientos, a las clases y a las citas. Estos pasos te ayudan a planificar un trayecto.',
          'By train and bus you can get to training, classes and appointments. These steps help you plan a journey.',
          "En train et en bus, tu peux aller aux entraînements, aux cours et aux rendez-vous. Ces étapes t'aident à préparer un trajet.",
          'بالقطار والحافلة يمكنك الوصول إلى التدريبات والدروس والمواعيد. تساعدك هذه الخطوات على التخطيط لرحلتك.',
          'با قطار و اتوبوس می‌توانی به تمرین، کلاس و قرارها برسی. این قدم‌ها کمکت می‌کنند مسیرت را برنامه‌ریزی کنی.',
        ),
      ),
      step(
        t(
          'Mira el recorregut abans',
          'Mira el recorrido antes',
          'Check the route first',
          "Regarde l'itinéraire avant",
          'اطّلعي على المسار مسبقاً',
          'مسیر را از قبل ببین',
        ),
        t(
          'Amb una aplicació de mapes del mòbil pots veure quin tren o autobús has d’agafar i a quina hora passa.',
          'Con una aplicación de mapas del móvil puedes ver qué tren o autobús tienes que coger y a qué hora pasa.',
          'With a maps app on your phone you can see which train or bus to take and when it comes.',
          'Avec une application de cartes sur ton téléphone, tu peux voir quel train ou quel bus prendre et à quelle heure il passe.',
          'بتطبيق خرائط على هاتفك يمكنك معرفة أي قطار أو حافلة تأخذين ومتى يمر.',
          'با یک برنامه نقشه روی گوشی می‌توانی ببینی کدام قطار یا اتوبوس را باید بگیری و چه ساعتی می‌رسد.',
        ),
      ),
      step(
        t(
          'Pregunta pel bitllet que et convé',
          'Pregunta por el billete que te conviene',
          'Ask which ticket suits you',
          'Demande quel billet te convient',
          'اسألي عن التذكرة المناسبة لك',
          'بپرس کدام بلیت برایت مناسب است',
        ),
        t(
          'Hi ha targetes per a diversos viatges que surten més a compte. L’equip tècnic et pot explicar quina et va millor.',
          'Hay tarjetas para varios viajes que salen más a cuenta. El equipo técnico te puede explicar cuál te va mejor.',
          'There are multi-trip cards that work out cheaper. The staff can explain which one suits you best.',
          "Il existe des cartes pour plusieurs trajets qui reviennent moins cher. L'équipe technique peut t'expliquer laquelle te convient le mieux.",
          'توجد بطاقات لعدة رحلات تكون أوفر. يمكن للفريق الفني أن يشرح لك أيها أنسب لك.',
          'کارت‌هایی برای چند سفر هست که به‌صرفه‌ترند. کادر فنی می‌تواند توضیح دهد کدام برایت بهتر است.',
        ),
      ),
      step(
        t(
          'Surt amb temps',
          'Sal con tiempo',
          'Leave with time to spare',
          "Pars à l'avance",
          'اخرجي مبكراً',
          'زودتر راه بیفت',
        ),
        t(
          'Els trens de vegades fan tard. Surt una mica abans i guarda al mòbil el número de l’equip tècnic per avisar si arribes tard.',
          'Los trenes a veces llegan tarde. Sal un poco antes y guarda en el móvil el número del equipo técnico para avisar si llegas tarde.',
          'Trains are sometimes late. Leave a little earlier and save the staff’s number on your phone so you can tell them if you are running late.',
          "Les trains ont parfois du retard. Pars un peu plus tôt et enregistre le numéro de l'équipe technique pour prévenir si tu es en retard.",
          'تتأخر القطارات أحياناً. اخرجي قبل الموعد بقليل واحفظي رقم الفريق الفني في هاتفك لتخبريهم إذا تأخرتِ.',
          'قطارها گاهی دیر می‌کنند. کمی زودتر راه بیفت و شماره کادر فنی را در گوشی ذخیره کن تا اگر دیر رسیدی خبر بدهی.',
        ),
      ),
    ],
  },
  {
    key: 'general-organise-documents',
    category: 'general-resources',
    contentType: 'tutorial',
    published: { minutesAgo: 11 },
    title: t(
      'Com tenir els documents en ordre',
      'Cómo tener los documentos en orden',
      'How to keep your documents in order',
      'Comment garder tes documents en ordre',
      'كيف تحافظين على ترتيب وثائقك',
      'چطور مدارکت را مرتب نگه داری',
    ),
    body: [
      p(
        t(
          'Quan fas tràmits, sovint et demanen els mateixos papers. Si els tens ordenats, tot va més ràpid i no perds res important.',
          'Cuando haces trámites, a menudo te piden los mismos papeles. Si los tienes ordenados, todo va más rápido y no pierdes nada importante.',
          'When you deal with paperwork, you are often asked for the same papers. If you keep them in order, everything goes faster and you lose nothing important.',
          "Quand tu fais des démarches, on te demande souvent les mêmes papiers. S'ils sont bien rangés, tout va plus vite et tu ne perds rien d'important.",
          'عند إنجاز المعاملات تُطلب منك الأوراق نفسها غالباً. إذا كانت مرتبة يسير كل شيء أسرع ولا تضيعين شيئاً مهماً.',
          'وقتی کارهای اداری انجام می‌دهی، اغلب همان مدارک را از تو می‌خواهند. اگر مرتب باشند همه چیز سریع‌تر پیش می‌رود و چیز مهمی گم نمی‌شود.',
        ),
      ),
      step(
        t(
          'Una carpeta per a cada tema',
          'Una carpeta para cada tema',
          'One folder for each topic',
          'Un dossier par sujet',
          'ملف لكل موضوع',
          'برای هر موضوع یک پوشه',
        ),
        t(
          'Separa els papers per temes: identitat, salut, habitatge, feina i estudis.',
          'Separa los papeles por temas: identidad, salud, vivienda, trabajo y estudios.',
          'Sort your papers by topic: identity, health, housing, work and studies.',
          'Classe tes papiers par sujet : identité, santé, logement, travail et études.',
          'رتّبي أوراقك حسب الموضوع: الهوية، والصحة، والسكن، والعمل، والدراسة.',
          'کاغذهایت را بر اساس موضوع جدا کن: هویت، سلامت، مسکن، کار و تحصیل.',
        ),
      ),
      step(
        t(
          'Fes-ne còpies',
          'Haz copias',
          'Make copies',
          'Fais des copies',
          'اصنعي نسخاً',
          'از آن‌ها کپی بگیر',
        ),
        t(
          'Guarda una fotocòpia dels documents importants i una foto al mòbil. Els originals, a casa en un lloc sec.',
          'Guarda una fotocopia de los documentos importantes y una foto en el móvil. Los originales, en casa en un lugar seco.',
          'Keep a photocopy of important documents and a photo on your phone. Keep the originals at home somewhere dry.',
          'Garde une photocopie des documents importants et une photo sur ton téléphone. Les originaux restent chez toi dans un endroit sec.',
          'احتفظي بنسخة مصورة من الوثائق المهمة وصورة على هاتفك. أما الأصول فاحفظيها في البيت في مكان جاف.',
          'از مدارک مهم یک فتوکپی و یک عکس روی گوشی نگه دار. اصل مدارک را در خانه جای خشکی بگذار.',
        ),
      ),
      step(
        t(
          'Apunta les dates de les cites',
          'Apunta las fechas de las citas',
          'Note your appointment dates',
          'Note les dates de tes rendez-vous',
          'دوّني مواعيدك',
          'تاریخ قرارها را یادداشت کن',
        ),
        t(
          'Escriu al calendari del mòbil cada cita i on és. Posa-hi un avís el dia abans.',
          'Escribe en el calendario del móvil cada cita y dónde es. Ponle un aviso el día antes.',
          'Put each appointment and its place in your phone calendar. Add a reminder the day before.',
          'Inscris chaque rendez-vous et son lieu dans le calendrier de ton téléphone. Ajoute un rappel la veille.',
          'اكتبي كل موعد ومكانه في تقويم الهاتف، وأضيفي تذكيراً قبله بيوم.',
          'هر قرار و محل آن را در تقویم گوشی بنویس و یک روز قبلش یادآور بگذار.',
        ),
      ),
    ],
  },
  {
    key: 'general-app-tour',
    category: 'general-resources',
    contentType: 'article',
    published: { daysAgo: 42 },
    title: t(
      'On trobaràs cada cosa a l’aplicació',
      'Dónde encontrarás cada cosa en la aplicación',
      'Where to find everything in the app',
      "Où trouver chaque chose dans l'application",
      'أين تجدين كل شيء في التطبيق',
      'هر چیز را کجای برنامه پیدا کنی',
    ),
    body: [
      p(
        t(
          'A Inici hi ha el que tens pendent: formularis, avisos i la propera activitat. A Activitats trobaràs els entrenaments i les sortides.',
          'En Inicio está lo que tienes pendiente: formularios, avisos y la próxima actividad. En Actividades encontrarás los entrenamientos y las salidas.',
          'Home shows what is waiting for you: forms, notices and your next activity. In Activities you will find training sessions and outings.',
          "L'Accueil montre ce qui t'attend : formulaires, avis et ta prochaine activité. Dans Activités, tu trouveras les entraînements et les sorties.",
          'في الصفحة الرئيسية تجدين ما ينتظرك: الاستمارات والإعلانات ونشاطك القادم. وفي الأنشطة تجدين التدريبات والرحلات.',
          'در خانه کارهای باقی‌مانده‌ات هست: فرم‌ها، اطلاعیه‌ها و فعالیت بعدی. در فعالیت‌ها تمرین‌ها و گردش‌ها را پیدا می‌کنی.',
        ),
      ),
      p(
        t(
          'A Comunitat pots llegir el fòrum, veure fotos i llegir històries de les companyes. A Ajuda hi ha serveis i guies com aquesta.',
          'En Comunidad puedes leer el foro, ver fotos y leer historias de las compañeras. En Ayuda hay servicios y guías como esta.',
          'In Community you can read the forum, see photos and read stories from your teammates. In Help there are services and guides like this one.',
          'Dans Communauté, tu peux lire le forum, voir des photos et lire les histoires de tes coéquipières. Dans Aide, il y a des services et des guides comme celui-ci.',
          'في المجتمع يمكنك قراءة المنتدى ورؤية الصور وقراءة قصص زميلاتك. وفي المساعدة توجد خدمات وأدلة مثل هذا الدليل.',
          'در بخش جامعه می‌توانی انجمن را بخوانی، عکس‌ها را ببینی و داستان‌های هم‌تیمی‌ها را بخوانی. در بخش کمک خدمات و راهنماهایی مثل همین هست.',
        ),
      ),
      p(
        t(
          'A Contacte pots escriure a l’equip tècnic, demanar una mentoria o enviar un suggeriment. Quan hi ha alguna cosa nova, ho veuràs amb un número a la pestanya.',
          'En Contacto puedes escribir al equipo técnico, pedir una mentoría o enviar una sugerencia. Cuando hay algo nuevo, lo verás con un número en la pestaña.',
          'In Contact you can write to the staff, ask for mentoring or send a suggestion. When there is something new, you will see a number on the tab.',
          "Dans Contact, tu peux écrire à l'équipe technique, demander un mentorat ou envoyer une suggestion. Quand il y a du nouveau, tu verras un nombre sur l'onglet.",
          'في التواصل يمكنك الكتابة إلى الفريق الفني أو طلب إرشاد أو إرسال اقتراح. عندما يكون هناك شيء جديد سترين رقماً على التبويب.',
          'در بخش تماس می‌توانی به کادر فنی پیام بدهی، درخواست راهنمایی کنی یا پیشنهاد بفرستی. وقتی چیز تازه‌ای باشد، عددی روی زبانه می‌بینی.',
        ),
      ),
    ],
  },
];
