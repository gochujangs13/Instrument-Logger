// Epson PRIFIA OK900P — Web Label Studio (360 DPI Interactive WYSIWYG Editor & Direct Print)
import { drawCode128, drawQRCode } from './epson_ok900p_barcode.js';

// ── i18n 번역 사전 (한국어 / English) ──────────────────────────────────────────
const I18N = {
  ko: {
    print_panel_title: '라벨 출력 (Print)',
    printer_select_lbl: '프린터 선택:',
    printer_searching: '프린터 검색 중...',
    printer_refresh_tip: '프린터 목록 새로고침',
    copies_lbl: '인쇄 매수:',
    print_btn: '🖨️ 라벨 인쇄 (Print)',
    preview_btn: '👁️ 360 DPI 비트맵 미리보기 / 저장',
    rendering_toast: '360 DPI 1비트 렌더링 후 프린터로 전송 중...',
    toast_done: '인쇄 완료: {msg}',
    toast_fail: '인쇄 실패: {msg}',
    tape_spec_title: '📐 테이프 규격 설정',
    tape_width_lbl: '테이프 폭 (mm):',
    length_mode_lbl: '길이 모드:',
    mode_auto: '자동',
    mode_fixed: '고정',
    fixed_length_lbl: '고정 길이(mm):',
    margin_lbl: '여백:',
    margin_min: '2mm',
    margin_std: '8mm',
    margin_wide: '12mm',
    margin_custom_lbl: '여백 직접 설정 (mm):',
    cutter_lbl: '커터 옵션:',
    cut_full: '완전 절단',
    cut_half: '하프 커팅',
    cut_none: '절단 없음',
    insert_title: '➕ 요소 추가 (Insert)',
    ins_text: '✏️ 텍스트',
    ins_barcode: '🏁 1D 바코드',
    ins_qr: '📱 2D QR코드',
    ins_serial: '🔢 일련번호',
    ins_image: '🖼️ 이미지 삽입',
    preset_title: '📋 샘플 템플릿 불러오기',
    preset_asset: '🏷️ 장비 자산 관리 태그 (24mm)',
    preset_chem: '🧪 시약 / 샘플 바이알 (12mm)',
    preset_warn: '⚠️ 경고 & 보관함 표지 (36mm)',
    zoom_lbl: '줌:',
    tape_bg_lbl: '배경:',
    bg_white: '흰색 (White)',
    bg_yellow: '노란색 (Yellow)',
    bg_silver: '은색 (Silver)',
    bg_red: '빨간색 (Red)',
    bg_blue: '파란색 (Blue)',
    bg_dark: '투명/어두움',
    center_all_h_btn: '↔ 대칭 중앙',
    center_h_btn: '↔ 가로',
    center_v_btn: '↕ 세로',
    multi_selected: '{count}개 요소 선택됨',
    multi_hint: '캔버스 빈 곳에서 드래그해 여러 요소를 선택할 수 있습니다.',
    multi_text_size: '글자 크기(pt)',
    multi_center: '가운데 정렬',
    multi_rotation: '회전각도(°)',
    multi_delete: '선택 항목 삭제',
    undo_btn: '↶ 되돌리기',
    undo_tip: '이전 편집 상태로 되돌리기 (Ctrl+Z)',
    delete_btn: '🗑️ 삭제',
    autofit_btn: '📐 크기 자동맞춤',
    print_area_lbl: '인쇄 영역:',
    batch_title: '대량 연속 인쇄 시트 (Batch Data Sheet)',
    batch_loaded: '건 로드됨',
    collapse_btn: '▼ 접기',
    expand_btn: '▲ 펼치기',
    batch_target_lbl: '바인딩 대상 요소:',
    csv_load_btn: '📁 CSV 불러오기',
    paste_excel_btn: '📋 엑셀 붙여넣기',
    clear_btn: '✕ 지우기',
    batch_start_btn: '⚡ 일괄 대량 연속 인쇄 시작',
    th_num: '#',
    th_col1: '열 1 (Col 1)',
    th_col2: '열 2 (Col 2)',
    th_col3: '열 3 (Col 3)',
    no_selection: '선택된 요소 없음',
    no_sel_desc: '캔버스 위의 텍스트나 바코드를 클릭하면<br>세부 속성을 이곳에서 실시간 편집할 수 있습니다.',
    add_text_btn: '➕ 텍스트 추가',
    add_bc_btn: '➕ 1D 바코드 추가',
    add_qr_btn: '➕ 2D QR코드 추가',
    prop_header: '{type} 속성',
    del_prop_btn: '삭제',
    pos_size_title: '위치 및 크기 (mm)',
    pos_x: 'X (가로):',
    pos_y: 'Y (세로):',
    size_w: '너비(W):',
    size_h: '높이(H):',
    rotation_lbl: '회전 각도:',
    text_content_title: '텍스트 내용',
    font_lbl: '글꼴:',
    size_lbl: '크기(pt):',
    serial_title: '🔢 시리얼 카운터 ({SN})',
    serial_start_lbl: '시작값:',
    serial_end_lbl: '종료값:',
    serial_step_lbl: '증가폭:',
    serial_pad_lbl: '자릿수:',
    serial_hint: '텍스트 내 {SN} 태그가 번호로 자동 치환됩니다.',
    serial_example: '출력 예시: {values} · 총 {count}장',
    serial_range_invalid: '종료값은 시작값보다 크거나 같아야 합니다.',
    serial_range_too_large: '시리얼 인쇄는 한 번에 최대 999개 번호까지 가능합니다.',
    bc_data_title: '1D 바코드 데이터',
    bc_type_lbl: '종류:',
    bc_show_text_lbl: '하단 숫자/텍스트 표기',
    qr_data_title: '2D QR 코드 데이터 (URL / 텍스트)',
    duplicate_btn: '📋 복제',
    delete_elem_btn: '🗑️ 삭제',
    preview_modal_title: '👁️ 360 DPI 1-Bit 비트맵 최종 출력 미리보기',
    preview_spec: '해상도: 360 DPI ({w} × {h} px) | 테이프: {tw}mm × {len}mm | 모드: 1-Bit Monochrome',
    png_download_btn: '💾 PNG 다운로드',
    direct_print_btn: '🖨️ 바로 인쇄',
    close_btn: '닫기',
    batch_empty_alert: '배치 시트에 데이터가 없습니다.',
    batch_confirm_msg: '총 {count}개의 라벨을 \'{printer}\'로 연속 인쇄하시겠습니까?',
    batch_complete_msg: '대량 연속 인쇄 완료: 총 {total}건 중 {success}건 전송되었습니다.',
    driver_not_found: 'OK900P 드라이버 미인식',
    driver_not_found_desc: '시스템에 EPSON OK900P 프린터 드라이버가 감지되지 않았습니다. 다른 PC에서 사용하려면 최초 1회 드라이버 설치가 필요합니다.',
    driver_install_btn: '📥 드라이버 원클릭 설치',
    driver_folder_btn: '📂 드라이버 폴더 열기',
    driver_download_btn: '💾 드라이버 ZIP 다운로드',
    driver_manage_tip: '프린터 드라이버 설치 및 관리',
    driver_detected_ok: 'EPSON OK900P 정상 연결됨',
    driver_settings_btn: '관리',
    driver_modal_title: '🛠️ EPSON OK900P 프린터 드라이버 관리',
    driver_modal_desc: '다른 PC에서 OK900P를 사용하려면 아래 방법 중 하나로 드라이버를 설치하세요.',
    driver_method1_title: '방법 1: 원클릭 자동 설치 (권장)',
    driver_method1_desc: '관리자 권한으로 pnputil 스풀러 등록 스크립트를 즉시 실행합니다.',
    driver_method2_title: '방법 2: 공식 드라이버 마법사 (dinst64)',
    driver_method2_desc: 'EPSON 공식 드라이버 설치 마법사 창을 엽니다.',
    driver_method3_title: '방법 3: 드라이버 폴더 열기 / 다운로드',
    driver_method3_desc: '드라이버 파일(INF, CAT, DLL)이 담긴 폴더를 직접 열거나 ZIP 파일로 다운로드합니다.',
    driver_launch_success: '드라이버 설치 마법사가 실행되었습니다. 화면의 관리자 권한(UAC) 승인 창을 확인해주세요.',
    driver_launch_fail: '드라이버 설치 실행 실패: {err}'
  },
  en: {
    print_panel_title: 'Label Print',
    printer_select_lbl: 'Printer:',
    printer_searching: 'Searching printers...',
    printer_refresh_tip: 'Refresh printer list',
    copies_lbl: 'Copies:',
    print_btn: '🖨️ Print Label',
    preview_btn: '👁️ 360 DPI Bitmap Preview / Save',
    rendering_toast: 'Rendering 360 DPI 1-bit bitmap and sending to printer...',
    toast_done: 'Print complete: {msg}',
    toast_fail: 'Print failed: {msg}',
    tape_spec_title: '📐 Tape Specifications',
    tape_width_lbl: 'Tape Width (mm):',
    length_mode_lbl: 'Length Mode:',
    mode_auto: 'Auto',
    mode_fixed: 'Fixed',
    fixed_length_lbl: 'Fixed Length (mm):',
    margin_lbl: 'Margins:',
    margin_min: '2mm',
    margin_std: '8mm',
    margin_wide: '12mm',
    margin_custom_lbl: 'Custom Margin (mm):',
    cutter_lbl: 'Cutter Option:',
    cut_full: 'Full Cut',
    cut_half: 'Half Cut',
    cut_none: 'No Cut',
    insert_title: '➕ Insert Element',
    ins_text: '✏️ Text',
    ins_barcode: '🏁 1D Barcode',
    ins_qr: '📱 2D QR Code',
    ins_serial: '🔢 Serial No.',
    ins_image: '🖼️ Insert Image',
    preset_title: '📋 Sample Presets',
    preset_asset: '🏷️ Equipment Asset Tag (24mm)',
    preset_chem: '🧪 Chemical / Sample Vial (12mm)',
    preset_warn: '⚠️ Warning / Storage Sign (36mm)',
    zoom_lbl: 'Zoom:',
    tape_bg_lbl: 'Background:',
    bg_white: 'White',
    bg_yellow: 'Yellow',
    bg_silver: 'Silver',
    bg_red: 'Red',
    bg_blue: 'Blue',
    bg_dark: 'Clear / Dark',
    center_all_h_btn: '↔ Sym Center',
    center_h_btn: '↔ Center H',
    center_v_btn: '↕ Center V',
    multi_selected: '{count} Elements Selected',
    multi_hint: 'Drag on empty canvas space to select multiple elements.',
    multi_text_size: 'Text Size (pt)',
    multi_center: 'Center Align',
    multi_rotation: 'Rotation (°)',
    multi_delete: 'Delete Selected',
    undo_btn: '↶ Undo',
    undo_tip: 'Undo the previous edit (Ctrl+Z)',
    delete_btn: '🗑️ Delete',
    autofit_btn: '📐 Auto-fit Size',
    print_area_lbl: 'Printable Area:',
    batch_title: 'Batch Data Sheet',
    batch_loaded: 'rows loaded',
    collapse_btn: '▼ Collapse',
    expand_btn: '▲ Expand',
    batch_target_lbl: 'Target Element:',
    csv_load_btn: '📁 Load CSV',
    paste_excel_btn: '📋 Paste from Excel',
    clear_btn: '✕ Clear',
    batch_start_btn: '⚡ Start Batch Print',
    th_num: '#',
    th_col1: 'Col 1 (Text Replace)',
    th_col2: 'Col 2',
    th_col3: 'Col 3',
    no_selection: 'No Element Selected',
    no_sel_desc: 'Click any text or barcode on the canvas<br>to inspect and edit properties in real time.',
    add_text_btn: '➕ Add Text',
    add_bc_btn: '➕ Add 1D Barcode',
    add_qr_btn: '➕ Add 2D QR Code',
    prop_header: '{type} Properties',
    del_prop_btn: 'Delete',
    pos_size_title: 'Position & Size (mm)',
    pos_x: 'X (Horizontal):',
    pos_y: 'Y (Vertical):',
    size_w: 'Width (W):',
    size_h: 'Height (H):',
    rotation_lbl: 'Rotation:',
    text_content_title: 'Text Content',
    font_lbl: 'Font:',
    size_lbl: 'Size (pt):',
    serial_title: '🔢 Serial Counter ({SN})',
    serial_start_lbl: 'Start:',
    serial_end_lbl: 'End:',
    serial_step_lbl: 'Step:',
    serial_pad_lbl: 'Digits:',
    serial_hint: '{SN} in text will be automatically replaced with numbers.',
    serial_example: 'Print example: {values} · {count} labels',
    serial_range_invalid: 'End value must be greater than or equal to start value.',
    serial_range_too_large: 'Serial printing is limited to 999 numbers per run.',
    bc_data_title: '1D Barcode Data',
    bc_type_lbl: 'Type:',
    bc_show_text_lbl: 'Show text below barcode',
    qr_data_title: '2D QR Code Data (URL / Text)',
    duplicate_btn: '📋 Duplicate',
    delete_elem_btn: '🗑️ Delete',
    preview_modal_title: '👁️ 360 DPI 1-Bit Bitmap Print Preview',
    preview_spec: 'Resolution: 360 DPI ({w} × {h} px) | Tape: {tw}mm × {len}mm | Mode: 1-Bit Monochrome',
    png_download_btn: '💾 Download PNG',
    direct_print_btn: '🖨️ Print Now',
    close_btn: 'Close',
    batch_empty_alert: 'No data in batch sheet.',
    batch_confirm_msg: 'Print {count} labels sequentially to \'{printer}\'?',
    batch_complete_msg: 'Batch printing complete: {success} of {total} jobs sent successfully.',
    driver_not_found: 'OK900P Driver Not Detected',
    driver_not_found_desc: 'EPSON OK900P printer driver is not detected on this system. A one-time driver installation is required.',
    driver_install_btn: '📥 One-Click Install Driver',
    driver_folder_btn: '📂 Open Driver Folder',
    driver_download_btn: '💾 Download Driver ZIP',
    driver_manage_tip: 'Printer driver installation & management',
    driver_detected_ok: 'EPSON OK900P Connected',
    driver_settings_btn: 'Manage',
    driver_modal_title: '🛠️ EPSON OK900P Driver Management',
    driver_modal_desc: 'To use OK900P on other PCs, install the driver using one of the methods below.',
    driver_method1_title: 'Method 1: One-Click Auto Install (Recommended)',
    driver_method1_desc: 'Installs the driver package into Windows Spooler and DriverStore.',
    driver_method2_title: 'Method 2: Official Epson Setup Wizard (dinst64)',
    driver_method2_desc: 'Opens Epson official driver setup wizard.',
    driver_method3_title: 'Method 3: Open Folder / Download ZIP',
    driver_method3_desc: 'Open local driver folder containing INF/CAT/DLL files or download ZIP.',
    driver_launch_success: 'Driver installer launched. Please accept the UAC administrator prompt on your screen.',
    driver_launch_fail: 'Failed to launch driver installer: {err}'
  }
};

const t = k => {
  const l = (window.app?.lang === 'en') ? 'en' : 'ko';
  return I18N[l]?.[k] ?? I18N.ko?.[k] ?? k;
};
const tf = (k, repl) => Object.entries(repl).reduce((s, [p, v]) => s.replaceAll(`{${p}}`, v), t(k));


// ── 테이프 규격 상수 ─────────────────────────────────────────────────────────
const TAPE_SPECS = {
  4.0:  { maxPrint: 2.0,  sideMargin: 1.0,  minLead: 2.0, stdLead: 10.0 },
  6.0:  { maxPrint: 4.0,  sideMargin: 1.0,  minLead: 2.0, stdLead: 10.0 },
  9.0:  { maxPrint: 6.5,  sideMargin: 1.25, minLead: 2.0, stdLead: 10.0 },
  12.0: { maxPrint: 9.0,  sideMargin: 1.5,  minLead: 2.0, stdLead: 10.0 },
  18.0: { maxPrint: 14.0, sideMargin: 2.0,  minLead: 2.0, stdLead: 10.0 },
  24.0: { maxPrint: 18.5, sideMargin: 2.75, minLead: 2.0, stdLead: 10.0 },
  36.0: { maxPrint: 27.1, sideMargin: 4.45, minLead: 2.0, stdLead: 10.0 },
};

// ── 에디터 전역 상태 ─────────────────────────────────────────────────────────
let S = null;

function init() {
  S = {
    tapeWidth: 24.0,
    lengthMode: 'auto',       // 'auto' | 'fixed'
    fixedLength: 70.0,
    marginMode: 'standard',   // 'minimum' (2mm) | 'standard' (8mm) | 'wide' (12mm) | 'custom'
    marginMm: 8.0,            // 물리 여백 mm (기본 8.0mm)
    cutterMode: 'full',       // 'full' | 'half' | 'none'
    orientation: 'horizontal',// 'horizontal' | 'vertical'
    tapeColor: '#ffffff',
    zoom: 1.0,                // fixed viewer scale; physical print size is unchanged
    elements: [
      {
        id: 'elem_title',
        type: 'text',
        x: 6.5, y: 5.2, w: 38.0, h: 5.0,
        text: 'EQUIPMENT ASSET TAG',
        font: 'Arial', size: 9, bold: true, italic: false, underline: false,
        align: 'left', rotation: 0,
        isSerial: false, serialStart: 1, serialEnd: 1, serialStep: 1, serialPad: 3
      },
      {
        id: 'elem_sn',
        type: 'text',
        x: 6.5, y: 12.0, w: 38.0, h: 6.8,
        text: 'ID: EP-OK900P-{SN}',
        font: 'Arial', size: 11, bold: true, italic: false, underline: false,
        align: 'left', rotation: 0,
        isSerial: true, serialStart: 1, serialEnd: 1, serialStep: 1, serialPad: 3
      },
      {
        id: 'elem_qr',
        type: 'qrcode',
        x: 47.5, y: 4.8, w: 14.5, h: 14.5,
        barcodeData: 'https://3m.com/instrument',
        rotation: 0
      }
    ],
    selectedId: 'elem_title',
    selectedIds: ['elem_title'],
    printers: [],
    selectedPrinter: '',
    copies: 1,
    batchData: [
      ['EQUIPMENT TAG A1', '1001', 'TAG-A'],
      ['EQUIPMENT TAG A2', '1002', 'TAG-A'],
      ['EQUIPMENT TAG B1', '1003', 'TAG-B']
    ],
    batchTargetId: 'elem_sn',
    batchOpen: false,
    dragState: null,
    resizeState: null,
    undoStack: [],
    undoLimit: 50,
    keyHandler: null
  };
}

// ── 보조 헬퍼 ───────────────────────────────────────────────────────────────
let _measureCanvas = null;
function measureTextMm(text, font = 'Arial', sizePt = 10, bold = false, italic = false) {
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  const fontPx = Math.max(6, Math.round((sizePt || 10) * 5)); // 360 DPI (1pt = 5px)
  ctx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${fontPx}px "${font || 'Arial'}", sans-serif`;
  const lines = String(text || ' ').split('\n');
  let maxW = 0;
  lines.forEach(l => {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  });
  const widthMm = (maxW * 25.4) / 360;
  const lineHMm = (fontPx * 1.18 * 25.4) / 360;
  const heightMm = (fontPx * 25.4) / 360 + (lines.length - 1) * lineHMm;
  return {
    w: Math.max(4.0, Math.round(widthMm * 10) / 10),
    h: Math.max(2.5, Math.round(heightMm * 10) / 10)
  };
}

function getTapeSpec(w = S.tapeWidth) {
  return TAPE_SPECS[w] || TAPE_SPECS[24.0];
}

function roundLayout(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Resize an existing label design when the physical tape width changes.
 * The OK900P tape families have different printable heights, so using the
 * printable-height ratio keeps text, QR/barcodes, images, gaps and positions
 * together instead of merely clipping tall elements at the new tape edge.
 */
export function rescaleElementsForTapeWidth(elements, oldWidth, newWidth) {
  const oldSpec = TAPE_SPECS[Number(oldWidth)];
  const newSpec = TAPE_SPECS[Number(newWidth)];
  if (!Array.isArray(elements) || !oldSpec || !newSpec || oldWidth === newWidth) return elements;

  const scale = newSpec.maxPrint / oldSpec.maxPrint;
  const left = elements.length ? Math.min(...elements.map(e => Number(e.x) || 0)) : 0;
  for (const element of elements) {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || oldSpec.sideMargin;
    const width = Math.max(0.1, Number(element.w) || 0.1);
    const height = Math.max(0.1, Number(element.h) || 0.1);

    element.x = roundLayout(left + (x - left) * scale);
    element.y = roundLayout(newSpec.sideMargin + (y - oldSpec.sideMargin) * scale);
    element.w = roundLayout(width * scale);
    element.h = roundLayout(height * scale);
    if (element.type === 'text') {
      element.size = roundLayout(Math.max(0.5, (Number(element.size) || 10) * scale));
    }

    // Keep every element within the real printable height after rounding.
    element.h = Math.min(element.h, newSpec.maxPrint);
    element.y = Math.max(newSpec.sideMargin,
      Math.min(element.y, Number(newWidth) - newSpec.sideMargin - element.h));
  }
  return elements;
}

function getLeadMargin() {
  return S.marginMm ?? 8.0;
}

function getEffectiveLength(targetReplaceVal = null, serialOffset = 0) {
  if (S.lengthMode === 'fixed') return Math.max(20.0, S.fixedLength);
  let minLeft = 9999;
  let maxRight = 0;
  S.elements.forEach(e => {
    let ew = e.w || 10;
    if (e.type === 'text') {
      let txt = (targetReplaceVal && e.id === S.batchTargetId) ? targetReplaceVal : (e.text || ' ');
      if (e.isSerial) {
        const sn = String((e.serialStart || 1) + serialOffset * (e.serialStep || 1)).padStart(e.serialPad || 3, '0');
        txt = txt.includes('{SN}') ? txt.replace('{SN}', sn) : `${txt} ${sn}`.trim();
      }
      const measured = measureTextMm(txt, e.font, e.size, e.bold, e.italic);
      ew = Math.max(ew, Math.round((measured.w + 1.2) * 10) / 10);
    }
    const left = (e.x || 0);
    const right = left + ew;
    if (left < minLeft) minLeft = left;
    if (right > maxRight) maxRight = right;
  });
  if (minLeft > maxRight) { minLeft = 6.5; maxRight = 62.0; }
  // OK900P 실기 헤드-커터 물리 오프셋(실측 1.5mm)을 보정하여 물리 좌우 여백을 완벽 대칭(센터)으로 연동
  const physLeadOffset = 1.5;
  const effLen = maxRight + minLeft + physLeadOffset;
  return Math.max(20.0, Math.round(effLen * 10) / 10);
}

function mmToPx(mm) {
  return mm * 4.0 * S.zoom;
}

function pxToMm(px) {
  return px / (4.0 * S.zoom);
}

function getSelectedElem() {
  return S.elements.find(e => e.id === S.selectedId) || null;
}

function selectedIdSet() {
  return new Set(Array.isArray(S.selectedIds) ? S.selectedIds : (S.selectedId ? [S.selectedId] : []));
}

function getSelectedElems() {
  const ids = selectedIdSet();
  return S.elements.filter(element => ids.has(element.id));
}

function serialPreviewValues(elem, count = 3) {
  const plan = serialPrintPlan(elem);
  if (!plan.ok) return '—';
  return plan.values.slice(0, count).join(' → ');
}

export function serialPrintPlan(elem) {
  const start = Math.trunc(Number(elem?.serialStart));
  const end = elem?.serialEnd === undefined || elem?.serialEnd === null || elem?.serialEnd === ''
    ? start : Math.trunc(Number(elem.serialEnd));
  const step = Math.max(1, Math.trunc(Number(elem?.serialStep) || 1));
  const digits = Math.max(1, Math.min(8, Math.trunc(Number(elem?.serialPad) || 3)));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { ok:false, reason:'invalid', values:[] };
  const count = Math.floor((end - start) / step) + 1;
  if (count > 999) return { ok:false, reason:'too_large', values:[] };
  const values = Array.from({ length: count }, (_, index) => String(start + index * step).padStart(digits, '0'));
  return { ok:true, start, end, step, digits, count, values, offsets:values.map((_, index) => index) };
}

function labelSnapshot() {
  return {
    tapeWidth: S.tapeWidth, lengthMode: S.lengthMode, fixedLength: S.fixedLength,
    marginMode: S.marginMode, marginMm: S.marginMm, cutterMode: S.cutterMode,
    orientation: S.orientation, tapeColor: S.tapeColor, elements: structuredClone(S.elements),
    selectedId: S.selectedId, selectedIds: [...selectedIdSet()],
  };
}

function restoreLabelSnapshot(snapshot) {
  Object.assign(S, structuredClone(snapshot));
  if (!Array.isArray(S.selectedIds)) S.selectedIds = S.selectedId ? [S.selectedId] : [];
}

// ── 모듈 Export 객체 ─────────────────────────────────────────────────────────
export default {
  name: 'Epson PRIFIA OK900P',
  icon: 'assets/epson_ok900p.png',
  category: 'Software',
  viewType: 'custom',
  serial: null,

  onConnect() {},
  onDisconnect() {
    const layout = document.getElementById('layout');
    if (layout) layout.classList.remove('ok900p-layout');
    if (S?.keyHandler) document.removeEventListener('keydown', S.keyHandler);
    if (S) S.keyHandler = null;
  },
  onLine() {},

  onRebuild() {
    this.renderCanvas();
    this.updateBatchTable();
    this.updateUndoControl();
  },

  saveUndoState() {
    if (!S) return;
    S.undoStack.push(labelSnapshot());
    if (S.undoStack.length > S.undoLimit) S.undoStack.shift();
    this.updateUndoControl();
  },

  updateUndoControl() {
    const button = document.getElementById('okUndoBtn');
    if (button) button.disabled = !(S?.undoStack?.length);
  },

  undo() {
    const snapshot = S?.undoStack?.pop();
    if (!snapshot) return;
    restoreLabelSnapshot(snapshot);
    this.buildSidebar(document.getElementById('sidebar'));
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
    this.updateUndoControl();
  },

  installKeyboardShortcuts() {
    if (!S || S.keyHandler) return;
    S.keyHandler = event => {
      const target = event.target;
      const editingText = target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editingText) {
        event.preventDefault();
        this.undo();
        return;
      }
      if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && !event.altKey && !editingText && getSelectedElems().length) {
        event.preventDefault();
        this.deleteSelected();
      }
    };
    document.addEventListener('keydown', S.keyHandler);
  },


  // ── 1. 좌측 사이드바 빌드 (Ribbon & Actions) ──────────────────────────────
  buildSidebar(el) {
    if (!S) init();
    const layout = document.getElementById('layout');
    if (layout) layout.classList.add('ok900p-layout');

    this.fetchPrinters();

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;box-sizing:border-box;overflow-y:auto;">
        
        <!-- 출력 & 인쇄 액션 패널 -->
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;">
              <span>🖨️</span><span>${t("print_panel_title")}</span>
            </div>
            <span style="font-size:11px;background:#2563eb;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;">360 DPI</span>
          </div>

          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">${t("printer_select_lbl")}</div>
            <div style="display:flex;gap:6px;align-items:center;width:100%;box-sizing:border-box;">
              <select id="okPrinterSelect" style="flex:1;min-width:0;width:0;padding:6px 8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;box-sizing:border-box;"
                onchange="app.instr.setPrinter(this.value)">
                <option value="">${t("printer_searching")}</option>
              </select>
              <button class="icon-btn" onclick="app.instr.fetchPrinters()" title="${t('printer_refresh_tip')}" style="flex-shrink:0;width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;box-sizing:border-box;">↻</button>
              <button class="icon-btn" onclick="app.instr.showDriverModal()" title="${t('driver_manage_tip')}" style="flex-shrink:0;width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;box-sizing:border-box;">🛠️</button>
            </div>
            <div id="okDriverNotice" style="display:none;margin-top:6px;"></div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;color:var(--text-dim);">${t("copies_lbl")}</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="sbtn" style="padding:3px 8px;" onclick="app.instr.stepCopies(-1)">-</button>
              <input type="number" id="okCopiesInput" value="${S.copies}" min="1" max="999"
                style="width:48px;text-align:center;padding:4px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;"
                onchange="app.instr.setCopies(parseInt(this.value)||1)">
              <button class="sbtn" style="padding:3px 8px;" onclick="app.instr.stepCopies(1)">+</button>
            </div>
          </div>

          <!-- 메인 인쇄 버튼 -->
          <button id="okPrintBtn" class="sbtn green" style="width:100%;padding:10px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(34,176,106,0.3);"
            onclick="app.instr.printLabel()">
            ${t("print_btn")}
          </button>

          <button class="sbtn" style="width:100%;font-size:12px;padding:6px;" onclick="app.instr.showPreviewModal()">
            ${t("preview_btn")}
          </button>

          <div id="okPrintToast" style="font-size:11px;min-height:16px;color:var(--text-dim);line-height:1.4;"></div>
        </div>

        <!-- 테이프 규격 패널 -->
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${t("tape_spec_title")}</div>
          
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">${t("tape_width_lbl")}</div>
            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:4px;">
              ${[4, 6, 9, 12, 18, 24, 36].map(w => `
                <button class="sbtn ${S.tapeWidth === w ? 'green' : ''}" style="font-size:11px;padding:5px 0;text-align:center;"
                  onclick="app.instr.setTapeWidth(${w})">${w}mm</button>
              `).join('')}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border);padding-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12px;color:var(--text-dim);">${t("length_mode_lbl")}</span>
              <div style="display:flex;gap:4px;">
                <button class="sbtn ${S.lengthMode === 'auto' ? 'green' : ''}" style="font-size:11px;padding:3px 8px;" onclick="app.instr.setLengthMode('auto')">${t("mode_auto")}</button>
                <button class="sbtn ${S.lengthMode === 'fixed' ? 'green' : ''}" style="font-size:11px;padding:3px 8px;" onclick="app.instr.setLengthMode('fixed')">${t("mode_fixed")}</button>
              </div>
            </div>
            ${S.lengthMode === 'fixed' ? `
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:11px;color:var(--text-dim);">${t("fixed_length_lbl")}</span>
                <input type="number" value="${S.fixedLength}" min="15" max="500" step="1"
                  style="width:70px;padding:3px 6px;border-radius:4px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;"
                  onchange="app.instr.setFixedLength(parseFloat(this.value)||60)">
              </div>
            ` : ''}
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border);padding-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12px;color:var(--text-dim);">${t("margin_lbl")}</span>
              <div style="display:flex;gap:4px;">
                <button class="sbtn ${S.marginMm === 2.0 ? 'green' : ''}" style="font-size:11px;padding:3px 6px;" onclick="app.instr.setMarginPreset(2)">${t("margin_min")}</button>
                <button class="sbtn ${S.marginMm === 8.0 ? 'green' : ''}" style="font-size:11px;padding:3px 6px;" onclick="app.instr.setMarginPreset(8)">${t("margin_std")}</button>
                <button class="sbtn ${S.marginMm === 12.0 ? 'green' : ''}" style="font-size:11px;padding:3px 6px;" onclick="app.instr.setMarginPreset(12)">${t("margin_wide")}</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;color:var(--text-dim);">${t("margin_custom_lbl")}</span>
              <div style="display:flex;align-items:center;gap:4px;">
                <button class="sbtn" style="padding:2px 7px;" onclick="app.instr.stepMargin(-1)">-</button>
                <input type="number" id="okMarginInput" value="${S.marginMm ?? 8.0}" min="1" max="50" step="0.5"
                  style="width:50px;text-align:center;padding:3px 4px;border-radius:4px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;"
                  onchange="app.instr.setCustomMargin(parseFloat(this.value)||8)">
                <button class="sbtn" style="padding:2px 7px;" onclick="app.instr.stepMargin(1)">+</button>
                <span style="font-size:11px;color:var(--text-dim);">mm</span>
              </div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;color:var(--text-dim);">${t("cutter_lbl")}</span>
            <select style="padding:3px 6px;border-radius:4px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:11px;"
              onchange="app.instr.setCutterMode(this.value)">
              <option value="full" ${S.cutterMode==='full'?'selected':''}>${t("cut_full")}</option>
              <option value="half" ${S.cutterMode==='half'?'selected':''}>${t("cut_half")}</option>
              <option value="none" ${S.cutterMode==='none'?'selected':''}>${t("cut_none")}</option>
            </select>
          </div>
        </div>

        <!-- 요소 추가 패널 -->
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${t("insert_title")}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button class="sbtn" onclick="app.instr.addElement('text')">${t("ins_text")}</button>
            <button class="sbtn" onclick="app.instr.addElement('barcode')">${t("ins_barcode")}</button>
            <button class="sbtn" onclick="app.instr.addElement('qrcode')">${t("ins_qr")}</button>
            <button class="sbtn" onclick="app.instr.addElement('serial')">${t("ins_serial")}</button>
          </div>
          <button class="sbtn" style="width:100%;margin-top:2px;" onclick="app.instr.triggerImageUpload()">${t("ins_image")}</button>
          <input type="file" id="okImageInput" accept="image/*" style="display:none;" onchange="app.instr.handleImageUpload(event)">
        </div>

        <!-- 템플릿 프리셋 -->
        <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("preset_title")}</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="sbtn" style="font-size:11px;text-align:left;padding:5px 8px;" onclick="app.instr.loadPreset('asset')">${t("preset_asset")}</button>
            <button class="sbtn" style="font-size:11px;text-align:left;padding:5px 8px;" onclick="app.instr.loadPreset('chemical')">${t("preset_chem")}</button>
            <button class="sbtn" style="font-size:11px;text-align:left;padding:5px 8px;" onclick="app.instr.loadPreset('warning')">${t("preset_warn")}</button>
          </div>
        </div>

      </div>
    `;
  },

  // ── 2. 중앙 작업 캔버스 빌드 (Canvas & Rulers & Batch Sheet) ───────────────
  buildCenter(el) {
    if (!S) init();

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;overflow:hidden;background:#0d141e;">
        
        <!-- 상단 툴바: 정렬 및 편집 -->
        <div style="background:var(--panel);border-bottom:1px solid var(--border);padding:6px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;overflow-x:auto;white-space:nowrap;">
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.centerAllSymmetrically()" title="${t('center_all_h_tip')}">${t("center_all_h_btn")}</button>
            <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.alignSelected('centerH')">${t("center_h_btn")}</button>
            <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.alignSelected('centerV')">${t("center_v_btn")}</button>
            <button id="okUndoBtn" class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.undo()" title="${t('undo_tip')}">${t("undo_btn")}</button>
            <button class="sbtn red" style="font-size:11px;padding:3px 8px;" onclick="app.instr.deleteSelected()">${t("delete_btn")}</button>
          </div>
        </div>

        <!-- 2번째 줄: 여백 및 실제 인쇄 치수 정보 바 (ZOOM 바로 아래줄) -->
        <div style="background:var(--panel-2);border-bottom:1px solid var(--border);padding:5px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;overflow-x:auto;">
          <div id="okTapeDimInfo" style="font-size:12px;color:#38bdf8;font-family:var(--mono);font-weight:700;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
            <span>📏</span> <span>${S.tapeWidth} mm × ${getEffectiveLength()} mm</span> <span style="font-weight:normal;opacity:0.85;margin-left:6px;">(물리 여백: 좌 ${(S.marginMm??8.0).toFixed(1)}mm / 우 ${(S.marginMm??8.0).toFixed(1)}mm)</span>
          </div>
          <div id="okTapeSubInfo" style="font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:12px;font-family:var(--mono);white-space:nowrap;">
            <span>인쇄 가능 폭: <b style="color:var(--text);">${getTapeSpec().maxPrint}mm</b></span>
            <span>길이 모드: <b style="color:#38bdf8;">${S.lengthMode === 'auto' ? '자동 맞춤' : '고정'}</b></span>
          </div>
        </div>

        <!-- 중앙 에디터 영역 (눈금자 + 캔버스) -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;">
          
          <!-- 상단 가로 밀리미터 눈금자 -->
          <div style="height:24px;background:#132030;border-bottom:1px solid var(--border);position:relative;overflow:hidden;">
            <canvas id="okRulerX" height="24" style="width:100%;height:24px;display:block;"></canvas>
          </div>

          <!-- 메인 캔버스 스크롤 영역 -->
          <div id="okCanvasViewport"
            style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:40px;background:#09121d;user-select:none;"
            onmousedown="app.instr.startMarqueeSelection(event)"
            onclick="app.instr.onViewportClick(event)">
            
            <!-- 실제 테이프 캔버스 컨테이너 -->
            <div id="okTapeContainer" style="position:relative;transition:width 0.1s, height 0.1s;"></div>
          </div>
        </div>

        <!-- 하단 대량 배치 시트 (접이식) -->
        <div style="background:var(--panel);border-top:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;">
          
          <!-- 토글 헤더 -->
          <div style="padding:8px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;"
            onclick="app.instr.toggleBatchSheet()">
            <div style="font-size:12px;font-weight:700;color:#38bdf8;display:flex;align-items:center;gap:6px;">
              <span>📊</span><span>${t("batch_title")}</span>
              <span id="okBatchRowCount" style="font-size:11px;color:var(--text-dim);font-weight:normal;">(${S.batchData.length} ${t("batch_loaded")})</span>
            </div>
            <span id="okBatchToggleIcon" style="font-size:12px;color:var(--text-dim);">${S.batchOpen ? t('collapse_btn') : t('expand_btn')}</span>
          </div>

          <!-- 접이식 시트 내용 -->
          <div id="okBatchBody" style="display:${S.batchOpen ? 'flex' : 'none'};flex-direction:column;gap:8px;padding:0 16px 12px;max-height:180px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:11px;color:var(--text-dim);">${t("batch_target_lbl")}</span>
              <select id="okBatchTargetSelect" style="padding:3px 6px;border-radius:4px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:11px;"
                onchange="app.instr.setBatchTarget(this.value)">
                ${S.elements.map(e => `<option value="${e.id}" ${e.id===S.batchTargetId?'selected':''}>${e.id} (${e.text||e.barcodeData||e.type})</option>`).join('')}
              </select>

              <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.triggerCsvImport()">${t("csv_load_btn")}</button>
              <input type="file" id="okCsvInput" accept=".csv" style="display:none;" onchange="app.instr.handleCsvImport(event)">

              <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.pasteFromClipboard()">${t("paste_excel_btn")}</button>
              <button class="sbtn" style="font-size:11px;padding:3px 8px;" onclick="app.instr.clearBatchData()">${t("clear_btn")}</button>

              <div style="flex:1;"></div>

              <button class="sbtn green" style="font-size:12px;font-weight:700;padding:5px 14px;" onclick="app.instr.startBatchPrint()">
                ${t("batch_start_btn")}
              </button>
            </div>

            <!-- 미니 데이터 테이블 -->
            <div style="overflow-y:auto;border:1px solid var(--border);border-radius:4px;max-height:110px;">
              <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--mono);">
                <thead>
                  <tr style="background:var(--panel-2);border-bottom:1px solid var(--border);color:var(--text-dim);">
                    <th style="padding:4px 8px;text-align:left;width:36px;">#</th>
                    <th style="padding:4px 8px;text-align:left;">${t("th_col1")}</th>
                    <th style="padding:4px 8px;text-align:left;">${t("th_col2")}</th>
                    <th style="padding:4px 8px;text-align:left;">${t("th_col3")}</th>
                  </tr>
                </thead>
                <tbody id="okBatchTableBody">
                  ${S.batchData.map((row, idx) => `
                    <tr style="border-bottom:1px solid var(--border-2);">
                      <td style="padding:4px 8px;color:var(--text-dim);">${idx+1}</td>
                      <td style="padding:4px 8px;">${row[0]||''}</td>
                      <td style="padding:4px 8px;">${row[1]||''}</td>
                      <td style="padding:4px 8px;">${row[2]||''}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    `;

    setTimeout(() => {
      this.renderCanvas();
      this.drawRuler();
      this.installKeyboardShortcuts();
      this.updateUndoControl();
    }, 0);
  },

  // ── 3. 우측 속성 패널 빌드 (Properties Inspector) ─────────────────────────
  buildRightPanel(el) {
    if (!S) init();
    const selected = getSelectedElems();
    if (selected.length > 1) {
      const textCount = selected.filter(element => element.type === 'text').length;
      el.innerHTML = `
        <div style="padding:14px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box;overflow-y:auto;">
          <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);padding-bottom:8px;"><span>☑</span><span>${tf('multi_selected', {count:selected.length})}</span></div>
          <div style="font-size:11px;line-height:1.45;color:var(--text-dim);">${t('multi_hint')}</div>
          ${textCount ? `<div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${textCount}개 텍스트</div>
            <label style="font-size:10px;color:var(--text-dim);">${t('multi_text_size')}<input id="okMultiTextSize" type="number" min="1" max="72" step="0.5" style="display:block;width:100%;margin-top:4px;padding:5px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);" onchange="app.instr.applySelectedTextSize(parseFloat(this.value)||10)"></label>
            <button class="sbtn" onclick="app.instr.applySelectedAlignment('center')">↔ ${t('multi_center')}</button>
          </div>` : ''}
          <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:10px;color:var(--text-dim);">${t('multi_rotation')}<input id="okMultiRotation" type="number" min="0" max="359" step="1" value="0" style="display:block;width:100%;margin-top:4px;padding:5px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);" onchange="app.instr.applySelectedRotation(parseFloat(this.value)||0)"></label>
          </div>
          <button class="sbtn red" style="margin-top:auto;" onclick="app.instr.deleteSelected()">🗑️ ${t('multi_delete')}</button>
        </div>`;
      return;
    }
    const elem = getSelectedElem();

    if (!elem) {
      el.innerHTML = `
        <div style="padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--text-dim);gap:12px;">
          <div style="font-size:32px;">👆</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${t("no_selection")}</div>
          <div style="font-size:12px;line-height:1.5;">
            ${t("no_sel_desc")}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;width:100%;margin-top:10px;">
            <button class="sbtn" onclick="app.instr.addElement('text')">${t("add_text_btn")}</button>
            <button class="sbtn" onclick="app.instr.addElement('barcode')">${t("add_bc_btn")}</button>
            <button class="sbtn" onclick="app.instr.addElement('qrcode')">${t("add_qr_btn")}</button>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div style="padding:14px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box;overflow-y:auto;">
        
        <!-- 속성 헤더 -->
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;">
            <span>⚙️</span><span>${tf("prop_header", {type: elem.type.toUpperCase()})}</span>
          </div>
        </div>

        <!-- 1. 위치 및 크기 -->
        <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("pos_size_title")}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <div>
              <span style="font-size:10px;color:var(--text-dim);">${t("pos_x")}</span>
              <input type="number" id="okPropX" step="0.5" value="${elem.x}" style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;"
                onchange="app.instr.updateElemProp('x', parseFloat(this.value)||0)">
            </div>
            <div>
              <span style="font-size:10px;color:var(--text-dim);">${t("pos_y")}</span>
              <input type="number" id="okPropY" step="0.5" value="${elem.y}" style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;"
                onchange="app.instr.updateElemProp('y', parseFloat(this.value)||0)">
            </div>
            <div>
              <span style="font-size:10px;color:var(--text-dim);">${t("size_w")}</span>
              <input type="number" id="okPropW" step="0.5" value="${elem.w}" style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;"
                onchange="app.instr.updateElemProp('w', parseFloat(this.value)||5)">
            </div>
            <div>
              <span style="font-size:10px;color:var(--text-dim);">${t("size_h")}</span>
              <input type="number" id="okPropH" step="0.5" value="${elem.h}" style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;"
                onchange="app.instr.updateElemProp('h', parseFloat(this.value)||5)">
            </div>
          </div>

        </div>

        <!-- 2. 텍스트 속성 (텍스트 요소 전용) -->
        ${elem.type === 'text' ? `
          <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("text_content_title")}</div>
              <button class="sbtn" style="font-size:10px;padding:2px 6px;" onclick="app.instr.autoFitSelectedText()">${t("autofit_btn")}</button>
            </div>
            <textarea style="width:100%;height:54px;padding:6px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;resize:vertical;"
              oninput="app.instr.updateElemProp('text', this.value)">${elem.text||''}</textarea>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <div>
                <span style="font-size:10px;color:var(--text-dim);">${t("font_lbl")}</span>
                <select style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:11px;"
                  onchange="app.instr.updateElemProp('font', this.value)">
                  <option value="Arial" ${elem.font==='Arial'?'selected':''}>Arial</option>
                  <option value="맑은 고딕" ${elem.font==='맑은 고딕'?'selected':''}>맑은 고딕</option>
                  <option value="굴림" ${elem.font==='굴림'?'selected':''}>굴림</option>
                  <option value="Courier New" ${elem.font==='Courier New'?'selected':''}>Courier</option>
                  <option value="Impact" ${elem.font==='Impact'?'selected':''}>Impact</option>
                </select>
              </div>
              <div>
                <span style="font-size:10px;color:var(--text-dim);">${t("size_lbl")}</span>
                <input type="number" value="${elem.size||10}" min="4" max="72"
                  style="width:100%;padding:4px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;"
                  onchange="app.instr.updateElemProp('size', parseFloat(this.value)||10)">
              </div>
            </div>

            <div style="display:flex;gap:4px;align-items:center;">
              <button class="sbtn ${elem.bold?'green':''}" style="font-weight:bold;padding:4px 10px;" onclick="app.instr.updateElemProp('bold', !${elem.bold})">B</button>
              <button class="sbtn ${elem.italic?'green':''}" style="font-style:italic;padding:4px 10px;" onclick="app.instr.updateElemProp('italic', !${elem.italic})">I</button>
              <button class="sbtn ${elem.underline?'green':''}" style="text-decoration:underline;padding:4px 10px;" onclick="app.instr.updateElemProp('underline', !${elem.underline})">U</button>
              <div style="flex:1;"></div>
              <button class="sbtn ${elem.align==='left'?'green':''}" style="padding:4px 8px;" onclick="app.instr.updateElemProp('align', 'left')">◀</button>
              <button class="sbtn ${elem.align==='center'?'green':''}" style="padding:4px 8px;" onclick="app.instr.updateElemProp('align', 'center')">■</button>
              <button class="sbtn ${elem.align==='right'?'green':''}" style="padding:4px 8px;" onclick="app.instr.updateElemProp('align', 'right')">▶</button>
            </div>
          </div>

          <!-- 시리얼 자동 증가 설정 -->
          <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("serial_title")}</span>
              <input type="checkbox" ${elem.isSerial?'checked':''} onchange="app.instr.updateElemProp('isSerial', this.checked)">
            </div>
            ${elem.isSerial ? `
              <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:4px;">
                <div>
                  <span style="font-size:9px;color:var(--text-dim);">${t("serial_start_lbl")}</span>
                  <input type="number" value="${elem.serialStart||1}" min="0" style="width:100%;padding:3px;font-size:11px;"
                    onchange="app.instr.updateElemProp('serialStart', parseInt(this.value)||1)">
                </div>
                <div>
                  <span style="font-size:9px;color:var(--text-dim);">${t("serial_end_lbl")}</span>
                  <input type="number" value="${elem.serialEnd ?? elem.serialStart ?? 1}" min="0" style="width:100%;padding:3px;font-size:11px;"
                    onchange="app.instr.updateElemProp('serialEnd', parseInt(this.value)||0)">
                </div>
                <div>
                  <span style="font-size:9px;color:var(--text-dim);">${t("serial_step_lbl")}</span>
                  <input type="number" value="${elem.serialStep||1}" min="1" style="width:100%;padding:3px;font-size:11px;"
                    onchange="app.instr.updateElemProp('serialStep', parseInt(this.value)||1)">
                </div>
                <div>
                  <span style="font-size:9px;color:var(--text-dim);">${t("serial_pad_lbl")}</span>
                  <input type="number" value="${elem.serialPad||3}" min="1" max="8" style="width:100%;padding:3px;font-size:11px;"
                    onchange="app.instr.updateElemProp('serialPad', parseInt(this.value)||3)">
                </div>
              </div>
              <div style="font-size:10px;color:var(--cyan);">${t("serial_hint")}</div>
              <div style="font-size:10px;color:var(--text-dim);padding:6px 8px;border-radius:5px;background:var(--panel);border:1px solid var(--border);font-family:var(--mono);">${tf('serial_example', {values: serialPreviewValues(elem), count: serialPrintPlan(elem).count || 0})}</div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 3. 바코드 속성 -->
        ${elem.type === 'barcode' ? `
          <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("bc_data_title")}</div>
            <input type="text" value="${elem.barcodeData||''}" style="width:100%;padding:6px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:12px;font-family:var(--mono);"
              oninput="app.instr.updateElemProp('barcodeData', this.value)">

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;color:var(--text-dim);">${t("bc_type_lbl")}</span>
              <select style="padding:3px 6px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:11px;"
                onchange="app.instr.updateElemProp('barcodeType', this.value)">
                <option value="Code128" ${elem.barcodeType==='Code128'?'selected':''}>Code 128</option>
                <option value="EAN13" ${elem.barcodeType==='EAN13'?'selected':''}>EAN-13</option>
              </select>
            </div>

            <div style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" id="okShowBcTxt" ${elem.showText!==false?'checked':''}
                onchange="app.instr.updateElemProp('showText', this.checked)">
              <label for="okShowBcTxt" style="font-size:11px;color:var(--text-dim);cursor:pointer;">${t("bc_show_text_lbl")}</label>
            </div>
          </div>
        ` : ''}

        <!-- 4. QR 코드 속성 -->
        ${elem.type === 'qrcode' ? `
          <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t("qr_data_title")}</div>
            <textarea style="width:100%;height:64px;padding:6px;border-radius:4px;background:var(--panel);border:1px solid var(--border);color:var(--text);font-size:11px;resize:vertical;"
              oninput="app.instr.updateElemProp('barcodeData', this.value)">${elem.barcodeData||''}</textarea>
          </div>
        ` : ''}

        <div style="display:flex;gap:6px;margin-top:auto;">
          <button class="sbtn" style="flex:1;font-size:11px;" onclick="app.instr.duplicateSelected()">${t("duplicate_btn")}</button>
        </div>

      </div>
    `;
  },

  // ── 4. 캔버스 실시간 렌더링 및 인터랙션 ─────────────────────────────────────
  renderCanvas() {
    const container = document.getElementById('okTapeContainer');
    if (!container) return;

    const effLength = getEffectiveLength();
    const tapeSpec = getTapeSpec();
    const leadMargin = getLeadMargin();

    const wPx = mmToPx(effLength);
    const hPx = mmToPx(S.tapeWidth);

    container.style.width = `${wPx}px`;
    container.style.height = `${hPx}px`;
    container.style.backgroundColor = S.tapeColor;
    container.style.borderRadius = '3px';
    container.style.boxShadow = '0 6px 24px rgba(0,0,0,0.5), inset 0 0 0 1px #cbd5e1';
    container.style.position = 'relative';

    let minL = 9999;
    let maxR = 0;
    S.elements.forEach(e => {
      const left = (e.x || 0);
      const right = left + (e.w || 10);
      if (left < minL) minL = left;
      if (right > maxR) maxR = right;
    });
    if (minL > maxR) { minL = 6.5; maxR = 62.0; }
    const physLead = Math.round((1.5 + minL) * 10) / 10;
    const physTrail = Math.round((effLength - maxR) * 10) / 10;

    const dimInfo = document.getElementById('okTapeDimInfo');
    if (dimInfo) {
      const marginTxt = (window.app?.lang === 'en')
        ? `(Margin: L ${physLead}mm / R ${physTrail}mm)`
        : `(물리 여백: 좌 ${physLead}mm / 우 ${physTrail}mm)`;
      dimInfo.innerHTML = `<span>📏</span> <span>${S.tapeWidth} mm × ${effLength} mm</span> <span style="font-weight:normal;opacity:0.85;margin-left:6px;">${marginTxt}</span>`;
    }

    const subInfo = document.getElementById('okTapeSubInfo');
    if (subInfo) {
      const modeStr = S.lengthMode === 'auto'
        ? ((window.app?.lang === 'en') ? 'Auto-fit' : '자동 맞춤')
        : ((window.app?.lang === 'en') ? 'Fixed' : '고정');
      const maxPrintLbl = (window.app?.lang === 'en') ? 'Printable' : '인쇄 가능 폭';
      const modeLbl = (window.app?.lang === 'en') ? 'Mode' : '길이 모드';
      subInfo.innerHTML = `<span>${maxPrintLbl}: <b style="color:var(--text);">${tapeSpec.maxPrint}mm</b></span> <span>${modeLbl}: <b style="color:#38bdf8;">${modeStr}</b></span>`;
    }

    // 마진 가이드 (붉은 점선 사각형: 인쇄 가능 상하 한계선)
    const marginL = mmToPx(minL);
    const marginT = mmToPx(tapeSpec.sideMargin);
    const marginW = mmToPx(Math.max(1, maxR - minL));
    const marginH = mmToPx(Math.max(1, S.tapeWidth - tapeSpec.sideMargin * 2));

    let html = `
      <!-- 마진 가이드라인 -->
      <div style="position:absolute;left:${marginL}px;top:${marginT}px;width:${marginW}px;height:${marginH}px;
                  border:1.5px dashed #f87171;box-sizing:border-box;pointer-events:none;z-index:1;"></div>
      <!-- 중심 안내선 -->
      <div style="position:absolute;left:0;top:${hPx/2}px;width:100%;height:1px;
                  border-top:1px dotted rgba(56,189,248,0.5);pointer-events:none;z-index:1;"></div>
    `;

    // 각 요소 렌더링
    S.elements.forEach(e => {
      const isSel = selectedIdSet().has(e.id);
      const isPrimary = e.id === S.selectedId;
      const xPx = mmToPx(e.x);
      const yPx = mmToPx(e.y);
      const ewPx = mmToPx(e.w);
      const ehPx = mmToPx(e.h);

      let inner = '';
      if (e.type === 'text') {
        let displayTxt = e.text || ' ';
        if (e.isSerial) {
          const sn = String(e.serialStart).padStart(e.serialPad || 3, '0');
          displayTxt = displayTxt.includes('{SN}') ? displayTxt.replace('{SN}', sn) : `${displayTxt} ${sn}`.trim();
        }
        // Keep multi-line label text flush with the element. Indenting text in
        // this template literal becomes a real blank line under pre-wrap and
        // pushes warning-template lines outside their fitted height.
        const safeDisplayTxt = String(displayTxt).replace(/[&<>"']/g, ch => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
        const fontSizePx = Math.max(2, (e.size || 10) * (4.0 * S.zoom / 2.8));
        inner = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:${e.align==='center'?'center':e.align==='right'?'flex-end':'flex-start'};font-family:${e.font||'Arial'};font-size:${fontSizePx}px;font-weight:${e.bold?'bold':'normal'};font-style:${e.italic?'italic':'normal'};text-decoration:${e.underline?'underline':'none'};color:#000000;white-space:${displayTxt.includes('\n')?'pre-wrap':'nowrap'};line-height:1.2;overflow:hidden;text-overflow:ellipsis;">${safeDisplayTxt}</div>`;
      } else if (e.type === 'barcode') {
        inner = `<canvas id="canvas_${e.id}" width="${Math.round(ewPx)}" height="${Math.round(ehPx)}" style="width:100%;height:100%;display:block;"></canvas>`;
      } else if (e.type === 'qrcode') {
        inner = `<canvas id="canvas_${e.id}" width="${Math.round(ewPx)}" height="${Math.round(ehPx)}" style="width:100%;height:100%;display:block;"></canvas>`;
      } else if (e.type === 'image' && e.imageSrc) {
        inner = `<img src="${e.imageSrc}" style="width:100%;height:100%;object-fit:contain;display:block;">`;
      }

      html += `
        <div id="item_${e.id}"
          class="ok-item ${isSel ? 'selected' : ''}"
          style="position:absolute;left:${xPx}px;top:${yPx}px;width:${ewPx}px;height:${ehPx}px;
                 border:${isSel ? (isPrimary ? '2px solid #2563eb' : '2px solid #60a5fa') : '1px dashed transparent'};
                 background:${isSel ? 'rgba(37,99,235,0.08)' : 'transparent'};
                 transform:rotate(${e.rotation||0}deg);transform-origin:center center;
                 box-sizing:border-box;cursor:move;z-index:10;"
          onmousedown="app.instr.startDrag(event, '${e.id}')">
          ${inner}
          ${isPrimary ? `
            <div title="마우스로 드래그하여 자유 회전" style="position:absolute;left:50%;top:-28px;transform:translateX(-50%);width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#2563eb;border:2px solid #ffffff;color:#ffffff;font-size:14px;font-weight:700;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.45);z-index:12;"
              onmousedown="app.instr.startRotate(event, '${e.id}')">⟳</div>
            <div style="position:absolute;right:-4px;bottom:-4px;width:8px;height:8px;
                        background:#2563eb;border:1px solid #ffffff;border-radius:2px;cursor:nwse-resize;"
              onmousedown="app.instr.startResize(event, '${e.id}')"></div>
          ` : ''}
        </div>
      `;
    });

    container.innerHTML = html;

    // 바코드 / QR 비트맵 그리기
    S.elements.forEach(e => {
      const cvs = document.getElementById(`canvas_${e.id}`);
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      if (e.type === 'barcode') {
        drawCode128(ctx, e.barcodeData || '12345678', 0, 0, cvs.width, cvs.height, e.showText !== false);
      } else if (e.type === 'qrcode') {
        drawQRCode(ctx, e.barcodeData || 'https://3m.com', 0, 0, cvs.width, cvs.height);
      }
    });

    this.drawRuler();
  },

  drawRuler() {
    const cvs = document.getElementById('okRulerX');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    cvs.width = cvs.clientWidth || 800;
    cvs.height = 24;

    ctx.fillStyle = '#132030';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 23); ctx.lineTo(cvs.width, 23);
    ctx.stroke();

    const viewport = document.getElementById('okCanvasViewport');
    const container = document.getElementById('okTapeContainer');
    if (!viewport || !container) return;

    const originX = container.offsetLeft - viewport.scrollLeft;
    const stepMm = 1.0;
    const stepPx = mmToPx(stepMm);

    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';

    const maxMm = Math.ceil(cvs.width / stepPx) + 20;
    for (let mm = 0; mm < maxMm; mm++) {
      const x = originX + mm * stepPx;
      if (x < 0 || x > cvs.width) continue;

      ctx.beginPath();
      if (mm % 10 === 0) {
        ctx.moveTo(x, 10); ctx.lineTo(x, 23);
        ctx.fillText(`${mm}`, x + 2, 9);
      } else if (mm % 5 === 0) {
        ctx.moveTo(x, 15); ctx.lineTo(x, 23);
      } else {
        ctx.moveTo(x, 19); ctx.lineTo(x, 23);
      }
      ctx.stroke();
    }
  },

  // ── 5. 요소 드래그 및 리사이즈 인터랙션 ─────────────────────────────────────
  startDrag(e, id) {
    e.stopPropagation();
    this.selectElem(id);

    const elem = S.elements.find(x => x.id === id);
    if (!elem) return;

    S.dragState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      elemX: elem.x,
      elemY: elem.y,
      historyRecorded: false
    };

    const onMouseMove = ev => {
      if (!S.dragState) return;
      const dxMm = pxToMm(ev.clientX - S.dragState.startX);
      const dyMm = pxToMm(ev.clientY - S.dragState.startY);

      let newX = Math.max(0, S.dragState.elemX + dxMm);
      let newY = Math.max(0, S.dragState.elemY + dyMm);

      // 테이프 세로 중앙 스냅 (자석)
      const centerTapeY = (S.tapeWidth - elem.h) / 2.0;
      if (Math.abs(newY - centerTapeY) < 1.0) newY = centerTapeY;

      // 마진 시작선 스냅
      const lead = getLeadMargin();
      if (Math.abs(newX - lead) < 1.0) newX = lead;

      if (!S.dragState.historyRecorded && (newX !== S.dragState.elemX || newY !== S.dragState.elemY)) {
        this.saveUndoState();
        S.dragState.historyRecorded = true;
      }
      elem.x = Math.round(newX * 2) / 2;
      elem.y = Math.round(newY * 2) / 2;

      this.renderCanvas();
    };

    const onMouseUp = () => {
      S.dragState = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.buildRightPanel(document.getElementById('rightpanel'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  },

  startResize(e, id) {
    e.stopPropagation();
    const elem = S.elements.find(x => x.id === id);
    if (!elem) return;

    S.resizeState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      initW: elem.w,
      initH: elem.h,
      historyRecorded: false
    };

    const onMouseMove = ev => {
      if (!S.resizeState) return;
      const dwMm = pxToMm(ev.clientX - S.resizeState.startX);
      const dhMm = pxToMm(ev.clientY - S.resizeState.startY);

      const nextW = Math.max(4, Math.round((S.resizeState.initW + dwMm) * 2) / 2);
      const nextH = Math.max(4, Math.round((S.resizeState.initH + dhMm) * 2) / 2);
      if (!S.resizeState.historyRecorded && (nextW !== S.resizeState.initW || nextH !== S.resizeState.initH)) {
        this.saveUndoState();
        S.resizeState.historyRecorded = true;
      }
      elem.w = nextW;
      elem.h = nextH;

      this.renderCanvas();
    };

    const onMouseUp = () => {
      S.resizeState = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.buildRightPanel(document.getElementById('rightpanel'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  },

  startRotate(e, id) {
    e.stopPropagation();
    e.preventDefault();
    const elem = S.elements.find(x => x.id === id);
    const item = document.getElementById(`item_${id}`);
    if (!elem || !item) return;
    const rect = item.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startPointerAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
    const initialRotation = Number(elem.rotation) || 0;
    let historyRecorded = false;

    const onMouseMove = ev => {
      const pointerAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180 / Math.PI;
      let delta = pointerAngle - startPointerAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const nextRotation = ((Math.round(initialRotation + delta) % 360) + 360) % 360;
      if (!historyRecorded && nextRotation !== initialRotation) {
        this.saveUndoState();
        historyRecorded = true;
      }
      elem.rotation = nextRotation;
      this.renderCanvas();
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.buildRightPanel(document.getElementById('rightpanel'));
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  },

  selectElem(id) {
    S.selectedId = id;
    S.selectedIds = id ? [id] : [];
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  startMarqueeSelection(e) {
    if (e.button !== 0 || e.target.closest('.ok-item')) return;
    const viewport = document.getElementById('okCanvasViewport');
    if (!viewport) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;display:none;border:1px dashed #60a5fa;background:rgba(96,165,250,.16);pointer-events:none;z-index:20000;';
    document.body.appendChild(box);
    const onMouseMove = ev => {
      const left = Math.min(startX, ev.clientX), top = Math.min(startY, ev.clientY);
      const width = Math.abs(ev.clientX - startX), height = Math.abs(ev.clientY - startY);
      if (width > 3 || height > 3) moved = true;
      if (!moved) return;
      box.style.display = 'block';
      box.style.left = `${left}px`; box.style.top = `${top}px`;
      box.style.width = `${width}px`; box.style.height = `${height}px`;
      const ids = S.elements.filter(element => {
        const item = document.getElementById(`item_${element.id}`);
        if (!item) return false;
        const rect = item.getBoundingClientRect();
        return rect.left < left + width && rect.right > left && rect.top < top + height && rect.bottom > top;
      }).map(element => element.id);
      S.selectedIds = ids;
      S.selectedId = ids[0] || null;
      this.renderCanvas();
    };
    const onMouseUp = () => {
      box.remove();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (moved) {
        S.skipViewportClick = true;
        this.buildRightPanel(document.getElementById('rightpanel'));
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  },

  onViewportClick(e) {
    if (S.skipViewportClick) { S.skipViewportClick = false; return; }
    if (!e.target.closest('.ok-item')) {
      S.selectedId = null;
      S.selectedIds = [];
      this.renderCanvas();
      this.buildRightPanel(document.getElementById('rightpanel'));
    }
  },

  updateElemProp(prop, val) {
    const elem = getSelectedElem();
    if (!elem) return;
    if (elem[prop] === val) return;
    this.saveUndoState();
    const oldW = elem.w;
    elem[prop] = val;

    if (elem.type === 'text') {
      if (['text', 'size', 'font', 'bold', 'italic', 'isSerial', 'serialStart', 'serialStep', 'serialPad'].includes(prop)) {
        this.autoFitTextElement(elem, oldW);
      }
    }

    this.renderCanvas();
    if (['rotation', 'isSerial', 'barcodeType', 'serialStart', 'serialEnd', 'serialStep', 'serialPad'].includes(prop)) {
      this.buildRightPanel(document.getElementById('rightpanel'));
    }
  },

  autoFitTextElement(elem, oldW) {
    if (!elem || elem.type !== 'text') return;
    let txt = elem.text || ' ';
    if (elem.isSerial) {
      const sn = String(elem.serialStart || 1).padStart(elem.serialPad || 3, '0');
      txt = txt.includes('{SN}') ? txt.replace('{SN}', sn) : `${txt} ${sn}`.trim();
    }
    const measured = measureTextMm(txt, elem.font, elem.size, elem.bold, elem.italic);
    const newW = Math.max(6.0, Math.round((measured.w + 1.2) * 10) / 10);
    const newH = Math.max(3.0, Math.round((measured.h + 0.6) * 10) / 10);

    const prevRight = (elem.x || 0) + (oldW || elem.w || 10);
    elem.w = newW;
    elem.h = newH;

    const spec = getTapeSpec(S.tapeWidth);
    if (elem.h > spec.maxPrint) {
      elem.h = spec.maxPrint;
    }
    if (elem.y + elem.h > S.tapeWidth - spec.sideMargin) {
      elem.y = Math.max(spec.sideMargin, Math.round((S.tapeWidth - spec.sideMargin - elem.h) * 10) / 10);
    }

    const newRight = (elem.x || 0) + elem.w;
    if (newRight > prevRight) {
      const shift = newRight - prevRight;
      S.elements.forEach(other => {
        if (other.id !== elem.id && (other.x || 0) >= prevRight - 1.0) {
          other.x = Math.round(((other.x || 0) + shift) * 10) / 10;
        }
      });
    }

    const wInp = document.getElementById('okPropW');
    const hInp = document.getElementById('okPropH');
    const yInp = document.getElementById('okPropY');
    if (wInp) wInp.value = elem.w;
    if (hInp) hInp.value = elem.h;
    if (yInp) yInp.value = elem.y;
  },

  autoFitSelectedText() {
    const elem = getSelectedElem();
    if (elem && elem.type === 'text') {
      this.saveUndoState();
      this.autoFitTextElement(elem);
      this.renderCanvas();
      this.buildRightPanel(document.getElementById('rightpanel'));
    }
  },

  // ── 6. 테이프 파라미터 제어 ────────────────────────────────────────────────
  setTapeWidth(w) {
    if (S.tapeWidth === w) return;
    this.saveUndoState();
    const previousWidth = S.tapeWidth;
    rescaleElementsForTapeWidth(S.elements, previousWidth, w);
    S.tapeWidth = w;
    const spec = getTapeSpec(w);
    const maxY = w - spec.sideMargin;
    S.elements.forEach(e => {
      if (e.h > spec.maxPrint) {
        e.h = Math.max(2, Math.round(spec.maxPrint * 10) / 10);
        if (e.type === 'qrcode') e.w = e.h;
      }
      if (e.y + e.h > maxY) {
        e.y = Math.max(spec.sideMargin, Math.round((maxY - e.h) * 10) / 10);
      }
    });
    this.buildSidebar(document.getElementById('sidebar'));
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  setLengthMode(mode) {
    if (S.lengthMode === mode) return;
    this.saveUndoState();
    S.lengthMode = mode;
    this.buildSidebar(document.getElementById('sidebar'));
    this.renderCanvas();
  },

  setFixedLength(len) {
    if (S.fixedLength === len) return;
    this.saveUndoState();
    S.fixedLength = len;
    this.renderCanvas();
  },

  setMarginPreset(val) {
    this.setCustomMargin(val);
  },

  setCustomMargin(m) {
    const margin = Math.max(1.0, Math.min(60.0, Math.round(m * 10) / 10));
    if (S.marginMm === margin) return;
    this.saveUndoState();
    S.marginMm = margin;
    if (margin === 2.0) S.marginMode = 'minimum';
    else if (margin === 8.0) S.marginMode = 'standard';
    else if (margin === 12.0) S.marginMode = 'wide';
    else S.marginMode = 'custom';

    this.applyMarginShift();
    this.buildSidebar(document.getElementById('sidebar'));
    this.renderCanvas();
  },

  stepMargin(delta) {
    const cur = S.marginMm ?? 8.0;
    this.setCustomMargin(cur + delta);
  },

  setMarginMode(mode) {
    if (mode === 'minimum') this.setCustomMargin(2.0);
    else if (mode === 'standard') this.setCustomMargin(8.0);
    else if (mode === 'wide') this.setCustomMargin(12.0);
  },

  applyMarginShift() {
    let minLeft = 9999;
    S.elements.forEach(e => {
      if ((e.x || 0) < minLeft) minLeft = e.x || 0;
    });
    if (minLeft === 9999) return;
    const targetMinLeft = Math.max(0.5, Math.round(((S.marginMm ?? 8.0) - 1.5) * 10) / 10);
    const deltaX = targetMinLeft - minLeft;
    if (Math.abs(deltaX) > 0.05) {
      S.elements.forEach(e => {
        e.x = Math.max(0.5, Math.round(((e.x || 0) + deltaX) * 10) / 10);
      });
    }
  },

  setCutterMode(c) {
    if (S.cutterMode === c) return;
    this.saveUndoState();
    S.cutterMode = c;
  },

  applySelectedTextSize(size) {
    const texts = getSelectedElems().filter(element => element.type === 'text');
    if (!texts.length) return;
    const nextSize = Math.max(1, Math.min(72, Number(size) || 10));
    this.saveUndoState();
    texts.forEach(element => { element.size = nextSize; this.autoFitTextElement(element, element.w); });
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  applySelectedAlignment(alignment) {
    const texts = getSelectedElems().filter(element => element.type === 'text');
    if (!texts.length) return;
    this.saveUndoState();
    texts.forEach(element => { element.align = alignment; });
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  applySelectedRotation(rotation) {
    const selected = getSelectedElems();
    if (!selected.length) return;
    const nextRotation = ((Math.round(Number(rotation) || 0) % 360) + 360) % 360;
    this.saveUndoState();
    selected.forEach(element => { element.rotation = nextRotation; });
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  setTapeColor(col) {
    if (S.tapeColor === col) return;
    this.saveUndoState();
    S.tapeColor = col;
    this.renderCanvas();
  },

  setZoom(z) {
    S.zoom = Math.max(0.4, Math.min(3.0, Math.round(z * 10) / 10));
    const lbl = document.getElementById('okZoomLabel');
    if (lbl) lbl.textContent = `${Math.round(S.zoom * 100)}%`;
    this.renderCanvas();
  },

  // ── 7. 요소 추가 / 삭제 / 복제 ────────────────────────────────────────────
  addElement(type) {
    const lead = getLeadMargin();
    const side = getTapeSpec().sideMargin;
    const newId = `elem_${Date.now().toString(36)}`;
    let newElem = null;

    if (type === 'text') {
      const initTxt = '새 라벨 텍스트';
      const measured = measureTextMm(initTxt, 'Arial', 10, false, false);
      newElem = {
        id: newId, type: 'text',
        x: Math.max(0.5, (S.marginMm ?? 8.0) - 1.5), y: side + 2,
        w: Math.round((measured.w + 1.2) * 10) / 10,
        h: Math.round((measured.h + 0.6) * 10) / 10,
        text: initTxt,
        font: 'Arial', size: 10, bold: false, italic: false, underline: false,
        align: 'left', rotation: 0,
        isSerial: false, serialStart: 1, serialEnd: 1, serialStep: 1, serialPad: 3
      };
    } else if (type === 'barcode') {
      newElem = {
        id: newId, type: 'barcode',
        x: Math.max(0.5, (S.marginMm ?? 8.0) - 1.5), y: side + 2, w: 36, h: 12,
        barcodeType: 'Code128', barcodeData: '12345678', showText: true,
        rotation: 0
      };
    } else if (type === 'qrcode') {
      newElem = {
        id: newId, type: 'qrcode',
        x: Math.max(0.5, (S.marginMm ?? 8.0) - 1.5), y: side + 2, w: 16, h: 16,
        barcodeData: 'https://3m.com',
        rotation: 0
      };
    } else if (type === 'serial') {
      const initTxt = 'SN: {SN}';
      const measured = measureTextMm('SN: 001', 'Arial', 11, true, false);
      newElem = {
        id: newId, type: 'text',
        x: Math.max(0.5, (S.marginMm ?? 8.0) - 1.5), y: side + 2,
        w: Math.round((measured.w + 1.2) * 10) / 10,
        h: Math.round((measured.h + 0.6) * 10) / 10,
        text: initTxt,
        font: 'Arial', size: 11, bold: true, italic: false, underline: false,
        align: 'left', rotation: 0,
        isSerial: true, serialStart: 1, serialEnd: 1, serialStep: 1, serialPad: 3
      };
    }

    if (newElem) {
      this.saveUndoState();
      S.elements.push(newElem);
      this.selectElem(newId);
    }
  },

  deleteSelected() {
    const ids = selectedIdSet();
    if (!ids.size) return;
    this.saveUndoState();
    S.elements = S.elements.filter(e => !ids.has(e.id));
    S.selectedId = S.elements[0]?.id || null;
    S.selectedIds = S.selectedId ? [S.selectedId] : [];
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  duplicateSelected() {
    const elem = getSelectedElem();
    if (!elem) return;
    this.saveUndoState();
    const copy = JSON.parse(JSON.stringify(elem));
    copy.id = `elem_${Date.now().toString(36)}`;
    copy.x = (copy.x || 0) + 4;
    copy.y = (copy.y || 0) + 2;
    S.elements.push(copy);
    this.selectElem(copy.id);
  },

  alignSelected(dir) {
    const elem = getSelectedElem();
    if (!elem) return;
    this.saveUndoState();
    if (dir === 'centerH') {
      const effLen = getEffectiveLength();
      elem.x = Math.round(((effLen - elem.w) / 2) * 2) / 2;
    } else if (dir === 'centerV') {
      elem.y = Math.round(((S.tapeWidth - elem.h) / 2) * 2) / 2;
    }
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  centerAllSymmetrically(recordUndo = true) {
    if (recordUndo) this.saveUndoState();
    let minLeft = 9999;
    let maxRight = 0;
    S.elements.forEach(e => {
      let ew = e.w || 10;
      if (e.type === 'text') {
        const measured = measureTextMm(e.text, e.font, e.size, e.bold, e.italic);
        ew = Math.max(ew, Math.round((measured.w + 1.2) * 10) / 10);
        e.w = ew;
      }
      const left = e.x || 0;
      const right = left + ew;
      if (left < minLeft) minLeft = left;
      if (right > maxRight) maxRight = right;
    });
    if (minLeft >= maxRight) return;
    const contentW = maxRight - minLeft;

    // 대칭 중심 맞춤:
    // 고정 길이 모드: (S.fixedLength - 1.5 - contentW) / 2
    // 자동 길이 모드: 설정된 물리 여백(S.marginMm - 1.5)으로 시작점 정렬 (좌/우 여백이 완벽히 대칭이 됨)
    const targetMinLeft = S.lengthMode === 'fixed'
      ? Math.max(0.5, Math.round(((S.fixedLength - 1.5 - contentW) / 2) * 10) / 10)
      : Math.max(0.5, Math.round(((S.marginMm ?? 8.0) - 1.5) * 10) / 10);

    const deltaX = targetMinLeft - minLeft;
    S.elements.forEach(e => {
      e.x = Math.max(0.5, Math.round((e.x + deltaX) * 10) / 10);
    });

    // 세로 중앙 정렬도 함께 점검
    let minY = 9999;
    let maxY = 0;
    S.elements.forEach(e => {
      const top = e.y || 0;
      const bot = top + (e.h || 10);
      if (top < minY) minY = top;
      if (bot > maxY) maxY = bot;
    });
    if (minY < maxY) {
      const contentH = maxY - minY;
      const targetMinY = Math.max(getTapeSpec().sideMargin, Math.round(((S.tapeWidth - contentH) / 2) * 10) / 10);
      const deltaY = targetMinY - minY;
      S.elements.forEach(e => {
        e.y = Math.max(getTapeSpec().sideMargin, Math.round(((e.y || 0) + deltaY) * 10) / 10);
      });
    }

    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  triggerImageUpload() {
    const inp = document.getElementById('okImageInput');
    if (inp) inp.click();
  },

  handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      this.saveUndoState();
      const newId = `elem_${Date.now().toString(36)}`;
      S.elements.push({
        id: newId, type: 'image',
        x: getLeadMargin() + 2, y: getTapeSpec().sideMargin + 2, w: 16, h: 16,
        imageSrc: ev.target.result, rotation: 0
      });
      this.selectElem(newId);
    };
    reader.readAsDataURL(file);
  },

  loadPreset(name) {
    this.saveUndoState();
    S.marginMm = 8.0;
    S.marginMode = 'standard';
    if (name === 'asset') {
      S.tapeWidth = 24.0;
      S.lengthMode = 'auto';
      S.elements = [
        { id: 't1', type: 'text', x: 6.5, y: 5.2, w: 38.0, h: 5.0, text: 'EQUIPMENT ASSET TAG', font: 'Arial', size: 9, bold: true },
        { id: 't2', type: 'text', x: 6.5, y: 12.0, w: 38.0, h: 6.8, text: 'ID: EP-OK900P-{SN}', font: 'Arial', size: 11, bold: true, isSerial: true, serialStart: 1, serialEnd: 1, serialStep: 1, serialPad: 3 },
        { id: 'q1', type: 'qrcode', x: 47.5, y: 4.8, w: 14.5, h: 14.5, barcodeData: 'https://3m.com/instrument' }
      ];
    } else if (name === 'chemical') {
      S.tapeWidth = 12.0;
      S.lengthMode = 'auto';
      S.elements = [
        { id: 't1', type: 'text', x: 3, y: 1.5, w: 34, h: 4.5, text: 'SAMPLE: #2026-A', font: 'Arial', size: 8, bold: true },
        { id: 'b1', type: 'barcode', x: 3, y: 6.2, w: 34, h: 4.5, barcodeData: 'SMP2026A', barcodeType: 'Code128', showText: false }
      ];
    } else if (name === 'warning') {
      S.tapeWidth = 36.0;
      S.lengthMode = 'auto';
      S.elements = [
        { id: 't1', type: 'text', x: 5, y: 4, w: 55, h: 10, text: '⚠️ CAUTION / 주의', font: 'Arial', size: 16, bold: true, align: 'center' },
        { id: 't2', type: 'text', x: 5, y: 16, w: 55, h: 14, text: 'HIGH VOLTAGE INSIDE\n관계자 외 조작 금지', font: '맑은 고딕', size: 10, bold: true, align: 'center' }
      ];
    }
    S.elements.forEach(e => {
      if (e.type === 'text') this.autoFitTextElement(e);
    });
    this.centerAllSymmetrically(false);
    S.selectedId = S.elements[0]?.id || null;
    S.selectedIds = S.selectedId ? [S.selectedId] : [];
    this.buildSidebar(document.getElementById('sidebar'));
    this.renderCanvas();
    this.buildRightPanel(document.getElementById('rightpanel'));
  },

  // ── 8. 프린터 검색 & 인쇄 API 연동 ─────────────────────────────────────────
  async fetchPrinters() {
    try {
      const res = await fetch('/api/printers');
      const data = await res.json();
      if (data.ok && data.printers) {
        S.printers = data.printers;
        const sel = document.getElementById('okPrinterSelect');
        if (sel) {
          sel.innerHTML = data.printers.map(p => {
            const isDetected = (p === data.detected);
            const isSelected = (p === (data.detected || S.selectedPrinter || data.printers[0]));
            const label = isDetected ? `${p} ★` : p;
            return `<option value="${p}" ${isSelected ? 'selected' : ''} title="${p}">${label}</option>`;
          }).join('');
          S.selectedPrinter = sel.value;
        }
        if (data.detected) {
          S.selectedPrinter = data.detected;
        }
        this.renderDriverNotice(Boolean(data.detected), Boolean(data.driverFilesAvailable));
      } else {
        // Do not leave the select box at "Searching..." when the local server
        // replies with a structured error (for example, a missing print module).
        const sel = document.getElementById('okPrinterSelect');
        if (sel) sel.innerHTML = `<option value="">${t('printer_select')}</option>`;
        this.renderDriverNotice(false, false);
        const toast = document.getElementById('okPrintToast');
        if (toast) toast.textContent = data.error || t('printer_not_found');
      }
    } catch (e) {
      console.warn('프린터 목록 조회 실패 (오프라인 모드):', e);
      const sel = document.getElementById('okPrinterSelect');
      if (sel) sel.innerHTML = `<option value="Microsoft Print to PDF">Microsoft Print to PDF (가상)</option>`;
      S.selectedPrinter = "Microsoft Print to PDF";
      this.renderDriverNotice(false, false);
    }
  },

  renderDriverNotice(isDetected, filesAvailable) {
    const card = document.getElementById('okDriverNotice');
    if (!card) return;
    if (isDetected) {
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:6px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35);font-size:11px;color:#22c55e;">
          <span style="font-weight:700;display:flex;align-items:center;gap:4px;">🟢 ${t('driver_detected_ok')}</span>
          <button class="sbtn" style="padding:1px 6px;font-size:10px;" onclick="app.instr.showDriverModal()">${t('driver_settings_btn')}</button>
        </div>
      `;
      card.style.display = 'block';
    } else {
      card.innerHTML = `
        <div style="background:rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 11px; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 4px;">
              <span>⚠️</span> <span>${t("driver_not_found")}</span>
            </span>
            <span style="font-size: 10px; color: var(--text-dim);">${filesAvailable ? '내장 드라이버 있음' : ''}</span>
          </div>
          <div style="font-size: 10.5px; color: var(--text-dim); line-height: 1.35;">
            ${t("driver_not_found_desc")}
          </div>
          <div style="display: flex; gap: 4px; margin-top: 2px;">
            <button class="sbtn" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 700; background: #2563eb; color: #fff; border:none;" onclick="app.instr.installDriver()">
              ${t("driver_install_btn")}
            </button>
            <button class="sbtn" style="padding: 5px 8px; font-size: 11px;" onclick="app.instr.openDriverFolder()" title="${t('driver_folder_btn')}">
              📂
            </button>
            <button class="sbtn" style="padding: 5px 8px; font-size: 11px;" onclick="app.instr.showDriverModal()" title="${t('driver_manage_tip')}">
              🛠️
            </button>
          </div>
        </div>
      `;
      card.style.display = 'block';
    }
  },

  async installDriver() {
    const toast = document.getElementById('okPrintToast');
    if (toast) toast.innerText = '드라이버 설치 마법사 호출 중...';
    try {
      const res = await fetch('/api/driver/install/ok900p', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert(t('driver_launch_success'));
        if (toast) toast.innerText = t('driver_launch_success');
        setTimeout(() => this.fetchPrinters(), 4000);
        setTimeout(() => this.fetchPrinters(), 8000);
      } else {
        alert(tf('driver_launch_fail', { err: data.error || 'Unknown error' }));
      }
    } catch (e) {
      alert(tf('driver_launch_fail', { err: e.message }));
    }
  },

  async installOfficialWizard() {
    try {
      const res = await fetch('/api/driver/install-wizard/ok900p', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert(data.message || 'EPSON 공식 드라이버 마법사가 실행되었습니다.');
        setTimeout(() => this.fetchPrinters(), 5000);
      } else {
        alert(tf('driver_launch_fail', { err: data.error }));
      }
    } catch (e) {
      alert(tf('driver_launch_fail', { err: e.message }));
    }
  },

  async openDriverFolder() {
    try {
      const res = await fetch('/api/driver/open-folder/ok900p', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || '드라이버 폴더를 열 수 없습니다.');
      }
    } catch (e) {
      alert(e.message);
    }
  },

  downloadDriverZip() {
    window.location.href = '/api/driver/download/ok900p';
  },

  showDriverModal() {
    let modal = document.getElementById('okDriverModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'okDriverModal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
      document.body.appendChild(modal);
    }
    const isDetected = S.printers.some(p => p.toUpperCase().includes('OK900P'));
    modal.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:520px;max-width:95vw;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 12px 36px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3 style="margin:0;font-size:16px;color:var(--text);display:flex;align-items:center;gap:8px;">
            ${t("driver_modal_title")}
          </h3>
          <button class="icon-btn" onclick="document.getElementById('okDriverModal').style.display='none'" style="font-size:16px;cursor:pointer;">✕</button>
        </div>

        <div style="padding:10px 14px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);font-size:12px;display:flex;align-items:center;justify-content:space-between;">
          <span>드라이버 인식 상태:</span>
          <span style="font-weight:700;color:${isDetected ? '#22c55e' : '#eab308'};">
            ${isDetected ? '🟢 EPSON OK900P 정상 연결' : '⚠️ 미설치 / 미인식'}
          </span>
        </div>

        <div style="font-size:12px;color:var(--text-dim);line-height:1.4;">
          ${t("driver_modal_desc")}
        </div>

        <!-- 방법 1 -->
        <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${t("driver_method1_title")}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${t("driver_method1_desc")}</div>
          </div>
          <button class="sbtn" style="background:#2563eb;color:#fff;padding:6px 12px;font-size:12px;font-weight:700;white-space:nowrap;border:none;" onclick="app.instr.installDriver()">
            ${t("driver_install_btn")}
          </button>
        </div>

        <!-- 방법 2 -->
        <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${t("driver_method2_title")}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${t("driver_method2_desc")}</div>
          </div>
          <button class="sbtn" style="padding:6px 12px;font-size:12px;white-space:nowrap;" onclick="app.instr.installOfficialWizard()">
            실행 (Wizard)
          </button>
        </div>

        <!-- 방법 3 -->
        <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${t("driver_method3_title")}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${t("driver_method3_desc")}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="sbtn" style="padding:6px 10px;font-size:12px;" onclick="app.instr.openDriverFolder()">
              📂 폴더 열기
            </button>
            <button class="sbtn" style="padding:6px 10px;font-size:12px;" onclick="app.instr.downloadDriverZip()">
              💾 ZIP
            </button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:6px;">
          <button class="sbtn" style="padding:6px 16px;font-size:12px;" onclick="document.getElementById('okDriverModal').style.display='none'">
            ${t("close_btn")}
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  },

  setPrinter(p) {
    S.selectedPrinter = p;
  },

  setCopies(n) {
    S.copies = Math.max(1, Math.min(999, n));
    const inp = document.getElementById('okCopiesInput');
    if (inp) inp.value = S.copies;
  },

  stepCopies(delta) {
    this.setCopies(S.copies + delta);
  },

  // ── 9. 360 DPI 1-bit Monochrome 고해상도 비트맵 렌더러 ──────────────────────
  renderHighRes360(serialOffset = 0, targetReplaceVal = null) {
    const effLenMm = getEffectiveLength();
    const tapeWidthMm = S.tapeWidth;
    const dpi = 360;
    const dotsPerMm = dpi / 25.4; // ≈ 14.1732

    const wPx = Math.round(effLenMm * dotsPerMm);
    const hPx = Math.round(tapeWidthMm * dotsPerMm);

    const canvas = document.createElement('canvas');
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');

    // 1. 흰색 배경 채우기
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, wPx, hPx);

    // 2. 요소 순차 렌더링
    S.elements.forEach(e => {
      const ex = Math.round(e.x * dotsPerMm);
      const ey = Math.round(e.y * dotsPerMm);
      const ew = Math.round(e.w * dotsPerMm);
      const eh = Math.round(e.h * dotsPerMm);

      ctx.save();
      if (e.rotation) {
        ctx.translate(ex + ew / 2, ey + eh / 2);
        ctx.rotate((e.rotation * Math.PI) / 180);
        ctx.translate(-(ex + ew / 2), -(ey + eh / 2));
      }

      if (e.type === 'text') {
        let txt = (targetReplaceVal && e.id === S.batchTargetId) ? targetReplaceVal : (e.text || '');
        if (e.isSerial) {
          const sn = String((e.serialStart || 1) + serialOffset * (e.serialStep || 1)).padStart(e.serialPad || 3, '0');
          txt = txt.includes('{SN}') ? txt.replace('{SN}', sn) : `${txt} ${sn}`.trim();
        }

        const fontPt = e.size || 10;
        const fontPx = Math.round(fontPt * 5); // 360 DPI: 1pt = 5px
        ctx.font = `${e.bold ? 'bold' : ''} ${e.italic ? 'italic' : ''} ${fontPx}px ${e.font || 'Arial'}`;
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'top';

        const lines = txt.split('\n');
        const lineH = fontPx * 1.15;
        lines.forEach((l, idx) => {
          let tx = ex;
          if (e.align === 'center') {
            const tw = ctx.measureText(l).width;
            tx = ex + (ew - tw) / 2;
          } else if (e.align === 'right') {
            const tw = ctx.measureText(l).width;
            tx = ex + ew - tw;
          }
          ctx.fillText(l, tx, ey + idx * lineH);
          if (e.underline) {
            ctx.fillRect(tx, ey + idx * lineH + fontPx, ctx.measureText(l).width, Math.max(2, fontPx / 10));
          }
        });

      } else if (e.type === 'barcode') {
        const bcData = (targetReplaceVal && e.id === S.batchTargetId) ? targetReplaceVal : (e.barcodeData || '12345678');
        drawCode128(ctx, bcData, ex, ey, ew, eh, e.showText !== false);
      } else if (e.type === 'qrcode') {
        const qrData = (targetReplaceVal && e.id === S.batchTargetId) ? targetReplaceVal : (e.barcodeData || 'https://3m.com');
        drawQRCode(ctx, qrData, ex, ey, Math.min(ew, eh), Math.min(ew, eh));
      }

      ctx.restore();
    });

    // 3. 1-Bit Monochrome Thresholding 변환 (0: 검정, 255: 흰색)
    const imgData = ctx.getImageData(0, 0, wPx, hPx);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const bin = gray < 128 ? 0 : 255;
      d[i] = bin;
      d[i + 1] = bin;
      d[i + 2] = bin;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    return canvas;
  },

  // ── 10. 단일 인쇄 실행 ────────────────────────────────────────────────────
  async printLabel() {
    const btn = document.getElementById('okPrintBtn');
    const toast = document.getElementById('okPrintToast');
    const serialElem = S.elements.find(element => element.type === 'text' && element.isSerial);
    const serialPlan = serialElem ? serialPrintPlan(serialElem) : { ok:true, count:1, values:[''], offsets:[0] };
    if (!serialPlan.ok) {
      const message = serialPlan.reason === 'too_large' ? t('serial_range_too_large') : t('serial_range_invalid');
      if (toast) { toast.textContent = `⚠️ ${message}`; toast.style.color = '#f87171'; }
      return;
    }
    if (btn) btn.disabled = true;
    const totalCopies = serialPlan.count * S.copies;
    if (toast) {
      const range = serialElem ? `${serialPlan.values[0]} → ${serialPlan.values.at(-1)}` : '';
      toast.textContent = `${t('rendering_toast')}${range ? ` (${range} · ${totalCopies}장)` : ''}`;
      toast.style.color = '#38bdf8';
    }

    try {
      let completed = 0;
      for (const serialOffset of serialPlan.offsets) {
        const canvas360 = this.renderHighRes360(serialOffset);
        const payload = {
          printer: S.selectedPrinter || "Microsoft Print to PDF",
          imageBase64: canvas360.toDataURL('image/png'),
          tapeWidthMm: S.tapeWidth,
          lengthMm: getEffectiveLength(),
          copies: S.copies
        };
        const res = await fetch('/api/print/ok900p', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || '인쇄 실패');
        completed++;
        if (toast && serialElem) {
          toast.textContent = `🖨️ ${serialPlan.values[completed - 1]} (${completed}/${serialPlan.count}) · ${S.copies}장씩 전송 중`;
        }
      }
      if (toast) {
        const range = serialElem ? ` ${serialPlan.values[0]} → ${serialPlan.values.at(-1)}` : '';
        toast.textContent = `✅ ${range.trim() ? `${range} · ` : ''}총 ${totalCopies}장 전송 완료`;
        toast.style.color = '#10b981';
      }
    } catch (err) {
      console.warn('Spooler 전송 실패, 브라우저 다운로드 폴백:', err);
      if (toast) { toast.textContent = `⚠️ 인쇄 전송 실패: ${err.message}`; toast.style.color = '#f87171'; }
      // 폴백으로 360 DPI 이미지 바로 저장
      if (confirm(`프린터 스풀러 전송 오류: ${err.message}\n\n360 DPI 고해상도 라벨 PNG 파일로 다운로드하시겠습니까?`)) {
        this.download360Png();
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  download360Png() {
    const canvas360 = this.renderHighRes360(0);
    const link = document.createElement('a');
    link.download = `label_${S.tapeWidth}mm_${getEffectiveLength()}mm_360dpi.png`;
    link.href = canvas360.toDataURL('image/png');
    link.click();
  },

  showPreviewModal() {
    const canvas360 = this.renderHighRes360(0);
    const dataUrl = canvas360.toDataURL('image/png');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:800px;width:90%;max-height:85vh;display:flex;flex-direction:column;gap:14px;box-shadow:0 12px 36px #000;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:14px;font-weight:700;color:var(--text);">${t("preview_modal_title")}</div>
          <button class="icon-btn" onclick="this.closest('div[style*=fixed]').remove()">✕</button>
        </div>
        <div style="font-size:11px;color:var(--text-dim);">
          ${tf("preview_spec", {w: canvas360.width, h: canvas360.height, tw: S.tapeWidth, len: getEffectiveLength()})}
        </div>
        <div style="flex:1;overflow:auto;background:#222;padding:20px;display:flex;align-items:center;justify-content:center;border-radius:6px;">
          <img src="${dataUrl}" style="max-width:100%;box-shadow:0 4px 16px rgba(0,0,0,0.6);background:#fff;">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="sbtn" onclick="app.instr.download360Png()">${t("png_download_btn")}</button>
          <button class="sbtn green" onclick="app.instr.printLabel(); this.closest('div[style*=fixed]').remove();">${t("direct_print_btn")}</button>
          <button class="sbtn" onclick="this.closest('div[style*=fixed]').remove()">${t("close_btn")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  // ── 11. 대량 연속 인쇄 (Batch Data Sheet) ──────────────────────────────────
  toggleBatchSheet() {
    S.batchOpen = !S.batchOpen;
    const body = document.getElementById('okBatchBody');
    const icon = document.getElementById('okBatchToggleIcon');
    if (body) body.style.display = S.batchOpen ? 'flex' : 'none';
    if (icon) icon.textContent = S.batchOpen ? t('collapse_btn') : t('expand_btn');
  },

  setBatchTarget(id) {
    S.batchTargetId = id;
  },

  triggerCsvImport() {
    const inp = document.getElementById('okCsvInput');
    if (inp) inp.click();
  },

  handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split(/\r?\n/).filter(x => x.trim());
      S.batchData = lines.map(line => line.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')));
      this.updateBatchTable();
    };
    reader.readAsText(file);
  },

  async pasteFromClipboard() {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt) return;
      const lines = txt.split(/\r?\n/).filter(x => x.trim());
      S.batchData = lines.map(line => line.split('\t').map(s => s.trim()));
      this.updateBatchTable();
    } catch (err) {
      alert('클립보드 읽기 권한이 필요하거나 비어 있습니다: ' + err);
    }
  },

  clearBatchData() {
    S.batchData = [];
    this.updateBatchTable();
  },

  updateBatchTable() {
    const count = document.getElementById('okBatchRowCount');
    if (count) count.textContent = `(${S.batchData.length} ${t("batch_loaded")})`;

    const tbody = document.getElementById('okBatchTableBody');
    if (!tbody) return;
    tbody.innerHTML = S.batchData.map((row, idx) => `
      <tr style="border-bottom:1px solid var(--border-2);">
        <td style="padding:4px 8px;color:var(--text-dim);">${idx+1}</td>
        <td style="padding:4px 8px;">${row[0]||''}</td>
        <td style="padding:4px 8px;">${row[1]||''}</td>
        <td style="padding:4px 8px;">${row[2]||''}</td>
      </tr>
    `).join('');
  },

  async startBatchPrint() {
    if (!S.batchData.length) {
      alert(t('batch_empty_alert'));
      return;
    }

    if (!confirm(tf('batch_confirm_msg', {count: S.batchData.length, printer: S.selectedPrinter||'Default'}))) {
      return;
    }

    let successCount = 0;
    for (let i = 0; i < S.batchData.length; i++) {
      const rowVal = S.batchData[i][0] || '';
      try {
        const canvas360 = this.renderHighRes360(i, rowVal);
        const dataUrl = canvas360.toDataURL('image/png');

        await fetch('/api/print/ok900p', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            printer: S.selectedPrinter,
            imageBase64: dataUrl,
            tapeWidthMm: S.tapeWidth,
            lengthMm: getEffectiveLength(),
            copies: 1
          })
        });
        successCount++;
      } catch (err) {
        console.error(`행 ${i+1} 인쇄 실패:`, err);
      }
    }

    alert(tf('batch_complete_msg', {total: S.batchData.length, success: successCount}));
  }
};
