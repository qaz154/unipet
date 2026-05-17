export {
  type ThemeDefinition,
  type StateDefinition,
  type ThemeVariant,
  type ThemeTimings,
  type HitBox,
  type CSSPixelThemeConfig,
  type SVGThemeConfig,
  type SpriteThemeConfig,
  type ValidationError,
  validateTheme,
  DEFAULT_TIMINGS,
  REQUIRED_STATES,
  SLEEP_SEQUENCE_STATES,
} from './schema.js';

export {
  ThemeLoader,
  type ThemeManifest,
  type LoaderConfig,
} from './loader.js';

export {
  sanitizeSVG,
  hasDangerousContent,
  type SanitizeResult,
} from './sanitizer.js';

export {
  mergeVariant,
  listVariants,
  getVariant,
} from './variants.js';

export {
  createThemeAssetCache,
  type ThemeAssetCache,
  type CacheEntry,
} from './cache.js';

// NOTE: File utilities (importThemeFromFile, exportThemeToFile, importAndPersistTheme)
// have been moved to file-utils.ts for Node.js-only usage.
// Import them directly from '@unipet/themes/file-utils' in CLI/main process code.
