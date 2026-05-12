(function attachOutlookEmailPlusUtils(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.OutlookEmailPlusUtils = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createOutlookEmailPlusUtils() {
  const OUTLOOK_EMAIL_PLUS_PROVIDER = 'outlook-email-plus';
  const DEFAULT_OUTLOOK_EMAIL_PLUS_CALLER_ID = 'codex-oauth-extension';
  const DEFAULT_OUTLOOK_EMAIL_PLUS_POOL_PROVIDER = 'outlook';
  const SUPPORTED_POOL_PROVIDERS = new Set(['outlook', 'imap', 'custom', 'cloudflare_temp_mail']);

  function normalizeOutlookEmailPlusBaseUrl(value = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }

      parsed.hash = '';
      parsed.search = '';
      parsed.pathname = parsed.pathname
        .replace(/\/api\/external\/(?:health|capabilities|account-status|messages(?:\/.*)?|verification-code|verification-link|wait-message|probe(?:\/.*)?|pool(?:\/.*)?)$/i, '')
        .replace(/\/+$/g, '');
      return parsed.toString().replace(/\/$/g, '');
    } catch {
      return '';
    }
  }

  function joinOutlookEmailPlusUrl(baseUrl, path = '') {
    const normalizedBaseUrl = normalizeOutlookEmailPlusBaseUrl(baseUrl);
    const normalizedPath = String(path || '').trim();
    if (!normalizedBaseUrl) {
      return normalizedPath || '';
    }
    if (!normalizedPath) {
      return normalizedBaseUrl;
    }
    return `${normalizedBaseUrl}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
  }

  function normalizeOutlookEmailPlusPoolProvider(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return SUPPORTED_POOL_PROVIDERS.has(normalized)
      ? normalized
      : DEFAULT_OUTLOOK_EMAIL_PLUS_POOL_PROVIDER;
  }

  function normalizeOutlookEmailPlusCallerId(value = '') {
    return String(value || '').trim() || DEFAULT_OUTLOOK_EMAIL_PLUS_CALLER_ID;
  }

  function normalizeOutlookEmailPlusProjectKey(value = '') {
    return String(value || '').trim();
  }

  function normalizeOutlookEmailPlusEmail(value = '') {
    const normalized = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  function pickObjectPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return payload.data;
    }
    if (payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)) {
      return payload.result;
    }
    if (payload.claim && typeof payload.claim === 'object' && !Array.isArray(payload.claim)) {
      return payload.claim;
    }
    return payload;
  }

  function getOutlookEmailPlusResponseError(payload) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    const code = String(payload.code || payload.error_code || '').trim();
    const message = String(payload.message || payload.msg || payload.error || '').trim();
    return [code, message].filter(Boolean).join('：');
  }

  function isOutlookEmailPlusSuccessResponse(payload) {
    if (!payload || typeof payload !== 'object') {
      return true;
    }
    if (payload.success !== undefined) {
      return payload.success === true;
    }
    if (payload.ok !== undefined) {
      return payload.ok === true;
    }
    return true;
  }

  function normalizeOutlookEmailPlusClaim(value = {}, fallback = {}) {
    const payload = pickObjectPayload(value);
    const accountId = Number(
      payload.account_id
      ?? payload.accountId
      ?? payload.id
      ?? fallback.accountId
      ?? fallback.account_id
      ?? 0
    );
    const email = normalizeOutlookEmailPlusEmail(
      payload.email
      ?? payload.email_address
      ?? payload.address
      ?? fallback.email
      ?? ''
    );
    const claimToken = String(
      payload.claim_token
      ?? payload.claimToken
      ?? payload.token
      ?? fallback.claimToken
      ?? fallback.claim_token
      ?? ''
    ).trim();
    const callerId = normalizeOutlookEmailPlusCallerId(
      payload.caller_id
      ?? payload.callerId
      ?? fallback.callerId
      ?? fallback.caller_id
      ?? ''
    );
    const taskId = String(
      payload.task_id
      ?? payload.taskId
      ?? fallback.taskId
      ?? fallback.task_id
      ?? ''
    ).trim();

    if (!Number.isFinite(accountId) || accountId <= 0 || !email || !claimToken || !taskId) {
      return null;
    }

    return {
      accountId: Math.floor(accountId),
      email,
      emailDomain: String(payload.email_domain || payload.emailDomain || fallback.emailDomain || '').trim().toLowerCase(),
      claimToken,
      callerId,
      taskId,
      poolProvider: normalizeOutlookEmailPlusPoolProvider(payload.provider || fallback.poolProvider),
      claimedAt: String(payload.claimed_at || payload.claimedAt || fallback.claimedAt || '').trim(),
      leaseExpiresAt: String(payload.lease_expires_at || payload.leaseExpiresAt || fallback.leaseExpiresAt || '').trim(),
    };
  }

  function getOutlookEmailPlusVerificationCode(payload) {
    const data = pickObjectPayload(payload);
    const directCode = String(
      data.verification_code
      ?? data.verificationCode
      ?? data.code
      ?? data.otp
      ?? ''
    ).trim();
    if (/^\d{4,10}$/.test(directCode)) {
      return directCode;
    }

    const sources = [
      data.subject,
      data.content,
      data.html_content,
      data.htmlContent,
      data.body,
      data.text,
      data.raw_content,
      data.rawContent,
      data.message,
    ];
    for (const source of sources) {
      const match = String(source || '').match(/\b(\d{4,10})\b/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  function normalizeOutlookEmailPlusCurrentClaim(value = {}) {
    return normalizeOutlookEmailPlusClaim(value);
  }

  return {
    DEFAULT_OUTLOOK_EMAIL_PLUS_CALLER_ID,
    DEFAULT_OUTLOOK_EMAIL_PLUS_POOL_PROVIDER,
    OUTLOOK_EMAIL_PLUS_PROVIDER,
    getOutlookEmailPlusResponseError,
    getOutlookEmailPlusVerificationCode,
    isOutlookEmailPlusSuccessResponse,
    joinOutlookEmailPlusUrl,
    normalizeOutlookEmailPlusBaseUrl,
    normalizeOutlookEmailPlusCallerId,
    normalizeOutlookEmailPlusClaim,
    normalizeOutlookEmailPlusCurrentClaim,
    normalizeOutlookEmailPlusEmail,
    normalizeOutlookEmailPlusPoolProvider,
    normalizeOutlookEmailPlusProjectKey,
  };
});
