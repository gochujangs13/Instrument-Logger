// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  ko: {
    // topbar / launcher
    launcher_subtitle: '계측기를 선택하세요',
    launcher_sub_hint: 'Chrome / Edge 89+',
    launcher_fav_section: '★ 즐겨찾기',
    launcher_hidden: '숨겨진 항목',
    launcher_restore: '전체 복원',
    launcher_fav_tip: '즐겨찾기 추가/해제',
    launcher_del_tip: '숨기기',
    card_edit_title:   '편집',
    card_edit_fav_add: '☆ 즐겨찾기 추가',
    card_edit_fav_rm:  '★ 즐겨찾기 해제',
    card_edit_fav_lbl: '즐겨찾기',
    card_edit_group:   '그룹',
    card_edit_order:   '순서 (그룹 내)',
    card_edit_up:      '↑ 위로',
    card_edit_down:    '↓ 아래로',
    card_edit_done:    '완료',
    card_meta_location:'보관 위치',
    card_meta_asset:   '자산번호',
    card_meta_manager: '담당자',
    card_meta_note:    '비고',
    card_meta_photo:   '장비 사진',
    card_meta_photo_rm:'사진 삭제',
    card_meta_upload:  '사진 업로드',
    theme_setting: '테마', lang_setting: '언어',
    disconnected: '연결 안됨', connected: '연결됨',
    conn_btn: '디바이스 연결', disconn_btn: '연결 해제',
    connect_first: '먼저 계측기를 연결하세요.',
    test_manage: '테스트 방법 관리',
    split_view: '출력 분할 화면:', screens: '화면',
    auto_log_wait: '자동 기록 대기 (초)',
    meas_wire: '측정 방식', sample_rate: '측정 속도',
    meas_range: '측정 레인지',
    btn_copy: '복사', btn_csv: 'CSV 저장', btn_clear: '전체 삭제', btn_del_sel: '선택 삭제',
    test_add_new: '새 평가 방법 추가',
    test_name_label: '테스트명', test_total_cells: '총 칸 수',
    test_group_cells: '구분 칸 수 (0=없음)', test_set_group: '셋트 크기',
    btn_add: '추가', btn_delete: '삭제',
    test_delete_method: '기존 평가 방법 삭제',
    panel_prefix: 'PANEL',
    status_disconnected: 'Disconnected',
    status_connected: 'Connected',
    status_failed: 'Connection Failed',
    running_warn: '측정 중에는 테마/언어 변경이 불가합니다.',
    chart_hint: '현재 패널 측정값 분포 (박스 플롯)',
    chart_empty: '측정 데이터가 없습니다',
    wire_fixed: '4-Wire (고정)',
    web_serial_unsupported: 'Web Serial API가 지원되지 않습니다.\nChrome 또는 Edge 89+ 를 사용하세요.',
    settings_title: '설정',
    meas_count_lbl: '측정 수:',
    data_panel_title: '📋 측정 데이터',
    dist_panel_title: '📊 데이터 분포',
    syslog_title: 'SYSTEM LOG',
    refresh_tip: '새로고침',
    // test manager alerts
    alert_enter_name: '테스트명을 입력하세요.',
    alert_dup_name:   '이미 존재하는 이름입니다.',
    alert_min_cells:  '총 칸 수는 1 이상이어야 합니다.',
    alert_del_default:'기본 테스트 방법은 삭제할 수 없습니다.',
    alert_confirm_clear: '모든 데이터를 지우겠습니까?',
    clipboard_ok: '클립보드 복사됨.',
    csv_ok: 'CSV 내보내기 완료.',
    // Agilent 4339B
    ag_gpib_notice: '⚠ GPIB 장비 — NI GPIB-USB → 가상 COM 포트 연결 필요',
    ag_conn_section: '장비 연결',
    ag_meas_section: '측정 설정',
    ag_meas_mode: '모드',
    ag_mode_surf: '표면 (Surface)',
    ag_mode_vol:  '체적 (Volume)',
    ag_mode_lbl_surf: '표면 저항률 (Ω/sq)',
    ag_mode_lbl_vol:  '체적 저항률 (Ω·cm)',
    ag_electrode: '전극 (Electrode)',
    ag_thickness: '두께 (mm)',
    ag_voltage:   '전압 (V)',
    ag_auto_volt: '자동 전압',
    ag_ilim:      '전류 상한 (I-Lim)',
    ag_ilim_note: '※ 참고용 (장비로 전송되지 않음 — OL 시 표시만)',
    ag_charge_t:  '충전 (s)',
    ag_discharge_t:'방전 시간 (s)',
    ag_sop_btn:   '📋 SOP 매뉴얼 보기',
    ag_sample:    '샘플명',
    ag_wait:      '대기 중',
    ag_stopped:   '정지됨',
    ag_done_wait: '완료 — 다음 측정 대기 중',
    ag_charging:  '충전 중...',
    ag_measuring: '측정 중...',
    ag_discharging:'방전 중...',
    ag_start_btn: '▶ 측정 시작',
    ag_stop_btn:  '■ 정지',
    ag_ol_escalate: 'OL 감지 → 전류 상승:',
    ag_ol_maxed:  '전류 최대치 도달 — 측정 불가 (OL)',
    ag_valid_ok:  '에서 유효값 획득',
    ag_meas_done_ol: '측정 완료: OL (범위 초과) — 전류:',
    ag_meas_done: '측정 완료:',
    ag_stopped_log: '측정 중지됨.',
    ag_confirm_clear: '모든 데이터를 지우겠습니까?',
    ag_mode_changed: '모드 변경:',
    ag_mode_surf_short: '표면',
    ag_mode_vol_short: '체적',
    ag_mode_click_hint: '이미지를 클릭하면 이 모드로 설정됩니다',
    ag_sop_title: '📋 SOP 시료 거치 가이드',
    ag_sop_prev: '◀ 이전',
    ag_sop_next: '다음 ▶',
    ag_sop_close: '✕ 닫기',
    ag_mode_title_surf: '표면 저항률 (Surface) 측정 설정',
    ag_mode_title_vol:  '체적 저항률 (Volume) 측정 설정',
    ag_initializing: '장비 초기화 중... (*RST)',
    // DAQ-6510
    daq_visa_label: 'VISA 주소',
    daq_visa_opt1: 'USB (04632710) — 1,2번 오븐',
    daq_visa_opt2: 'USB (04544808) — 3,4번 오븐',
    daq_config_section: '측정 구성',
    daq_filename: '파일명',
    daq_total_time: '총 측정 시간',
    daq_ch_delay: '채널 딜레이 (s)',
    daq_slot1_ch: 'Slot 1 채널',
    daq_slot2_ch: 'Slot 2 채널',
    daq_slot2_ph: '비워두면 OFF',
    daq_scan_mode: '스캔 모드',
    daq_scan_rt: '실시간 (최근 1000개 표시)',
    daq_scan_full: '전체 스캔 (3분마다 기록)',
    daq_wire_mode: '측정 방식',
    daq_ch_names_btn: '채널 이름 설정...',
    daq_wait: '대기 중',
    daq_start_btn: '▶ 측정 시작',
    daq_stop_btn: '■ 측정 정지',
    daq_rec_count: '기록 수:',
    daq_end_time: '종료예정',
    daq_data_tab: '📋 데이터 테이블',
    daq_slot1_tab: '📈 Slot 1',
    daq_slot2_tab: '📈 Slot 2',
    daq_no_data: '데이터가 없습니다.',
    daq_clear_confirm: '모든 기록 데이터를 지우겠습니까?',
    daq_csv_ok: 'CSV 내보내기 완료.',
    daq_cleared: 'DAQ 데이터 초기화됨.',
    daq_stopped: '정지됨',
    daq_rt_running: '실시간 측정 중... (1초)',
    daq_full_running: '3분 간격 측정 중...',
    daq_start_log_rt: '실시간(1s)',
    daq_start_log_full: '전체스캔(3min)',
    daq_start_log: 'DAQ 시작 — 모드:',
    daq_stop_log: 'DAQ 측정 정지.',
    daq_no_data_log: '데이터가 없습니다.',
    daq_ch_modal_title: '채널 이름 설정',
    daq_ch_modal_no_slot: '슬롯 범위를 먼저 설정하세요',
    daq_ch_ok: '✔ 확인',
    daq_ch_cancel: '✕ 취소',
    daq_select_all: '전체 선택',
    daq_no_chart: '측정 데이터가 없습니다',
    daq_connect_first: '먼저 계측기를 연결하세요.',
    daq_no_ch_alert: 'Slot 1 또는 Slot 2 채널을 먼저 설정하세요.',
    daq_terminal_lbl: '입력 단자',
    daq_front_tab: '그래프',
    daq_4wire_warn: '4-Wire(FRES) 모드에서 채널 {chs}은 자동 페어링 채널(11~20번)입니다.\n소스 채널(1~10번)만 설정하면 장비가 자동으로 페어를 연결합니다.\n계속하시겠습니까?',

    // SP-2100 / TL-2200
    sp_model_label: '장비 모델',
    sp_comm_label: '통신 설정',
    sp_comm_auto: '(자동)',
    sp_test_section: '테스트 조건 설정',
    sp_sample_name_label: '샘플명',
    sp_sample_default_val: '제품',
    sp_name_label: '제품명',
    sp_speed_label: 'Test Speed',
    sp_delay_label: 'Initial Delay',
    sp_avg_label: 'Averaging Time',
    sp_test_hint: '테스트 조건은 CSV/복사 내보내기 상단에 메모로 함께 기록됩니다.',
    sp_group_label: '그룹당 개수',
    sp_group_hint: '체크한 행이 없으면 이 개수 단위로 그룹을 나눠 분포 차트를 그립니다.',
    sp_table_title: '📋 측정 기록',
    sp_del_checked: '선택 삭제',
    sp_dist_title: '📊 AVG 분포',
    sp_dist_hint: '체크한 행(또는 그룹별)의 AVG 값 분포를 박스-수염 차트로 표시합니다.',
    sp_selected: '선택',
    sp_overwrite_log: '[덮어쓰기]',
    sp_conn_log: '모델 선택됨',
    sp_model_changed: '모델 변경됨',
    sp_del_none: '체크된 행이 없습니다.',
    sp_del_done: '체크된 행을 삭제했습니다.',
    sp_no_data_log: '측정 데이터가 없습니다.',
    sp_csv_ok: 'CSV 내보내기 완료.',
    sp_cleared: '측정 기록을 초기화했습니다.',
    sp_clear_confirm: '모든 측정 기록을 지우겠습니까?',
    sp_copy_empty: '복사할 측정 기록이 없습니다.',
    sp_copy_ok: '측정 기록을 클립보드에 복사했습니다.',
    sp_copy_fail: '복사 실패 — 표를 직접 선택해 복사해주세요.',
    sp_wave_title: '현재 파형 그래프 (힘-시간)',
    sp_wave_hint: '측정을 실행하면 힘-시간 곡선이 표시됩니다.',
    sp_wave_samples: '샘플',
    sp_wave_decode: '디코딩',

    // PT-2000 Probe Tack
    pt_conn_label: '장비 연결 (WebHID)',
    pt_dev_connected: '장비 연결됨',
    pt_dev_disconnected: '연결 해제됨',
    pt_conn_failed: '연결 실패',
    pt_webhid_unsupported: '이 브라우저는 WebHID를 지원하지 않습니다. 데스크톱 Chrome/Edge를 사용하세요.',
    pt_test_settings: '시험 설정',
    pt_notice: '⚠ 아래 값은 <b>장비를 제어하지 않습니다.</b> 변위·Work 계산용 참고값이므로, 반드시 장비(Change Test Parameters)에 설정된 값과 <b>동일하게</b> 입력하세요.',
    pt_sample_name: '샘플명',
    pt_sample: '샘플',
    pt_speed_label: '속도 (mm/s)',
    pt_dwell_label: 'Dwell (s)',
    pt_loadcell_label: 'Load Cell',
    pt_tol_label: '이상치 허용 편차 (중앙값 대비 %)',
    pt_tol_hint: '같은 샘플명 그룹에 4개 이상 측정 시, 그룹 중앙값(Peak)에서 이 비율을 넘게 벗어난 행을 빨갛게 표시합니다.',
    pt_repeat_label: '개수',
    pt_repeat_hint: '같은 샘플명을 N개씩 묶어 자동으로 번호를 매깁니다 (예: 3이면 A-1-1, A-1-2, A-1-3, A-2-1 ...)',
    pt_del_sel: '선택 삭제',
    pt_failure_mode: '파괴모드',
    pt_mode_interface: '계면 파괴',
    pt_mode_cohesive: '응집 파괴',
    pt_mode_transfer: '전이 파괴',
    pt_graph_title: '📈 측정 그래프',
    pt_graph_hint: '표에서 항목을 체크하면 여러 곡선을 겹쳐 비교할 수 있습니다. (체크 없으면 최근 측정 표시)',
    pt_graph_empty: '측정 데이터를 가져오면 곡선이 표시됩니다',
    pt_q_detected: 'Q 신호 감지 (시험 데이터 준비됨)',
    pt_download_log: '다운로드',
    pt_chunks: '청크',
    pt_points: '포인트',
    pt_early_stop: '조기종료',
    pt_save_done: '데이터 저장 완료 — 장비 그래프 완료 후 [다음 시험 진행]을 누르세요',
    pt_proceed_sent: '다음 시험 진행 신호(b) 전송 — Clean Probe 시작',
    pt_collecting: '데이터 수집 중...',
    pt_swap_hint: '이제 다음 샘플로 교체하세요~',
    pt_meas_done: '측정 완료 · 데이터 저장됨',
    pt_auto_close_hint: '20초 후 팝업창이 자동으로 닫힙니다. 잠시만 기다리세요.',
    pt_proceed_btn: '다음 시험 진행',
    pt_sec_auto: '초 후 자동 진행',
    pt_proceed_warn: '⚠ 아래 버튼을 누르면 장비가 <b>Clean Probe</b> 동작을 시작합니다.<br>로드셀이 상단 리밋 스위치에서 <b>정상적으로 멈추는지</b> 확인하세요.<br><b>장비 화면에서 직접 닫기를 누르지 말고, 이 버튼으로 진행하세요.</b>',
    pt_aborted: '시험 중단됨 · 기록 안 함',
    pt_status: '상태',
    pt_aborted_status: '중단 / 샘플 미접촉',
    pt_aborted_status_short: '중단',
    pt_abort_guide: '시험이 정상적으로 완료되지 않았습니다.<br>장비 화면의 안내에 따라 진행하세요:<br>① "test was aborted" → <b>OK</b><br>② "return to HOME position" → <b>HOME</b>',
    pt_confirm: '확인',
    pt_connect_first: '먼저 장비를 연결해 주세요.',
    pt_remeasure_one: '재측정은 항목 1개만 선택해 주세요.',
    pt_test_done_detected: '시험 완료 감지 → 자동 다운로드 시작',
    pt_download_err: '다운로드 오류',
    pt_no_curve: '시험 곡선을 받지 못했습니다.\n장비에서 시험을 먼저 완료했는지 확인해 주세요.',
    pt_no_data: '수신 데이터 없음/부족',
    pt_abort_detected: '시험 중단(abort) 감지 — 진행 신호를 보내지 않으며 기록하지 않습니다.',
    pt_remeasured: '재측정',
    pt_remeasure_done: '재측정 완료',
    pt_meas_added: '측정 추가',
    pt_label_changed: '라벨 변경',
    pt_select_to_delete: '삭제할 항목을 선택해 주세요.',
    pt_confirm_delete_n: '선택한',
    pt_items: '개 항목을 삭제하시겠습니까',
    pt_items_deleted: '개 항목 삭제',
    pt_clear_confirm: '모든 측정 데이터를 삭제하시겠습니까?',
    pt_cleared: '전체 데이터 초기화',
    pt_no_export_data: '내보낼 데이터가 없습니다.',
    pt_csv_ok: 'CSV 내보내기 완료',
    pt_no_copy_data: '복사할 데이터가 없습니다.',
    pt_copy_ok: '표 데이터를 클립보드에 복사했습니다.',
    pt_copy_fail: '복사 실패 — 표를 직접 선택해 복사해주세요.',

    // LT-1000 Loop Tack
    lt_conn_label: '장비 연결 (Web Serial)',
    lt_conn_btn: '시리얼 포트 연결',
    lt_test_settings: '시험 설정',
    lt_notice: 'LT-1000은 장비에서 직접 시험을 시작합니다.<br>시험 완료 후 Print 메뉴(P)에서 Enter를 눌러 데이터를 전송하세요.',
    lt_calib_btn: '로드셀 캘리브레이션 방법',
    lt_calib_title: '로드셀 캘리브레이션',
    lt_calib_body: '캘리브레이션은 정확한 측정값을 유지하기 위해 주기적으로 수행하세요.',
    lt_calib_s1: '로드셀을 끝까지 위로 올린 후 고정핀으로 안전하게 고정합니다.',
    lt_calib_s2: '을 3초 이상 동시에 눌러 캘리브레이션 모드로 진입합니다.',
    lt_calib_s3: '화면이 표시되면 Enter를 눌러 확인합니다.',
    lt_calib_s4: '<b>LC 0.000</b> 화면에서 무부하(영점) 상태를 확인하고 Enter를 누릅니다.',
    lt_calib_s5: '<b>HC 1000</b> 화면이 나타납니다.',
    lt_calib_s6: '로드셀 상단에 <b>1 kg 분동(추)</b>을 올린 후 Enter를 누릅니다.',
    lt_calib_s7: '추를 제거하고, 로드셀을 손으로 잡은 상태에서 고정핀을 해제한 후 조심히 내려놓습니다.',
    lt_calib_img_cap: '1 kg 분동을 로드셀 상단에 올려놓은 상태',
    lt_calib_prep: '① 준비',
    lt_calib_prep_s1: '로드셀 최상단 이동',
    lt_calib_prep_s2: '고정핀 체결',
    lt_calib_enter: '② 캘리브레이션 모드 진입',
    lt_calib_zero: '③ 영점 교정 (무부하)',
    lt_calib_zero_check: 'LC 0.000 확인',
    lt_calib_span: '④ 스팬 교정 (1 kg 분동)',
    lt_calib_span_show: 'HC 1000 표시',
    lt_calib_span_place: '1 kg 분동 올리기',
    lt_calib_img_alt: '1kg 추 올리기',
    lt_calib_done: '⑤ 완료',
    lt_calib_done_s1: '추 제거',
    lt_calib_done_s2: '로드셀 파지',
    lt_calib_done_s3: '고정핀 해제',
    lt_calib_done_s4: '조심히 내려놓기',
    lt_howto_btn: '데이터 전송 방법',
    lt_howto_title: '📋 데이터 전송 방법',
    lt_howto_body: '시험 완료 후 아래 순서대로 버튼을 누르면 데이터가 자동으로 기록됩니다.',
    lt_howto_auto: '타이머 종료 후<br>자동 기록',
    lt_sample_label: '샘플명',
    lt_tol_label: '이상치 허용 (%)',
    lt_unit_label: '단위',
    lt_unit_gf: 'gf (gram-force)',
    lt_unit_n: 'N (Newton)',
    lt_unit_oz: 'oz (ounce-force)',
    lt_speed_label: '속도',
    lt_sampling_label: '샘플링',
    lt_probe_label: '프로브',
    lt_mem_warn: '⚠ P — 20개 등록 시 메모리 초기화해주세요',
    lt_mem_how: '방법',
    lt_run_hint: 'Run 상태에서 평가를 진행하세요',
    lt_stfull_btn: 'ST FULL 해결 방법',
    lt_stfull_title: 'ST FULL 해결 방법',
    lt_stfull_body: '장비에 저장 가능한 메모리가 가득 찼습니다. 아래 순서로 메모리를 초기화하고 다시 평가를 시작하세요.',
    lt_stfull_done: '초기화 완료<br>다시 평가 시작',
    lt_data_title: '📋 측정 데이터',
    group_repeat_label: '그룹 개수',
    group_repeat_hint: '같은 샘플명을 N개씩 묶어 번호를 매깁니다 (예: 3 → A-1-1, A-1-2, A-1-3, A-2-1...)',
    lt_group_label: '그룹 개수',
    lt_graph_title: '📈 측정 그래프',
    lt_graph_hint: '표에서 항목을 체크하면 여러 곡선을 겹쳐 비교할 수 있습니다.',
    lt_graph_empty: '측정 데이터를 수신하면 곡선이 표시됩니다',
    lt_th_sample: '샘플명',
    lt_th_stdev: 'Std Dev',
    lt_th_mode: '파괴모드',
    lt_guide0_title: '📐 단위 설정 확인',
    lt_guide0_body: '이 프로그램은 장비에서 받은 숫자를 그대로 사용합니다.<br><b style="color:var(--text);">Run 상태에서 Units 버튼을 눌러 Grams으로 변경하세요.</b>',
    lt_guide0_next: '확인 → 다음',
    lt_guide1_title: '⚙️ 저장 기능 활성화',
    lt_guide1_body: '측정 데이터를 PC로 전송하려면 장비의 저장(St) 기능이 <b>On</b> 상태여야 합니다.',
    lt_memfull_title: '⚠️ 메모리 초기화 필요',
    lt_memfull_body: '장비에 저장된 데이터가 <b style="color:var(--text);">20개</b>에 도달했습니다.<br>계속 측정하려면 메모리를 삭제해 주세요.',
    lt_result_done: '✅ 측정 완료',
    lt_result_abort: '⚠ 시험 중단 · 기록 안 함',
    lt_modal_sample: '샘플',
    lt_modal_mode: '파괴모드',
    lt_modal_pts: '포인트 수',
    lt_modal_verdict: '판정',
    lt_modal_below_min: '유효 기준 미달',
    lt_mode_snap: '즉시 파괴 (Snap)',
    lt_mode_std: '표준 루프 파괴',
    lt_mode_creep: '지연 파괴 (Creep)',
    lt_log_no_parse: '파싱 가능한 데이터가 없습니다.',
    lt_log_header: '헤더 감지',
    lt_log_curve: '곡선 데이터',
    lt_log_added: '측정 추가',
    lt_log_connected: 'LT-1000 연결됨. 장비에서 Print(P) → Enter로 데이터를 전송하세요.',
    lt_no_export: '내보낼 데이터가 없습니다.',
    lt_csv_ok: 'CSV 내보내기 완료.',
    lt_no_copy: '복사할 데이터가 없습니다.',
    lt_copy_ok: '클립보드에 복사됐습니다.',
    lt_del_none: '삭제할 항목을 선택해 주세요.',
    lt_del_confirm_n: '선택한',
    lt_del_confirm_items: '개 항목을 삭제하시겠습니까?',
    lt_del_done_items: '개 항목 삭제됨.',
    lt_clear_confirm: '모든 측정 데이터를 삭제하시겠습니까?',
    lt_cleared: '전체 데이터 초기화.',
    lt_rename_log: '라벨 변경',
    lt_receiving: '수신 중...',
    lt_abort_log: '시험 중단 — 포인트:',
    lt_abort_below: '(기준 미달)',
    lt_min_criteria: '유효 기준: 최소',
    lt_min_and_peak: '포인트 AND Peak >',
    lt_guide1_btn: '확인',
    lt_modal_btn: '확인',
    lt_memfull_btn: '확인',
    // Photo Editor
    ai_guide_title: 'ℹ️ 안내',
    ai_guide_step1: '1단계: 사진을 업로드하고 회전/줌/팬으로 위치를 맞춘 뒤 크롭 영역을 지정하세요.',
    ai_guide_auto: '"자동 맞춤"은 현재 선택된 사진의 크롭 영역을 다른 사진에도 비슷한 위치로 맞춰줍니다.',
    ai_guide_step2: '2단계에서 그리드 미리보기를 확인하고 엑셀로 내보낼 수 있습니다.',
    ai_phone_title: '📱 폰 카메라 연동',
    ai_phone_start: '▶ 폰 연동 시작',
    ai_phone_stop: '⏹ 폰 연동 중지',
    ai_file_list: '📁 파일 리스트',
    ai_file_count: '개의 파일',
    ai_drop_hint: '파일을 여기로 드래그하거나<br>클릭하여 업로드',
    ai_delete_all: '전체 삭제',
    ai_size_label: '엑셀 출력 사이즈 (inch)',
    ai_size_h: '높이(inch)',
    ai_size_w: '너비(inch)',
    ai_rot_label: '수평 보정:',
    ai_reset_crop: '↺ 다시 선택',
    ai_auto_align: '⚡ 크롭 자동 지정',
    ai_next: '다음 단계 ▶',
    ai_back: '◀ 돌아가기',
    ai_per_row: '한 열 개수',
    ai_export_excel: '📥 엑셀로 내보내기',
    ai_exporting: '내보내는 중…',
  },
  en: {
    // topbar / launcher
    launcher_subtitle: 'Select an Instrument',
    launcher_sub_hint: 'Chrome / Edge 89+',
    launcher_fav_section: '★ Favorites',
    launcher_hidden: 'Hidden items',
    launcher_restore: 'Restore All',
    launcher_fav_tip: 'Add / Remove Favorite',
    launcher_del_tip: 'Hide',
    card_edit_title:   'Edit',
    card_edit_fav_add: '☆ Add to Favorites',
    card_edit_fav_rm:  '★ Remove from Favorites',
    card_edit_fav_lbl: 'Favorites',
    card_edit_group:   'Group',
    card_edit_order:   'Order (within group)',
    card_edit_up:      '↑ Move Up',
    card_edit_down:    '↓ Move Down',
    card_edit_done:    'Done',
    card_meta_location:'Storage Location',
    card_meta_asset:   'Asset Number',
    card_meta_manager: 'Manager',
    card_meta_note:    'Notes',
    card_meta_photo:   'Device Photo',
    card_meta_photo_rm:'Remove Photo',
    card_meta_upload:  'Upload Photo',
    theme_setting: 'Theme', lang_setting: 'Language',
    disconnected: 'Disconnected', connected: 'Connected',
    conn_btn: 'Connect Device', disconn_btn: 'Disconnect',
    connect_first: 'Please connect the instrument first.',
    test_manage: 'Manage Test Methods',
    split_view: 'Split View:', screens: 'Panel',
    auto_log_wait: 'Auto-log Wait (s)',
    meas_wire: 'Wire Mode', sample_rate: 'Sample Rate',
    meas_range: 'Meas. Range',
    btn_copy: 'Copy', btn_csv: 'Save CSV', btn_clear: 'Clear All', btn_del_sel: 'Delete Sel',
    test_add_new: 'Add New Test Method',
    test_name_label: 'Name', test_total_cells: 'Total Cells',
    test_group_cells: 'Group Size (0=none)', test_set_group: 'Set Size',
    btn_add: 'Add', btn_delete: 'Delete',
    test_delete_method: 'Delete Existing Method',
    panel_prefix: 'PANEL',
    status_disconnected: 'Disconnected',
    status_connected: 'Connected',
    status_failed: 'Connection Failed',
    running_warn: 'Cannot change theme/language during measurement.',
    chart_hint: 'Box plot of active panel values',
    chart_empty: 'No data yet',
    wire_fixed: '4-Wire (Fixed)',
    web_serial_unsupported: 'Web Serial API not supported.\nUse Chrome or Edge 89+.',
    settings_title: 'Settings',
    meas_count_lbl: 'Count:',
    data_panel_title: '📋 Measurement Data',
    dist_panel_title: '📊 Data Distribution',
    syslog_title: 'SYSTEM LOG',
    refresh_tip: 'Refresh',
    // test manager alerts
    alert_enter_name: 'Please enter a test name.',
    alert_dup_name:   'That name already exists.',
    alert_min_cells:  'Total cells must be at least 1.',
    alert_del_default:'Default test methods cannot be deleted.',
    alert_confirm_clear: 'Clear all data?',
    clipboard_ok: 'Copied to clipboard.',
    csv_ok: 'CSV export complete.',
    // Agilent 4339B
    ag_gpib_notice: '⚠ GPIB device — NI GPIB-USB → virtual COM port required',
    ag_conn_section: 'Device Connection',
    ag_meas_section: 'Measurement Settings',
    ag_meas_mode: 'Mode',
    ag_mode_surf: 'Surface',
    ag_mode_vol:  'Volume',
    ag_mode_lbl_surf: 'Surface Resistivity (Ω/sq)',
    ag_mode_lbl_vol:  'Volume Resistivity (Ω·cm)',
    ag_electrode: 'Electrode',
    ag_thickness: 'Thickness (mm)',
    ag_voltage:   'Voltage (V)',
    ag_auto_volt: 'Auto Voltage',
    ag_ilim:      'Current Limit (I-Lim)',
    ag_ilim_note: '※ Reference only (not sent to device — shown on OL)',
    ag_charge_t:  'Charge (s)',
    ag_discharge_t:'Discharge Time (s)',
    ag_sop_btn:   '📋 SOP Manual',
    ag_sample:    'Sample Name',
    ag_wait:      'Waiting',
    ag_stopped:   'Stopped',
    ag_done_wait: 'Done — waiting for next measurement',
    ag_charging:  'Charging...',
    ag_measuring: 'Measuring...',
    ag_discharging:'Discharging...',
    ag_start_btn: '▶ Start',
    ag_stop_btn:  '■ Stop',
    ag_ol_escalate: 'OL detected → I-Lim escalated:',
    ag_ol_maxed:  'Max I-Lim reached — cannot measure (OL)',
    ag_valid_ok:  'valid reading at',
    ag_meas_done_ol: 'Measurement done: OL (out of range) — I-Lim:',
    ag_meas_done: 'Measurement done:',
    ag_stopped_log: 'Measurement stopped.',
    ag_confirm_clear: 'Clear all data?',
    ag_mode_changed: 'Mode changed:',
    ag_mode_surf_short: 'Surface',
    ag_mode_vol_short: 'Volume',
    ag_mode_click_hint: 'Click image to apply this mode',
    ag_sop_title: '📋 SOP Sample Placement Guide',
    ag_sop_prev: '◀ Prev',
    ag_sop_next: 'Next ▶',
    ag_sop_close: '✕ Close',
    ag_mode_title_surf: 'Surface Resistivity (Surface) Settings',
    ag_mode_title_vol:  'Volume Resistivity (Volume) Settings',
    ag_initializing: 'Initializing device... (*RST)',
    // DAQ-6510
    daq_visa_label: 'VISA Address',
    daq_visa_opt1: 'USB (04632710) — Oven 1, 2',
    daq_visa_opt2: 'USB (04544808) — Oven 3, 4',
    daq_config_section: 'Measurement Config',
    daq_filename: 'File Name',
    daq_total_time: 'Total Duration',
    daq_ch_delay: 'Channel Delay (s)',
    daq_slot1_ch: 'Slot 1 Channels',
    daq_slot2_ch: 'Slot 2 Channels',
    daq_slot2_ph: 'Leave empty to disable',
    daq_scan_mode: 'Scan Mode',
    daq_scan_rt: 'Real-time (last 1000 pts)',
    daq_scan_full: 'Full Scan (every 3 min)',
    daq_wire_mode: 'Wire Mode',
    daq_ch_names_btn: 'Channel Names...',
    daq_wait: 'Waiting',
    daq_start_btn: '▶ Start',
    daq_stop_btn: '■ Stop',
    daq_rec_count: 'Records:',
    daq_end_time: 'Est. End',
    daq_data_tab: '📋 Data Table',
    daq_slot1_tab: '📈 Slot 1',
    daq_slot2_tab: '📈 Slot 2',
    daq_no_data: 'No data available.',
    daq_clear_confirm: 'Clear all recorded data?',
    daq_csv_ok: 'CSV export complete.',
    daq_cleared: 'DAQ data cleared.',
    daq_stopped: 'Stopped',
    daq_rt_running: 'Real-time measuring... (1s)',
    daq_full_running: 'Measuring every 3 min...',
    daq_start_log_rt: 'real-time(1s)',
    daq_start_log_full: 'full-scan(3min)',
    daq_start_log: 'DAQ start — mode:',
    daq_stop_log: 'DAQ measurement stopped.',
    daq_no_data_log: 'No data available.',
    daq_ch_modal_title: 'Channel Names',
    daq_ch_modal_no_slot: 'Please set slot range first',
    daq_ch_ok: '✔ OK',
    daq_ch_cancel: '✕ Cancel',
    daq_select_all: 'Select All',
    daq_no_chart: 'No measurement data',
    daq_connect_first: 'Please connect the instrument first.',
    daq_no_ch_alert: 'Please set Slot 1 or Slot 2 channels first.',
    daq_terminal_lbl: 'Terminal',
    daq_front_tab: 'Graph',
    daq_4wire_warn: '4-Wire(FRES) mode: channel(s) {chs} are auto-pair channels (11–20).\nSet source channels (1–10) and the device will pair automatically.\nContinue?',

    // SP-2100 / TL-2200
    sp_model_label: 'Instrument Model',
    sp_comm_label: 'Comm. Settings',
    sp_comm_auto: '(auto)',
    sp_test_section: 'Test Conditions',
    sp_sample_name_label: 'Sample Name',
    sp_sample_default_val: 'Product',
    sp_name_label: 'Product Name',
    sp_speed_label: 'Test Speed',
    sp_delay_label: 'Initial Delay',
    sp_avg_label: 'Averaging Time',
    sp_test_hint: 'Test conditions are written as a header comment in CSV / clipboard exports.',
    sp_group_label: 'Items per group',
    sp_group_hint: 'When no rows are checked, the distribution chart groups data by this count.',
    sp_table_title: '📋 Measurement Log',
    sp_del_checked: 'Delete Sel',
    sp_dist_title: '📊 AVG Distribution',
    sp_dist_hint: 'Shows a box-and-whisker chart of AVG values for checked rows (or by group).',
    sp_selected: 'Selected',
    sp_overwrite_log: '[Overwrite]',
    sp_conn_log: 'Model selected',
    sp_model_changed: 'Model changed',
    sp_del_none: 'No rows are checked.',
    sp_del_done: 'Deleted the checked rows.',
    sp_no_data_log: 'No measurement data.',
    sp_csv_ok: 'CSV export complete.',
    sp_cleared: 'Cleared the measurement log.',
    sp_clear_confirm: 'Clear all measurement records?',
    sp_copy_empty: 'No measurement records to copy.',
    sp_copy_ok: 'Copied measurement records to clipboard.',
    sp_copy_fail: 'Copy failed — please select the table manually.',
    sp_wave_title: 'Waveform Graph (Force-Time)',
    sp_wave_hint: 'Run a test to display the force-time curve.',
    sp_wave_samples: 'Samples',
    sp_wave_decode: 'Decode',

    // PT-2000 Probe Tack
    pt_conn_label: 'Device Connection (WebHID)',
    pt_dev_connected: 'Device connected',
    pt_dev_disconnected: 'Disconnected',
    pt_conn_failed: 'Connection failed',
    pt_webhid_unsupported: 'This browser does not support WebHID. Please use desktop Chrome/Edge.',
    pt_test_settings: 'Test Settings',
    pt_notice: '⚠ The values below <b>do not control the device.</b> They are reference values for displacement/Work calculation only — make sure they <b>match</b> the values set on the device (Change Test Parameters).',
    pt_sample_name: 'Sample Name',
    pt_sample: 'Sample',
    pt_speed_label: 'Speed (mm/s)',
    pt_dwell_label: 'Dwell (s)',
    pt_loadcell_label: 'Load Cell',
    pt_tol_label: 'Outlier tolerance (% vs median)',
    pt_tol_hint: 'When 4+ measurements share a sample-name group, rows whose Peak deviates from the group median by more than this percentage are highlighted in red.',
    pt_repeat_label: 'Count',
    pt_repeat_hint: 'Groups measurements with the same sample name into sets of N and numbers them automatically (e.g. 3 → A-1-1, A-1-2, A-1-3, A-2-1 ...)',
    pt_del_sel: 'Delete Sel',
    pt_failure_mode: 'Failure Mode',
    pt_mode_interface: 'Interfacial failure',
    pt_mode_cohesive: 'Cohesive failure',
    pt_mode_transfer: 'Transfer failure',
    pt_graph_title: '📈 Measurement Graph',
    pt_graph_hint: 'Check rows in the table to overlay multiple curves for comparison. (Shows the latest measurement if none are checked)',
    pt_graph_empty: 'Curves will appear here once measurements are imported',
    pt_q_detected: 'Q signal detected (test data ready)',
    pt_download_log: 'Download',
    pt_chunks: 'chunks',
    pt_points: 'points',
    pt_early_stop: 'early stop',
    pt_save_done: 'Data saved — press [Proceed to Next Test] once the device graph finishes',
    pt_proceed_sent: 'Proceed signal (b) sent — Clean Probe starting',
    pt_collecting: 'Collecting data...',
    pt_swap_hint: 'You can swap in the next sample now~',
    pt_meas_done: 'Measurement complete · data saved',
    pt_auto_close_hint: 'This popup will close automatically in 20 seconds. Please wait.',
    pt_proceed_btn: 'Proceed to next test',
    pt_sec_auto: 's auto-proceed',
    pt_proceed_warn: '⚠ Pressing the button below will start the device\'s <b>Clean Probe</b> action.<br>Verify that the load cell <b>stops correctly</b> at the upper limit switch.<br><b>Do not close it from the device screen — proceed using this button instead.</b>',
    pt_aborted: 'Test aborted · not recorded',
    pt_status: 'Status',
    pt_aborted_status: 'Aborted / sample not contacted',
    pt_aborted_status_short: 'Aborted',
    pt_abort_guide: 'The test did not complete normally.<br>Follow the guidance on the device screen:<br>① "test was aborted" → <b>OK</b><br>② "return to HOME position" → <b>HOME</b>',
    pt_confirm: 'OK',
    pt_connect_first: 'Please connect the device first.',
    pt_remeasure_one: 'Please select only one item to re-measure.',
    pt_test_done_detected: 'Test completion detected → starting auto download',
    pt_download_err: 'Download error',
    pt_no_curve: 'Failed to receive the test curve.\nPlease check that the test has finished on the device.',
    pt_no_data: 'No / insufficient data received',
    pt_abort_detected: 'Test abort detected — proceed signal will not be sent and this will not be recorded.',
    pt_remeasured: 're-measured',
    pt_remeasure_done: 'Re-measurement complete',
    pt_meas_added: 'Measurement added',
    pt_label_changed: 'Label changed',
    pt_select_to_delete: 'Please select items to delete.',
    pt_confirm_delete_n: 'Delete the selected',
    pt_items: 'item(s)?',
    pt_items_deleted: 'item(s) deleted',
    pt_clear_confirm: 'Delete all measurement data?',
    pt_cleared: 'All data cleared',
    pt_no_export_data: 'No data to export.',
    pt_csv_ok: 'CSV export complete',
    pt_no_copy_data: 'No data to copy.',
    pt_copy_ok: 'Table data copied to clipboard.',
    pt_copy_fail: 'Copy failed — please select the table manually.',

    // LT-1000 Loop Tack
    lt_conn_label: 'Device Connection (Web Serial)',
    lt_conn_btn: 'Connect Serial Port',
    lt_test_settings: 'Test Settings',
    lt_notice: 'Tests are started directly on the LT-1000.<br>After the test, press Enter in the Print menu (P) to send data.',
    lt_calib_btn: 'Load Cell Calibration Guide',
    lt_calib_title: 'Load Cell Calibration',
    lt_calib_body: 'Perform calibration periodically to maintain measurement accuracy.',
    lt_calib_s1: 'Raise the load cell to the top and secure it firmly with the locking pin.',
    lt_calib_s2: 'Press and hold simultaneously for 3+ seconds to enter calibration mode.',
    lt_calib_s3: 'When the Setup screen appears, press Enter to confirm.',
    lt_calib_s4: 'On the <b>LC 0.000</b> screen, confirm the zero (no-load) state and press Enter.',
    lt_calib_s5: 'The <b>HC 1000</b> screen will appear.',
    lt_calib_s6: 'Place a <b>1 kg calibration weight</b> on top of the load cell, then press Enter.',
    lt_calib_s7: 'Remove the weight, hold the load cell securely, release the locking pin, and gently lower it into position.',
    lt_calib_img_cap: '1 kg calibration weight placed on top of the load cell',
    lt_calib_prep: '① Preparation',
    lt_calib_prep_s1: 'Move load cell to top',
    lt_calib_prep_s2: 'Secure locking pin',
    lt_calib_enter: '② Enter Calibration Mode',
    lt_calib_zero: '③ Zero Calibration (No-load)',
    lt_calib_zero_check: 'Verify LC 0.000',
    lt_calib_span: '④ Span Calibration (1 kg weight)',
    lt_calib_span_show: 'HC 1000 Display',
    lt_calib_span_place: 'Place 1 kg weight',
    lt_calib_img_alt: 'Place 1kg weight',
    lt_calib_done: '⑤ Complete',
    lt_calib_done_s1: 'Remove weight',
    lt_calib_done_s2: 'Hold load cell',
    lt_calib_done_s3: 'Release pin',
    lt_calib_done_s4: 'Lower gently',
    lt_howto_btn: 'How to Send Data',
    lt_howto_title: '📋 How to Send Data',
    lt_howto_body: 'After the test, press the buttons in the following order to record data automatically.',
    lt_howto_auto: 'Auto-recorded<br>after timer ends',
    lt_sample_label: 'Sample Name',
    lt_tol_label: 'Outlier Tolerance (%)',
    lt_unit_label: 'Unit',
    lt_unit_gf: 'gf (gram-force)',
    lt_unit_n: 'N (Newton)',
    lt_unit_oz: 'oz (ounce-force)',
    lt_speed_label: 'Speed',
    lt_sampling_label: 'Sampling',
    lt_probe_label: 'Probe',
    lt_mem_warn: '⚠ P — Clear memory after 20 entries',
    lt_mem_how: 'How',
    lt_run_hint: 'Perform test in Run state',
    lt_stfull_btn: 'ST FULL Fix',
    lt_stfull_title: 'ST FULL Fix',
    lt_stfull_body: 'Device memory is full. Follow the steps below to clear memory and restart testing.',
    lt_stfull_done: 'Memory cleared<br>Restart test',
    lt_data_title: '📋 Measurement Data',
    group_repeat_label: 'Group Count',
    group_repeat_hint: 'Groups N measurements per sample name for auto-numbering (e.g. 3 → A-1-1, A-1-2, A-1-3, A-2-1...)',
    lt_group_label: 'Group Count',
    lt_graph_title: '📈 Measurement Graph',
    lt_graph_hint: 'Check rows to overlay multiple curves for comparison.',
    lt_graph_empty: 'Curves will appear once data is received',
    lt_th_sample: 'Sample',
    lt_th_stdev: 'Std Dev',
    lt_th_mode: 'Failure Mode',
    lt_guide0_title: '📐 Unit Setting',
    lt_guide0_body: 'This program uses raw values from the device.<br><b style="color:var(--text);">Press Units in Run mode and select Grams.</b>',
    lt_guide0_next: 'OK → Next',
    lt_guide1_title: '⚙️ Enable Save Function',
    lt_guide1_body: 'The device\'s save (St) function must be <b>On</b> to transmit data to PC.',
    lt_memfull_title: '⚠️ Memory Reset Required',
    lt_memfull_body: 'The device has reached <b style="color:var(--text);">20</b> stored entries.<br>Please clear memory to continue.',
    lt_result_done: '✅ Measurement Complete',
    lt_result_abort: '⚠ Test Aborted · Not Recorded',
    lt_modal_sample: 'Sample',
    lt_modal_mode: 'Failure Mode',
    lt_modal_pts: 'Points',
    lt_modal_verdict: 'Verdict',
    lt_modal_below_min: 'Below minimum threshold',
    lt_mode_snap: 'Immediate failure (Snap)',
    lt_mode_std: 'Standard loop failure',
    lt_mode_creep: 'Delayed failure (Creep)',
    lt_log_no_parse: 'No parseable data found.',
    lt_log_header: 'Header detected',
    lt_log_curve: 'Curve data',
    lt_log_added: 'Measurement added',
    lt_log_connected: 'LT-1000 connected. Press Print(P) → Enter on the device to send data.',
    lt_no_export: 'No data to export.',
    lt_csv_ok: 'CSV export complete.',
    lt_no_copy: 'No data to copy.',
    lt_copy_ok: 'Copied to clipboard.',
    lt_del_none: 'Please select items to delete.',
    lt_del_confirm_n: 'Delete the selected',
    lt_del_confirm_items: 'item(s)?',
    lt_del_done_items: 'item(s) deleted.',
    lt_clear_confirm: 'Delete all measurement data?',
    lt_cleared: 'All data cleared.',
    lt_rename_log: 'Label changed',
    lt_receiving: 'Receiving...',
    lt_abort_log: 'Test aborted — points:',
    lt_abort_below: '(below threshold)',
    lt_min_criteria: 'Min criteria:',
    lt_min_and_peak: 'points AND Peak >',
    lt_guide1_btn: 'OK',
    lt_modal_btn: 'OK',
    lt_memfull_btn: 'OK',
    // Photo Editor
    ai_guide_title: 'ℹ️ Guide',
    ai_guide_step1: 'Step 1: Upload photos, adjust rotation/zoom/pan, then set the crop area.',
    ai_guide_auto: '"Auto Align" copies the current crop area to other photos.',
    ai_guide_step2: 'Step 2: Preview the grid and export to Excel.',
    ai_phone_title: '📱 Phone Camera Sync',
    ai_phone_start: '▶ Start Sync',
    ai_phone_stop: '⏹ Stop Sync',
    ai_file_list: '📁 File List',
    ai_file_count: 'files',
    ai_drop_hint: 'Drop files here or click to upload',
    ai_delete_all: 'Delete All',
    ai_size_label: 'Excel Output Size (inch)',
    ai_size_h: 'Height(inch)',
    ai_size_w: 'Width(inch)',
    ai_rot_label: 'Rotation:',
    ai_reset_crop: '↺ Reset Crop',
    ai_auto_align: '⚡ Auto Align',
    ai_next: 'Next Step ▶',
    ai_back: '◀ Back',
    ai_per_row: 'Cols per sheet',
    ai_export_excel: '📥 Export to Excel',
    ai_exporting: 'Exporting…',
  },
};

// ── Default Test Modes ────────────────────────────────────────────────────────
const DEFAULT_TEST_MODES = {
  'ETM-7':  { cols: ['1','2','3'], group: 0, set: 3 },
  'ETM-6':  { cols: ['1','2','3','4','1','2','3','4'], group: 4, set: 8 },
  'ETM-3':  { cols: ['1','2','3','4','1','2','3','4','1','2','3','4'], group: 4, set: 12 },
  'ETM-18': { cols: ['1','2','3'], group: 0, set: 3 },
};
const DEFAULT_VL50_MODES = {
  'MSL-2': { cols: ['Left','Right'], group: 6, set: 6 },
};
const DEFAULT_KEYS = new Set(Object.keys(DEFAULT_TEST_MODES));

// ── State Machine ─────────────────────────────────────────────────────────────
class StateMachine {
  constructor() {
    this.state = 'WAIT_FOR_CONTACT';
    this.waitTime = 2.0;
    this._t0 = 0;
    this.onStateChange  = null;
    this.onLogTriggered = null;
  }
  update(isValid, value, fmt) {
    if (this.state === 'WAIT_FOR_CONTACT') {
      if (isValid) { this._t0 = Date.now(); this._go('STABILIZING'); }
    } else if (this.state === 'STABILIZING') {
      if (!isValid) { this._go('WAIT_FOR_CONTACT'); return; }
      if ((Date.now() - this._t0) / 1000 >= this.waitTime) {
        this.onLogTriggered?.(value, fmt);
        this._go('WAIT_FOR_OPEN');
      }
    } else if (this.state === 'WAIT_FOR_OPEN') {
      if (!isValid) this._go('WAIT_FOR_CONTACT');
    }
  }
  reset() { this._go('WAIT_FOR_CONTACT'); }
  _go(s) { if (this.state !== s) { this.state = s; this.onStateChange?.(s); } }
}

// ── Serial Controller ─────────────────────────────────────────────────────────
class SerialController {
  constructor() {
    this.port = null; this.writer = null; this.reader = null;
    this.readLoopActive = false;
    this.readPromise = null;
    this.isConnected = false;
    this.isVisa = false;
    this.visaAddress = '';
    this.onLine  = null;
    this.onByte  = null;
    this.onError = null;
  }
  async connect(cfg) {
    if (!navigator.serial) throw new Error('Web Serial API not supported');
    this.port = await navigator.serial.requestPort();
    // 오픈 실패 시 1회 재시도 — 직전 연결이 막 닫혔을 때 OS가 포트를 늦게 해제하는 경우 대응
    try {
      await this.port.open(cfg);
    } catch (e1) {
      await new Promise(r => setTimeout(r, 600));
      try {
        await this.port.open(cfg);
      } catch (e2) {
        try { await this.port.close?.(); } catch (_) {}
        throw e2;
      }
    }
    const enc = new TextEncoderStream();
    enc.readable.pipeTo(this.port.writable).catch(() => {});
    this.writer = enc.writable.getWriter();
    this.isConnected = true;
    this._loop();
  }
  async disconnect() {
    this.readLoopActive = false;
    if (this.reader) {
      try { await this.reader.cancel(); } catch (_) {}
    }
    if (this.readPromise) {
      try { await this.readPromise; } catch (_) {}
      this.readPromise = null;
    }
    try { await this.writer?.close(); } catch (_) {}
    try { await this.port?.close(); } catch (_) {}
    this.port = null; this.writer = null; this.reader = null;
    this.isConnected = false;
  }
  async sendCmd(cmd) {
    if (this.isVisa) {
      try {
        const isQuery = cmd.trim().includes('?');  // TRAC:DATA? 1,N,...,READ 처럼 ? 뒤 파라미터가 있는 경우도 쿼리로
        const url = isQuery ? '/api/visa/query' : '/api/visa/write';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd })
        });
        const data = await resp.json();
        if (data.success && isQuery && data.response) {
          this.onLine?.(data.response.trim());
        }
      } catch (e) {
        this.onError?.(`VISA Transmit: ${e.message}`);
      }
      return;
    }
    if (!this.writer) return;
    try { await this.writer.write(cmd); } catch (e) { this.onError?.(`Send: ${e.message}`); }
  }
  _loop() {
    this.readLoopActive = true;
    this.reader = this.port.readable.getReader();
    const dec = new TextDecoder();
    let buf = '';
    this.readPromise = (async () => {
      try {
        while (this.readLoopActive) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value) continue;
          if (this.onByte) for (const b of value) this.onByte(b);
          buf += dec.decode(value, { stream: true });
          const parts = buf.split(/[\r\n]+/);
          buf = parts.pop();
          for (const line of parts) if (line.trim()) this.onLine?.(line.trim());
        }
      } catch (e) {
        if (this.readLoopActive) this.onError?.(`Read: ${e.message}`);
      } finally {
        try { this.reader.releaseLock(); } catch (_) {}
      }
    })();
  }
}

// ── Editable Grid ─────────────────────────────────────────────────────────────
class EditableGrid {
  constructor(host, panelIdx) {
    this.host = host;
    this.panelIdx = panelIdx;
    this.cols = []; this.group = 0; this.set = 0;
    this.rows = [];
    this.focusR = 0; this.focusC = 0;
    this.onFocusChange = null;
    this.onDataChange  = null;
    this._cells = [];
    this._tbody = null;
  }

  build(modeCfg, saved) {
    this.cols  = modeCfg.cols;
    this.group = modeCfg.group || 0;
    this.set   = modeCfg.set   || 0;
    this.rows  = (saved && saved.length)
      ? saved.map(r => r.slice())
      : [new Array(this.cols.length).fill('')];
    this.focusR = 0; this.focusC = 0;
    this._cells = [];
    this._render();
  }

  _render() {
    this._cells = [];
    this.host.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.className = 'grid-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'data-table';

    const tr0 = tbl.createTHead().insertRow();
    const th0 = document.createElement('th'); th0.textContent = 'No.'; tr0.appendChild(th0);
    this.cols.forEach((c, ci) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (this.group > 0 && (ci + 1) % this.group === 0 && ci < this.cols.length - 1)
        th.style.borderRight = '2px solid var(--accent)';
      tr0.appendChild(th);
    });

    this._tbody = tbl.createTBody();
    this.rows.forEach((_, ri) => this._appendRow(ri));

    scroll.appendChild(tbl);
    this.host.appendChild(scroll);

    const add = document.createElement('button');
    add.className = 'grid-add-btn';
    add.textContent = '+ Row';
    add.onclick = () => {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    };
    this.host.appendChild(add);
    this._focusCell(0, 0);
  }

  _appendRow(ri) {
    const tr = this._tbody.insertRow();
    if (this.set > 0 && ri > 0 && ri % this.set === 0) tr.classList.add('set-divider');

    const lbl = this.set > 0
      ? `${Math.floor(ri / this.set) + 1}-${(ri % this.set) + 1}`
      : String(ri + 1);
    const td0 = tr.insertCell();
    td0.className = 'no-cell'; td0.textContent = lbl;

    const row = [];
    this.cols.forEach((_, ci) => {
      const td = tr.insertCell();
      if (this.group > 0 && (ci + 1) % this.group === 0 && ci < this.cols.length - 1)
        td.classList.add('group-gap');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'cell-input';
      inp.value = this.rows[ri][ci] || '';
      inp.addEventListener('focus',   () => this._onFocus(ri, ci));
      inp.addEventListener('input',   () => { this.rows[ri][ci] = inp.value; this.onDataChange?.(); });
      inp.addEventListener('keydown', e  => this._onKey(e, ri, ci));
      td.appendChild(inp);
      row.push(inp);
    });
    this._cells.push(row);
    this._scrollTo(ri);
  }

  _onFocus(r, c) {
    this.focusR = r; this.focusC = c;
    this.onFocusChange?.(this.panelIdx);
    this._tbl()?.querySelectorAll('td.cell-focused').forEach(td => td.classList.remove('cell-focused'));
    this._cells[r]?.[c]?.closest('td')?.classList.add('cell-focused');
  }

  _onKey(e, r, c) {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); app.onEnterPressed(); }
    else if (e.key === 'ArrowRight') this._focusCell(r, c + 1);
    else if (e.key === 'ArrowLeft')  this._focusCell(r, c - 1);
    else if (e.key === 'ArrowDown')  this._focusCell(r + 1, c);
    else if (e.key === 'ArrowUp')    this._focusCell(r - 1, c);
  }

  _tbl()  { return this.host.querySelector('table'); }
  _focusCell(r, c) {
    r = Math.max(0, Math.min(r, this._cells.length - 1));
    c = Math.max(0, Math.min(c, this.cols.length - 1));
    this._cells[r]?.[c]?.focus();
  }
  _scrollTo(ri) {
    requestAnimationFrame(() => this._cells[ri]?.[0]?.scrollIntoView({ block: 'nearest' }));
  }

  setValue(r, c, val) {
    while (this.rows.length <= r) {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    }
    if (this._cells[r]?.[c]) {
      this._cells[r][c].value = val;
      this.rows[r][c] = val;
      this.onDataChange?.();
    }
  }

  moveNext() {
    let r = this.focusR, c = this.focusC + 1;
    if (c >= this.cols.length) { c = 0; r++; }
    if (r >= this._cells.length) {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    }
    this._focusCell(r, c);
  }

  getData()    { return this.rows.map(r => r.slice()); }
  getNumbers() { return this.rows.flat().map(v => parseFloat(v)).filter(v => !isNaN(v)); }
}

// ── Box Plot Chart ────────────────────────────────────────────────────────────
class BoxPlot {
  constructor(canvas, emptyEl, statsEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emptyEl = emptyEl;
    this.statsEl = statsEl;
    this._customYMin = null;
    this._customYMax = null;
    this._lastArgs   = null;
    this._minInp     = null;
    this._maxInp     = null;
  }

  attachYControls(graphAreaEl) {
    const overlay = document.createElement('div');
    overlay.className = 'y-overlay';
    graphAreaEl.appendChild(overlay);

    const make = (cls) => {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = 'any'; inp.placeholder = '자동';
      inp.className = `y-axis-inp ${cls}`;
      overlay.appendChild(inp);
      return inp;
    };
    this._maxInp = make('y-axis-max');
    this._minInp = make('y-axis-min');

    const resetBtn = document.createElement('button');
    resetBtn.className = 'y-reset-btn';
    resetBtn.title = 'Y축 자동';
    resetBtn.textContent = '↺';
    overlay.appendChild(resetBtn);

    const redraw = () => {
      const mn = parseFloat(this._minInp.value);
      const mx = parseFloat(this._maxInp.value);
      this._customYMin = (this._minInp.value !== '' && !isNaN(mn)) ? mn : null;
      this._customYMax = (this._maxInp.value !== '' && !isNaN(mx)) ? mx : null;
      resetBtn.style.display = (this._customYMin !== null || this._customYMax !== null) ? '' : 'none';
      if (this._lastArgs) this.draw(...this._lastArgs);
    };
    for (const inp of [this._maxInp, this._minInp]) {
      inp.addEventListener('change', redraw);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); redraw(); } });
    }
    resetBtn.onclick = () => {
      this._customYMin = null; this._customYMax = null;
      this._maxInp.value = ''; this._minInp.value = '';
      resetBtn.style.display = 'none';
      if (this._lastArgs) this.draw(...this._lastArgs);
    };
    resetBtn.style.display = 'none';
    this._resetBtn = resetBtn;
  }

  _positionInputs(H) {
    if (this._maxInp) { this._maxInp.style.top = `${28 - 9}px`; this._maxInp.style.left = '3px'; }
    if (this._minInp) { this._minInp.style.top = `${H - 44 - 9}px`; this._minInp.style.left = '3px'; }
    if (this._resetBtn) { this._resetBtn.style.top = '6px'; this._resetBtn.style.right = '6px'; }
  }

  draw(grid, groupCount) {
    this._lastArgs = [grid, groupCount];
    const cv = this.canvas;
    cv.width  = cv.offsetWidth  || 320;
    cv.height = cv.offsetHeight || 240;
    const W = cv.width, H = cv.height;
    this._positionInputs(cv.offsetHeight || H);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    const empty = this.emptyEl || document.getElementById('chartEmpty');
    
    let groups = [];
    let allVals = [];

    if (groupCount > 0 && grid && grid.rows) {
      const rows = grid.rows;
      const allGroups = [];
      for (let i = 0; i < rows.length; i += groupCount) {
        const chunk = rows.slice(i, i + groupCount);
        const vals = chunk.flat().map(v => parseFloat(v)).filter(v => !isNaN(v));
        if (vals.length > 0) {
          allGroups.push({
            vals: [...vals].sort((a, b) => a - b),
            n: vals.length,
            groupNo: allGroups.length + 1
          });
        }
      }
      groups = allGroups.slice(-3);
      allVals = rows.flat().map(v => parseFloat(v)).filter(v => !isNaN(v));
    } else {
      const nums = (grid && grid.getNumbers) ? grid.getNumbers() : (Array.isArray(grid) ? grid : []);
      allVals = nums;
      if (nums && nums.length >= 2) {
        groups = [{
          vals: [...nums].sort((a, b) => a - b),
          n: nums.length,
          groupNo: 1
        }];
      }
    }

    if (!allVals || allVals.length < 2 || groups.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    const sortedAll = [...allVals].sort((a, b) => a - b);
    const autoMn = sortedAll[0], autoMx = sortedAll[sortedAll.length - 1];
    const mn = this._customYMin !== null ? this._customYMin : autoMn;
    const mx = this._customYMax !== null ? this._customYMax : autoMx;
    const span = mx - mn || 1;

    if (this._minInp && this._customYMin === null) this._minInp.placeholder = autoMn.toPrecision(4).replace(/\.?0+$/, '');
    if (this._maxInp && this._customYMax === null) this._maxInp.placeholder = autoMx.toPrecision(4).replace(/\.?0+$/, '');

    const padT = 28, padB = 44, padL = 64, padR = 20;
    const cH = H - padT - padB;
    const toY = v => padT + (1 - (v - mn) / span) * cH;

    const cs = getComputedStyle(document.body);
    const C = {
      text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
      text2:   cs.getPropertyValue('--chart-text2').trim()   || '#8aa3bd',
      grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
      boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
      boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
      med:     cs.getPropertyValue('--chart-med').trim()     || '#3fb6e8',
      mean:    cs.getPropertyValue('--chart-mean').trim()    || '#fbbf24',
      dot:     cs.getPropertyValue('--chart-dot').trim()     || 'rgba(63,182,232,.55)',
    };

    ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
    [mn, (mn+mx)/2, mx].forEach(v => {
      const y = toY(v);
      // Skip min/max text when overlay inputs show those values
      if (v === (mn+mx)/2 || !this._maxInp) {
        ctx.fillStyle = C.text;
        ctx.fillText(_fmt(v), padL - 6, y + 4);
      }
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    });

    const totalW = W - padL - padR;
    const colW = totalW / groups.length;
    const bW = Math.max(16, Math.min(colW * 0.55, 72));

    const BOX_PALETTE = [
      { stroke: '#2b8fff', fill: 'rgba(43, 143, 255, 0.15)' }, // Blue
      { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' }, // Emerald
      { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)' }, // Purple
      { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.15)' }, // Orange
      { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.15)' }, // Rose
      { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)' },  // Cyan
      { stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.15)' },   // Yellow
      { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)' }   // Pink
    ];

    groups.forEach((g, gi) => {
      const cx = padL + (gi + 0.5) * colW;
      const { vals, n } = g;
      const wMin = vals[0], wMax = vals[vals.length - 1];

      const q = f => vals[Math.min(n - 1, Math.floor(n * f))];
      const q1 = q(.25), q2 = q(.5), q3 = q(.75);
      const meanG = vals.reduce((a, b) => a + b, 0) / n;
      const yQ1 = toY(q1), yQ3 = toY(q3), yMed = toY(q2);

      const colorObj = BOX_PALETTE[(g.groupNo - 1) % BOX_PALETTE.length];
      const boxStr = colorObj.stroke;
      const boxFill = colorObj.fill;

      ctx.strokeStyle = boxStr; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      [[wMin, q1],[q3, wMax]].forEach(([y1, y2]) => {
        ctx.beginPath();
        ctx.moveTo(cx, toY(y1)); ctx.lineTo(cx, toY(y2)); ctx.stroke();
      });
      ctx.setLineDash([]);

      [[wMin],[wMax]].forEach(([v]) => {
        const y = toY(v);
        ctx.beginPath(); ctx.moveTo(cx - bW * 0.2, y); ctx.lineTo(cx + bW * 0.2, y); ctx.stroke();
      });

      ctx.fillStyle = boxFill; ctx.strokeStyle = boxStr; ctx.lineWidth = 1.5;
      ctx.fillRect(cx - bW / 2, yQ3, bW, yQ1 - yQ3);
      ctx.strokeRect(cx - bW / 2, yQ3, bW, yQ1 - yQ3);

      ctx.strokeStyle = boxStr; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - bW / 2, yMed); ctx.lineTo(cx + bW / 2, yMed); ctx.stroke();

      ctx.fillStyle = C.mean;
      const yM = toY(meanG), dm = 5;
      ctx.beginPath();
      ctx.moveTo(cx, yM - dm); ctx.lineTo(cx + dm, yM);
      ctx.lineTo(cx, yM + dm); ctx.lineTo(cx - dm, yM);
      ctx.closePath(); ctx.fill();

      // 평균값 레이블 — 상단 수염 위, 기울여서 표시
      let unit = 'Ω';
      if (window.app && window.app.instr) {
        if (window.app.instrName === 'Mitutoyo VL-50' || window.app.instr.useVL50Modes) {
          unit = 'mm';
        } else if (window.app.instrName.toLowerCase().includes('vl-50') || window.app.instrName.toLowerCase().includes('vl50')) {
          unit = 'mm';
        }
      }
      ctx.save();
      ctx.translate(cx, toY(wMax) - 7);
      ctx.rotate(-Math.PI / 5.5);
      ctx.font = 'bold 9px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillStyle = boxStr;
      ctx.fillText(_fmt(meanG) + ' ' + unit, 0, 0);
      ctx.restore();


      if (n <= 20) {
        vals.forEach(v => {
          const y = toY(v);
          const x = cx + bW / 2 + 5 + Math.random() * 6;
          ctx.fillStyle = boxStr + '88';
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        });
      }

      const labelText = groupCount > 0 ? `#${g.groupNo} (${g.groupNo}-1~${g.groupNo}-${groupCount})` : `#${g.groupNo}`;
      ctx.fillStyle = C.text; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'center';
      ctx.fillText(labelText, cx, H - padB + 13);
    });

    const globalMean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const globalSd   = Math.sqrt(allVals.reduce((s, v) => s + (v - globalMean) ** 2, 0) / allVals.length);
    ctx.fillStyle = C.text2; ctx.font = '10.5px Inter'; ctx.textAlign = 'center';
    ctx.fillText(`n=${allVals.length}  x̄=${_fmt(globalMean)}  σ=${_fmt(globalSd)}`, W/2, H - 6);

    const statsEl = this.statsEl || document.getElementById('statsPanel');
    if (statsEl) statsEl.innerHTML = [
      ['Min', _fmt(mn)], ['Max', _fmt(mx)],
      ['Mean', _fmt(globalMean)], ['σ', _fmt(globalSd)], ['n', allVals.length],
    ].map(([k,v]) => `<div class="stat-chip">${k} <b>${v}</b></div>`).join('');
  }
}

function _fmt(v) {
  if (v === undefined || isNaN(v)) return '---';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(2);
  if (a >= 100)  return v.toFixed(2);
  if (a >= 1)    return v.toFixed(4);
  return v.toPrecision(4);
}

// ── Main Application ──────────────────────────────────────────────────────────
class App {
  constructor(instruments = {}) {
    this._instruments = instruments;
    this.lang  = 'ko';
    this.theme = 'dark';
    this.instrName = null;   // current instrument name string
    this.instr     = null;   // current instrument module object
    this.splitCount    = 1;
    this.panels        = [];
    this.activePanelIdx = 0;
    this.testModes  = { ...DEFAULT_TEST_MODES };
    this.masterData = Object.fromEntries(Object.keys(DEFAULT_TEST_MODES).map(k => [k, []]));
    this.vl50Modes  = { ...DEFAULT_VL50_MODES };
    this.vl50Data   = { 'MSL-2': [] };
    this.count      = 0;
    this.currentFmt = '---';
    this.serial     = new SerialController();
    this.sm         = new StateMachine();
    this.pollTimer  = null;
    this._chart     = null;

    // Save grid sidebar HTML for restore when switching back from custom views
    this._origSidebarHTML = document.getElementById('sidebar').innerHTML;

    this._loadConfig();

    // VL-50용 테스트 모드에 일반 모드들도 추가하여 드롭다운 선택 가능하게 만듦 (단, MSL-2가 첫 번째로 유지)
    this.vl50Modes = { ...DEFAULT_VL50_MODES };
    Object.keys(this.testModes).forEach(k => {
      if (!this.vl50Modes[k]) this.vl50Modes[k] = this.testModes[k];
    });
    this.vl50Data = { 'MSL-2': this.vl50Data['MSL-2'] || [] };
    Object.keys(this.masterData).forEach(k => {
      if (!this.vl50Data[k]) this.vl50Data[k] = this.masterData[k];
    });
    this._applyTheme();
    this._applyLang();
    this._buildLauncher();

    this.sm.onStateChange  = s => this._onStateChange(s);
    this.sm.onLogTriggered = (v, f) => this._onLogTriggered(v, f);
    this.serial.onLine  = line => this._onLine(line);
    this.serial.onByte  = b    => { if (this.instr?.onByte) this.instr.onByte(b); };
    this.serial.onError = msg  => this.log(`[ERR] ${msg}`, 'err');
  }

  // ── i18n ───────────────────────────────────────────────────────────────────
  t(key) { return T[this.lang]?.[key] ?? T.ko[key] ?? key; }

  _applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
    document.documentElement.lang = this.lang;
    document.getElementById('langSelect').value = this.lang;
    document.getElementById('splitToggle')?.querySelectorAll('.toggle-btn').forEach((btn, i) => {
      btn.innerHTML = `${i+1} <span data-i18n="screens">${this.t('screens')}</span>`;
    });
    // Rebuild launcher section titles if visible
    if (!document.getElementById('launcher').hidden) {
      this._buildLauncher();
    }
    // Re-apply instrument sidebar if loaded
    if (this.instr) {
      this._rebuildInstrumentSidebar();
    }
  }

  _rebuildInstrumentSidebar() {
    if (!this.instr || document.getElementById('instrumentView').hidden) return;
    if (this.instr.viewType === 'custom') {
      // Custom-view modules build their own HTML with translated strings baked in.
      // buildSidebar must NOT call init() on rebuild (use `if (!S) init()` pattern)
      // so module-level state (rows, results) is preserved across lang/theme changes.
      this.instr.buildSidebar(document.getElementById('sidebar'));
      this.instr.buildCenter(document.getElementById('center'));
      this.instr.buildRightPanel(document.getElementById('rightpanel'));
      this._updateCount();
      // 사이드바 재빌드 후 연결 상태 복원 (언어/테마 변경 시 connStatus가 초기화되는 문제 방지)
      this._setBtnState(this.serial.isConnected);
      if (this.serial.isConnected) this._connBadge(true);
      // Re-populate table/graph HTML after rebuild (each module opts in via onRebuild)
      this.instr.onRebuild?.();
    } else {
      const area = document.getElementById('dynamicSettings');
      if (area && this.instr.buildSettings) {
        area.innerHTML = '';
        this.instr.buildSettings(area);
      }
    }
  }

  setLang(lang) {
    if (this.instr?.isRunning?.()) { this._showRunningWarning(); document.getElementById('langSelect').value = this.lang; return; }
    this.lang = lang; this._applyLang(); this._saveConfig();
  }

  // ── Theme ──────────────────────────────────────────────────────────────────
  _applyTheme() {
    document.body.classList.toggle('light', this.theme === 'light');
    document.getElementById('themeSelect').value = this.theme;
  }
  setTheme(t) {
    if (this.instr?.isRunning?.()) { this._showRunningWarning(); document.getElementById('themeSelect').value = this.theme; return; }
    this.theme = t; this._applyTheme(); this._rebuildInstrumentSidebar(); this._saveConfig();
  }

  _showRunningWarning() {
    let toast = document.getElementById('_runningToast');
    if (toast) { clearTimeout(toast._t); }
    else {
      toast = document.createElement('div');
      toast.id = '_runningToast';
      toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#d32f2f;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = this.t('running_warn') || '측정 중에는 테마/언어 변경이 불가합니다.';
    toast._t = setTimeout(() => toast.remove(), 2500);
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  _saveConfig() {
    try {
      localStorage.setItem('3m_cfg', JSON.stringify({
        lang: this.lang, theme: this.theme,
        testModes: this.testModes,
        masterData: this.masterData,
        vl50Data: this.vl50Data,
        launcherOrder:    this._lOrder,
        launcherFavs:     [...this._lFavs],
        launcherHidden:   [...this._lHidden],
        launcherNames:    this._lNames,
        launcherGroups:   this._lGroups,
        launcherMeta:     this._lMeta,
      }));
    } catch (_) {}
  }

  _loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem('3m_cfg') || '{}');
      if (c.lang)  this.lang  = c.lang;
      if (c.theme) this.theme = c.theme;
      if (c.testModes) {
        Object.keys(DEFAULT_TEST_MODES).forEach(k => {
          if (!c.testModes[k]) c.testModes[k] = { ...DEFAULT_TEST_MODES[k] };
        });
        Object.assign(this.testModes, c.testModes);
        this.masterData = Object.fromEntries(Object.keys(this.testModes).map(k => [k, []]));
      }
      if (c.masterData) Object.assign(this.masterData, c.masterData);
      if (c.vl50Data)   Object.assign(this.vl50Data,   c.vl50Data);
      // Launcher state
      const allNames = Object.keys(this._instruments);
      this._lOrder  = c.launcherOrder?.filter(n => allNames.includes(n)) ?? [...allNames];
      allNames.forEach(n => { if (!this._lOrder.includes(n)) this._lOrder.push(n); });
      this._lFavs   = new Set(c.launcherFavs   ?? []);
      this._lHidden = new Set(c.launcherHidden  ?? []);
      this._lNames  = c.launcherNames  ?? {};
      this._lGroups = c.launcherGroups ?? {};
      this._lMeta   = c.launcherMeta   ?? {};
    } catch (_) {
      const allNames = Object.keys(this._instruments);
      this._lOrder  = [...allNames];
      this._lFavs   = new Set();
      this._lHidden = new Set();
      this._lNames  = {};
      this._lGroups = {};
      this._lMeta   = {};
    }
  }

  // ── Launcher ───────────────────────────────────────────────────────────────
  static _LAUNCHER_GROUPS = {
    'Hioki 3540':        'Resistance',
    'Keithley 2700':     'Resistance',
    'Agilent 4339B':     'Resistance',
    'DAQ-6510':          'Resistance',
    'Mitutoyo VL-50':    'Thickness',
    'SP-2100 / TL-2200': 'Adhesive',
    'PT-2000 Probe Tack':'Adhesive',
    'LT-1000 Loop Tack': 'Adhesive',
    'Photo Editor':      'Software',
    'Club Expense':      'Software',
  };
  static _GROUP_ORDER  = ['Resistance', 'Thickness', 'Adhesive', 'Software'];
  static _GROUP_LABELS = {
    Resistance: { ko: '저항',    en: 'Resistance' },
    Thickness:  { ko: '두께',    en: 'Thickness'  },
    Adhesive:   { ko: '점착력', en: 'Adhesive'   },
    Software:   { ko: 'Software', en: 'Software'  },
  };

  _buildLauncher() {
    const root = document.getElementById('launcherCards');
    root.innerHTML = '';

    const visibleNames = this._lOrder.filter(n => !this._lHidden.has(n));
    const hiddenNames  = [...this._lHidden];

    // Favourites section
    const favNames = visibleNames.filter(n => this._lFavs.has(n));
    if (favNames.length) {
      const sec = document.createElement('div');
      sec.className = 'launcher-section';
      sec.innerHTML = `<div class="launcher-sec-title">${this.t('launcher_fav_section')}</div>`;
      const grid = document.createElement('div');
      grid.className = 'cards-grid';
      favNames.forEach(n => grid.appendChild(this._makeCard(n)));
      sec.appendChild(grid);
      root.appendChild(sec);
    }

    // Group visible instruments — 즐겨찾기에 있는 카드는 그룹에서 제외
    const nonFavNames = visibleNames.filter(n => !this._lFavs.has(n));
    const groups = {};
    nonFavNames.forEach(n => {
      const g = this._lGroups?.[n] ?? App._LAUNCHER_GROUPS[n] ?? 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(n);
    });

    const orderedGroups = [
      ...App._GROUP_ORDER.filter(g => groups[g]?.length),
      ...Object.keys(groups).filter(g => !App._GROUP_ORDER.includes(g) && groups[g]?.length),
    ];

    orderedGroups.forEach(g => {
      const labels = App._GROUP_LABELS[g];
      const title  = labels ? (this.lang === 'ko' ? labels.ko : labels.en) : g;
      const sec = document.createElement('div');
      sec.className = 'launcher-section';
      sec.innerHTML = `<div class="launcher-sec-title">${title}</div>`;
      const grid = document.createElement('div');
      grid.className = 'cards-grid';
      groups[g].forEach(n => {
        const card = this._makeCard(n);
        card.draggable = true;   // 그룹 카드만 드래그 가능
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      root.appendChild(sec);
    });

    // Hidden restore bar
    if (hiddenNames.length) {
      const bar = document.createElement('div');
      bar.className = 'launcher-hidden-bar';
      bar.innerHTML = `<span style="color:var(--text-dim);font-size:12px;">${this.t('launcher_hidden')}: ${hiddenNames.join(', ')}</span>
        <button class="sbtn" onclick="app._restoreAll()">${this.t('launcher_restore')}</button>`;
      root.appendChild(bar);
    }

    this._initDragDrop();
  }

  _initDragDrop() {
    let dragging = null;
    document.querySelectorAll('.device-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragging = card;
        setTimeout(() => card.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.card-drop-over').forEach(c => c.classList.remove('card-drop-over'));
        dragging = null;
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragging || dragging === card) return;
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.card-drop-over').forEach(c => c.classList.remove('card-drop-over'));
        card.classList.add('card-drop-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('card-drop-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragging || dragging === card) return;
        const fromName = dragging.dataset.name;
        const toName   = card.dataset.name;
        const fi = this._lOrder.indexOf(fromName);
        const ti = this._lOrder.indexOf(toName);
        if (fi !== -1 && ti !== -1) {
          this._lOrder.splice(fi, 1);
          this._lOrder.splice(ti, 0, fromName);
          this._saveConfig();
          this._buildLauncher();
        }
      });
    });
  }

  _makeCard(name) {
    const cfg  = this._instruments[name];
    const card = document.createElement('div');
    card.className = 'device-card';
    card.dataset.name = name;

    // Favourite button (top-left)
    const favBtn = document.createElement('button');
    favBtn.className   = 'card-fav-btn' + (this._lFavs.has(name) ? ' active' : '');
    favBtn.title       = this.t('launcher_fav_tip');
    favBtn.textContent = '★';
    favBtn.onclick = e => { e.stopPropagation(); this._toggleFav(name); };

    // Delete button (top-right)
    const delBtn = document.createElement('button');
    delBtn.className   = 'card-del-btn';
    delBtn.title       = this.t('launcher_del_tip');
    delBtn.textContent = '✕';
    delBtn.onclick = e => { e.stopPropagation(); this._hideCard(name); };

    // Icon
    const displayName = this._lNames?.[name] ?? name;
    const img = document.createElement('img');
    img.className = 'card-icon'; img.src = cfg.icon; img.alt = displayName;
    img.draggable = false;
    img.addEventListener('contextmenu', e => e.preventDefault()); // 이미지 기본 메뉴 차단
    img.onerror = () => {
      const ph = document.createElement('div');
      ph.className = 'card-icon-ph'; ph.textContent = displayName[0];
      img.replaceWith(ph);
    };

    const nm = document.createElement('div'); nm.className = 'card-name'; nm.textContent = displayName;
    const ct = document.createElement('div'); ct.className = 'card-cat';  ct.textContent = cfg.category;

    card.appendChild(favBtn);
    card.appendChild(delBtn);
    card.appendChild(img);
    card.appendChild(nm);
    card.appendChild(ct);

    card.onclick = e => { if (!e.target.closest('button')) this.launchInstrument(name); };

    // 호버 시 정보 팝업 — 소프트웨어/앱 카드는 제외
    const group = this._lGroups?.[name] ?? App._LAUNCHER_GROUPS[name] ?? 'Other';
    if (group !== 'Software') {
      card.addEventListener('mouseenter', () => {
        clearTimeout(this._cardHoverTimer);
        this._showCardInfo(name, card);
      });
      card.addEventListener('mouseleave', () => {
        this._cardHoverTimer = setTimeout(() => {
          const p = document.querySelector('.card-info-popup');
          if (p) p.remove();
        }, 150);
      });
    }

    return card;
  }

  _openCardEdit(name) {
    const m0      = this._lMeta?.[name] ?? {};
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
    const inpSt  = `style="width:100%;box-sizing:border-box;padding:7px 10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;margin-bottom:12px;"`;
    const lblSt  = t => `<label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px;">${t}</label>`;
    const btnBase = 'border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;';
    overlay.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px 26px;width:320px;max-height:90vh;overflow-y:auto;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,.4);">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px;">${this.t('card_edit_title')}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">${name}</div>

        ${lblSt(this.t('card_meta_location'))}
        <input id="_ceLoc" type="text" value="${(m0.location??'').replace(/"/g,'&quot;')}" placeholder="예) 3F EMSD Lab" ${inpSt}>

        ${lblSt(this.t('card_meta_asset'))}
        <input id="_ceAsset" type="text" value="${(m0.assetNo??'').replace(/"/g,'&quot;')}" placeholder="예) EQ-0042" ${inpSt}>

        ${lblSt(this.t('card_meta_manager'))}
        <input id="_ceMgr" type="text" value="${(m0.manager??'').replace(/"/g,'&quot;')}" placeholder="예) 홍길동" ${inpSt}>

        ${lblSt(this.t('card_meta_note'))}
        <textarea id="_ceNote" rows="2" placeholder="예) 교정 주기 1년" style="width:100%;box-sizing:border-box;padding:7px 10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;resize:vertical;margin-bottom:12px;font-family:inherit;">${m0.note??''}</textarea>

        ${lblSt(this.t('card_meta_photo'))}
        <div style="margin-bottom:16px;">
          <img id="_cePhotoImg" src="${m0.photo??''}" style="${m0.photo?'':'display:none;'}width:100%;max-height:130px;object-fit:cover;border-radius:8px;margin-bottom:8px;">
          <div style="display:flex;gap:6px;">
            <label style="flex:1;cursor:pointer;">
              <span style="${btnBase}display:block;padding:7px 10px;text-align:center;border:1px solid var(--border);background:var(--panel-2);color:var(--text);border-radius:6px;">${this.t('card_meta_upload')}</span>
              <input id="_cePhotoInput" type="file" accept="image/*" style="display:none;">
            </label>
            <button id="_cePhotoRm" style="${btnBase}padding:7px 12px;border:1px solid var(--border);background:var(--panel-2);color:var(--red,#e55);">${this.t('card_meta_photo_rm')}</button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button id="_ceClose" style="${btnBase}padding:8px 22px;background:var(--accent);border:none;color:#fff;font-weight:700;">${this.t('card_edit_done')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let pendingPhoto = m0.photo ?? null;
    const photoImg   = overlay.querySelector('#_cePhotoImg');
    const photoInput = overlay.querySelector('#_cePhotoInput');
    overlay.querySelector('#_cePhotoInput').addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      pendingPhoto = await this._compressPhoto(file);
      photoImg.src = pendingPhoto;
      photoImg.style.display = '';
    });
    overlay.querySelector('#_cePhotoRm').onclick = () => {
      pendingPhoto = null; photoImg.src = ''; photoImg.style.display = 'none';
    };

    overlay.querySelector('#_ceClose').onclick = () => {
      if (!this._lMeta) this._lMeta = {};
      const meta = {
        location: overlay.querySelector('#_ceLoc').value.trim(),
        assetNo:  overlay.querySelector('#_ceAsset').value.trim(),
        manager:  overlay.querySelector('#_ceMgr').value.trim(),
        note:     overlay.querySelector('#_ceNote').value.trim(),
        photo:    pendingPhoto,
      };
      if (Object.values(meta).some(Boolean)) this._lMeta[name] = meta;
      else delete this._lMeta[name];
      this._saveConfig(); this._buildLauncher(); overlay.remove();
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  async _compressPhoto(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = 360, MAX_H = 270;  // 레티나 2x 대응 (90×70 CSS → 180×140 물리px)
          let w = img.width, h = img.height;
          if (w <= MAX_W && h <= MAX_H) { resolve(e.target.result); return; } // 원본이 충분히 작으면 그대로
          if (w / h > MAX_W / MAX_H) { h = Math.round(h * MAX_W / w); w = MAX_W; }
          else                        { w = Math.round(w * MAX_H / h); h = MAX_H; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  _showCardMenu(name, x, y) {
    document.querySelector('.card-ctx-menu')?.remove();
    const isFav = this._lFavs.has(name);
    const menu  = document.createElement('div');
    menu.className = 'card-ctx-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9000;`;
    menu.innerHTML = `
      <div class="ccm-item" data-action="edit">✏ ${this.t('card_edit_title')}</div>
      <div class="ccm-item" data-action="fav">${isFav ? '★ ' + this.t('card_edit_fav_rm') : '☆ ' + this.t('card_edit_fav_add')}</div>
      <div class="ccm-sep"></div>
      <div class="ccm-item ccm-danger" data-action="hide">✕ ${this.t('launcher_del_tip')}</div>`;
    document.body.appendChild(menu);

    // 화면 경계 보정
    const r = menu.getBoundingClientRect();
    if (r.right  > window.innerWidth)  menu.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight) menu.style.top  = `${y - r.height}px`;

    menu.addEventListener('click', e => {
      const action = e.target.dataset.action;
      menu.remove();
      if (action === 'edit') this._openCardEdit(name);
      if (action === 'fav')  this._toggleFav(name);
      if (action === 'hide') this._hideCard(name);
    });

    const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  _showCardInfo(name, cardEl) {
    // 이미 이 카드 팝업이 열려있으면 그냥 유지
    const existing = document.querySelector('.card-info-popup');
    if (existing?.dataset.card === name) return;
    existing?.remove();

    const m = this._lMeta?.[name] ?? {};
    const popup = document.createElement('div');
    popup.className = 'card-info-popup';
    popup.dataset.card = name;

    const fields = [
      [this.t('card_meta_location'), m.location],
      [this.t('card_meta_asset'),    m.assetNo],
      [this.t('card_meta_manager'),  m.manager],
      [this.t('card_meta_note'),     m.note],
    ];
    const infoRows = fields.map(([lbl, val]) =>
      `<div class="ci-row">
        <span class="ci-field-lbl">${lbl}</span>
        <span class="ci-sep">:</span>
        <span class="ci-val${val ? '' : ' ci-empty-val'}">${val || '—'}</span>
      </div>`
    ).join('');

    const photoHTML = m.photo
      ? `<img class="ci-photo" src="${m.photo}" alt="">`
      : `<div class="ci-photo ci-photo-empty">사진 없음</div>`;

    popup.innerHTML = `
      <div class="ci-header">${this._lNames?.[name] ?? name}</div>
      ${photoHTML}
      <div class="ci-body">${infoRows}</div>
      <div class="ci-footer">
        <button class="ci-edit-btn">✏ ${this.t('card_edit_title')}</button>
      </div>`;

    // 1행 여부: 카드가 속한 .cards-grid 상단과의 BoundingClientRect 차이로 판별
    // (두 값 모두 같은 좌표계이므로 DPI/zoom에 무관하게 정확함)
    const _grid   = cardEl.closest('.cards-grid') || cardEl.parentElement;
    const _cardT  = cardEl.getBoundingClientRect().top;
    const _gridT  = _grid ? _grid.getBoundingClientRect().top : 0;
    const _isRow1 = (_cardT - _gridT) <= 8;

    document.body.appendChild(popup);
    popup.style.cssText = 'position:fixed;z-index:8000;';

    const _place = () => {
      if (!document.contains(popup)) return;
      const cr  = cardEl.getBoundingClientRect();
      const pw  = popup.offsetWidth;
      const ph  = popup.offsetHeight;
      const vw  = document.documentElement.clientWidth  || window.innerWidth;
      const vh  = document.documentElement.clientHeight || window.innerHeight;
      // getBoundingClientRect()와 clientWidth/Height의 단위가 같으면
      // 비율은 항상 정확하므로 DPI·배율·창 크기와 무관하게 올바른 위치에 배치됨
      const pwPct = pw / vw * 100;
      const phPct = ph / vh * 100;
      const topPct = _isRow1
        ? cr.bottom / vh * 100 + 0.4
        : cr.top    / vh * 100 - phPct - 0.4;
      const cardCxPct = (cr.left + cr.width / 2) / vw * 100;
      let leftPct = cardCxPct - pwPct / 2;
      if (leftPct < 0.5)          leftPct = 0.5;
      if (leftPct + pwPct > 99.5) leftPct = 99.5 - pwPct;
      popup.style.top  = `${topPct}%`;
      popup.style.left = `${leftPct}%`;
    };
    _place();
    requestAnimationFrame(() => requestAnimationFrame(_place));

    // 팝업 위에 마우스 있을 때 hover 타이머 취소
    popup.addEventListener('mouseenter', () => clearTimeout(this._cardHoverTimer));
    popup.addEventListener('mouseleave', () => {
      this._cardHoverTimer = setTimeout(() => popup.remove(), 150);
    });

    // 편집 버튼
    popup.querySelector('.ci-edit-btn').onclick = e => {
      e.stopPropagation();
      popup.remove();
      this._openCardEdit(name);
    };

    // 팝업 내 아무 곳 클릭 (편집 제외) → 닫기
    popup.addEventListener('click', e => {
      if (!e.target.closest('.ci-edit-btn')) popup.remove();
    });

    // 팝업 밖 클릭 → 닫기
    const closeOnOutside = e => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closeOnOutside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
  }

  _toggleFav(name) {
    if (this._lFavs.has(name)) this._lFavs.delete(name);
    else this._lFavs.add(name);
    this._saveConfig();
    this._buildLauncher();
  }

  _hideCard(name) {
    this._lHidden.add(name);
    this._saveConfig();
    this._buildLauncher();
  }

  _restoreAll() {
    this._lHidden.clear();
    this._saveConfig();
    this._buildLauncher();
  }

  goHome() {
    this.instr?.onDisconnect?.();
    if (this.serial.isConnected) this._doDisconnect();
    this.instr     = null;
    this.instrName = null;
    document.getElementById('launcher').hidden = false;
    document.getElementById('instrumentView').hidden = true;
    document.getElementById('deviceName').textContent = '';
    this._connBadge(false);
    this._buildLauncher();
    this._saveConfig();
  }

  // ── Instrument launch ──────────────────────────────────────────────────────
  launchInstrument(name) {
    const m = this._instruments[name];

    // Desktop-only tools: show info modal instead of launching
    if (m?.viewType === 'desktop-only') {
      const msg = (m.description || `${name}은(는) 데스크톱 앱에서만 실행 가능합니다.`).replace(/\n/g, '<br>');
      const pathLine = m.exePath ? `<br><br><b>실행 경로:</b><br><code style="font-size:11px;word-break:break-all">${m.exePath}</code>` : '';
      // Use a styled overlay modal instead of alert() to avoid blocking
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
      overlay.innerHTML = `<div style="background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:10px;padding:28px 32px;max-width:460px;width:90%;box-shadow:0 8px 32px #000a;font-family:inherit">
        <div style="font-size:15px;font-weight:600;margin-bottom:14px;color:#fff">🖥️ 데스크톱 전용 앱</div>
        <div style="font-size:13px;line-height:1.7;margin-bottom:18px">${msg}${pathLine}</div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:#555;color:#fff;border:none;border-radius:6px;padding:8px 22px;cursor:pointer;font-size:13px">확인</button>
      </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      return;
    }

    // Link tools: open the link in a new tab/browser and return (do not open instrument view)
    if (m?.viewType === 'link') {
      window.open(m.url, '_blank');
      return;
    }

    this.instrName = name;
    this.instr     = m;

    document.getElementById('launcher').hidden = true;
    document.getElementById('instrumentView').hidden = false;
    document.getElementById('deviceName').textContent = `(${name})`;
    this.sm.reset();
    this.count = 0;
    document.getElementById('syslogPanel')?.classList.remove('collapsed');
    const lt = document.getElementById('logToggle');
    if (lt) lt.textContent = '▼';

    if (this.instr.viewType === 'custom') {
      this._setupCustomView();
    } else {
      this._setupGridView();
    }
  }

  // ── Custom view (Agilent, DAQ, etc.) ──────────────────────────────────────
  _setupCustomView() {
    this.instr.buildSidebar(document.getElementById('sidebar'));
    this.instr.buildCenter(document.getElementById('center'));
    this.instr.buildRightPanel(document.getElementById('rightpanel'));
    this._updateCount();
    this._setDisplay('— — —', '', 'off', this.t('disconnected'));
    this.refreshPorts();
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  _setupGridView() {
    const cfg = this.instr;
    document.getElementById('sidebar').innerHTML = this._origSidebarHTML;
    this._applyLang();

    if (cfg.hideSplit)   document.getElementById('splitPanel')?.style.setProperty('display','none');
    if (cfg.hideAutoLog) document.getElementById('autoLogPanel')?.style.setProperty('display','none');

    const center = document.getElementById('center');
    center.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit"></span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${this.t('disconnected')}</span>
          <span class="meas-count">${this.t('meas_count_lbl')} <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="panel datalog-head-bar">
        <div class="panel-title" data-i18n="data_panel_title">${this.t('data_panel_title')}</div>
        <div class="datalog-actions">
          <button class="sbtn" onclick="app.copyData()" data-i18n="btn_copy">${this.t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.exportCSV()" data-i18n="btn_csv">${this.t('btn_csv')}</button>
          <button class="sbtn red" onclick="app.clearData()" data-i18n="btn_clear">${this.t('btn_clear')}</button>
        </div>
      </div>
      <div id="panelsContainer" class="panels-scroll"></div>`;

    document.getElementById('rightpanel').innerHTML = `
      <div class="panel grow">
        <div class="graph-head"><div class="panel-title" data-i18n="dist_panel_title">${this.t('dist_panel_title')}</div></div>
        <div class="graph-hint" data-i18n="chart_hint">${this.t('chart_hint')}</div>
        <div class="graph-area">
          <canvas id="mainChart"></canvas>
          <div class="graph-empty" id="chartEmpty" data-i18n="chart_empty">${this.t('chart_empty')}</div>
        </div>
        <div id="statsPanel" class="stats-area"></div>
      </div>`;
    this._chart = new BoxPlot(document.getElementById('mainChart'));
    this._chart.attachYControls(document.querySelector('#rightpanel .graph-area'));

    const area = document.getElementById('dynamicSettings');
    if (area) { area.innerHTML = ''; cfg.buildSettings?.(area); }

    this._updateCount();
    this._setDisplay('— — —', '', 'off', this.t('disconnected'));
    this.refreshPorts();

    const modes = cfg.useVL50Modes ? this.vl50Modes : this.testModes;
    const data  = cfg.useVL50Modes ? this.vl50Data  : this.masterData;
    this._buildPanels(1, modes, data);
  }

  // ── Serial port ────────────────────────────────────────────────────────────
  async refreshPorts() {
    const sel = document.getElementById('portSelect');
    if (!sel) return;

    // Preserve existing hardcoded options (like VISA addresses) if any
    const existingOpts = [];
    if (sel.options.length > 0 && !sel.dataset.usbReflected) {
      for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        if (opt.value && !opt.textContent.startsWith('Serial Port')) {
          existingOpts.push({ value: opt.value, text: opt.textContent, selected: opt.selected });
        }
      }
    }

    // 하드코딩 VISA 옵션이 있으면 빈 placeholder 삽입 안 함 (빈 항목 선택 → Web Serial 다이얼로그 팝업 방지)
    if (existingOpts.length === 0) {
      sel.innerHTML = '<option value="">-- Select Port --</option>';
    } else {
      sel.innerHTML = '';
    }
    if (existingOpts.length > 0) {
      existingOpts.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.text; opt.selected = o.selected;
        sel.appendChild(opt);
      });
    }

    // 1) Fetch VISA devices from local backend server
    try {
      const resp = await fetch('/api/visa/list');
      const data = await resp.json();
      if (data) {
        if (data.success && data.resources) {
          data.resources.forEach(addr => {
            let exists = false;
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === addr) { exists = true; break; }
            }
            if (!exists) {
              const opt = document.createElement('option');
              opt.value = addr; opt.textContent = addr;
              sel.appendChild(opt);
            }
          });
        } else if (data.error) {
          this.log(`[VISA Error] ${data.error}`, 'err');
        }
      }
    } catch (_) {}

    // 2) Fetch standard Web Serial ports
    if (!navigator.serial) return;
    try {
      const ports = await navigator.serial.getPorts();
      ports.forEach((_, i) => {
        const val = String(i);
        let exists = false;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === val) { exists = true; break; }
        }
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = val; opt.textContent = `Serial Port ${i+1}`;
          sel.appendChild(opt);
        }
      });
    } catch (_) {}
  }

  async toggleConnection() {
    if (this.serial.isConnected) await this._doDisconnect();
    else await this._doConnect();
  }

  async _doConnect() {
    if (!this.instr) return;
    const sel = document.getElementById('portSelect');
    let selectedPortValue = sel ? sel.value : '';
    // 빈 값이면 첫 번째 유효 옵션 자동 선택 (VISA 주소 드롭다운에서 빈 항목이 선택된 경우 방어)
    if (!selectedPortValue && sel) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value) { selectedPortValue = sel.options[i].value; sel.selectedIndex = i; break; }
      }
    }
    const isVisa = selectedPortValue.includes('::') || selectedPortValue.startsWith('USB') || selectedPortValue.startsWith('GPIB');

    if (isVisa) {
      try {
        this.log(`Connecting to ${this.instrName} via VISA (${selectedPortValue})…`);
        const resp = await fetch('/api/visa/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: selectedPortValue })
        });
        if (!resp.ok || resp.headers.get('content-type')?.includes('text/html')) {
          throw new Error('VISA 서버에 연결할 수 없습니다. EXE를 실행하거나 server.py를 먼저 시작하세요.');
        }
        const data = await resp.json();
        if (!data || !data.success) {
          throw new Error(data.error || 'Failed to connect via VISA');
        }
        this.serial.isVisa = true;
        this.serial.visaAddress = selectedPortValue;
        this.serial.isConnected = true;

        this._setBtnState(true);
        this._connBadge(true);
        this._setDisplay('— — —', '', 'ready', 'READY');
        this.log(`Connected to ${this.instrName} (VISA).`, 'ok');
        this.instr.onConnect?.();
        if (this.instr.pollCmd) this._startPolling(this.instr);
      } catch (e) {
        this.log(`[ERR] ${e.message}`, 'err');
        const el = document.getElementById('connStatus');
        if (el) { el.className = 'conn-status-lbl err'; el.textContent = this.t('status_failed'); }
      }
      return;
    }

    if (!navigator.serial) { alert(this.t('web_serial_unsupported')); return; }
    try {
      this.log(`Connecting to ${this.instrName}…`);
      await this.serial.connect(this.instr.serial);
      this._setBtnState(true);
      this._connBadge(true);
      this._setDisplay('— — —', '', 'ready', 'READY');
      this._reflectUsbAddress();
      this.log(`Connected to ${this.instrName}.`, 'ok');
      this.instr.onConnect?.();
      if (this.instr.pollCmd) this._startPolling(this.instr);
    } catch (e) {
      this.log(`[ERR] ${e.message}`, 'err');
      const msg = (e.message || '').toLowerCase();
      if (e.name === 'NotFoundError') {
        this.log('포트를 선택하지 않았습니다. 목록에서 장비 포트를 선택하세요.', 'err');
      } else if (msg.includes('failed to open') || msg.includes('open')) {
        this.log('⚠ 포트를 열 수 없습니다. 대개 포트가 이미 사용 중입니다:', 'err');
        this.log('  1) 다른 브라우저 탭에서 같은 장비가 연결돼 있으면 그 탭을 닫으세요 (포트는 한 탭만 사용 가능).', 'err');
        this.log('  2) 데스크톱 프로그램(.exe)·PuTTY 등 다른 프로그램이 포트를 쓰고 있으면 종료하세요.', 'err');
        this.log('  3) USB-시리얼 케이블을 뽑았다 다시 꽂은 뒤 재시도하세요.', 'err');
        this.log('  4) 연결 시 팝업에서 올바른 COM 포트(장비)를 선택했는지 확인하세요.', 'err');
      }
      const el = document.getElementById('connStatus');
      if (el) { el.className = 'conn-status-lbl err'; el.textContent = this.t('status_failed'); }
    }
  }

  async _doDisconnect() {
    clearInterval(this.pollTimer); this.pollTimer = null;
    if (this.serial.isVisa) {
      try {
        await fetch('/api/visa/disconnect', { method: 'POST' });
      } catch (_) {}
      this.serial.isVisa = false;
      this.serial.visaAddress = '';
      this.serial.isConnected = false;
    } else {
      await this.serial.disconnect();
    }
    this._setBtnState(false);
    this._connBadge(false);
    this.sm.reset();
    this._setDisplay('— — —', '', 'off', this.t('disconnected'));
    this._resetUsbAddress();
    this.log('Disconnected.');
  }

  // ── Reflect the actually-connected device's USB address ───────────────────
  // The DAQ-6510 sidebar ships with two hard-coded sample VISA address strings
  // (different unit serial numbers) which do NOT match whatever instrument the
  // user actually plugs in, and Web Serial connects via the browser's native
  // port picker — the dropdown selection is never used to choose the port.
  // Once connected, ask the OS-level USB info Web Serial *does* expose
  // (vendor/product ID via port.getInfo()) and show the real address instead.
  _reflectUsbAddress() {
    try {
      const info = this.serial.port?.getInfo?.();
      if (!info || (info.usbVendorId == null && info.usbProductId == null)) return;
      const hex = (n) => (n ?? 0).toString(16).toUpperCase().padStart(4, '0');
      const addr = `USB::0x${hex(info.usbVendorId)}::0x${hex(info.usbProductId)}::INSTR`;
      const sel = document.getElementById('portSelect');
      if (sel) {
        sel.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = addr; opt.textContent = addr; opt.selected = true;
        sel.appendChild(opt);
        sel.dataset.usbReflected = '1';
      }
      const st = document.getElementById('connStatus');
      if (st) st.textContent = `${this.t('status_connected')}  (${addr})`;
      this.log(`Connected device USB address: ${addr}`, 'ok');
    } catch (_) { /* getInfo() not supported by this browser/port — ignore */ }
  }

  _resetUsbAddress() {
    const sel = document.getElementById('portSelect');
    if (sel && sel.options.length && sel.dataset.usbReflected) {
      sel.innerHTML = '';
      delete sel.dataset.usbReflected;
      this.refreshPorts();
    }
  }

  _setBtnState(connected) {
    const btn = document.getElementById('btnConnect');
    if (btn) {
      btn.textContent = connected ? this.t('disconn_btn') : this.t('conn_btn');
      btn.className   = connected ? 'big-btn danger' : 'big-btn';
    }
    const st = document.getElementById('connStatus');
    if (st) {
      st.textContent = connected ? this.t('status_connected') : this.t('status_disconnected');
      st.className   = connected ? 'conn-status-lbl ok' : 'conn-status-lbl';
    }
  }

  _connBadge(on) {
    document.getElementById('connDot').className   = `conn-dot ${on ? 'on' : 'off'}`;
    document.getElementById('connText').textContent = on ? this.t('connected') : this.t('disconnected');
  }

  // ── Polling ────────────────────────────────────────────────────────────────
  _startPolling(cfg) {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.serial.isConnected) this.serial.sendCmd(cfg.pollCmd);
    }, cfg.pollInterval);
  }

  _onLine(line) {
    if (!this.instr) return;
    // Custom instruments handle their own line parsing
    if (this.instr.onLine) {
      this.instr.onLine(line);
      return;
    }
    // Grid instruments: use parseValue + state machine
    const res = this.instr.parseValue?.(line);
    if (!res) return;
    this.currentFmt = `${res.fmt}${res.unit ? ' ' + res.unit : ''}`;
    this._setDisplay(res.fmt, res.unit || '');
    if (!this.instr.noAutoLog) {
      this.sm.update(res.valid, res.value ?? 0, res.fmt);
    }
  }

  // ── State machine callbacks ────────────────────────────────────────────────
  _onStateChange(s) {
    const map = {
      'WAIT_FOR_CONTACT': ['ready',       'READY'],
      'STABILIZING':      ['stabilizing', 'STABILIZING'],
      'WAIT_FOR_OPEN':    ['wait-open',   'WAIT OPEN'],
    };
    const [cls, lbl] = map[s] || ['off', s];
    const el = document.getElementById('liveStatus');
    if (el) { el.className = `disp-status ${cls}`; el.textContent = lbl; }
  }

  _onLogTriggered(value, fmt) {
    this.log(`Auto-log: ${fmt}`, 'ok');
    this._captureValue(fmt.split(' ')[0]);
  }

  // ── Grid interaction ───────────────────────────────────────────────────────
  onEnterPressed() {
    if (this.serial.isConnected) {
      const clean = this.currentFmt.split(' ')[0];
      const bad = ['---','Over','Current','Cmd'];
      if (clean && !bad.some(x => clean.startsWith(x))) {
        this._captureValue(clean); return;
      }
    }
    this.panels[this.activePanelIdx]?.grid.moveNext();
  }

  _captureValue(val) {
    const p = this.panels[this.activePanelIdx];
    if (!p) return;
    const { focusR: r, focusC: c } = p.grid;
    p.grid.setValue(r, c, val);
    p.grid.moveNext();
    this.count++;
    this._updateCount();
    this._redrawChart();
  }

  setWaitTime(v) { this.sm.waitTime = isNaN(v) ? 2.0 : Math.max(0.1, v); }

  // ── Split ──────────────────────────────────────────────────────────────────
  setSplit(n) {
    if (this.instr?.viewType !== 'grid') return;
    document.getElementById('splitToggle')?.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === n);
    });
    this._savePanelData();
    const modes = this.instr.useVL50Modes ? this.vl50Modes : this.testModes;
    const data  = this.instr.useVL50Modes ? this.vl50Data  : this.masterData;
    this._buildPanels(n, modes, data);
  }

  _buildPanels(n, modes, data) {
    this.splitCount = n;

    // Right panel multi-chart build
    const rightpanel = document.getElementById('rightpanel');
    if (rightpanel) {
      rightpanel.innerHTML = '';
      this._charts = [];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px; height:100%; width:100%;';

      for (let i = 0; i < n; i++) {
        const chartPanel = document.createElement('div');
        chartPanel.className = 'panel grow';
        chartPanel.style.flex = `${1/n}`;
        chartPanel.style.display = 'flex';
        chartPanel.style.flexDirection = 'column';
        chartPanel.style.minHeight = '0';

        const titleText = n > 1 ? `📊 ${this.t('panel_prefix') || 'PANEL'} ${i+1} ${this.t('dist_panel_title') || '데이터 분포'}` : `📊 ${this.t('dist_panel_title') || '데이터 분포'}`;
        const hintText = this.t('chart_hint') || '현재 패널의 측정값 분포를 표시합니다.';

        chartPanel.innerHTML = `
          <div class="graph-head">
            <div class="panel-title">${titleText}</div>
          </div>
          <div class="graph-hint" style="font-size:11px; margin-bottom:4px;">${hintText}</div>
          <div class="graph-area" style="flex:1; min-height:0; position:relative;">
            <canvas id="mainChart_${i}" style="width:100%; height:100%; display:block;"></canvas>
            <div class="graph-empty" id="chartEmpty_${i}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">측정 데이터가 없습니다</div>
          </div>
          <div id="statsPanel_${i}" class="stats-area" style="margin-top:6px;"></div>
        `;
        wrap.appendChild(chartPanel);
      }
      rightpanel.appendChild(wrap);

      for (let i = 0; i < n; i++) {
        const canvas = document.getElementById(`mainChart_${i}`);
        const emptyEl = document.getElementById(`chartEmpty_${i}`);
        const statsEl = document.getElementById(`statsPanel_${i}`);
        const bp = new BoxPlot(canvas, emptyEl, statsEl);
        bp.attachYControls(wrap.children[i].querySelector('.graph-area'));
        this._charts.push(bp);
      }
    }

    const cont = document.getElementById('panelsContainer');
    cont.innerHTML = '';
    this.panels = [];
    const modeKeys = Object.keys(modes);

    // No grid group input displayed in grid view header

    for (let i = 0; i < n; i++) {
      const modeKey = modeKeys[i % modeKeys.length];

      const panelEl = document.createElement('div');
      panelEl.className = 'inst-panel';
      panelEl.style.flex = `${1/n}`;

      const hdr = document.createElement('div');
      hdr.className = 'panel-hdr';

      const lbl = document.createElement('span');
      lbl.className = 'panel-lbl';
      lbl.textContent = `${this.t('panel_prefix')} ${i+1}`;

      const modeSel = document.createElement('select');
      modeSel.className = 'mode-select';
      Object.keys(modes).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        if (k === modeKey) opt.selected = true;
        modeSel.appendChild(opt);
      });

      hdr.appendChild(lbl); hdr.appendChild(modeSel);

      // No group input in panel headers

      panelEl.appendChild(hdr);

      const gridHost = document.createElement('div');
      gridHost.style.cssText = 'flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;';
      panelEl.appendChild(gridHost);
      cont.appendChild(panelEl);

      const grid = new EditableGrid(gridHost, i);
      grid.onFocusChange = pi => { this.activePanelIdx = pi; };
      grid.onDataChange  = () => this._redrawChart();
      grid.build(modes[modeKey], data[modeKey] || []);

      // No grid group inputs to initialize

      const panelObj = { modeKey, grid };
      this.panels.push(panelObj);

      modeSel.onchange = () => {
        const k = modeSel.value;
        this._savePanelData(i);
        panelObj.modeKey = k;
        grid.build(modes[k], data[k] || []);
        // No grid group inputs to update
        this._redrawChart();
      };
    }
    this._redrawChart();
  }

  _redrawChart() {
    if (!this._charts || this._charts.length === 0) return;
    this.panels.forEach((p, idx) => {
      const chart = this._charts[idx];
      if (chart && p && p.grid) {
        requestAnimationFrame(() => chart.draw(p.grid, p.grid.set));
      }
    });
  }

  _savePanelData(idx) {
    const master = this.instr?.useVL50Modes ? this.vl50Data : this.masterData;
    if (idx !== undefined) {
      const p = this.panels[idx];
      if (p) master[p.modeKey] = p.grid.getData();
    } else {
      this.panels.forEach(p => { master[p.modeKey] = p.grid.getData(); });
    }
  }

  updateGridGroup(panelIdx, val) {
    const p = this.panels[panelIdx];
    if (!p) return;
    const groupVal = parseInt(val) || 0;
    p.grid.group = groupVal;
    if (p.grid.set > 0 && groupVal > 0) {
      p.grid.set = groupVal;
    }
    p.grid._render();

    const modes = this.instr?.useVL50Modes ? this.vl50Modes : this.testModes;
    if (modes && modes[p.modeKey]) {
      modes[p.modeKey].group = groupVal;
      if (modes[p.modeKey].set > 0 && groupVal > 0) {
        modes[p.modeKey].set = groupVal;
      }
      this._saveConfig();
    }
  }

  // ── Toolbar (grid) ─────────────────────────────────────────────────────────
  copyData() {
    const lines = [];
    this.panels.forEach((p, i) => {
      if (this.panels.length > 1) lines.push(`=== Panel ${i+1} ===`);
      p.grid.getData().forEach(row => lines.push(row.join('\t')));
    });
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => this.log(this.t('clipboard_ok'), 'ok'));
  }

  exportCSV() {
    const rows = [];
    this.panels.forEach((p, pi) => {
      if (this.panels.length > 1) rows.push([`=== Panel ${pi+1} ===`]);
      rows.push(['No.', ...p.grid.cols]);
      p.grid.getData().forEach((row, ri) => rows.push([ri+1, ...row]));
      rows.push([]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })),
      download: `3M_${this.instrName}_${_dateStr()}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
    this.log(this.t('csv_ok'), 'ok');
  }

  clearData() {
    if (!confirm(this.t('alert_confirm_clear'))) return;
    const modes  = this.instr?.useVL50Modes ? this.vl50Modes : this.testModes;
    const master = this.instr?.useVL50Modes ? this.vl50Data  : this.masterData;
    this.panels.forEach(p => {
      master[p.modeKey] = [];
      p.grid.build(modes[p.modeKey], []);
    });
    this.count = 0; this._updateCount();
    this._redrawChart();
    this.log('Data cleared.');
  }

  // ── Test manager ───────────────────────────────────────────────────────────
  openTestManager() {
    const sel = document.getElementById('mgr_del');
    sel.innerHTML = '';
    Object.keys(this.testModes).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k + (DEFAULT_KEYS.has(k) ? ` (${this.t('test_name_label')||'default'})` : '');
      sel.appendChild(opt);
    });
    document.getElementById('testManagerModal').style.display = 'flex';
  }
  closeTestManager() { document.getElementById('testManagerModal').style.display = 'none'; }

  addTestMode() {
    const name  = document.getElementById('mgr_name').value.trim();
    const total = parseInt(document.getElementById('mgr_total').value);
    const group = parseInt(document.getElementById('mgr_group').value) || 0;
    const set   = parseInt(document.getElementById('mgr_set').value)   || total;
    if (!name)               return alert(this.t('alert_enter_name'));
    if (this.testModes[name]) return alert(this.t('alert_dup_name'));
    if (isNaN(total) || total < 1) return alert(this.t('alert_min_cells'));
    const cols = group > 0
      ? Array.from({length: total}, (_, i) => String((i % group) + 1))
      : Array.from({length: total}, (_, i) => String(i + 1));
    this.testModes[name] = { cols, group, set };
    this.masterData[name] = [];
    this._saveConfig();
    this.openTestManager();
    document.getElementById('mgr_name').value = '';
    this.log(`'${name}' 추가됨.`, 'ok');
  }

  deleteTestMode() {
    const name = document.getElementById('mgr_del').value;
    if (DEFAULT_KEYS.has(name)) return alert(this.t('alert_del_default'));
    if (!confirm(`'${name}' ${this.t('btn_delete')}?`)) return;
    delete this.testModes[name]; delete this.masterData[name];
    this._saveConfig();
    this.openTestManager();
  }

  // ── System log ────────────────────────────────────────────────────────────
  toggleLog() {
    const panel = document.getElementById('syslogPanel');
    const btn   = document.getElementById('logToggle');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    if (btn) btn.textContent = collapsed ? '▲' : '▼';
  }

  log(msg, type = '') {
    const box = document.getElementById('sysLog');
    if (!box) return;
    const ts  = new Date().toTimeString().slice(0, 8);
    const div = document.createElement('div');
    div.className = type ? `log-${type}` : '';
    div.textContent = `[${ts}] ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _setDisplay(val, unit, statusCls, statusText) {
    const lv = document.getElementById('liveValue');
    const lu = document.getElementById('liveUnit');
    const ls = document.getElementById('liveStatus');
    if (lv) lv.textContent = val;
    if (lu && unit !== undefined) lu.textContent = unit ? ` ${unit}` : '';
    if (ls && statusCls !== undefined) {
      ls.className   = `disp-status ${statusCls}`;
      ls.textContent = statusText;
    }
  }

  _updateCount() {
    const el = document.getElementById('measCount');
    if (el) el.textContent = this.count;
  }
}

function _dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export { App, _dateStr };

