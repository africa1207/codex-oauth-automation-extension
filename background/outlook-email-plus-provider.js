(function outlookEmailPlusProviderModule(root, factory) {
  root.MultiPageBackgroundOutlookEmailPlusProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createOutlookEmailPlusProviderModule() {
  function createOutlookEmailPlusProvider(deps = {}) {
    const {
      addLog = async () => {},
      broadcastDataUpdate = () => {},
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getOutlookEmailPlusResponseError,
      getOutlookEmailPlusVerificationCode,
      getState = async () => ({}),
      isOutlookEmailPlusSuccessResponse,
      joinOutlookEmailPlusUrl,
      normalizeOutlookEmailPlusBaseUrl,
      normalizeOutlookEmailPlusCallerId,
      normalizeOutlookEmailPlusClaim,
      normalizeOutlookEmailPlusCurrentClaim,
      normalizeOutlookEmailPlusEmail,
      normalizeOutlookEmailPlusPoolProvider,
      normalizeOutlookEmailPlusProjectKey,
      OUTLOOK_EMAIL_PLUS_PROVIDER = 'outlook-email-plus',
      setEmailState = async () => {},
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
    } = deps;

    function getOutlookEmailPlusConfig(state = {}) {
      return {
        baseUrl: normalizeOutlookEmailPlusBaseUrl(state.outlookEmailPlusBaseUrl),
        apiKey: String(state.outlookEmailPlusApiKey || '').trim(),
        callerId: normalizeOutlookEmailPlusCallerId(state.outlookEmailPlusCallerId),
        projectKey: normalizeOutlookEmailPlusProjectKey(state.outlookEmailPlusProjectKey),
        poolProvider: normalizeOutlookEmailPlusPoolProvider(state.outlookEmailPlusPoolProvider),
        currentClaim: normalizeOutlookEmailPlusCurrentClaim(state.currentOutlookEmailPlusClaim),
      };
    }

    function ensureOutlookEmailPlusConfig(state = {}, options = {}) {
      const config = getOutlookEmailPlusConfig(state);
      if (!config.baseUrl) {
        throw new Error('OutlookEmailPlus API 地址为空或格式无效。');
      }
      if (options.requireApiKey && !config.apiKey) {
        throw new Error('OutlookEmailPlus API Key 为空，请先在侧边栏填写。');
      }
      return config;
    }

    async function getLatestOutlookEmailPlusState(state = null) {
      const providedState = state && typeof state === 'object' ? state : {};
      const currentState = await getState().catch(() => ({}));
      return {
        ...providedState,
        ...(currentState && typeof currentState === 'object' ? currentState : {}),
      };
    }

    async function requestOutlookEmailPlusJson(config, path, options = {}) {
      if (!fetchImpl) {
        throw new Error('OutlookEmailPlus 当前运行环境不支持 fetch。');
      }

      const {
        method = 'GET',
        payload,
        searchParams,
        timeoutMs = 30000,
      } = options;
      const requestUrl = new URL(joinOutlookEmailPlusUrl(config.baseUrl, path));
      if (searchParams && typeof searchParams === 'object') {
        for (const [key, value] of Object.entries(searchParams)) {
          if (value === undefined || value === null || value === '') continue;
          requestUrl.searchParams.set(key, String(value));
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      const headers = { Accept: 'application/json' };
      if (config.apiKey) {
        headers['X-API-Key'] = config.apiKey;
      }
      if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      let response;
      try {
        response = await fetchImpl(requestUrl.toString(), {
          method: String(method || 'GET').toUpperCase(),
          headers,
          body: payload !== undefined ? JSON.stringify(payload || {}) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err?.name === 'AbortError'
          ? `OutlookEmailPlus 请求超时：${path}`
          : `OutlookEmailPlus 请求失败：${err.message}`;
        throw new Error(errorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        const payloadError = getOutlookEmailPlusResponseError(parsed);
        throw new Error(`OutlookEmailPlus 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
      }
      if (!isOutlookEmailPlusSuccessResponse(parsed)) {
        const payloadError = getOutlookEmailPlusResponseError(parsed);
        throw new Error(`OutlookEmailPlus 业务错误：${payloadError || 'success=false'}`);
      }

      return parsed;
    }

    function buildOutlookEmailPlusTaskId(state = {}, options = {}) {
      const explicitTaskId = String(options.taskId || '').trim();
      if (explicitTaskId) {
        return explicitTaskId;
      }
      const sessionId = Math.max(0, Math.floor(Number(state.autoRunSessionId) || 0));
      const currentRun = Math.max(0, Math.floor(Number(state.autoRunCurrentRun || options.targetRun) || 0));
      const attemptRun = Math.max(0, Math.floor(Number(state.autoRunAttemptRun || options.attemptRun) || 0));
      const randomPart = Math.random().toString(36).slice(2, 10);
      return [
        'codex-oauth',
        sessionId || Date.now(),
        currentRun || 'manual',
        attemptRun || 'claim',
        randomPart,
      ].join('-');
    }

    async function clearOutlookEmailPlusRuntimeState(options = {}) {
      const updates = {
        currentOutlookEmailPlusClaim: null,
      };
      if (options.clearEmail) {
        updates.email = null;
      }
      await setState(updates);
      broadcastDataUpdate(updates);
    }

    async function releaseOutlookEmailPlusClaim(state = null, options = {}) {
      const latestState = await getLatestOutlookEmailPlusState(state);
      const config = ensureOutlookEmailPlusConfig(latestState, { requireApiKey: true });
      const claim = normalizeOutlookEmailPlusCurrentClaim(options.claim || config.currentClaim);
      if (!claim) {
        return { released: false };
      }

      const reason = String(options.reason || 'flow_failed').trim() || 'flow_failed';
      await requestOutlookEmailPlusJson(config, '/api/external/pool/claim-release', {
        method: 'POST',
        payload: {
          account_id: claim.accountId,
          claim_token: claim.claimToken,
          caller_id: claim.callerId,
          task_id: claim.taskId,
          reason,
        },
        timeoutMs: options.timeoutMs || 30000,
      });
      await clearOutlookEmailPlusRuntimeState({ clearEmail: Boolean(options.clearEmail) });
      await addLog(`OutlookEmailPlus：已释放邮箱 ${claim.email}（${reason}）。`, options.level || 'warn');
      return { released: true, claim };
    }

    async function safeReleaseOutlookEmailPlusClaim(state = null, options = {}) {
      try {
        return await releaseOutlookEmailPlusClaim(state, options);
      } catch (err) {
        await addLog(`OutlookEmailPlus：释放当前邮箱失败：${err.message}`, 'warn');
        return { released: false, error: err };
      }
    }

    async function completeOutlookEmailPlusClaim(state = null, options = {}) {
      const latestState = await getLatestOutlookEmailPlusState(state);
      const config = ensureOutlookEmailPlusConfig(latestState, { requireApiKey: true });
      const claim = normalizeOutlookEmailPlusCurrentClaim(options.claim || config.currentClaim);
      if (!claim) {
        return { completed: false };
      }

      const result = String(options.result || 'success').trim() || 'success';
      await requestOutlookEmailPlusJson(config, '/api/external/pool/claim-complete', {
        method: 'POST',
        payload: {
          account_id: claim.accountId,
          claim_token: claim.claimToken,
          caller_id: claim.callerId,
          task_id: claim.taskId,
          result,
          detail: String(options.detail || '').trim(),
        },
        timeoutMs: options.timeoutMs || 30000,
      });
      await clearOutlookEmailPlusRuntimeState({ clearEmail: Boolean(options.clearEmail) });
      await addLog(`OutlookEmailPlus：已回传邮箱 ${claim.email} 结果 ${result}。`, options.level || 'ok');
      return { completed: true, claim, result };
    }

    async function claimOutlookEmailPlusMailbox(state = null, options = {}) {
      throwIfStopped();
      const latestState = await getLatestOutlookEmailPlusState(state);
      const config = ensureOutlookEmailPlusConfig(latestState, { requireApiKey: true });
      const existingClaim = normalizeOutlookEmailPlusCurrentClaim(config.currentClaim);
      const forceNew = Boolean(options.forceNew || options.generateNew);
      if (existingClaim && !forceNew) {
        await setEmailState(existingClaim.email);
        await addLog(`OutlookEmailPlus：复用当前领取邮箱 ${existingClaim.email}`, 'info');
        return existingClaim;
      }
      if (existingClaim && forceNew) {
        const releaseResult = await safeReleaseOutlookEmailPlusClaim(latestState, {
          claim: existingClaim,
          reason: 'replaced_by_new_claim',
          clearEmail: true,
        });
        if (!releaseResult?.released) {
          throw new Error(`OutlookEmailPlus：释放旧邮箱 ${existingClaim.email} 失败，已停止领取新邮箱以避免邮箱池状态泄漏。`);
        }
      }

      const callerId = normalizeOutlookEmailPlusCallerId(options.callerId || config.callerId);
      const projectKey = normalizeOutlookEmailPlusProjectKey(options.projectKey || config.projectKey);
      const taskId = buildOutlookEmailPlusTaskId(latestState, options);
      const poolProvider = normalizeOutlookEmailPlusPoolProvider(options.poolProvider || config.poolProvider);
      const payload = {
        caller_id: callerId,
        task_id: taskId,
        provider: poolProvider,
      };
      if (projectKey) {
        payload.project_key = projectKey;
      }
      const response = await requestOutlookEmailPlusJson(config, '/api/external/pool/claim-random', {
        method: 'POST',
        payload,
        timeoutMs: options.timeoutMs || 30000,
      });
      const claim = normalizeOutlookEmailPlusClaim(response, {
        callerId,
        taskId,
        poolProvider,
      });
      if (!claim) {
        throw new Error('OutlookEmailPlus 未返回可用邮箱领取信息。');
      }

      await setState({ currentOutlookEmailPlusClaim: claim });
      broadcastDataUpdate({ currentOutlookEmailPlusClaim: claim });
      await setEmailState(claim.email);
      await addLog(`OutlookEmailPlus：已领取邮箱 ${claim.email}`, 'ok');
      return claim;
    }

    function resolveOutlookEmailPlusPollTargetEmail(state = {}, pollPayload = {}) {
      return normalizeOutlookEmailPlusEmail(state.currentOutlookEmailPlusClaim?.email)
        || normalizeOutlookEmailPlusEmail(state.email)
        || normalizeOutlookEmailPlusEmail(pollPayload.targetEmail);
    }

    function getSinceMinutesForPoll(pollPayload = {}) {
      const afterTimestamp = Number(pollPayload.filterAfterTimestamp) || 0;
      if (afterTimestamp <= 0) {
        return 10;
      }
      const elapsedMs = Math.max(0, Date.now() - afterTimestamp);
      return Math.max(1, Math.min(120, Math.ceil(elapsedMs / 60000) + 2));
    }

    async function requestVerificationCodeFromFolder(config, targetEmail, folder, pollPayload = {}) {
      return requestOutlookEmailPlusJson(config, '/api/external/verification-code', {
        method: 'GET',
        searchParams: {
          email: targetEmail,
          folder,
          top: pollPayload.top || 20,
          since_minutes: pollPayload.sinceMinutes || getSinceMinutesForPoll(pollPayload),
          code_length: pollPayload.codeLength || 6,
          code_source: pollPayload.codeSource || 'all',
        },
        timeoutMs: pollPayload.requestTimeoutMs || 30000,
      });
    }

    async function pollOutlookEmailPlusVerificationCode(step, state, pollPayload = {}) {
      const latestState = await getLatestOutlookEmailPlusState(state);
      const config = ensureOutlookEmailPlusConfig(latestState, { requireApiKey: true });
      const targetEmail = resolveOutlookEmailPlusPollTargetEmail(latestState, pollPayload);
      if (!targetEmail) {
        throw new Error('OutlookEmailPlus 轮询前缺少目标邮箱地址。');
      }

      const pageTargetEmail = normalizeOutlookEmailPlusEmail(pollPayload.targetEmail);
      if (pageTargetEmail && pageTargetEmail !== targetEmail) {
        await addLog(`步骤 ${step}：页面显示邮箱 ${pageTargetEmail} 与 OutlookEmailPlus 领取邮箱 ${targetEmail} 不一致，按领取邮箱读取验证码。`, 'warn');
      }
      await addLog(`步骤 ${step}：正在轮询 OutlookEmailPlus 邮件（${targetEmail}）...`, 'info');
      const maxAttempts = Number(pollPayload.maxAttempts) || 5;
      const intervalMs = Number(pollPayload.intervalMs) || 3000;
      const excludedCodes = new Set((pollPayload.excludeCodes || []).map((code) => String(code || '').trim()).filter(Boolean));
      const folders = pollPayload.folder
        ? [String(pollPayload.folder).trim()]
        : ['inbox', 'junkemail'];
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        for (const folder of folders) {
          try {
            const response = await requestVerificationCodeFromFolder(config, targetEmail, folder, pollPayload);
            const code = getOutlookEmailPlusVerificationCode(response);
            if (code && !excludedCodes.has(code)) {
              return {
                ok: true,
                code,
                emailTimestamp: Date.now(),
                mailId: String(response?.data?.message_id || response?.data?.id || response?.message_id || response?.id || ''),
              };
            }
            if (code && excludedCodes.has(code)) {
              lastError = new Error(`步骤 ${step}：OutlookEmailPlus 返回的验证码 ${code} 已试过。`);
            } else {
              lastError = new Error(`步骤 ${step}：OutlookEmailPlus 暂未提取到验证码（${attempt}/${maxAttempts}）。`);
            }
          } catch (err) {
            lastError = err;
            const message = String(err?.message || '');
            const level = /MAIL_NOT_FOUND|VERIFICATION_CODE_NOT_FOUND|not_found|未找到/i.test(message) ? 'info' : 'warn';
            await addLog(`步骤 ${step}：OutlookEmailPlus ${folder} 轮询失败：${message}`, level);
          }
        }

        if (lastError) {
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
        }
        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }

      throw lastError || new Error(`步骤 ${step}：未在 OutlookEmailPlus 中获取到新的验证码。`);
    }

    function isOutlookEmailPlusProvider(stateOrProvider) {
      const provider = typeof stateOrProvider === 'string'
        ? stateOrProvider
        : stateOrProvider?.mailProvider;
      return String(provider || '').trim().toLowerCase() === OUTLOOK_EMAIL_PLUS_PROVIDER;
    }

    return {
      claimOutlookEmailPlusMailbox,
      clearOutlookEmailPlusRuntimeState,
      completeOutlookEmailPlusClaim,
      ensureOutlookEmailPlusConfig,
      getOutlookEmailPlusConfig,
      isOutlookEmailPlusProvider,
      pollOutlookEmailPlusVerificationCode,
      releaseOutlookEmailPlusClaim,
      requestOutlookEmailPlusJson,
      resolveOutlookEmailPlusPollTargetEmail,
      safeReleaseOutlookEmailPlusClaim,
    };
  }

  return {
    createOutlookEmailPlusProvider,
  };
});
