import { afterEach, describe, expect, it, vi } from 'vitest';

import { isGoogleLoginEnabled } from './features';

describe('isGoogleLoginEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('é desligado por padrão', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED', undefined);
    expect(isGoogleLoginEnabled()).toBe(false);
  });

  it('só liga com o texto exato "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED', 'true');
    expect(isGoogleLoginEnabled()).toBe(true);
  });

  it.each(['', 'false', 'TRUE', 'True', '1', 'yes', ' true '])('%j continua desligado', (value) => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED', value);
    expect(isGoogleLoginEnabled()).toBe(false);
  });
});
