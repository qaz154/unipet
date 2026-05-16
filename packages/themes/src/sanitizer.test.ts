import { describe, it, expect } from 'vitest';
import { sanitizeSVG, hasDangerousContent } from './sanitizer.js';

describe('sanitizeSVG', () => {
  it('removes script tags', () => {
    const svg = '<svg><script>alert("xss")</script><rect/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('<script>');
    expect(result.sanitized).toContain('<rect/>');
    expect(result.removed).toContain('script element');
  });

  it('removes event handlers', () => {
    const svg = '<svg><rect onclick="alert(1)" onload="bad()"/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('onclick');
    expect(result.sanitized).not.toContain('onload');
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it('removes javascript: URLs', () => {
    const svg = '<svg><a href="javascript:alert(1)">click</a></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('javascript:');
  });

  it('removes absolute file paths', () => {
    const svg = '<svg><image href="/etc/passwd"/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('/etc/passwd');
  });

  it('removes path traversal', () => {
    const svg = '<svg><image href="../../../secret"/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('..');
  });

  it('removes foreignObject', () => {
    const svg = '<svg><foreignObject><body onload="xss()"/></foreignObject></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).not.toContain('foreignObject');
  });

  it('preserves safe SVG content', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect fill="red" width="50" height="50"/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).toBe(svg);
    expect(result.removed).toHaveLength(0);
  });

  it('preserves local fragment references', () => {
    const svg = '<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>';
    const result = sanitizeSVG(svg);
    expect(result.sanitized).toContain('url(#g)');
  });
});

describe('hasDangerousContent', () => {
  it('detects script tags', () => {
    expect(hasDangerousContent('<svg><script>alert(1)</script></svg>')).toBe(true);
  });

  it('detects event handlers', () => {
    expect(hasDangerousContent('<svg><rect onclick="bad()"/></svg>')).toBe(true);
  });

  it('detects javascript URLs', () => {
    expect(hasDangerousContent('<svg><a href="javascript:void(0)"/></svg>')).toBe(true);
  });

  it('returns false for safe SVG', () => {
    expect(hasDangerousContent('<svg><rect fill="blue"/></svg>')).toBe(false);
  });
});
