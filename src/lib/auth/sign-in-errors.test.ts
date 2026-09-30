import { describe, expect, it } from 'vitest';

import { otpErrorFromAuthCode, signInPageErrorMessage } from './sign-in-errors';

describe('signInPageErrorMessage', () => {
  it('maps the fixed codes', () => {
    expect(signInPageErrorMessage('google')).toMatch(/Google/);
    expect(signInPageErrorMessage('retorno')).toMatch(/retorno/);
    expect(signInPageErrorMessage('indisponivel')).toMatch(/indisponível/);
  });

  it.each([undefined, '', 'x', '<script>alert(1)</script>', 'toString', '__proto__', ['google']])(
    'ignores %j',
    (value) => {
      expect(signInPageErrorMessage(value)).toBeNull();
    },
  );
});

describe('otpErrorFromAuthCode', () => {
  it('maps rate limits', () => {
    expect(otpErrorFromAuthCode('over_email_send_rate_limit', 'send')).toBe('rate_limited');
    expect(otpErrorFromAuthCode('over_request_rate_limit', 'verify')).toBe('rate_limited');
  });

  it('maps a wrong or expired code', () => {
    expect(otpErrorFromAuthCode('otp_expired', 'verify')).toBe('invalid_code');
    expect(otpErrorFromAuthCode(undefined, 'verify')).toBe('invalid_code');
  });

  it('maps an invalid e-mail and unknown send errors', () => {
    expect(otpErrorFromAuthCode('email_address_invalid', 'send')).toBe('invalid_email');
    expect(otpErrorFromAuthCode('unexpected_failure', 'send')).toBe('unavailable');
  });
});
