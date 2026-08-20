/**
 * The single i18n factory both apps consume (one config, ADR-006). Locale
 * resources are namespaced JSON per feature under `locales/<language>/`; they
 * are bundled statically because the full set is small and must work offline.
 */

import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguageStorage } from './language-storage';
import { DEFAULT_LANGUAGE, resolveInitialLanguage, SUPPORTED_LANGUAGES } from './languages';
import arAdmin from './locales/ar/admin.json';
import arAnnouncements from './locales/ar/announcements.json';
import arAttendance from './locales/ar/attendance.json';
import arAuth from './locales/ar/auth.json';
import arCommon from './locales/ar/common.json';
import arEntityManagement from './locales/ar/entity-management.json';
import arEntityServices from './locales/ar/entity-services.json';
import arEquipment from './locales/ar/equipment.json';
import arErrors from './locales/ar/errors.json';
import arEvents from './locales/ar/events.json';
import arForum from './locales/ar/forum.json';
import arGallery from './locales/ar/gallery.json';
import arHome from './locales/ar/home.json';
import arKnowledge from './locales/ar/knowledge.json';
import arMentoring from './locales/ar/mentoring.json';
import arMessaging from './locales/ar/messaging.json';
import arNav from './locales/ar/nav.json';
import arOnboarding from './locales/ar/onboarding.json';
import arParticipants from './locales/ar/participants.json';
import arPlayerServices from './locales/ar/player-services.json';
import arProfile from './locales/ar/profile.json';
import arPush from './locales/ar/push.json';
import arReferrals from './locales/ar/referrals.json';
import caAdmin from './locales/ca/admin.json';
import caAnnouncements from './locales/ca/announcements.json';
import caAttendance from './locales/ca/attendance.json';
import caAuth from './locales/ca/auth.json';
import caCommon from './locales/ca/common.json';
import caEntityManagement from './locales/ca/entity-management.json';
import caEntityServices from './locales/ca/entity-services.json';
import caEquipment from './locales/ca/equipment.json';
import caErrors from './locales/ca/errors.json';
import caEvents from './locales/ca/events.json';
import caForum from './locales/ca/forum.json';
import caGallery from './locales/ca/gallery.json';
import caHome from './locales/ca/home.json';
import caKnowledge from './locales/ca/knowledge.json';
import caMentoring from './locales/ca/mentoring.json';
import caMessaging from './locales/ca/messaging.json';
import caNav from './locales/ca/nav.json';
import caOnboarding from './locales/ca/onboarding.json';
import caParticipants from './locales/ca/participants.json';
import caPlayerServices from './locales/ca/player-services.json';
import caProfile from './locales/ca/profile.json';
import caPush from './locales/ca/push.json';
import caReferrals from './locales/ca/referrals.json';
import caServices from './locales/ca/services.json';
import enAdmin from './locales/en/admin.json';
import enAnnouncements from './locales/en/announcements.json';
import enAttendance from './locales/en/attendance.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enEntityManagement from './locales/en/entity-management.json';
import enEntityServices from './locales/en/entity-services.json';
import enEquipment from './locales/en/equipment.json';
import enErrors from './locales/en/errors.json';
import enEvents from './locales/en/events.json';
import enForum from './locales/en/forum.json';
import enGallery from './locales/en/gallery.json';
import enHome from './locales/en/home.json';
import enKnowledge from './locales/en/knowledge.json';
import enMentoring from './locales/en/mentoring.json';
import enMessaging from './locales/en/messaging.json';
import enNav from './locales/en/nav.json';
import enOnboarding from './locales/en/onboarding.json';
import enParticipants from './locales/en/participants.json';
import enPlayerServices from './locales/en/player-services.json';
import enProfile from './locales/en/profile.json';
import enPush from './locales/en/push.json';
import enReferrals from './locales/en/referrals.json';
import enServices from './locales/en/services.json';
import esAdmin from './locales/es/admin.json';
import esAnnouncements from './locales/es/announcements.json';
import esAttendance from './locales/es/attendance.json';
import esAuth from './locales/es/auth.json';
import esCommon from './locales/es/common.json';
import esEntityManagement from './locales/es/entity-management.json';
import esEntityServices from './locales/es/entity-services.json';
import esEquipment from './locales/es/equipment.json';
import esErrors from './locales/es/errors.json';
import esEvents from './locales/es/events.json';
import esForum from './locales/es/forum.json';
import esGallery from './locales/es/gallery.json';
import esHome from './locales/es/home.json';
import esKnowledge from './locales/es/knowledge.json';
import esMentoring from './locales/es/mentoring.json';
import esMessaging from './locales/es/messaging.json';
import esNav from './locales/es/nav.json';
import esOnboarding from './locales/es/onboarding.json';
import esParticipants from './locales/es/participants.json';
import esPlayerServices from './locales/es/player-services.json';
import esProfile from './locales/es/profile.json';
import esPush from './locales/es/push.json';
import esReferrals from './locales/es/referrals.json';
import faAdmin from './locales/fa/admin.json';
import faAnnouncements from './locales/fa/announcements.json';
import faAttendance from './locales/fa/attendance.json';
import faAuth from './locales/fa/auth.json';
import faCommon from './locales/fa/common.json';
import faEntityManagement from './locales/fa/entity-management.json';
import faEntityServices from './locales/fa/entity-services.json';
import faEquipment from './locales/fa/equipment.json';
import faErrors from './locales/fa/errors.json';
import faEvents from './locales/fa/events.json';
import faForum from './locales/fa/forum.json';
import faGallery from './locales/fa/gallery.json';
import faHome from './locales/fa/home.json';
import faKnowledge from './locales/fa/knowledge.json';
import faMentoring from './locales/fa/mentoring.json';
import faMessaging from './locales/fa/messaging.json';
import faNav from './locales/fa/nav.json';
import faOnboarding from './locales/fa/onboarding.json';
import faParticipants from './locales/fa/participants.json';
import faPlayerServices from './locales/fa/player-services.json';
import faProfile from './locales/fa/profile.json';
import faPush from './locales/fa/push.json';
import faReferrals from './locales/fa/referrals.json';

const resources = {
  ca: {
    common: caCommon,
    home: caHome,
    auth: caAuth,
    admin: caAdmin,
    errors: caErrors,
    nav: caNav,
    onboarding: caOnboarding,
    participants: caParticipants,
    equipment: caEquipment,
    profile: caProfile,
    push: caPush,
    announcements: caAnnouncements,
    events: caEvents,
    forum: caForum,
    gallery: caGallery,
    knowledge: caKnowledge,
    messaging: caMessaging,
    mentoring: caMentoring,
    attendance: caAttendance,
    services: caServices,
    'entity-services': caEntityServices,
    'entity-management': caEntityManagement,
    playerServices: caPlayerServices,
    referrals: caReferrals,
  },
  es: {
    common: esCommon,
    home: esHome,
    auth: esAuth,
    admin: esAdmin,
    errors: esErrors,
    nav: esNav,
    onboarding: esOnboarding,
    participants: esParticipants,
    equipment: esEquipment,
    profile: esProfile,
    push: esPush,
    announcements: esAnnouncements,
    events: esEvents,
    forum: esForum,
    gallery: esGallery,
    knowledge: esKnowledge,
    messaging: esMessaging,
    mentoring: esMentoring,
    attendance: esAttendance,
    services: enServices,
    'entity-services': esEntityServices,
    'entity-management': esEntityManagement,
    playerServices: esPlayerServices,
    referrals: esReferrals,
  },
  en: {
    common: enCommon,
    home: enHome,
    auth: enAuth,
    admin: enAdmin,
    errors: enErrors,
    nav: enNav,
    onboarding: enOnboarding,
    participants: enParticipants,
    equipment: enEquipment,
    profile: enProfile,
    push: enPush,
    announcements: enAnnouncements,
    events: enEvents,
    forum: enForum,
    gallery: enGallery,
    knowledge: enKnowledge,
    messaging: enMessaging,
    mentoring: enMentoring,
    attendance: enAttendance,
    services: enServices,
    'entity-services': enEntityServices,
    'entity-management': enEntityManagement,
    playerServices: enPlayerServices,
    referrals: enReferrals,
  },
  ar: {
    common: arCommon,
    home: arHome,
    auth: arAuth,
    admin: arAdmin,
    errors: arErrors,
    nav: arNav,
    onboarding: arOnboarding,
    participants: arParticipants,
    equipment: arEquipment,
    profile: arProfile,
    push: arPush,
    announcements: arAnnouncements,
    events: arEvents,
    forum: arForum,
    gallery: arGallery,
    knowledge: arKnowledge,
    messaging: arMessaging,
    mentoring: arMentoring,
    attendance: arAttendance,
    services: enServices,
    'entity-services': arEntityServices,
    'entity-management': arEntityManagement,
    playerServices: arPlayerServices,
    referrals: arReferrals,
  },
  fa: {
    common: faCommon,
    home: faHome,
    auth: faAuth,
    admin: faAdmin,
    errors: faErrors,
    nav: faNav,
    onboarding: faOnboarding,
    participants: faParticipants,
    equipment: faEquipment,
    profile: faProfile,
    push: faPush,
    announcements: faAnnouncements,
    events: faEvents,
    forum: faForum,
    gallery: faGallery,
    knowledge: faKnowledge,
    messaging: faMessaging,
    mentoring: faMentoring,
    attendance: faAttendance,
    services: enServices,
    'entity-services': faEntityServices,
    'entity-management': faEntityManagement,
    playerServices: faPlayerServices,
    referrals: faReferrals,
  },
};

export interface CreateI18nOptions {
  languageStorage: LanguageStorage;
  /** Device/browser locale preference list, best first (e.g. `['es-ES', 'en']`). */
  deviceLanguages?: readonly string[];
}

export function createI18n(options: CreateI18nOptions): i18n {
  const { languageStorage, deviceLanguages = [] } = options;

  const instance = createInstance();
  // Bundled resources make init synchronous; `t` works as soon as this returns.
  void instance.use(initReactI18next).init({
    resources,
    lng: resolveInitialLanguage({
      persistedLanguage: languageStorage.getLanguage(),
      deviceLanguages,
    }),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: 'common',
    ns: Object.keys(resources.ca),
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false,
    },
  });

  // Attached after init so only explicit language switches persist, not the
  // device-derived boot language: until the user chooses, a device language
  // change should keep flowing through.
  instance.on('languageChanged', (language) => {
    languageStorage.setLanguage(language);
  });

  return instance;
}
