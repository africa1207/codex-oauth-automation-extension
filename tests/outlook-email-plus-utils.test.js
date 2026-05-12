const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OUTLOOK_EMAIL_PLUS_CALLER_ID,
  DEFAULT_OUTLOOK_EMAIL_PLUS_POOL_PROVIDER,
  getOutlookEmailPlusVerificationCode,
  normalizeOutlookEmailPlusBaseUrl,
  normalizeOutlookEmailPlusClaim,
  normalizeOutlookEmailPlusEmail,
  normalizeOutlookEmailPlusPoolProvider,
  normalizeOutlookEmailPlusProjectKey,
} = require('../outlook-email-plus-utils.js');

test('normalizeOutlookEmailPlusBaseUrl accepts root URL and strips known API endpoint paths', () => {
  assert.equal(
    normalizeOutlookEmailPlusBaseUrl(' https://api.example.com/api/external/pool/claim-random?x=1#top '),
    'https://api.example.com'
  );
  assert.equal(
    normalizeOutlookEmailPlusBaseUrl('https://api.example.com/mail/api/external/verification-code'),
    'https://api.example.com/mail'
  );
  assert.equal(normalizeOutlookEmailPlusBaseUrl('ftp://api.example.com'), '');
});

test('normalizeOutlookEmailPlusClaim supports nested response and fallback fields', () => {
  const claim = normalizeOutlookEmailPlusClaim({
    success: true,
    data: {
      account_id: 88,
      email: 'User@Outlook.COM',
      email_domain: 'Outlook.COM',
      claim_token: 'claim-token',
      lease_expires_at: '2026-05-10T10:00:00Z',
    },
  }, {
    callerId: 'caller-1',
    taskId: 'task-1',
    poolProvider: 'imap',
  });

  assert.deepEqual(claim, {
    accountId: 88,
    email: 'User@Outlook.COM',
    emailDomain: 'outlook.com',
    claimToken: 'claim-token',
    callerId: 'caller-1',
    taskId: 'task-1',
    poolProvider: 'imap',
    claimedAt: '',
    leaseExpiresAt: '2026-05-10T10:00:00Z',
  });
});

test('normalizeOutlookEmailPlusEmail preserves provider email casing', () => {
  assert.equal(normalizeOutlookEmailPlusEmail(' LarryMcdonald4676@outlook.com '), 'LarryMcdonald4676@outlook.com');
  assert.equal(normalizeOutlookEmailPlusEmail('bad-email'), '');
});

test('OutlookEmailPlus helpers default unsupported pool provider and extract code from response content', () => {
  assert.equal(normalizeOutlookEmailPlusPoolProvider('bad-provider'), DEFAULT_OUTLOOK_EMAIL_PLUS_POOL_PROVIDER);
  assert.equal(DEFAULT_OUTLOOK_EMAIL_PLUS_CALLER_ID, 'codex-oauth-extension');
  assert.equal(normalizeOutlookEmailPlusProjectKey('  project-A  '), 'project-A');
  assert.equal(getOutlookEmailPlusVerificationCode({ data: { content: 'Your OpenAI code is 654321.' } }), '654321');
  assert.equal(getOutlookEmailPlusVerificationCode({ verification_code: '123456' }), '123456');
});
