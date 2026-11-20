/**
 * Tester ground (RAPP-885): where each of the 53 stock images comes from.
 *
 * Every photo is published on Unsplash under the Unsplash License: free to use,
 * no permission needed, no attribution required (we keep it anyway). The image
 * file is fetched from the Unsplash CDN at a fixed size, so the same request
 * gives the same JPEG: long edge at most 1600 px.
 *
 * `store.ts manifest` turns this list into `manifest.json`; the other commands
 * read only the manifest.
 */

import { COMPANIONS, TEAM, type ImageName } from '../lib/ground';

export interface ImageSource {
  /** The Unsplash photo id in the CDN file name (`photo-<id>`). */
  readonly photo: string;
  /** The short slug of the photo page on unsplash.com. */
  readonly page: string;
  readonly author: string;
  /** What the photo shows, for a reviewer who has not opened it. */
  readonly shows: string;
  /**
   * The profile id that sits in the storage key as the uploader. Avatars carry
   * their owner (the database serves a profile photo by that segment), and
   * everything else carries the team member who publishes the content.
   */
  readonly uploader?: string;
}

export const LICENCE = 'Unsplash License (https://unsplash.com/license)';

/** The CDN request that gives the cached JPEG: fits inside 1600 x 1600. */
export function fileUrl(photo: string): string {
  return `https://images.unsplash.com/photo-${photo}?w=1600&h=1600&fit=max&fm=jpg&q=80`;
}

export function pageUrl(page: string): string {
  return `https://unsplash.com/photos/${page}`;
}

function companion(index: number): string {
  const account = COMPANIONS[index];
  if (account === undefined) throw new Error(`No companion ${index + 1}`);
  return account.id;
}

export const SOURCES: Readonly<Record<ImageName, ImageSource>> = {
  'gallery-01': {
    photo: '1624880357913-a8539238245b',
    page: 'TsYzva0e2pQ',
    author: 'Joppe Spaa',
    shows: 'Two women fight for the ball in front of a goal',
  },
  'gallery-02': {
    photo: '1535116574766-9a678bf80bf4',
    page: 'UtexyJxa4kI',
    author: 'Jeffrey F Lin',
    shows: 'Two players hug on the pitch after a goal',
  },
  'gallery-03': {
    photo: '1528162841823-9e55a8cc2f58',
    page: 'oBxX10dsZJk',
    author: 'Jeffrey F Lin',
    shows: 'Two players race for the ball',
  },
  'gallery-04': {
    photo: '1529929344488-5e812ddb6e2a',
    page: 'GLKM5guF69Y',
    author: 'Jeffrey F Lin',
    shows: 'A women’s team in a huddle before kick-off',
  },
  'gallery-05': {
    photo: '1534853785576-8206ebceb16b',
    page: 'BowvUrYqUIw',
    author: 'Jeffrey F Lin',
    shows: 'Match action, a player shoots past a defender',
  },
  'gallery-06': {
    photo: '1526842010423-ff68e3c2f89c',
    page: 'N7BDXObvQU0',
    author: 'Jeffrey F Lin',
    shows: 'Three players in a tackle for the ball',
  },
  'gallery-07': {
    photo: '1535506349729-56e253fac2b1',
    page: '9qP-hp9GvUk',
    author: 'Jeffrey F Lin',
    shows: 'Teammates walk off the pitch arm in arm',
  },
  'gallery-08': {
    photo: '1567989995326-46ed902b0494',
    page: 'cGSKtowYJwM',
    author: 'Jeffrey F Lin',
    shows: 'Players celebrate together on the pitch',
  },
  'gallery-09': {
    photo: '1529933116320-bca609dd8227',
    page: 'iONbJBw39oc',
    author: 'Jeffrey F Lin',
    shows: 'Two players stretch on the grass',
  },
  'gallery-10': {
    photo: '1529848891152-72fea52a8f03',
    page: 'TkS6V8YTdy8',
    author: 'Jeffrey F Lin',
    shows: 'A women’s team lined up for the team photo',
  },
  'gallery-11': {
    photo: '1721180672597-beddd124205a',
    page: 'nOVt9Yeo9Xc',
    author: 'DJ Paine',
    shows: 'Hands sharing dishes on a table written with "welcome friends"',
  },
  'gallery-12': {
    photo: '1528605248644-14dd04022da1',
    page: 'W3SEyZODn8U',
    author: 'Priscilla Du Preez',
    shows: 'A long table of people eating and talking',
  },
  'story-01': {
    photo: '1622352496174-9e1d969b1945',
    page: 'EU-Oc9VQHRg',
    author: 'Crosby Hinze',
    shows: 'Four women laugh together outdoors at golden hour',
  },
  'story-02': {
    photo: '1753162659622-371949a713ec',
    page: 'yRnWq4U4S20',
    author: 'Vitaly Gariev',
    shows: 'Two women work together at a sewing workshop',
  },
  'story-03': {
    photo: '1757085242641-d829ddde7191',
    page: 'FHZAI9c8wIk',
    author: 'ANYA RICHTER',
    shows: 'Three women paint and craft at a table',
  },
  'story-04': {
    photo: '1529903384028-929ae5dccdf1',
    page: 'PXVQ7SNqdME',
    author: 'Chris Murray',
    shows: 'Four women sit on a city bench with a dog',
  },
  'activity-01': {
    photo: '1529267988596-c9e1c9e4670f',
    page: 'zs4Pahjo5ww',
    author: 'Jeffrey F Lin',
    shows: 'Players warm up between training cones',
  },
  'activity-02': {
    photo: '1554073133-a4afd1b1ffe0',
    page: 'ND57L4S5VOw',
    author: 'Jeffrey F Lin',
    shows: 'Two players duel for the ball in a match',
  },
  'activity-03': {
    photo: '1758270704286-83476deb3bd1',
    page: 'r_UZcR2VFqE',
    author: 'Vitaly Gariev',
    shows: 'Adult students raise their hands in a class',
  },
  'activity-04': {
    photo: '1670899460364-ebc917bac09a',
    page: 'KZfUMAgVPCg',
    author: 'Taylor Heery',
    shows: 'People share a meal at a long table',
  },
  'activity-05': {
    photo: '1783702588068-ded13dac6bde',
    page: 'L8d9pgaVu_M',
    author: 'Dušan Tizić',
    shows: 'Three women cross a street on a city outing',
  },
  'activity-06': {
    photo: '1682868067843-11fbc221174a',
    page: 'kJiPUr1KQSE',
    author: 'Sander Breneman',
    shows: 'Women work at a pottery workshop',
  },
  'avis-01': {
    photo: '1697674492322-e67a68ed8309',
    page: 'D0P_Rsc7iEo',
    author: 'Duy Nod',
    shows: 'A ball on a yellow cone in an indoor court',
  },
  'avis-02': {
    photo: '1547573854-74d2a71d0826',
    page: 'Q_Moi2xjieU',
    author: 'Stefan Vladimirov',
    shows: 'A table full of shared dishes, seen from above',
  },
  'avis-03': {
    photo: '1655337690307-5293f900f580',
    page: 'Fh1k69VqT_A',
    author: 'Timur Shakerzianov',
    shows: 'Women sit together in a meeting room',
  },
  'service-01': {
    photo: '1758518731462-d091b0b4ed0d',
    page: 'iPheGw7_UaI',
    author: 'Vitaly Gariev',
    shows: 'A meeting at a desk where a document is signed (legal advice)',
  },
  'service-02': {
    photo: '1631217868264-e5b90bb7e133',
    page: 'tl447mekwuQ',
    author: 'National Cancer Institute',
    shows: 'A doctor in a white coat talks with a patient (health)',
  },
  'service-03': {
    photo: '1758273241078-8eec353836be',
    page: 'rG5elqddGzo',
    author: 'Vitaly Gariev',
    shows: 'Two women talk in a counselling room (emotional support)',
  },
  'service-04': {
    photo: '1741156386380-0236c72eb6f9',
    page: 'bqUZEAeWuok',
    author: 'Jakub Żerdzicki',
    shows: 'A hand holds house keys at a front door (housing)',
  },
  'service-05': {
    photo: '1698047682091-782b1e5c6536',
    page: 'IESB4iFVuzA',
    author: 'Resume Genius',
    shows: 'Two women shake hands across a desk (work)',
  },
  'service-06': {
    photo: '1698047681432-006d2449c631',
    page: '9si2noVCVH8',
    author: 'Resume Genius',
    shows: 'Someone reads a CV at a table (job search)',
  },
  'service-07': {
    photo: '1758790015863-4f9798bb818f',
    page: 'eVm3qlRnf_Y',
    author: 'Roman Kravtsov',
    shows: 'An empty playroom with toys and shelves (childcare)',
  },
  'service-08': {
    photo: '1573497491208-6b1acb260507',
    page: 'LQ1t-8Ms5PY',
    author: 'Christina @ wocintechchat.com M',
    shows: 'Two women talk at a table by a window (mentoring)',
  },
  'service-09': {
    photo: '1573496546471-398eacdbd679',
    page: 'yhq2ymcPlZE',
    author: 'Christina @ wocintechchat.com M',
    shows: 'Two women write on a whiteboard (training course)',
  },
  'service-10': {
    photo: '1512238972088-8acb84db0771',
    page: 'oc_XTqWezp4',
    author: 'Monica Melton',
    shows: 'A woman writes with a tutor in a classroom (tutoring)',
  },
  'guide-01': {
    photo: '1581553673739-c4906b5d0de8',
    page: 'htQznS-Rx7w',
    author: 'Kit (formerly ConvertKit)',
    shows: 'An open passport full of stamps',
  },
  'guide-02': {
    photo: '1553697388-94e804e2f0f6',
    page: '0QcSnCM0aMc',
    author: 'Spencer Davis',
    shows: 'Two hands hold up passports in a city square',
  },
  'guide-03': {
    photo: '1706880471208-88328ff11505',
    page: 'tSOz_Hg2pgc',
    author: 'Sourav Debnath',
    shows: 'A passport, a watch and a pen on a dark table',
  },
  'guide-04': {
    photo: '1515378791036-0648a3ef77b2',
    page: 'Hcfwew744z4',
    author: 'Christin Hume',
    shows: 'Hands typing on a laptop (online forms)',
  },
  'guide-05': {
    photo: '1531421693921-03e5aa6ee863',
    page: '9uEHFjGXnCE',
    author: 'Daria Nepriakhina',
    shows: 'Women working at laptops in a shared office',
  },
  'guide-06': {
    photo: '1610605941775-ffbeb8c589ba',
    page: 'uz_Ddc9uUF8',
    author: 'Pere Jurado',
    shows: 'A train platform in a station',
  },
  'guide-07': {
    photo: '1789121630190-d2a4ee4b820b',
    page: 'MfE1FtngPUs',
    author: 'Samuel Isaacs',
    shows: 'A Barcelona metro sign lit at night',
  },
  'guide-08': {
    photo: '1744782351841-9cc6b86a5add',
    page: 'V7Q94jc04wQ',
    author: 'Jakub Żerdzicki',
    shows: 'Keys with a house keyring in front of a staircase',
  },
  'forum-01': {
    photo: '1651467320586-73d8f5f344c4',
    page: 'GaVnw9Sk3R4',
    author: 'Joshua Hoehne',
    shows: 'Footballs lying on the grass of a pitch',
  },
  'forum-02': {
    photo: '1607748862156-7c548e7e98f4',
    page: 'HvZDCuRnSaY',
    author: 'Joel Muniz',
    shows: 'A group of women laugh together on painted stairs',
  },
  'forum-03': {
    photo: '1763901326432-4b08b99e03e4',
    page: 'ifL6Wykf6W8',
    author: 'Andrii Solok',
    shows: 'Friends share a picnic in a sunny park',
  },
  'avatar-01': {
    photo: '1718048170732-0ef8a77fce9e',
    page: '6awpFbYse3o',
    author: 'Lisa Marie Theck',
    shows: 'Portrait of a smiling woman in a light headscarf',
    uploader: companion(0),
  },
  'avatar-02': {
    photo: '1536766768598-e09213fdcf22',
    page: 'f49XhYbpiA0',
    author: 'Danie Franco',
    shows: 'Portrait of a woman in a brown headscarf',
    uploader: companion(1),
  },
  'avatar-03': {
    photo: '1517462964-21fdcec3f25b',
    page: 'NTjSR3zYpsY',
    author: 'Ethan Haddox',
    shows: 'Portrait of a woman with dark hair in a coat',
    uploader: companion(2),
  },
  'avatar-04': {
    photo: '1743871698163-a2e470d8eac7',
    page: 'HIPIOPYz0tQ',
    author: 'Angelo Casto',
    shows: 'Portrait of a smiling woman in a headwrap',
    uploader: companion(3),
  },
  'avatar-05': {
    photo: '1586391975091-40b8eb04bfc7',
    page: '8bi7v7yx3Uo',
    author: 'Manuel González Asturias, SJ',
    shows: 'Portrait of a smiling woman with long dark hair in an embroidered blouse',
    uploader: companion(4),
  },
  'avatar-06': {
    photo: '1505421031134-e57263cae630',
    page: 'UzSPiVmnkAA',
    author: 'Ayo Ogunseinde',
    shows: 'Portrait of a woman in a patterned headwrap',
    uploader: companion(5),
  },
  'avatar-07': {
    photo: '1614204424926-196a80bf0be8',
    page: 'CGKYNN3uuVo',
    author: 'Filipp Romanovski',
    shows: 'Portrait of a woman with short curly hair (the team member)',
    uploader: TEAM.id,
  },
};
