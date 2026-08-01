/**
 * The flow manifest: authored once by the issue that builds the flow, resolved
 * against what actually got captured on every run (RAPP-78).
 *
 * The authored copy in `flows/<slug>.manifest.json` declares every step, every
 * platform path it will ever have, and the graph joining them. The resolved copy
 * that lands next to the images in the vault keeps only the images that exist on
 * disk, so a CA-only run and a CA+AR run both produce an honest canvas rather
 * than one full of broken frames.
 */

export interface ManifestStep {
  readonly id: string;
  readonly label: string;
  readonly ios?: string;
  readonly android?: string;
  readonly web?: string;
  readonly diff?: boolean;
}

export interface ManifestEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind?: 'positive' | 'negative' | 'dismiss' | 'neutral';
}

export interface ManifestNode {
  readonly id: string;
  readonly type: 'note';
  readonly text: string;
}

export interface FlowManifest {
  readonly app: string;
  readonly slug: string;
  readonly title: string;
  readonly surface: 'mobile' | 'admin' | 'entity';
  readonly description: string;
  readonly capturedAt?: string;
  readonly steps: readonly ManifestStep[];
  readonly edges?: readonly ManifestEdge[];
  readonly nodes?: readonly ManifestNode[];
  readonly notes?: readonly string[];
}

const PLATFORM_KEYS = ['ios', 'android', 'web'] as const;

/**
 * Anything that would identify our tracker, our vault, or this machine. The
 * canvas is shown to the client and attached to funder reporting, so a manifest
 * is an EXTERNAL surface: it describes the screen, never the ticket.
 */
const INTERNAL_REFERENCE_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] =
  [
    { label: 'issue ID', pattern: /RAPP-\d+/ },
    { label: 'wikilink', pattern: /\[\[/ },
    { label: 'vault path', pattern: /second-brain/ },
    { label: 'absolute home path', pattern: /\/Users\// },
  ];

/**
 * Drops every image the run did not actually produce, then every step left with
 * no image at all, then every edge that pointed at one of those steps. Keeping a
 * dangling reference would render as an empty frame in a client-facing canvas,
 * which reads as a broken screen rather than an uncaptured one.
 */
export function resolveManifest(
  authored: FlowManifest,
  hasImage: (relativePath: string) => boolean,
  capturedAt: string,
): FlowManifest {
  const steps = authored.steps
    .map((step) => {
      const captured: { -readonly [K in (typeof PLATFORM_KEYS)[number]]?: string } = {};
      for (const key of PLATFORM_KEYS) {
        const value = step[key];
        if (value !== undefined && hasImage(value)) {
          captured[key] = value;
        }
      }
      return { ...step, ios: captured.ios, android: captured.android, web: captured.web };
    })
    .filter((step) => PLATFORM_KEYS.some((key) => step[key] !== undefined))
    .map((step) => stripUndefined(step));

  const keptIds = new Set(steps.map((step) => step.id));
  const edges = (authored.edges ?? []).filter(
    (edge) => keptIds.has(edge.from) && keptIds.has(edge.to),
  );

  // `edges` is rebuilt rather than spread through: an authored graph whose every
  // target was dropped must leave NO edges key behind, or the canvas builder
  // draws arrows to steps that are not there.
  const rest: Omit<FlowManifest, 'edges'> = { ...authored };
  delete (rest as { edges?: unknown }).edges;
  return {
    ...rest,
    capturedAt,
    steps,
    ...(edges.length > 0 ? { edges } : {}),
  };
}

/**
 * Throws with every offending field listed at once, so a manifest that leaked
 * two references is fixed in one pass rather than one error at a time.
 */
export function assertClientSafe(manifest: FlowManifest, source: string): void {
  const offences: string[] = [];
  for (const [field, text] of clientVisibleText(manifest)) {
    for (const { label, pattern } of INTERNAL_REFERENCE_PATTERNS) {
      const match = pattern.exec(text);
      if (match !== null) {
        offences.push(`${field}: ${label} "${match[0]}"`);
      }
    }
  }
  if (offences.length > 0) {
    throw new Error(
      `${source} leaks internal references into a client-facing canvas:\n` +
        offences.map((offence) => `  - ${offence}`).join('\n'),
    );
  }
}

/** Every string a reader of the canvas can see. Image paths are not among them. */
function clientVisibleText(manifest: FlowManifest): readonly (readonly [string, string])[] {
  return [
    ['title', manifest.title],
    ['description', manifest.description],
    ...manifest.steps.map((step) => [`step "${step.id}" label`, step.label] as const),
    ...(manifest.edges ?? []).map(
      (edge, index) => [`edge ${index + 1} label`, edge.label ?? ''] as const,
    ),
    ...(manifest.nodes ?? []).map((node) => [`note "${node.id}"`, node.text] as const),
    ...(manifest.notes ?? []).map((note, index) => [`note ${index + 1}`, note] as const),
  ];
}

function stripUndefined(step: ManifestStep): ManifestStep {
  return Object.fromEntries(
    Object.entries(step).filter(([, value]) => value !== undefined),
  ) as unknown as ManifestStep;
}
