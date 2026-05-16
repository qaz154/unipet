/**
 * SVG Sanitizer
 *
 * Strips dangerous content from SVG files in user-installed themes.
 * Ported from clawd-on-desk's theme-sanitizer.js, hardened for cases
 * the earlier regex pass missed.
 *
 * IMPORTANT: regex-based SVG sanitization is fundamentally fragile against
 * adversarial input. For untrusted theme sources, prefer a DOM-based pass
 * (e.g. DOMPurify in renderer, or sax-style parser server-side). This module
 * is a defensible defense-in-depth layer for first-party + known-author themes.
 *
 * Hardened against:
 * - <script> elements (including CDATA-wrapped script bodies)
 * - All `on*` event handler attributes (allowlist-independent — covers
 *   future-added attributes like `onpointerrawupdate`)
 * - <foreignObject>, <iframe>, <object>, <embed>, <applet> elements
 * - <style> blocks with @import or remote url(...) references
 * - javascript:, vbscript:, data:text/html, data:application/* URLs
 * - Absolute file paths in href/src
 * - Path traversal (../, ..\, ~/)
 * - <!ENTITY ...> billion-laughs / XXE primitives
 */

const DANGEROUS_ELEMENTS = [
  'script', 'foreignObject', 'iframe', 'embed', 'object', 'applet',
  'use', // can pull in external SVGs via xlink:href
];

const DANGEROUS_URL_PATTERNS = [
  /^\s*javascript:/i,
  /^\s*vbscript:/i,
  /^\s*data:text\/html/i,
  /^\s*data:application\//i,
  /^\s*data:image\/svg\+xml/i, // SVGs-in-data-urls can carry their own scripts
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\\/]/,
  /^~[\\/]/,
];

// Kept exported for backwards compatibility with the test suite, but the
// runtime stripping is now allowlist-independent (any `on*=` attribute goes).
export const EVENT_HANDLER_ATTRS = new Set([
  'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
  'onmouseenter', 'onmouseleave', 'onmousedown', 'onmouseup',
  'onkeydown', 'onkeyup', 'onkeypress', 'onfocus', 'onblur',
  'onchange', 'onsubmit', 'onreset', 'onselect', 'oninput',
  'onpointerdown', 'onpointerup', 'onpointermove', 'onpointercancel',
  'onanimationstart', 'onanimationend', 'onanimationiteration',
  'ontransitionend', 'oncopy', 'oncut', 'onpaste',
  'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
  'ondragover', 'ondragstart', 'ondrop', 'onwheel',
]);

export interface SanitizeResult {
  sanitized: string;
  removed: string[];
}

export function sanitizeSVG(svgContent: string): SanitizeResult {
  const removed: string[] = [];
  let result = svgContent;

  // 1. Drop DOCTYPE / <!ENTITY ...> to neuter billion-laughs and XXE primitives
  result = result.replace(/<!DOCTYPE[\s\S]*?>/gi, () => {
    removed.push('DOCTYPE');
    return '';
  });
  result = result.replace(/<!ENTITY[\s\S]*?>/gi, () => {
    removed.push('ENTITY declaration');
    return '';
  });

  // 2. Strip all CDATA sections — they can hide script bodies
  result = result.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, () => {
    removed.push('CDATA section');
    return '';
  });

  // 3. Strip dangerous elements (including their content) — case-insensitive,
  //    tolerates whitespace/attributes between tag-open and rest of attrs.
  for (const tag of DANGEROUS_ELEMENTS) {
    // Paired: <tag …>…</tag>
    const paired = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`,
      'gi',
    );
    result = result.replace(paired, () => {
      removed.push(`${tag} element`);
      return '';
    });
    // Self-closing or unmatched: <tag … />  or <tag …>
    const selfClose = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    result = result.replace(selfClose, () => {
      removed.push(`${tag} element (self-closing)`);
      return '';
    });
  }

  // 4. Strip ALL `on*=` attributes (allowlist-independent — robust against
  //    new event handler names browsers add later).
  result = result.replace(
    /\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match) => {
      removed.push(`event handler: ${match.trim().split('=')[0]}`);
      return '';
    },
  );

  // 5. Sanitize <style> blocks: remove @import and remote url(...). Keep the
  //    rest of the CSS so animations still work.
  result = result.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    let cleaned = css;
    cleaned = cleaned.replace(/@import\s+[^;]+;/gi, () => {
      removed.push('CSS @import');
      return '';
    });
    cleaned = cleaned.replace(
      /url\(\s*(['"]?)(?!#)([^)'"]+)\1\s*\)/gi,
      (m, _q, url: string) => {
        if (/^https?:|^\/\/|^data:/i.test(url)) {
          removed.push(`CSS url(${url.slice(0, 50)})`);
          return 'url(#)';
        }
        return m;
      },
    );
    return `<style>${cleaned}</style>`;
  });

  // 6. Sanitize href / src / xlink:href values
  result = result.replace(
    /((?:href|src|xlink:href)\s*=\s*)(["'])([^"']*)\2/gi,
    (match, prefix: string, quote: string, url: string) => {
      const trimmed = url.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) return match;

      if (DANGEROUS_URL_PATTERNS.some((p) => p.test(trimmed))) {
        removed.push(`dangerous URL: ${trimmed.slice(0, 50)}`);
        return `${prefix}${quote}#${quote}`;
      }
      if (/^(\/|[A-Za-z]:[\\/])/.test(trimmed)) {
        removed.push(`absolute path: ${trimmed.slice(0, 50)}`);
        return `${prefix}${quote}#${quote}`;
      }
      if (PATH_TRAVERSAL_PATTERNS.some((p) => p.test(trimmed))) {
        removed.push(`path traversal: ${trimmed.slice(0, 50)}`);
        return `${prefix}${quote}#${quote}`;
      }
      // Block external http(s) too — themes shouldn't phone home
      if (/^https?:|^\/\//i.test(trimmed)) {
        removed.push(`external URL: ${trimmed.slice(0, 50)}`);
        return `${prefix}${quote}#${quote}`;
      }
      return match;
    },
  );

  return { sanitized: result, removed };
}

/** Quick check: does this SVG contain potentially dangerous content? */
export function hasDangerousContent(svgContent: string): boolean {
  if (/<script\b/i.test(svgContent)) return true;
  if (/<foreignObject\b/i.test(svgContent)) return true;
  if (/<iframe\b/i.test(svgContent)) return true;
  if (/<!DOCTYPE/i.test(svgContent)) return true;
  if (/<!ENTITY/i.test(svgContent)) return true;
  if (/<!\[CDATA\[/.test(svgContent)) return true;
  if (/\s+on[a-z][a-z0-9_-]*\s*=/i.test(svgContent)) return true;
  if (/javascript:|vbscript:|data:text\/html|data:application\//i.test(svgContent)) return true;
  return false;
}
