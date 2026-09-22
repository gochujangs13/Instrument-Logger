// updater.js — GitHub Private/Public 릴리즈 자동 업데이트 프론트엔드 모듈
// - 부팅 시 조용히 최신 버전 백그라운드 체크 (오프라인 무중단)
// - 릴리즈 상태에 따른 버튼 활성화/비활성화 및 상태 메시지 표시
//   * 동일 버전: "현재 최신 버전입니다." 메시지 표시 & 버튼 비활성화
//   * 신규 버전: "vX.X.X 버전이 최신으로 등록되어 있습니다. 업데이트하세요." 메시지 표시 & 버튼 활성화
// - 버튼 클릭 시 저장/내장된 GitHub 토큰으로 자동 다운로드 (0% ~ 100% 게이지) 및 자가 교체

export class AppUpdater {
  constructor() {
    this.pollTimer = null;
    this.modalEl = null;
    this.latestInfo = null;
    this._injectStyles();
    this._attachHeaderButton();
  }

  static init() {
    if (window._appUpdater) return window._appUpdater;
    const instance = new AppUpdater();
    window._appUpdater = instance;
    // 앱 부팅 0.8초 후 자동 버전 체크 시작
    setTimeout(() => instance.checkInitial(), 800);
    return instance;
  }

  // ── 1. 부팅 시 자동 버전 확인 ────────────────────────────────────────────────
  async checkInitial() {
    this._setStatusChecking();

    // URL mock_update 파라미터가 있으면 시뮬레이션 모드로 즉시 동작
    const urlParams = new URLSearchParams(window.location.search);
    const mockVer = urlParams.get('mock_update');
    if (mockVer) {
      this.latestInfo = {
        ok: true,
        update_available: true,
        latest_version: mockVer,
        current_version: '1.0.0-rc.6',
        release_notes: [
          '## Keithley 2400',
          '- OVP 자동 설정 단계 오류 수정 (30V 이상 구간)',
          '- GPIB 첫 명령 안전 딜레이 개선 (50ms → 120ms)',
          '',
          '## SP-2100 / TL-2200',
          '- 파형 캡처 중 onByte 버퍼 누수 수정',
          '- Peak 값 산출 알고리즘 정밀도 개선',
          '',
          '## Etching Design',
          '- 혼합 배치 브릿지 4포인트 좌표 계산 오류 수정',
          '- DXF 내보내기 ETCH_REMOVE 닫힌 폴리라인 보장',
          '- 자동 배치 열/행 계산 엔진 성능 개선',
          '',
          '## 공통',
          '- 자동 업데이트 시스템 통합 및 안정화',
          '- 업데이트 완료 후 릴리즈 노트 즉시 확인 기능 추가',
        ].join('\n'),
        asset_size: 48 * 1024 * 1024,
        asset_name: `3M_Instrument_Logger_v${mockVer}.exe`,
        asset_id: 99999
      };

      this._setStatusAvailable(mockVer);
      return;
    }

    try {
      const res = await fetch('/api/update/check');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.ok && data.update_available) {
        // [새 버전이 있을 경우]
        this.latestInfo = data;
        this._setStatusAvailable(data.latest_version);
      } else {
        // [현재 버전과 동일하거나 최신일 경우]
        this.latestInfo = null;
        this._setStatusUpToDate(data.current_version);
      }
    } catch (e) {
      // 서버 미지원 환경 또는 일시적 오류 시
      this._setStatusUpToDate();
    }
  }

  // ── 2. 상태별 UI 반영 ────────────────────────────────────────────────────────
  _setStatusChecking() {
    const badge = document.getElementById('updaterStatusBadge');
    const badgeText = document.getElementById('updaterStatusText');
    const btn = document.getElementById('btnAppUpdater');
    if (badge && badgeText) {
      badge.className = 'updater-status-badge checking';
      badgeText.textContent = '버전 확인 중...';
    }
    if (btn) {
      btn.disabled = true;
      btn.className = 'updater-header-btn disabled';
      btn.title = 'GitHub 최신 버전을 확인하고 있습니다.';
      btn.innerHTML = `<span class="updater-btn-icon updater-spin">🔄</span><span>업데이트</span>`;
    }
  }

  _setStatusUpToDate(currentVer) {
    const badge = document.getElementById('updaterStatusBadge');
    const badgeText = document.getElementById('updaterStatusText');
    const btn = document.getElementById('btnAppUpdater');
    if (badge && badgeText) {
      badge.className = 'updater-status-badge latest';
      badgeText.textContent = '현재 최신 버전입니다.';
      badge.title = '클릭 시 최신 버전을 다시 확인합니다.';
      badge.style.cursor = 'pointer';
      badge.onclick = () => this.checkManual();
    }
    if (btn) {
      btn.disabled = false;
      btn.className = 'updater-header-btn latest-btn';
      btn.title = currentVer ? `현재 최신 버전(v${currentVer})입니다. 클릭하면 업데이트를 다시 확인합니다.` : '클릭하면 최신 버전을 다시 확인합니다.';
      btn.innerHTML = `<span class="updater-btn-icon">✓</span><span>업데이트 확인</span>`;
    }
  }

  _setStatusAvailable(newVer) {
    const badge = document.getElementById('updaterStatusBadge');
    const badgeText = document.getElementById('updaterStatusText');
    const btn = document.getElementById('btnAppUpdater');
    const tag = newVer ? `v${newVer}` : '신규';
    if (badge && badgeText) {
      badge.className = 'updater-status-badge available';
      badgeText.textContent = `${tag} 버전이 최신으로 등록되어 있습니다. 업데이트하세요.`;
    }
    if (btn) {
      btn.disabled = false;
      btn.className = 'updater-header-btn active';
      btn.title = `${tag} 버전으로 즉시 업데이트를 시작합니다.`;
      btn.innerHTML = `<span class="updater-btn-icon">🚀</span><span>지금 업데이트</span>`;
    }
  }

  // ── 3. 업데이트 버튼 클릭 액션 ───────────────────────────────────────────────
  onUpdateBtnClick() {
    if (!this.latestInfo) {
      // 혹시 정보가 없으면 수동 재확인
      this.checkManual();
      return;
    }
    // 사용자가 버튼을 클릭하면 토큰을 별도로 묻지 않고 저장/내장 토큰을 사용하여 곧바로 다운로드 시작
    this.startDownloadFlow(this.latestInfo);
  }

  // ── 4. 수동 재확인 (설정창 등에서 호출) ────────────────────────────────────────
  async checkManual() {
    this._showLoadingToast('GitHub에서 최신 버전을 확인하고 있습니다...');
    try {
      const res = await fetch('/api/update/check');
      this._hideLoadingToast();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok && data.update_available) {
        this.latestInfo = data;
        this._setStatusAvailable(data.latest_version);
        this.showUpdateModal(data);
      } else {
        this.latestInfo = null;
        this._setStatusUpToDate(data.current_version);
        const cur = data.current_version ? `v${data.current_version}` : '현재 버전';
        this.showNoticeModal('최신 버전 사용 중', `현재 최신 버전(${cur})을 사용하고 있습니다.\n새로운 업데이트가 없습니다.`);
      }
    } catch (e) {
      this._hideLoadingToast();
      this.showNoticeModal('업데이트 확인 실패', `최신 버전을 확인할 수 없습니다.\n인터넷 연결 또는 GitHub 설정을 확인해 주세요.\n(${e.message})`);
    }
  }

  // ── 5. 업데이트 안내 모달 (상세 보기 원할 때) ─────────────────────────────────
  showUpdateModal(info) {
    this.closeModal();

    const curVer = info.current_version ? `v${info.current_version}` : '현재 버전';
    const newVer = info.latest_version ? `v${info.latest_version}` : '신규 버전';
    const sizeMb = info.asset_size ? (info.asset_size / (1024 * 1024)).toFixed(1) + ' MB' : '';
    const notesHtml = this._formatReleaseNotes(info.release_notes || '');

    const modal = document.createElement('div');
    modal.className = 'updater-modal-overlay';
    modal.innerHTML = `
      <div class="updater-modal-card">
        <div class="updater-modal-header">
          <div class="updater-title-badge">
            <span class="updater-icon">🚀</span>
            <span class="updater-title">${newVer} 버전이 릴리즈 되었습니다</span>
          </div>
          <button class="updater-close-btn" id="updaterModalCloseBtn">&times;</button>
        </div>

        <div class="updater-subtitle-prompt">
          최신 버전으로 업데이트 하시겠습니까?
        </div>

        <div class="updater-version-row">
          <span class="updater-badge-old">${curVer}</span>
          <span class="updater-arrow">➔</span>
          <span class="updater-badge-new">${newVer}</span>
          ${sizeMb ? `<span class="updater-size">(${sizeMb})</span>` : ''}
        </div>

        <div class="updater-body-section">
          <div class="updater-notes-label">📋 이번 업데이트 주요 내용</div>
          <div class="updater-notes-box">${notesHtml}</div>
        </div>

        <div class="updater-actions-row">
          <button class="updater-btn-secondary" id="updaterLaterBtn">나중에 하기</button>
          <button class="updater-btn-primary" id="updaterStartBtn">
            <span>지금 업데이트 진행하기</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.querySelector('#updaterModalCloseBtn').onclick = () => this.closeModal();
    modal.querySelector('#updaterLaterBtn').onclick = () => this.closeModal();
    modal.querySelector('#updaterStartBtn').onclick = () => this.startDownloadFlow(info);
  }

  // ── 6. 독립 업데이트 프로그램 실행 및 메인 프로그램 종료 ───────────────────
  async startDownloadFlow(info) {
    this.closeModal();

    const newVer = info.latest_version ? `v${info.latest_version}` : '신규 버전';
    const isMock = window.location.search.includes('mock_update');

    if (isMock) {
      this._runMockUpdaterFlow(info);
      return;
    }

    // 실제 환경: 로딩 안내 카드 표시 후 즉시 독립 업데이터 실행 + 메인 프로그램 안전 종료
    const modal = document.createElement('div');
    modal.className = 'updater-modal-overlay';
    modal.innerHTML = `
      <div class="updater-modal-card" style="max-width: 440px; text-align: center; padding: 28px 24px;">
        <div style="font-size: 42px; margin-bottom: 12px; animation: updaterBounce 1s infinite alternate;">🚀</div>
        <div style="font-size: 17px; font-weight: 700; color: #f8fafc; margin-bottom: 8px;">
          독립 업데이트 프로그램을 실행합니다
        </div>
        <div style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 18px;">
          통합 프로그램이 안전하게 종료되고,<br>
          <strong style="color:#38bdf8;">화면 최상단에 전용 업데이트 창이 실행됩니다.</strong>
        </div>
        <div style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(56, 189, 248, 0.3);">
          <span class="updater-spin" style="display:inline-block;">🔄</span> 업데이트 창을 최상단에 띄우는 중...
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;

    try {
      await fetch('/api/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id:      info.asset_id,
          asset_name:    info.asset_name,
          asset_size:    info.asset_size,
          version:       info.latest_version,
          release_notes: info.release_notes || ''
        })
      });
    } catch {
      // 메인 프로세스가 0.15초 후 종료되므로 네트워크 연결 끊김은 정상입니다.
    }
  }

  // ── Mock 시뮬레이션: 독립 업데이트 프로그램 동작 가상 시연 ─────────────────
  _runMockUpdaterFlow(info) {
    const newVer = info.latest_version ? `v${info.latest_version}` : '신규 버전';
    const modal = document.createElement('div');
    modal.className = 'updater-modal-overlay';
    modal.innerHTML = `
      <div class="updater-modal-card" style="max-width: 490px; text-align: left;">
        <div class="updater-modal-header" style="margin-bottom: 14px;">
          <div class="updater-title-badge">
            <span class="updater-icon" id="mockFlowIcon">🔄</span>
            <span class="updater-title" id="mockFlowTitle">3M Instrument Logger 자동 업데이트 (시뮬레이션)</span>
          </div>
        </div>

        <div class="updater-download-center" style="padding: 0;">
          <div id="mockStatusText" style="color:#38bdf8;font-weight:600;font-size:14px;margin-bottom:10px;">
            1단계: 메인 프로그램 안전 종료 중...
          </div>
          <div class="updater-progress-track" style="margin-bottom: 8px;">
            <div class="updater-progress-fill" id="mockProgressFill" style="width: 10%;"></div>
          </div>
          <div class="updater-stat-row" style="margin-bottom: 12px;">
            <span id="mockProgressPct" style="font-weight:bold;color:#f1f5f9;">10%</span>
            <span id="mockBytesText" style="color:#64748b;">프로세스 정리</span>
          </div>

          <div id="mockDetailBox" style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px;font-size:12px;color:#94a3b8;line-height:1.5;">
            메인 프로그램의 안전 종료 및 파일 잠금 해제를 확인했습니다.
          </div>

          <div id="mockNotesBox" style="display:none;margin-top:12px;">
            <div style="font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:6px;">📋 이번 업데이트 주요 내용</div>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px;max-height:110px;overflow-y:auto;font-size:11.5px;line-height:1.65;color:#cbd5e1;">
              ${this._formatReleaseNotes(info.release_notes || '')}
            </div>
          </div>

          <div id="mockPromptBox" style="display:none;background:#0f2942;border:1.2px solid #38bdf8;border-radius:8px;padding:10px;margin-top:12px;text-align:center;font-size:13px;font-weight:bold;color:#7dd3fc;">
            💡 새로운 프로그램을 지금 실행하시겠습니까?
          </div>

          <div id="mockActionRow" style="display:none;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
            <span id="mockFooterGuide" style="font-size:11px;color:#94a3b8;">[네] 새 버전 실행  /  [아니오] 창 닫기</span>
            <div style="display:flex;gap:8px;">
              <button class="updater-btn-secondary" id="mockBtnNo" style="padding:7px 18px;font-size:13px;">아니오</button>
              <button class="updater-btn-primary" id="mockBtnYes" style="padding:7px 22px;font-size:13px;background:#10b981;">네</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;

    const fillEl    = modal.querySelector('#mockProgressFill');
    const pctEl     = modal.querySelector('#mockProgressPct');
    const bytesEl   = modal.querySelector('#mockBytesText');
    const statusEl  = modal.querySelector('#mockStatusText');
    const detailEl  = modal.querySelector('#mockDetailBox');
    const notesBox  = modal.querySelector('#mockNotesBox');
    const promptBox = modal.querySelector('#mockPromptBox');
    const actionRow = modal.querySelector('#mockActionRow');
    const iconEl    = modal.querySelector('#mockFlowIcon');

    actionRow.style.display = 'none';

    let step = 0;
    const stages = [
      { pct: 15, status: '2단계: 최신 버전 다운로드 준비 중...', bytes: '서버 연결', detail: 'GitHub 릴리즈 서버 연결 및 패키지 확인 중...' },
      { pct: 35, status: '2단계: 최신 버전 다운로드 중...', bytes: '42.1 MB / 143.4 MB', detail: '다운로드 진행 중 (8.5 MB/s)' },
      { pct: 60, status: '2단계: 최신 버전 다운로드 중...', bytes: '86.0 MB / 143.4 MB', detail: '다운로드 진행 중 (9.1 MB/s)' },
      { pct: 80, status: '2단계 완료: 다운로드 완료', bytes: '143.4 MB / 143.4 MB', detail: '최신 버전 패키지 수신이 완료되었습니다.' },
      { pct: 90, status: '3단계: 이전 버전 삭제 및 최신 버전 설치 중...', bytes: '파일 교체 중', detail: '기존 실행 파일을 최신 버전으로 교체합니다...' },
      { pct: 98, status: '3단계 완료: 파일 교체 성공', bytes: '교체 완료', detail: '최신 버전 파일 교체가 성공적으로 완료되었습니다.' }
    ];

    const timer = setInterval(() => {
      if (step < stages.length) {
        const s = stages[step];
        fillEl.style.width = s.pct + '%';
        pctEl.textContent = s.pct + '%';
        statusEl.textContent = s.status;
        bytesEl.textContent = s.bytes;
        detailEl.textContent = s.detail;
        step++;
      } else {
        clearInterval(timer);
        // 완료 단계: 2초 대기 후 100% 전환
        setTimeout(() => {
          fillEl.style.width = '100%';
          fillEl.style.background = '#10b981';
          pctEl.textContent = '100%';
          bytesEl.textContent = '업데이트 완료';
          statusEl.textContent = '🎉 업데이트가 완료되었습니다!';
          statusEl.style.color = '#4ade80';
          detailEl.textContent = `최신 버전(${newVer})이 성공적으로 설치되었습니다.`;
          detailEl.style.background = '#064e3b';
          detailEl.style.borderColor = '#059669';
          detailEl.style.color = '#cbd5e1';
          iconEl.textContent = '🎉';

          notesBox.style.display = 'block';
          promptBox.style.display = 'block';
          actionRow.style.display = 'flex';

          modal.querySelector('#mockBtnYes').onclick = () => {
            alert('새로운 프로그램이 실행되었습니다. (시뮬레이션 완료)');
            this.closeModal();
          };
          modal.querySelector('#mockBtnNo').onclick = () => {
            this.closeModal();
          };
        }, 2000);
      }
    }, 400);
  }  // end startDownloadFlow


  async showSettingsModal() {

    this.closeModal();
    let config = { repo: 'gochujangs13/Instrument-Logger', has_token: false, is_builtin: false, masked_token: '' };
    try {
      const res = await fetch('/api/update/config');
      if (res.ok) config = await res.json();
    } catch {}

    const tokenStatusHtml = config.has_token
      ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;margin-bottom:8px;font-size:12px;color:#4ade80;">
          <span>🔒</span>
          <span><strong>비공개 릴리즈 토큰 자동 연동됨</strong> ${config.is_builtin ? '(프로그램 내장형, 만료 없음)' : '(사용자 지정)'}</span>
        </div>`
      : `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:6px;margin-bottom:8px;font-size:12px;color:#facc15;">
          <span>⚠️</span>
          <span>비공개(Private) 레포지토리의 경우 읽기 전용 토큰(만료 없음 권장)이 필요합니다.</span>
        </div>`;

    const modal = document.createElement('div');
    modal.className = 'updater-modal-overlay';
    modal.innerHTML = `
      <div class="updater-modal-card updater-settings-card">
        <div class="updater-modal-header">
          <div class="updater-title-badge">
            <span class="updater-icon">⚙️</span>
            <span class="updater-title">업데이트 및 GitHub 연동 설정</span>
          </div>
          <button class="updater-close-btn" id="updaterSettingsCloseBtn">&times;</button>
        </div>

        <div class="updater-settings-body">
          ${tokenStatusHtml}

          <div class="updater-field-group">
            <label>배포용 GitHub 비공개 저장소 (Owner/Repo)</label>
            <input type="text" id="updaterRepoInput" class="updater-input" value="${config.repo || ''}" placeholder="gochujangs13/Instrument-Logger">
          </div>

          <div class="updater-field-group">
            <label>GitHub Personal Access Token (만료 없음 / Read-only 권한)</label>
            <input type="password" id="updaterTokenInput" class="updater-input" placeholder="${config.has_token ? config.masked_token : 'github_pat_xxxx 입력 시 자동 설정'}">
            <span class="updater-hint">
              * 비공개(Private) 저장소의 릴리즈 파일을 자동 다운로드하기 위한 읽기(Contents: Read) 키입니다.<br>
              * 유효기간을 <strong>No expiration (만료 없음)</strong>으로 설정하시면 영구적으로 자동 업데이트됩니다.<br>
              * 기존 설정된 토큰을 유지하려면 빈칸으로 두고 저장하세요.
            </span>
          </div>
        </div>

        <div class="updater-actions-row">
          <button class="updater-btn-secondary" id="updaterCheckNowBtn">🔍 지금 버전 다시 확인</button>
          <div style="flex:1;"></div>
          <button class="updater-btn-secondary" id="updaterSettingsCancelBtn">취소</button>
          <button class="updater-btn-primary" id="updaterSettingsSaveBtn">설정 저장</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.querySelector('#updaterSettingsCloseBtn').onclick = () => this.closeModal();
    modal.querySelector('#updaterSettingsCancelBtn').onclick = () => this.closeModal();
    modal.querySelector('#updaterCheckNowBtn').onclick = () => {
      this.closeModal();
      this.checkManual();
    };
    modal.querySelector('#updaterSettingsSaveBtn').onclick = async () => {
      const repo = modal.querySelector('#updaterRepoInput').value.trim();
      const token = modal.querySelector('#updaterTokenInput').value.trim();
      try {
        await fetch('/api/update/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, token })
        });
        alert('설정이 안전하게 저장되었습니다.');
        this.closeModal();
        this.checkInitial();
      } catch (e) {
        alert('설정 저장 실패: ' + e.message);
      }
    };
  }

  showNoticeModal(title, msg) {
    this.closeModal();
    const modal = document.createElement('div');
    modal.className = 'updater-modal-overlay';
    modal.innerHTML = `
      <div class="updater-modal-card" style="max-width:420px;text-align:center;">
        <h3 style="margin-top:0;color:var(--text,#f1f5f9);font-size:18px;">${title}</h3>
        <p style="white-space:pre-wrap;color:var(--text-dim,#94a3b8);line-height:1.6;font-size:14px;">${msg}</p>
        <button class="updater-btn-primary" style="margin:16px auto 0;width:120px;" onclick="window._appUpdater.closeModal()">확인</button>
      </div>
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  closeModal() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  // ── 9. 상단바 바 컨테이너 주입 ────────────────────────────────────────────────
  _attachHeaderButton() {
    const tryAttach = () => {
      if (document.getElementById('updaterBarContainer')) return;

      const container = document.createElement('div');
      container.id = 'updaterBarContainer';
      container.className = 'updater-bar-container';

      container.innerHTML = `
        <span id="updaterStatusBadge" class="updater-status-badge checking">
          <span class="updater-status-dot"></span>
          <span id="updaterStatusText">버전 확인 중...</span>
        </span>
        <button id="btnAppUpdater" class="updater-header-btn disabled" disabled title="GitHub 최신 버전을 확인하고 있습니다.">
          <span class="updater-btn-icon updater-spin">🔄</span>
          <span>업데이트</span>
        </button>
        <button id="btnUpdaterConfig" class="updater-cfg-btn" title="업데이트 및 GitHub 연동 설정">⚙️</button>
      `;

      document.body.appendChild(container);

      container.querySelector('#btnAppUpdater').onclick = () => this.onUpdateBtnClick();
      container.querySelector('#updaterStatusBadge').onclick = () => this.checkManual();
      container.querySelector('#btnUpdaterConfig').onclick = () => this.showSettingsModal();

      // 런처 화면에서만 표시되도록 감시 (카드 클릭 진입 시 숨김, 홈 복귀 시 재표시)
      const syncLauncherVisibility = () => {
        const launcher = document.getElementById('launcher');
        const instView = document.getElementById('instrumentView');
        const isLauncherVisible = launcher && !launcher.hidden && (!instView || instView.hidden);
        container.style.display = isLauncherVisible ? 'inline-flex' : 'none';
      };

      const launcher = document.getElementById('launcher');
      if (launcher) {
        const obs = new MutationObserver(syncLauncherVisibility);
        obs.observe(launcher, { attributes: true, attributeFilter: ['hidden', 'style'] });
        const instView = document.getElementById('instrumentView');
        if (instView) {
          obs.observe(instView, { attributes: true, attributeFilter: ['hidden', 'style'] });
        }
      }
      syncLauncherVisibility();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach);
    } else {
      tryAttach();
    }
  }

  _formatReleaseNotes(notes) {
    if (!notes) return '<p style="color:#64748b;font-style:italic;">상세 설명이 제공되지 않았습니다.</p>';
    const lines = notes.split('\n');
    let html = '';
    for (let l of lines) {
      const trimmed = l.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) {
        const text = trimmed.replace(/^#+\s*/, '');
        html += `<div style="font-weight:700;color:#38bdf8;margin:8px 0 4px 0;">${this._esc(text)}</div>`;
      } else if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•')) {
        const text = trimmed.replace(/^[-*•]\s*/, '');
        html += `<div style="padding-left:14px;position:relative;margin:3px 0;"><span style="position:absolute;left:0;color:#60a5fa;">•</span>${this._esc(text)}</div>`;
      } else {
        html += `<div style="margin:2px 0;">${this._esc(trimmed)}</div>`;
      }
    }
    return html;
  }

  _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _showLoadingToast(msg) {
    let t = document.getElementById('updaterToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'updaterToast';
      t.className = 'updater-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
  }

  _hideLoadingToast() {
    const t = document.getElementById('updaterToast');
    if (t) t.style.display = 'none';
  }

  _injectStyles() {
    if (document.getElementById('updaterStyles')) return;
    const style = document.createElement('style');
    style.id = 'updaterStyles';
    style.textContent = `
      .updater-bar-container {
        position: absolute;
        top: 60px;
        right: 20px;
        z-index: 1000;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        padding: 4px 8px 4px 10px;
        border-radius: 8px;
        border: 1px solid rgba(51, 65, 85, 0.7);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        animation: updaterFadeIn 0.25s ease-out;
      }

      /* 런처 화면 이외(계측기 카드 진입 시) 상단 업데이트 확인 바 자동 숨김 */
      #launcher[hidden] ~ .updater-bar-container,
      body:has(#instrumentView:not([hidden])) .updater-bar-container,
      body:has(#launcher[hidden]) .updater-bar-container {
        display: none !important;
      }

      .updater-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        padding: 3px 8px;
        border-radius: 5px;
        transition: all 0.25s ease;
      }

      .updater-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }

      /* 상태: 확인 중 */
      .updater-status-badge.checking {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
        border: 1px solid rgba(100, 116, 139, 0.3);
      }
      .updater-status-badge.checking .updater-status-dot {
        background: #94a3b8;
        animation: updaterPulseDot 1.4s infinite;
      }

      /* 상태: 최신 버전임 (클릭 시 재확인 가능) */
      .updater-status-badge.latest {
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
        cursor: pointer;
        user-select: none;
      }
      .updater-status-badge.latest:hover {
        background: rgba(34, 197, 94, 0.22);
        border-color: rgba(34, 197, 94, 0.55);
      }
      .updater-status-badge.latest .updater-status-dot {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
      }

      /* 상태: 신규 버전 등록됨 (업데이트 하세요) */
      .updater-status-badge.available {
        background: rgba(245, 158, 11, 0.14);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.45);
        animation: updaterGlowBadge 2s infinite;
      }
      .updater-status-badge.available .updater-status-dot {
        background: #f59e0b;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
        animation: updaterPulseDot 1s infinite;
      }

      /* 업데이트 버튼 */
      .updater-header-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        line-height: 1.3;
        transition: all 0.2s ease;
        border: none;
      }

      /* 최신 버전 상태 버튼 (클릭 시 재확인) */
      .updater-header-btn.latest-btn {
        background: rgba(30, 41, 59, 0.85);
        color: #94a3b8;
        border: 1px solid rgba(51, 65, 85, 0.8);
        cursor: pointer;
        opacity: 0.95;
      }
      .updater-header-btn.latest-btn:hover {
        background: rgba(51, 65, 85, 0.95);
        color: #f8fafc;
        border-color: #38bdf8;
      }

      /* 비활성화 상태 */
      .updater-header-btn.disabled {
        background: #1e293b;
        color: #64748b;
        border: 1px solid #334155;
        cursor: not-allowed;
        opacity: 0.65;
        box-shadow: none;
      }

      /* 활성화 상태 (새 버전 있을 때) */
      .updater-header-btn.active {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #ffffff;
        border: 1px solid #3b82f6;
        cursor: pointer;
        opacity: 1;
        box-shadow: 0 0 12px rgba(37, 99, 235, 0.55);
        animation: updaterPulseBtn 2s infinite ease-in-out;
      }
      .updater-header-btn.active:hover {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        box-shadow: 0 0 16px rgba(59, 130, 246, 0.75);
        transform: translateY(-1px);
      }

      /* 톱니바퀴 설정 버튼 */
      .updater-cfg-btn {
        background: transparent;
        border: 1px solid rgba(51, 65, 85, 0.6);
        border-radius: 6px;
        padding: 3px 6px;
        font-size: 11px;
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.15s;
        line-height: 1;
      }
      .updater-cfg-btn:hover {
        background: #334155;
        color: #f8fafc;
        border-color: #475569;
      }

      /* ── 모달 & 카드 스타일 ── */
      .updater-modal-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(15, 23, 42, 0.82);
        backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        animation: updaterFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .updater-modal-card {
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid #334155;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
        width: 90%; max-width: 540px;
        padding: 24px;
        animation: updaterScaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .updater-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 16px;
      }
      .updater-title-badge {
        display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 17px; color: #f8fafc;
      }
      .updater-icon { font-size: 20px; }
      .updater-spin { display: inline-block; animation: updaterSpin 1.4s linear infinite; }
      .updater-close-btn {
        background: transparent; border: none; font-size: 24px; color: #94a3b8;
        cursor: pointer; padding: 0 4px; line-height: 1; transition: color 0.15s;
      }
      .updater-close-btn:hover { color: #f8fafc; }
      .updater-subtitle-prompt {
        font-size: 14px; font-weight: 600; color: #93c5fd; margin: -6px 0 16px 0;
      }
      .updater-version-row {
        display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
        background: #1e293b; padding: 8px 14px; border-radius: 10px; border: 1px solid #334155;
      }
      .updater-badge-old { color: #94a3b8; font-size: 13px; font-weight: 600; text-decoration: line-through; }
      .updater-arrow { color: #64748b; font-size: 12px; }
      .updater-badge-new {
        background: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700;
        padding: 2px 8px; border-radius: 6px;
      }
      .updater-size { color: #94a3b8; font-size: 12px; margin-left: auto; }
      .updater-body-section { margin-bottom: 20px; }
      .updater-notes-label { font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
      .updater-notes-box {
        background: #1e293b; border: 1px solid #334155; border-radius: 10px;
        padding: 12px 14px; max-height: 200px; overflow-y: auto;
        font-size: 13px; line-height: 1.6; color: #e2e8f0;
      }
      .updater-actions-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
      .updater-btn-primary {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #fff; font-weight: 700; border: none; border-radius: 8px;
        padding: 10px 18px; font-size: 14px; cursor: pointer;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); transition: all 0.15s ease;
      }
      .updater-btn-primary:hover {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.45);
      }
      .updater-btn-secondary {
        background: #1e293b; color: #cbd5e1; font-weight: 600; border: 1px solid #475569;
        border-radius: 8px; padding: 10px 16px; font-size: 14px; cursor: pointer; transition: all 0.15s;
      }
      .updater-btn-secondary:hover { background: #334155; color: #fff; }

      /* 다운로드 게이지 */
      .updater-download-center { text-align: center; padding: 10px 0 16px 0; }
      .updater-progress-track {
        background: #1e293b; border: 1px solid #334155; border-radius: 12px;
        height: 18px; width: 100%; overflow: hidden; position: relative; margin-bottom: 12px;
      }
      .updater-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #2563eb 100%);
        background-size: 200% 100%;
        border-radius: 12px;
        transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        animation: updaterShimmer 2s infinite linear;
      }
      .updater-progress-done {
        background: linear-gradient(90deg, #10b981 0%, #059669 100%) !important;
      }
      .updater-stat-row {
        display: flex; justify-content: space-between; font-size: 14px; font-weight: 600;
        color: #f1f5f9; margin-bottom: 6px;
      }
      .updater-speed-tag {
        display: inline-block; background: #334155; color: #38bdf8;
        padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;
        margin-bottom: 12px;
      }
      .updater-guide-text { font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; }

      /* 설정 모달 */
      .updater-field-group { margin-bottom: 14px; text-align: left; }
      .updater-field-group label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 5px; }
      .updater-input {
        width: 100%; box-sizing: border-box; background: #1e293b; border: 1px solid #475569;
        border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #f8fafc; outline: none;
      }
      .updater-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25); }
      .updater-hint { display: block; font-size: 11px; color: #94a3b8; margin-top: 4px; line-height: 1.4; }

      .updater-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #0f172a; color: #f8fafc; border: 1px solid #334155;
        border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 9999999; display: none;
      }

      .updater-apply-spinner {
        width: 42px; height: 42px; margin: 0 auto;
        border: 4px solid rgba(59, 130, 246, 0.2);
        border-top-color: #3b82f6; border-radius: 50%;
        animation: updaterSpin 0.9s linear infinite;
      }

      .updater-completion-card {
        margin-top: 14px;
        padding: 14px 16px;
        background: rgba(34, 197, 94, 0.12);
        border: 1px solid rgba(34, 197, 94, 0.35);
        border-radius: 10px;
        text-align: center;
        animation: updaterFadeIn 0.3s ease;
      }

      .updater-restart-pulse {
        animation: updaterPulseGreen 1.8s infinite ease-in-out !important;
      }

      @keyframes updaterPulseGreen {
        0%, 100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.45); }
        50% { box-shadow: 0 0 22px rgba(34, 197, 94, 0.85); transform: translateY(-1px); }
      }

      @keyframes updaterFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes updaterScaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @keyframes updaterSpin { 100% { transform: rotate(360deg); } }
      @keyframes updaterShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @keyframes updaterPulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.85); } }
      @keyframes updaterGlowBadge { 0%, 100% { border-color: rgba(245, 158, 11, 0.45); } 50% { border-color: rgba(245, 158, 11, 0.85); } }
      @keyframes updaterPulseBtn { 0%, 100% { box-shadow: 0 0 10px rgba(37, 99, 235, 0.5); } 50% { box-shadow: 0 0 18px rgba(37, 99, 235, 0.85); } }
    `;
    document.head.appendChild(style);
  }
}

// 자동 부팅
AppUpdater.init();
