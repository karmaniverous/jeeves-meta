/**
 * Render progress events with Handlebars templates, resolving owner-path
 * browse links through jeeves-server. Network I/O via resolveLink only.
 *
 * @module progress/render
 */

import Handlebars from 'handlebars';

import { DEFAULT_TEMPLATE_STRINGS } from '../schema/config.js';
import { resolveLink } from './resolveLink.js';

export type ProgressPhase = 'architect' | 'builder' | 'critic';

export type ProgressEvent = {
  type: 'phase_start' | 'phase_complete' | 'error';
  /** Owner path (not .meta path) of the entity being synthesized. */
  path: string;
  phase?: ProgressPhase;
  tokens?: number;
  durationMs?: number;
  error?: string;
};

/** Compiled Handlebars templates for the three progress event types. */
export type CompiledTemplates = {
  phaseStart: HandlebarsTemplateDelegate;
  phaseEnd: HandlebarsTemplateDelegate;
  phaseError: HandlebarsTemplateDelegate;
};

/** Raw (string) template config — mirrors the schema definition. */
export type TemplateStrings = {
  phaseStart: string;
  phaseEnd: string;
  phaseError: string;
};

/** Compile raw template strings into Handlebars delegates. */
export function compileTemplates(
  raw: Partial<TemplateStrings> | undefined,
): CompiledTemplates {
  const merged: TemplateStrings = {
    phaseStart: raw?.phaseStart ?? DEFAULT_TEMPLATE_STRINGS.phaseStart,
    phaseEnd: raw?.phaseEnd ?? DEFAULT_TEMPLATE_STRINGS.phaseEnd,
    phaseError: raw?.phaseError ?? DEFAULT_TEMPLATE_STRINGS.phaseError,
  };
  return {
    phaseStart: Handlebars.compile(merged.phaseStart),
    phaseEnd: Handlebars.compile(merged.phaseEnd),
    phaseError: Handlebars.compile(merged.phaseError),
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Link-resolution options for {@link renderProgressEvent}. */
export type RenderLinkOptions = {
  /** jeeves-server machine key seed. */
  serverKey?: string;
  /** Called with the HTTP status when the server refuses the request. */
  onUnauthorized?: (status: number) => void;
};

/** Path and link fields of the template data bag. */
type PathFields = Pick<
  TemplateData,
  'dirPath' | 'metaPath' | 'dirLink' | 'metaLink'
>;

/**
 * Resolve the path and link fields for an owner directory and its meta.json.
 * When the server refuses the key, every field is empty: no raw filesystem
 * path reaches any template, default or custom.
 */
async function resolvePathFields(
  ownerPath: string,
  serverUrl: string,
  options: RenderLinkOptions,
): Promise<PathFields> {
  const result = await resolveLink(ownerPath, serverUrl, options.serverKey);
  if (result.kind === 'unauthorized') {
    options.onUnauthorized?.(result.status);
    return { dirPath: '', metaPath: '', dirLink: '', metaLink: '' };
  }
  const dirLink = result.link;
  return {
    dirPath: ownerPath,
    metaPath: ownerPath.replace(/\/+$/, '') + '/.meta/meta.json',
    dirLink,
    // Derive metaLink by appending /.meta/meta.json to the resolved dir link
    metaLink: dirLink.replace(/\/+$/, '') + '/.meta/meta.json',
  };
}

/** Data bag passed to every Handlebars template. */
interface TemplateData {
  dirPath: string;
  metaPath: string;
  dirLink: string;
  metaLink: string;
  phase: string;
  seconds?: string;
  tokens?: string;
  error?: string;
}

/**
 * Render the appropriate template for a progress event.
 *
 * @param event - The progress event to render.
 * @param templates - Compiled Handlebars templates.
 * @param serverUrl - jeeves-server URL for resolve-path API.
 * @param options - Machine key and unauthorized-response callback.
 * @returns Rendered message string.
 */
export async function renderProgressEvent(
  event: ProgressEvent,
  templates: CompiledTemplates,
  serverUrl: string,
  options: RenderLinkOptions = {},
): Promise<string> {
  const phase = (event.phase ?? 'unknown').toUpperCase();
  const base: TemplateData = {
    ...(await resolvePathFields(event.path, serverUrl, options)),
    phase,
  };

  switch (event.type) {
    case 'phase_start':
      return templates.phaseStart(base);

    case 'phase_complete': {
      const seconds =
        event.durationMs !== undefined
          ? String(Math.round(event.durationMs / 1000))
          : '0';
      const tokens =
        event.tokens !== undefined ? formatNumber(event.tokens) : 'unknown';
      return templates.phaseEnd({ ...base, seconds, tokens });
    }

    case 'error': {
      const seconds =
        event.durationMs !== undefined
          ? String(Math.round(event.durationMs / 1000))
          : '0';
      const errorMsg = event.error ?? 'Unknown error';
      return templates.phaseError({ ...base, seconds, error: errorMsg });
    }

    default:
      return 'Unknown progress event';
  }
}
