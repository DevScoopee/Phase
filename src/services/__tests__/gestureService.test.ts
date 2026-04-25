import {
  buildGestureDebugLabel,
  resolveGesturePriority,
  validateHorizontalSwipe,
} from '../gestureService';

describe('gestureService', () => {
  it('accepts a clear horizontal swipe', () => {
    const result = validateHorizontalSwipe({ dx: 88, dy: 12, vx: 0.4, vy: 0.02 });

    expect(result.isValid).toBe(true);
    expect(result.direction).toBe('right');
    expect(result.priority).toBe('swipe');
  });

  it('rejects vertical-dominant movement', () => {
    const result = validateHorizontalSwipe({ dx: 74, dy: 64, vx: 0.27, vy: 0.35 });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('vertical-dominant');
  });

  it('resolves long press priority when no swipe is accepted', () => {
    const swipeResult = validateHorizontalSwipe({ dx: 10, dy: 2, vx: 0.01, vy: 0 });

    expect(resolveGesturePriority(swipeResult, true)).toBe('long-press');
    expect(resolveGesturePriority(swipeResult, false)).toBe('tap');
  });

  it('builds a readable debug label', () => {
    const result = validateHorizontalSwipe({ dx: -90, dy: 8, vx: -0.31, vy: 0.01 });
    const label = buildGestureDebugLabel(result, { dx: -90, dy: 8, vx: -0.31, vy: 0.01 });

    expect(label).toContain('direction=left');
    expect(label).toContain('reason=accepted');
  });
});
