const test = require('node:test');
const assert = require('node:assert/strict');

const outlookEmailPlusUtils = require('../outlook-email-plus-utils.js');
require('../background/outlook-email-plus-provider.js');

function createProviderApi(options = {}) {
  let currentState = {
    mailProvider: outlookEmailPlusUtils.OUTLOOK_EMAIL_PLUS_PROVIDER,
    outlookEmailPlusBaseUrl: 'https://api.example.com',
    outlookEmailPlusApiKey: 'sk-test',
    outlookEmailPlusCallerId: 'caller-1',
    outlookEmailPlusPoolProvider: 'imap',
    currentOutlookEmailPlusClaim: null,
    email: null,
    ...(options.state || {}),
  };
  const calls = [];
  const logs = [];
  const broadcasts = [];
  const responseByPath = options.responseByPath || {};
  const fetchImpl = async (url, request = {}) => {
    const parsedUrl = new URL(url);
    const body = request.body ? JSON.parse(request.body) : null;
    calls.push({
      url,
      path: parsedUrl.pathname,
      search: Object.fromEntries(parsedUrl.searchParams.entries()),
      method: request.method || 'GET',
      headers: request.headers || {},
      body,
    });
    const handler = responseByPath[parsedUrl.pathname];
    const payload = typeof handler === 'function'
      ? await handler({ url: parsedUrl, request, body, calls })
      : (handler || { success: true });
    return {
      ok: payload.ok !== false,
      status: payload.status || (payload.ok === false ? 500 : 200),
      text: async () => JSON.stringify(payload.body !== undefined ? payload.body : payload),
    };
  };

  const api = globalThis.MultiPageBackgroundOutlookEmailPlusProvider.createOutlookEmailPlusProvider({
    ...outlookEmailPlusUtils,
    addLog: async (message, level) => logs.push({ message, level }),
    broadcastDataUpdate: (payload) => broadcasts.push(payload),
    fetchImpl,
    getState: async () => currentState,
    setEmailState: async (email) => {
      currentState = { ...currentState, email };
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  return {
    ...api,
    snapshot() {
      return { calls, logs, broadcasts, state: currentState };
    },
  };
}

test('claimOutlookEmailPlusMailbox claims a mailbox with API key and stores runtime claim', async () => {
  const api = createProviderApi({
    responseByPath: {
      '/api/external/pool/claim-random': {
        success: true,
        data: {
          account_id: 12,
          email: 'User@Outlook.com',
          email_domain: 'outlook.com',
          claim_token: 'claim-token',
        },
      },
    },
  });

  const claim = await api.claimOutlookEmailPlusMailbox(null, { taskId: 'task-1' });
  const snapshot = api.snapshot();
  const request = snapshot.calls[0];

  assert.equal(claim.email, 'User@Outlook.com');
  assert.equal(snapshot.state.email, 'User@Outlook.com');
  assert.equal(snapshot.state.currentOutlookEmailPlusClaim.accountId, 12);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['X-API-Key'], 'sk-test');
  assert.deepEqual(request.body, {
    caller_id: 'caller-1',
    task_id: 'task-1',
    provider: 'imap',
  });
  assert.deepEqual(snapshot.broadcasts[0].currentOutlookEmailPlusClaim.email, 'User@Outlook.com');
});

test('completeOutlookEmailPlusClaim calls claim-complete and clears runtime email', async () => {
  const api = createProviderApi({
    state: {
      email: 'user@outlook.com',
      currentOutlookEmailPlusClaim: {
        accountId: 12,
        email: 'user@outlook.com',
        claimToken: 'claim-token',
        callerId: 'caller-1',
        taskId: 'task-1',
      },
    },
    responseByPath: {
      '/api/external/pool/claim-complete': { success: true },
    },
  });

  const result = await api.completeOutlookEmailPlusClaim(null, {
    result: 'success',
    detail: 'registration_success',
    clearEmail: true,
  });
  const snapshot = api.snapshot();

  assert.equal(result.completed, true);
  assert.equal(snapshot.state.email, null);
  assert.equal(snapshot.state.currentOutlookEmailPlusClaim, null);
  assert.deepEqual(snapshot.calls[0].body, {
    account_id: 12,
    claim_token: 'claim-token',
    caller_id: 'caller-1',
    task_id: 'task-1',
    result: 'success',
    detail: 'registration_success',
  });
});

test('releaseOutlookEmailPlusClaim calls claim-release on failed flow and clears runtime email', async () => {
  const api = createProviderApi({
    state: {
      email: 'user@outlook.com',
      currentOutlookEmailPlusClaim: {
        accountId: 12,
        email: 'user@outlook.com',
        claimToken: 'claim-token',
        callerId: 'caller-1',
        taskId: 'task-1',
      },
    },
    responseByPath: {
      '/api/external/pool/claim-release': { success: true },
    },
  });

  const result = await api.releaseOutlookEmailPlusClaim(null, {
    reason: 'step4_failed',
    clearEmail: true,
  });
  const snapshot = api.snapshot();

  assert.equal(result.released, true);
  assert.equal(snapshot.state.email, null);
  assert.equal(snapshot.state.currentOutlookEmailPlusClaim, null);
  assert.deepEqual(snapshot.calls[0].body, {
    account_id: 12,
    claim_token: 'claim-token',
    caller_id: 'caller-1',
    task_id: 'task-1',
    reason: 'step4_failed',
  });
});

test('pollOutlookEmailPlusVerificationCode searches inbox then junkemail and returns code', async () => {
  const api = createProviderApi({
    state: {
      email: 'user@outlook.com',
      currentOutlookEmailPlusClaim: {
        accountId: 12,
        email: 'user@outlook.com',
        claimToken: 'claim-token',
        callerId: 'caller-1',
        taskId: 'task-1',
      },
    },
    responseByPath: {
      '/api/external/verification-code': ({ url }) => {
        if (url.searchParams.get('folder') === 'inbox') {
          return { success: false, code: 'VERIFICATION_CODE_NOT_FOUND', message: 'not found' };
        }
        return { success: true, data: { verification_code: '778899', message_id: 'mail-1' } };
      },
    },
  });

  const result = await api.pollOutlookEmailPlusVerificationCode(4, null, {
    maxAttempts: 1,
    intervalMs: 1,
  });
  const snapshot = api.snapshot();

  assert.equal(result.code, '778899');
  assert.deepEqual(snapshot.calls.map((call) => call.search.folder), ['inbox', 'junkemail']);
  assert.equal(snapshot.calls[0].search.email, 'user@outlook.com');
});

test('pollOutlookEmailPlusVerificationCode uses claimed mailbox from fresh state over page target email', async () => {
  const api = createProviderApi({
    state: {
      email: 'claimed@outlook.com',
      currentOutlookEmailPlusClaim: {
        accountId: 12,
        email: 'Claimed@Outlook.com',
        claimToken: 'claim-token',
        callerId: 'caller-1',
        taskId: 'task-1',
      },
    },
    responseByPath: {
      '/api/external/verification-code': ({ url }) => {
        assert.equal(url.searchParams.get('email'), 'Claimed@Outlook.com');
        return { success: true, data: { verification_code: '112233', message_id: 'mail-2' } };
      },
    },
  });

  const result = await api.pollOutlookEmailPlusVerificationCode(8, {
    email: 'stale@outlook.com',
    step8VerificationTargetEmail: 'page@outlook.com',
  }, {
    targetEmail: 'page@outlook.com',
    maxAttempts: 1,
    intervalMs: 1,
  });
  const snapshot = api.snapshot();

  assert.equal(result.code, '112233');
  assert.equal(snapshot.calls[0].search.email, 'Claimed@Outlook.com');
  assert.equal(
    snapshot.logs.some((entry) => /页面显示邮箱 page@outlook\.com 与 OutlookEmailPlus 领取邮箱 Claimed@Outlook\.com 不一致/.test(entry.message)),
    true
  );
});
