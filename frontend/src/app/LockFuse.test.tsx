import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockFuse } from './LockFuse';

describe('LockFuse', () => {
  it('never shows more time than the auto-lock setting, even just after activity', () => {
    // Activity can push lockAt slightly past "now + setting" relative to the last rendered tick.
    render(<LockFuse lockAt={Date.now() + 5 * 60_000 + 900} minutes={5} />);
    expect(
      screen.getByRole('button', { name: /Locks automatically in 5:00\./ }),
    ).toBeInTheDocument();
  });

  it('counts down in minutes and seconds', () => {
    render(<LockFuse lockAt={Date.now() + 61_000} minutes={5} />);
    expect(
      screen.getByRole('button', { name: /Locks automatically in 1:01\./ }),
    ).toBeInTheDocument();
  });
});
