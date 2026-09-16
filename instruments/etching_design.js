// Etching Design — Professional Precision Chemical Etching CAD & Layout Studio
// Complete 3-Panel Engineering Application: Settings (Left), 2D Preview (Center), Calculation/Result (Right)

import { EtchingState } from './etching_design/state.js';
import { generateDXF, validateCadGeometry } from './etching_design/export_dxf.js';
import { buildCadEntities, calculateBridgesAndGaps, calculateSpecimenFeatureGeometry } from './etching_design/cad_builder.js';
import { generateSVG } from './etching_design/export_svg.js';
import { generatePDF } from './etching_design/export_pdf.js';

let state = null;
let _canvas = null;
let _ctx = null;
let _isPanning = false;
let _panStart = { x: 0, y: 0 };
let _resizeObserver = null;
let _geomCache = null;
let _mouseMoveHandler = null;
let _mouseUpHandler = null;
let _keyHandler = null;

// ── i18n Dictionary ─────────────────────────────────────────────────────────
const I18N = {
  ko: {
    // Mode
    mode_single: '단일 디자인',
    mode_mixed: '혼합 배치',

    // Preset
    sec_preset: '프리셋 선택',
    preset_type1: 'TYPE 1 (15×6 mm 378개 확정)',
    preset_type2: 'TYPE 2 (50×10 mm SUS316L)',
    preset_type3: 'TYPE 3 (40×3 mm 보강판)',
    preset_custom: '사용자 정의 (직접 입력)',

    // Single Plate
    sec_plate: '원판 규격 및 여백 설정',
    plate_width: '원판 가로 폭 (mm)',
    plate_height: '원판 세로 높이 (mm)',
    margin_auto: '자동 중앙 정렬',
    margin_manual: '수동 여백 설정',
    margin_lr: '좌/우 여백 (mm)',
    margin_tb: '상/하 여백 (mm)',

    // Sample Spec
    sec_sample: '시편 규격',
    sample_width: '시편 가로 폭 (mm)',
    sample_height: '시편 세로 높이 (mm)',

    // Orientation
    sec_orient: '시편 가공 방향',
    orient_center_override: '중앙 시편 개별 방향 지정',

    // Layout & Gaps
    sec_layout: '배열 구조 및 간격',
    layout_fixed: '열·행 직접 입력',
    layout_auto: '원판 맞춤 자동 배치',
    layout_fixed_help: '열 수와 행 수를 사용자가 직접 지정합니다.',
    layout_auto_help: '원판 크기, 시편 크기, 가로·세로 간격을 계산하여 들어갈 수 있는 열과 행을 자동으로 배치합니다.',
    cols: '열 수 (가로)',
    rows: '행 수 (세로)',
    h_gap: '구분선 / 가로 간격 (mm)',
    v_gap: '브릿지 위·아래 에칭 거리 (mm)',

    // Tabs
    sec_tabs: '지지대 및 브릿지 가공',
    tabs_enable: '지지대 사용',
    tab_width: '지지대 폭 (mm)',
    tab_length: '지지대 길이 (mm)',
    tab_feature_sec: '브릿지(시편 본체) 가공',
    tab_feature_type: '가공 형태',
    tab_feature_none: '없음 (솔리드)',
    tab_feature_hole: '원형 관통 홀 (Hole)',
    tab_feature_slot: '직사각형 홈 (Slot/Notch)',
    tab_hole_dia: '홀 직경 Ø (mm)',
    tab_slot_w: '홈 폭 W (mm)',
    tab_slot_h: '홈 높이 H (mm)',
    tab_pos_x: '가로 (X) 위치',
    tab_pos_y: '세로 (Y) 위치',
    tab_pos_center: '브릿지 정중앙',
    tab_pos_two_points: '브릿지 2포인트 (좌·우 대칭)',
    tab_pos_four_points: '브릿지 4포인트 (네 모서리)',
    tab_hole_distance_x: '좌 홀 ↔ 우 홀 중심 거리 (mm)',
    tab_hole_distance_y: '상 홀 ↔ 하 홀 중심 거리 (mm)',
    tab_slot_distance_x: '좌 사각형 ↔ 우 사각형 중심 거리 (mm)',
    tab_slot_distance_y: '상 사각형 ↔ 하 사각형 중심 거리 (mm)',
    tab_pos_specimen: '브릿지-지지대 연결부',
    tab_pos_runner: '원판-지지대 연결부',
    tab_pos_custom: '직접 입력 (mm)',
    tab_pos_top: '상단 노치',
    tab_pos_bot: '하단 노치',
    tab_pos_both: '상·하 대칭 노치',
    tab_apply_all_btn: '✓ 해당 타입 전체 적용',
    tab_apply_all_confirm: '선택한 시편에서 확인한 브릿지 가공을 이 타입의 모든 시편에 적용하시겠습니까?',
    tab_preview_help: '① 가공값 설정  ② 캔버스에서 시편 1개 클릭  ③ 미리보기 확인  ④ 해당 타입 전체 적용',
    tab_preview_select_first: '먼저 캔버스에서 이 타입의 시편을 하나 클릭해 미리보기를 확인하세요.',
    tab_runner_gap: '지지대 사이 러너 여백',

    // Mixed Sheet
    sec_mixed_sheet: '원판 규격 및 여백 설정',
    sec_mixed_partition: '혼합 구획 분할 및 경계 여백',
    mixed_sheet_w: '원판 가로 폭 (mm)',
    mixed_sheet_h: '원판 세로 높이 (mm)',
    boundary_width: '타입 간 기본 여백 (mm)',
    boundary_between_types: '{type1} ↔ {type2} 여백',
    margin_mode: '여백 모드',
    sec_split_dir: '구획 분할 방식',
    split_vertical: '세로 분할 (좌 / 우)',
    split_horizontal: '가로 분할 (상 / 하)',
    pos_top: '상단',
    pos_mid: '중단',
    pos_bot: '하단',
    pos_left: '좌측',
    pos_right: '우측',
    mixed_dir_desc_split_h: '원판을 위/아래 행(상/중/하)으로 분할하여 배치하며, 목표 비율에 맞추어 행과 열이 자동 배분됩니다.',
    mixed_dir_desc_split_v: '원판을 좌/우 열(좌/중/우)로 분할하여 배치하며, 목표 비율에 맞추어 행과 열이 자동 배분됩니다.',
    mixed_dir_title: '📐 작업 방향: 가로 긴 방향 (1번 타입 기준 자동 정렬)',
    mixed_dir_desc: '모든 시편이 가로로 긴 형태로 자동 배치되며, 전체 원판 크기에 맞추어 열과 행이 자동 배분됩니다.',
    mixed_dir_title_h: '📐 작업 방향: 가로 긴 방향 (1번 타입 기준 자동 정렬)',
    mixed_dir_desc_h: '모든 시편이 가로로 긴 형태로 자동 배치되며, 전체 원판 크기에 맞추어 열과 행이 자동 배분됩니다.',
    mixed_dir_title_v: '📐 작업 방향: 세로 긴 방향 (자동 정렬)',
    mixed_dir_desc_v: '모든 시편이 세로로 긴 형태로 자동 배치되며, 전체 원판 크기에 맞추어 열과 행이 자동 배분됩니다.',
    mixed_btn_equal: '⚡ {n}개 균등 배분 ({pct}%)',
    mixed_btn_auto_long: '📐 가로 방향 자동 맞춤',
    mixed_btn_orient_dropdown: '📐 작업 방향 자동 맞춤 ▾',
    mixed_orient_h: '가로 긴 방향 (W ≥ H)',
    mixed_orient_v: '세로 긴 방향 (H ≥ W)',
    btn_add_type: '➕ 새 시편 타입 추가',
    btn_move_up: '위로 이동',
    btn_move_down: '아래로 이동',
    btn_delete_type: '타입 삭제',
    confirm_delete_type: '선택한 시편 타입을 삭제하시겠습니까?',
    sec_type_ratio: '타입별 시편 수량 (열/행) 및 규격',
    sec_mixed_types: '타입별 시편 수량 (열/행) 및 규격',
    auto_ratio_lbl: '자동 계산 배분 비율',
    total_produced_specimens: '총 생산 시편 수량:',
    specimen_lbl: '시편:',
    specimen_wh_lbl: '시편 가로 × 세로 (mm)',
    gap_wh_lbl: '가로 지지대 간격 × 위·아래 에칭 거리 (mm)',
    target_ratio_total: '목표 비율 합계:',
    layout_all_fixed: '⚡ 전체 직접 입력',
    layout_all_auto: '⚡ 전체 자동 배치',
    auto_cols_rows_tooltip: '원판·시편·간격으로 자동 계산된 열과 행입니다',

    // Corner Treatment
    sec_corner: '모서리 가공',
    corner_type: '모서리 형태',
    corner_type_sharp: '직각',
    corner_type_fillet: '라운드',
    corner_type_chamfer: '모따기',
    corner_radius: '반경 / 크기 (mm)',
    corner_batch_title: '⚡ 모서리 일괄 설정 (전체 타입 적용)',
    btn_apply_all_corners: '✓ 전체 타입 모서리 일괄 적용',
    corner_lbl: '모서리:',

    // Toolbar & Center
    btn_new: '📄 새 프로젝트',
    title_new: '새 프로젝트',
    btn_open: '📂 불러오기',
    title_open: '프로젝트 불러오기 (.etching)',
    btn_save: '💾 저장',
    title_save: '프로젝트 저장 (.etching)',
    btn_undo: '↶ 취소',
    title_undo: '실행 취소 (Ctrl+Z)',
    btn_redo: '↷ 복원',
    title_redo: '다시 실행 (Ctrl+Y)',
    btn_export_dwg: '📐 DWG',
    title_export_dwg: 'AutoCAD 1:1 DWG 도면 저장 (경로 및 파일명 지정)',
    prompt_save_dwg: '저장할 DWG 파일명을 입력하세요:',
    dwg_converter_missing: 'DWG 변환기가 설치되어 있지 않습니다. ODA File Converter를 설치하거나 DXF 파일을 사용하세요.',
    dwg_conversion_failed: '정식 DWG 변환에 실패했습니다: ',
    btn_export_dxf: '📐 DXF',
    title_export_dxf: 'AutoCAD 1:1 DXF 도면 저장 (경로 및 파일명 지정)',
    prompt_save_dxf: '저장할 DXF 파일명을 입력하세요:',
    export_mode_mfg: '● 제조용 (Manufacturing)',
    export_mode_review: '○ 검토용 (Review Drawing)',
    cad_validation_failed: 'CAD 제조 검증 실패: 다음 오류를 수정한 후 다시 시도하십시오:\n\n',
    prompt_save_project: '저장할 프로젝트 파일명을 입력하세요:',
    btn_export_svg: '⚡ SVG',
    title_export_svg: '1:1 벡터 SVG',
    btn_export_pdf: '📕 PDF',
    title_export_pdf: '1:1 인쇄용 PDF',
    btn_export_png: '🖼 PNG',
    title_export_png: '미리보기 이미지 저장',
    btn_fit: '⛶ 맞춤',
    title_fit: '원판 전체 맞춤',
    overlay_dims: '치수선',
    overlay_orient: '방향 표시',
    overlay_grid: '그리드',
    overlay_boundary: '구획선',
    overlay_tabs: '고정 탭',
    overlay_bridges: '금속 브릿지',
    overlay_etch_remove: '에칭 제거 영역',
    mouse_guide: '휠: 줌 | 드래그: 이동 | 더블클릭: 맞춤',
    overflow_alert: '⚠️ 설계가 원판 크기를 초과했습니다: 가로 {w} mm 초과, 세로 {h} mm 초과',

    // Right Panel
    sec_calc_title: '계산 및 결과 분석',
    plate_dimensions_lbl: '원판 크기:',
    plate_area_lbl: '원판 면적:',
    used_area_lbl: '가공 점유 면적:',
    yield_badge_lbl: '면적 수율 (Yield)',
    scrap_badge_lbl: '스크랩 손실 (Scrap)',
    total_specimens_lbl: '총 시편 생산 수량',
    unit_pcs: '개',
    sec_type_breakdown: '타입별 세부 분석',
    target_lbl: '목표:',
    actual_lbl: '실제:',
    array_lbl: '배열:',
    qty_lbl: '수량:',
    unit_ea: '개',
    array_grid_lbl: '배열 구조:',
    array_grid_val: '{cols} 열 × {rows} 행',
    single_specimen_count_lbl: '단일 시편 수량:',
    unused_w_lbl: '남는 가로 여유폭:',
    unused_h_lbl: '남는 세로 여유폭:',
    fit_ok: '✓ 정격 원판 내 수납 적합 (규격 만족)',
    fit_overflow: '⚠️ 원판 크기 초과 (+{w} 가로 / +{h} 세로)',
    btn_copy_summary: '📋 계산 결과 요약 복사',
    copied_msg: '계산 요약이 클립보드에 복사되었습니다.',
    summary_template: `[3M 에칭 설계 계산 요약]\n원판 크기: {pw} × {ph} mm\n총 시편 수량: {total} 개\n가공 점유 면적: {used} mm²\n면적 수율: {yield}% (스크랩 손실: {scrap}%)\n판정: {status}`,
    status_ok: '적합 (OK)',
    status_overflow: '원판 초과 (EXCEEDS PLATE)',

    // In-canvas & Dialogs
    in_canvas_boundary: '구획 경계',
    tooltip_col: '열',
    tooltip_row: '행',
    confirm_new_project: '새 프로젝트를 생성하시겠습니까? 현재 변경사항이 초기화됩니다.',
    confirm_dxf_overflow: '경고: 설계가 원판 크기를 초과합니다. 그래도 DXF를 내보내시겠습니까?',
    error_load_project: '프로젝트 파일 로드 실패: ',
  },
  en: {
    // Mode
    mode_single: 'Single Design',
    mode_mixed: 'Mixed Layout',

    // Preset
    sec_preset: 'PRESET SELECTION',
    preset_type1: 'TYPE 1 (15×6 mm 378 pcs Verified)',
    preset_type2: 'TYPE 2 (50×10 mm SUS316L)',
    preset_type3: 'TYPE 3 (40×3 mm Stiffener)',
    preset_custom: 'Custom Specification',

    // Single Plate
    sec_plate: 'Plate Dimensions & Margins',
    plate_width: 'Plate Width (mm)',
    plate_height: 'Plate Height (mm)',
    margin_auto: 'Auto Center',
    margin_manual: 'Manual Margins',
    margin_lr: 'L / R Margin (mm)',
    margin_tb: 'T / B Margin (mm)',

    // Sample Spec
    sec_sample: 'SAMPLE SPECIFICATIONS',
    sample_width: 'Width (mm)',
    sample_height: 'Height (mm)',

    // Orientation
    sec_orient: 'PRODUCT ORIENTATION',
    orient_center_override: 'Override Center Product',

    // Layout & Gaps
    sec_layout: 'LAYOUT & GAPS',
    layout_fixed: 'Manual Columns / Rows',
    layout_auto: 'Auto Fit to Plate',
    layout_fixed_help: 'Enter the number of columns and rows manually.',
    layout_auto_help: 'Calculates the columns and rows from the plate size, specimen size, and horizontal/vertical gaps.',
    cols: 'Columns',
    rows: 'Rows',
    h_gap: 'Separator / H-Gap (mm)',
    v_gap: 'Bridge Top / Bottom Etch Gap (mm)',

    // Tabs
    sec_tabs: 'SUPPORTS & BRIDGE FEATURE',
    tabs_enable: 'Use Supports',
    tab_width: 'Support Width (mm)',
    tab_length: 'Support Length (mm)',
    tab_feature_sec: 'Bridge Body Feature',
    tab_feature_type: 'Feature Type',
    tab_feature_none: 'None (Solid)',
    tab_feature_hole: 'Circular Hole',
    tab_feature_slot: 'Rectangular Slot / Notch',
    tab_hole_dia: 'Hole Dia Ø (mm)',
    tab_slot_w: 'Slot Width W (mm)',
    tab_slot_h: 'Slot Height H (mm)',
    tab_pos_x: 'Horiz (X) Pos',
    tab_pos_y: 'Vert (Y) Pos',
    tab_pos_center: 'Exact Bridge Center',
    tab_pos_two_points: 'Bridge 2 Points (Left / Right)',
    tab_pos_four_points: 'Bridge 4 Points (Corners)',
    tab_hole_distance_x: 'Left Hole ↔ Right Hole Center Distance (mm)',
    tab_hole_distance_y: 'Top Hole ↔ Bottom Hole Center Distance (mm)',
    tab_slot_distance_x: 'Left Rect ↔ Right Rect Center Distance (mm)',
    tab_slot_distance_y: 'Top Rect ↔ Bottom Rect Center Distance (mm)',
    tab_pos_specimen: 'Bridge-Support Joint',
    tab_pos_runner: 'Plate-Support Joint',
    tab_pos_custom: 'Custom Offset (mm)',
    tab_pos_top: 'Top Notch',
    tab_pos_bot: 'Bottom Notch',
    tab_pos_both: 'Dual Notch (Top & Bot)',
    tab_apply_all_btn: '✓ Apply to This Type',
    tab_apply_all_confirm: 'Apply the bridge feature previewed on the selected specimen to every specimen of this type?',
    tab_preview_help: '1. Set feature  2. Click one specimen  3. Check preview  4. Apply to this type',
    tab_preview_select_first: 'Click one specimen of this type on the canvas and check the preview first.',
    tab_runner_gap: 'Runner Gap Between Supports',

    // Mixed Sheet
    sec_mixed_sheet: 'Plate Dimensions & Margins',
    sec_mixed_partition: 'Partition Split & Boundary Gap',
    mixed_sheet_w: 'Sheet Width (mm)',
    mixed_sheet_h: 'Sheet Height (mm)',
    boundary_width: 'Default Gap Between Types (mm)',
    boundary_between_types: '{type1} ↔ {type2} Gap',
    margin_mode: 'Margin Mode',
    sec_split_dir: 'Partition Direction',
    split_vertical: 'Vertical (Left / Right)',
    split_horizontal: 'Horizontal (Top / Bottom)',
    pos_top: 'Top',
    pos_mid: 'Middle',
    pos_bot: 'Bottom',
    pos_left: 'Left',
    pos_right: 'Right',
    mixed_dir_desc_split_h: 'Plate is divided into horizontal rows (Top / Middle / Bottom), with rows and columns allocated to target ratios.',
    mixed_dir_desc_split_v: 'Plate is divided into vertical columns (Left / Center / Right), with columns and rows allocated to target ratios.',
    mixed_dir_title: '📐 Work Direction: Horizontal Long (Aligned to Type 1)',
    mixed_dir_desc: 'All specimens are automatically aligned horizontally, with columns and rows auto-allocated to fit sheet dimensions.',
    mixed_dir_title_h: '📐 Work Direction: Horizontal Long (Aligned to Type 1)',
    mixed_dir_desc_h: 'All specimens are automatically aligned horizontally, with columns and rows auto-allocated to fit sheet dimensions.',
    mixed_dir_title_v: '📐 Work Direction: Vertical Long (Auto Aligned)',
    mixed_dir_desc_v: 'All specimens are automatically aligned vertically, with columns and rows auto-allocated to fit sheet dimensions.',
    mixed_btn_equal: '⚡ Equal {n}-Way ({pct}%)',
    mixed_btn_auto_long: '📐 Horizontal Long Fit',
    mixed_btn_orient_dropdown: '📐 Auto-Fit Direction ▾',
    mixed_orient_h: 'Horizontal (W ≥ H)',
    mixed_orient_v: 'Vertical (H ≥ W)',
    btn_add_type: '➕ Add New Specimen Type',
    btn_move_up: 'Move Up',
    btn_move_down: 'Move Down',
    btn_delete_type: 'Delete Type',
    confirm_delete_type: 'Are you sure you want to delete this specimen type?',
    sec_type_ratio: 'Type Quantities (Cols/Rows) & Specs',
    sec_mixed_types: 'Type Quantities (Cols/Rows) & Specs',
    auto_ratio_lbl: 'Calculated Ratio',
    total_produced_specimens: 'Total Specimens:',
    specimen_lbl: 'Specimen:',
    specimen_wh_lbl: 'Sample W × H (mm)',
    gap_wh_lbl: 'Support H-Gap × Top/Bottom Etch Gap (mm)',
    target_ratio_total: 'Total Target Ratio:',
    layout_all_fixed: '⚡ All Manual',
    layout_all_auto: '⚡ All Auto Fit',
    auto_cols_rows_tooltip: 'Columns and rows calculated from the plate, specimen, and gap dimensions',

    // Corner Treatment
    sec_corner: 'CORNER TREATMENT (ROUND / FILLET)',
    corner_type: 'Corner Type',
    corner_type_sharp: 'Sharp (90°)',
    corner_type_fillet: 'Fillet (R)',
    corner_type_chamfer: 'Chamfer (C)',
    corner_radius: 'Radius / Size (mm)',
    corner_batch_title: '⚡ Batch Corner Setup (Apply to All)',
    btn_apply_all_corners: '✓ Apply Corner to All Types',
    corner_lbl: 'Corner:',

    // Toolbar & Center
    btn_new: '📄 New',
    title_new: 'New Project',
    btn_open: '📂 Open',
    title_open: 'Open Project (.etching)',
    btn_save: '💾 Save',
    title_save: 'Save Project (.etching)',
    btn_undo: '↶ Undo',
    title_undo: 'Undo (Ctrl+Z)',
    btn_redo: '↷ Redo',
    title_redo: 'Redo (Ctrl+Y)',
    btn_export_dwg: '📐 DWG',
    title_export_dwg: 'AutoCAD 1:1 DWG Drawing (Select Path & File Name)',
    prompt_save_dwg: 'Enter filename for DWG export:',
    dwg_converter_missing: 'No DWG converter is installed. Install ODA File Converter or use the DXF export.',
    dwg_conversion_failed: 'Certified DWG conversion failed: ',
    btn_export_dxf: '📐 DXF',
    title_export_dxf: 'AutoCAD 1:1 DXF Cutting Drawing (Select Path & File Name)',
    prompt_save_dxf: 'Enter filename for DXF export:',
    export_mode_mfg: '● Manufacturing (Pure CAD)',
    export_mode_review: '○ Review Drawing (With Guides)',
    cad_validation_failed: 'CAD Validation Failed: Please fix the following errors before exporting:\n\n',
    prompt_save_project: 'Enter filename for project file:',
    btn_export_svg: '⚡ SVG',
    title_export_svg: '1:1 Vector SVG',
    btn_export_pdf: '📕 PDF',
    title_export_pdf: '1:1 Printable PDF',
    btn_export_png: '🖼 PNG',
    title_export_png: 'Save Preview PNG',
    btn_fit: '⛶ Fit',
    title_fit: 'Fit to Plate',
    overlay_dims: 'Dimensions',
    overlay_orient: 'Orientation',
    overlay_grid: 'Grid',
    overlay_boundary: 'Boundary',
    overlay_tabs: 'Holding Tabs',
    overlay_bridges: 'Bridges',
    overlay_etch_remove: 'Etch Remove Area',
    mouse_guide: 'Wheel: Zoom | Drag: Pan | Double-Click: Fit',
    overflow_alert: '⚠️ DESIGN EXCEEDS PLATE: Width exceeded by {w} mm, Height exceeded by {h} mm.',

    // Right Panel
    sec_calc_title: 'CALCULATION & RESULTS',
    plate_dimensions_lbl: 'Plate Dimensions:',
    plate_area_lbl: 'Plate Area:',
    used_area_lbl: 'Used Area:',
    yield_badge_lbl: 'Area Yield',
    scrap_badge_lbl: 'Scrap Loss',
    total_specimens_lbl: 'TOTAL SPECIMENS',
    unit_pcs: 'pcs',
    sec_type_breakdown: 'TYPE BREAKDOWN',
    target_lbl: 'Target:',
    actual_lbl: 'Actual:',
    array_lbl: 'Array:',
    qty_lbl: 'Qty:',
    unit_ea: 'EA',
    array_grid_lbl: 'Array Grid:',
    array_grid_val: '{cols} Cols × {rows} Rows',
    single_specimen_count_lbl: 'Specimen Count:',
    unused_w_lbl: 'Unused Width:',
    unused_h_lbl: 'Unused Height:',
    fit_ok: '✓ Plate Fit: OK (Within Plate Limits)',
    fit_overflow: '⚠️ DESIGN EXCEEDS PLATE (+{w}W / +{h}H)',
    btn_copy_summary: '📋 Copy Calculation Summary',
    copied_msg: 'Calculation summary copied to clipboard.',
    summary_template: `[3M Etching Design Calculation]\nPlate Dimensions: {pw} × {ph} mm\nTotal Samples: {total} pcs\nUsed Area: {used} mm²\nYield: {yield}% (Scrap Loss: {scrap}%)\nStatus: {status}`,
    status_ok: 'Fit OK',
    status_overflow: 'Exceeds Plate',

    // In-canvas & Dialogs
    in_canvas_boundary: 'BOUNDARY',
    tooltip_col: 'Col',
    tooltip_row: 'Row',
    confirm_new_project: 'Create a new project? Current unsaved changes will be lost.',
    confirm_dxf_overflow: 'Warning: Design exceeds plate dimensions. Do you still want to export DXF?',
    error_load_project: 'Failed to load project file: ',
  },
};

function getLang() {
  return (window.app?.lang === 'en' || document.documentElement.lang === 'en') ? 'en' : 'ko';
}

function t(key) {
  const lang = getLang();
  return I18N[lang]?.[key] ?? I18N.ko?.[key] ?? key;
}

function tf(key, replacements = {}) {
  let str = t(key);
  for (const [k, v] of Object.entries(replacements)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

function getGeom() {
  if (!state) state = new EtchingState();
  return state.getGeometry();
}

function refreshAll() {
  _geomCache = state.getGeometry();
  updateAutoLayoutFields();
  renderCanvas();
  updateCalculationPanel();
  updateUndoRedoButtons();
}

function updateAutoLayoutFields() {
  if (!state || !_geomCache) return;
  if (state.mode === 'single' && state.single?.layout?.mode === 'auto') {
    const cols = document.getElementById('etchCols');
    const rows = document.getElementById('etchRows');
    if (cols) cols.value = String(_geomCache.layout?.columns ?? '');
    if (rows) rows.value = String(_geomCache.layout?.rows ?? '');
  } else if (state.mode === 'mixed') {
    updateMixedSidebarBadges(document.getElementById('sidebar'));
  }
}

// ── 2D Canvas 렌더링 ────────────────────────────────────────────────────────────
function renderCanvas() {
  if (!_canvas || !_ctx || !state) return;

  const rect = _canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = rect.width;
  const ch = rect.height;

  if (_canvas.width !== Math.round(cw * dpr) || _canvas.height !== Math.round(ch * dpr)) {
    _canvas.width = Math.round(cw * dpr);
    _canvas.height = Math.round(ch * dpr);
  }

  const isLight = document.body.classList.contains('light');
  const geom = _geomCache || state.getGeometry();
  const pw = geom.plate.width;
  const ph = geom.plate.height;

  // Plate origin top-left on screen: (-pw/2, -ph/2)
  // In internal mm: x: 0..pw, y: 0..ph (y=0 is bottom)
  // Screen coordinate: sx = -pw/2 + x, sy = ph/2 - (y + height)
  const ox = -pw / 2;
  const oy = ph / 2; // Bottom origin reference

  const toScreenX = x => ox + x;
  const toScreenY = (y, h = 0) => oy - (y + h);

  _ctx.save();
  try {
    _ctx.scale(dpr, dpr);
    _ctx.clearRect(0, 0, cw, ch);

    // Background
    _ctx.fillStyle = isLight ? '#f1f5f9' : '#0a0d14';
    _ctx.fillRect(0, 0, cw, ch);

    // Background CAD Grid
    if (state.view.showGrid) {
      drawGrid(cw, ch, isLight);
    }

    // Transform: Center of plate at canvas center + pan
    _ctx.translate(cw / 2 + state.view.panX, ch / 2 + state.view.panY);
    // We flip Y so that internal mm Y (bottom-up) displays naturally, or keep top-down with y-inversion:
    _ctx.scale(state.view.zoom, state.view.zoom);

  // 1. Plate Body
  drawPlate(ox, -ph / 2, pw, ph, geom.isOverflow, isLight);

  // 2. Boundaries (Mixed Design)
  if (state.view.showBoundary && geom.boundaries) {
    _ctx.fillStyle = isLight ? 'rgba(217, 70, 239, 0.2)' : 'rgba(217, 70, 239, 0.25)';
    _ctx.strokeStyle = '#d946ef';
    _ctx.lineWidth = 0.4;
    geom.boundaries.forEach(b => {
      const bx = toScreenX(b.x);
      const by = toScreenY(b.y, b.height);
      _ctx.fillRect(bx, by, b.width, b.height);
      _ctx.strokeRect(bx, by, b.width, b.height);

      // Boundary Dimension Label
      const bDim = b.dimension !== undefined ? Number(b.dimension).toFixed(1) : (b.orientation === 'horizontal' ? b.height : b.width).toFixed(1);
      const arrow = b.orientation === 'horizontal' ? '↕' : '↔';
      const t1Name = (b.type1Name || '').replace(/\s*\(.*?\)/, '') || ('TYPE ' + (b.index + 1));
      const t2Name = (b.type2Name || '').replace(/\s*\(.*?\)/, '') || ('TYPE ' + (b.index + 2));
      const label = `${arrow} ${t1Name} ↔ ${t2Name}: ${bDim} mm`;

      _ctx.save();
      _ctx.translate(bx + b.width / 2, by + b.height / 2);
      if (b.orientation === 'vertical') {
        _ctx.rotate(-Math.PI / 2);
      }
      _ctx.fillStyle = '#d946ef';
      _ctx.font = '700 2.8px "JetBrains Mono", monospace';
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(label, 0, 0);
      _ctx.restore();
    });
  }

  // 3. Etched Slits (Backlight Void), Runners (Vertical Frames), & Samples
  // Real chemical etching appearance:
  // - Dark metallic SUS sheet plate (#1c222c)
  // - Through-cut slit openings where acid cuts completely through (#ffffff illuminated void)
  // - Specimen bodies remain solid SUS metal (#2d3748)
  // - Vertical frame runners between columns remain solid SUS metal (#242e3e)
  // - Holding tabs (0.5mm) in the vertical center of left/right edges bridge across the cut slit!
  const slitFill = '#ffffff'; // Through-cut backlit void
  const runnerFill = isLight ? '#334155' : '#1e293b';
  const partFill = isLight ? '#3b4758' : '#222c3c';
  const partStroke = isLight ? '#64748b' : '#475569';

  // 3a. Draw Vertical Frame Runners
  (geom.separators || []).forEach(sep => {
    const sx = toScreenX(sep.x);
    const sy = toScreenY(sep.y, sep.height);
    _ctx.fillStyle = runnerFill;
    _ctx.fillRect(sx, sy, sep.width, sep.height);
  });

  // 3b. Draw Samples, Cut Slits, & 0.5mm Micro-Joint Tabs
  (geom.samples || []).forEach(s => {
    const sx = toScreenX(s.x);
    const sy = toScreenY(s.y, s.height);
    const isSel = state.view.selectedIdx === s.id;
    const isHov = state.view.hoverIdx === s.id;

    const sampleTab = s.tabs?.[0];
    const hasTabs = state.view.showTabs && (s.tabs && s.tabs.length > 0);
    // The settings panel edits a draft. Only the canvas-selected specimen
    // previews that draft; CAD and all other specimens keep the last applied
    // manufacturing feature until the user confirms "apply to this type".
    let previewFeature = null;
    if (isSel) {
      if (state.mode === 'single') {
        previewFeature = state.single?.tabs?.feature || null;
      } else {
        const selectedType = state.mixed?.types?.find(t => t.id === s.typeId);
        previewFeature = selectedType?.tabs?.feature || null;
      }
    }
    const tabFeature = previewFeature || sampleTab?.feature;
    const baseTabL = sampleTab?.length !== undefined ? Number(sampleTab.length) : 0.8;
    const baseTabW = sampleTab?.width !== undefined ? Number(sampleTab.width) : 0.5;

    const effBridgeW = baseTabW;
    const effBridgeL = baseTabL;

    let bridgeL = effBridgeL;
    if (s.hGap !== undefined && s.hGap > 0) {
      const maxAllowedL = Math.max(0.4, Number(((s.hGap - 0.4) / 2).toFixed(4)));
      bridgeL = Math.min(maxAllowedL, effBridgeL);
    }
    const tw = effBridgeW;
    const vSlit = bridgeL;

    // Cut slit aperture thickness & Etch Remove visualization:
    const vGap = Math.max(0, Number(s.vGap ?? geom.gaps?.verticalGap ?? 1));
    const halfVGap = vGap / 2;
    const totalRows = s.totalRows || geom.layout?.rows || 1;
    const isTopRow = s.row === (totalRows - 1);
    const isBotRow = s.row === 0;

    const topSlitH = isTopRow ? vGap : (halfVGap + 0.05);
    const botSlitH = isBotRow ? vGap : (halfVGap + 0.05);

    const showEtchRemove = state.view.showEtchRemove !== false;
    const showBridges = state.view.showBridges !== false && (state.view.showTabs !== false);

    // Calculate Bridges and Gaps for this specimen
    const bridgeCount = sampleTab?.count || 1;
    const { bridges, gaps } = calculateBridgesAndGaps(s.y, s.height, bridgeCount, tw);

    if (showEtchRemove) {
      _ctx.fillStyle = slitFill;

      // Top and bottom through-cut slits (etched away void)
      _ctx.fillRect(sx - vSlit, sy - topSlitH, s.width + 2 * vSlit, topSlitH);
      _ctx.fillRect(sx - vSlit, sy + s.height, s.width + 2 * vSlit, botSlitH);

      // Left side etch remove gaps (between bridges)
      gaps.forEach(gap => {
        const gY = toScreenY(gap.top, 0);
        const gH = gap.height;
        _ctx.fillRect(sx - vSlit, gY, vSlit, gH);
      });

      // Right side etch remove gaps (between bridges)
      gaps.forEach(gap => {
        const gY = toScreenY(gap.top, 0);
        const gH = gap.height;
        _ctx.fillRect(sx + s.width, gY, vSlit, gH);
      });
    }

    // Draw Bridges (solid metal keep connecting to runner/frame)
    if (showBridges && sampleTab) {
      _ctx.fillStyle = runnerFill;
      bridges.forEach(b => {
        const bY = toScreenY(b.top, 0);
        const bH = b.width;
        // Left bridge metal keep
        _ctx.fillRect(sx - vSlit, bY, vSlit, bH);
        // Right bridge metal keep
        _ctx.fillRect(sx + s.width, bY, vSlit, bH);
      });
    }

    // Corner cutouts for rounded or chamfered corners:
    // Clears the dark sheet plate behind the corner curves so that the through-cut aperture wraps around the rounded/chamfered corners
    const maxR = Math.min(s.width, s.height) / 2;
    const cr = Math.min(Math.max(0, s.cornerRadius || 0), maxR);
    if (showEtchRemove && cr > 0 && s.cornerType !== 'sharp') {
      _ctx.fillStyle = slitFill;
      _ctx.fillRect(sx - 0.1, sy - 0.1, cr + 0.1, cr + 0.1);
      _ctx.fillRect(sx + s.width - cr, sy - 0.1, cr + 0.1, cr + 0.1);
      _ctx.fillRect(sx - 0.1, sy + s.height - cr, cr + 0.1, cr + 0.1);
      _ctx.fillRect(sx + s.width - cr, sy + s.height - cr, cr + 0.1, cr + 0.1);
    }

    // 3c. Specimen Body (Solid Metal)
    _ctx.save();
    _ctx.fillStyle = isSel ? '#1d4ed8' : (isHov ? '#1e3a5f' : partFill);
    _ctx.strokeStyle = isSel ? '#60a5fa' : (isHov ? '#38bdf8' : partStroke);
    _ctx.lineWidth = isSel ? 0.35 : (isHov ? 0.3 : 0.2);

    createSpecimenPath(_ctx, sx, sy, s.width, s.height, s.cornerType, s.cornerRadius);
    _ctx.fill();
    _ctx.stroke();

    // A center feature is cut into the exact center of the specimen body.
    // The body is called the bridge; the narrow left/right connections are supports.
    if (showEtchRemove && tabFeature?.type && tabFeature.type !== 'none') {
      const bodyFeat = calculateSpecimenFeatureGeometry(s, tabFeature);
      _ctx.fillStyle = slitFill;
      _ctx.strokeStyle = isSel ? '#3b82f6' : '#475569';
      _ctx.lineWidth = Math.min(0.15, 0.8 / state.view.zoom);
      if (bodyFeat?.type === 'hole') {
        bodyFeat.holes.forEach(hole => {
          _ctx.beginPath();
          _ctx.arc(toScreenX(hole.cx), toScreenY(hole.cy, 0), hole.r, 0, Math.PI * 2);
          _ctx.fill();
          _ctx.stroke();
        });
      } else if (bodyFeat?.type === 'slot') {
        bodyFeat.slots.forEach(slot => {
          const fx = toScreenX(slot.x1);
          const fy = toScreenY(slot.y2, 0);
          _ctx.fillRect(fx, fy, slot.x2 - slot.x1, slot.y2 - slot.y1);
          _ctx.strokeRect(fx, fy, slot.x2 - slot.x1, slot.y2 - slot.y1);
        });
      }
    }

    // 3d. Solid Metal Holding Tabs (Seamlessly bridging to runner/plate)
    if (hasTabs) {
      _ctx.fillStyle = isSel ? '#1d4ed8' : (isHov ? '#1e3a5f' : partFill);
      _ctx.strokeStyle = isSel ? '#60a5fa' : (isHov ? '#38bdf8' : partStroke);
      _ctx.lineWidth = 0.2;

      bridges.forEach(b => {
        const tabY = toScreenY(b.top, 0);
        const tabH = b.width;
        // Left bridge across the slit
        _ctx.fillRect(sx - vSlit, tabY, vSlit, tabH);
        _ctx.strokeRect(sx - vSlit, tabY, vSlit, tabH);

        // Right bridge across the slit
        _ctx.fillRect(sx + s.width, tabY, vSlit, tabH);
        _ctx.strokeRect(sx + s.width, tabY, vSlit, tabH);
      });

    }

    // 3e. Orientation Marks (arrows)
    if (state.view.showOrientation) {
      drawOrientationMark(sx, sy, s.width, s.height, s.direction, s.orientationOverride);
    }

    // Specimen Index / Label (if zoom >= 0.7)
    if (state.view.zoom >= 0.7 && s.width >= 4 && s.height >= 4) {
      _ctx.fillStyle = isSel ? '#93c5fd' : '#cbd5e1';
      _ctx.font = `${Math.max(1.6, Math.min(s.height * 0.28, 3.8))}px "JetBrains Mono", monospace`;
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      const label = s.column !== undefined ? `${s.column + 1},${s.row + 1}` : '';
      _ctx.fillText(label, sx + s.width / 2, sy + s.height / 2);
    }

    _ctx.restore();
  });

  // 5. Tooling Holes
  drawToolingHoles(ox, -ph / 2, pw, ph, isLight);

  // 6. Dimensions
  if (state.view.showDimensions) {
    drawDimensions(ox, -ph / 2, pw, ph, geom, isLight);
  }

  // 7. Overflow Alert Hatching Overlay
  if (geom.isOverflow) {
    drawOverflowOverlay(ox, -ph / 2, pw, ph, geom);
  }
  } finally {
    _ctx.restore();
  }

  // Floating Hover Tooltip (Screen space)
  if (state.view.hoverIdx) {
    const s = geom.samples.find(p => p.id === state.view.hoverIdx);
    if (s) {
      const scrX = cw / 2 + state.view.panX + (toScreenX(s.x) + s.width / 2) * state.view.zoom;
      const scrY = ch / 2 + state.view.panY + (toScreenY(s.y, s.height)) * state.view.zoom - 12;
      drawTooltip(s, scrX, scrY, isLight);
    }
  }
}

function createSpecimenPath(ctx, sx, sy, w, h, cornerType, r) {
  ctx.beginPath();
  const maxR = Math.min(w, h) / 2;
  const radius = Math.max(0, Math.min(r || 0, maxR));

  if (radius <= 0.01 || cornerType === 'sharp') {
    ctx.rect(sx, sy, w, h);
    return;
  }

  if (cornerType === 'chamfer') {
    ctx.moveTo(sx + radius, sy);
    ctx.lineTo(sx + w - radius, sy);
    ctx.lineTo(sx + w, sy + radius);
    ctx.lineTo(sx + w, sy + h - radius);
    ctx.lineTo(sx + w - radius, sy + h);
    ctx.lineTo(sx + radius, sy + h);
    ctx.lineTo(sx, sy + h - radius);
    ctx.lineTo(sx, sy + radius);
    ctx.closePath();
    return;
  }

  // Fillet / Round
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(sx, sy, w, h, radius);
  } else {
    ctx.moveTo(sx + radius, sy);
    ctx.lineTo(sx + w - radius, sy);
    ctx.arcTo(sx + w, sy, sx + w, sy + radius, radius);
    ctx.lineTo(sx + w, sy + h - radius);
    ctx.arcTo(sx + w, sy + h, sx + w - radius, sy + h, radius);
    ctx.lineTo(sx + radius, sy + h);
    ctx.arcTo(sx, sy + h, sx, sy + h - radius, radius);
    ctx.lineTo(sx, sy + radius);
    ctx.arcTo(sx, sy, sx + radius, sy, radius);
    ctx.closePath();
  }
}

function drawGrid(cw, ch, isLight) {
  _ctx.fillStyle = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
  const step = 24;
  for (let x = 0; x < cw; x += step) {
    for (let y = 0; y < ch; y += step) {
      _ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawPlate(ox, oy, pw, ph, isOverflow, isLight) {
  _ctx.save();
  _ctx.shadowColor = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.6)';
  _ctx.shadowBlur = 16;
  _ctx.shadowOffsetY = 6;

  // Dark metallic SUS sheet base (authentic chemical etching plate)
  _ctx.fillStyle = '#1c222c';
  _ctx.fillRect(ox, oy, pw, ph);
  _ctx.restore();

  _ctx.strokeStyle = isOverflow ? '#ef4444' : '#475569';
  _ctx.lineWidth = isOverflow ? 0.8 : 0.5;
  _ctx.strokeRect(ox, oy, pw, ph);
}

function drawToolingHoles(ox, oy, pw, ph, isLight) {
  _ctx.save();
  _ctx.fillStyle = isLight ? '#cbd5e1' : '#0f172a';
  _ctx.strokeStyle = isLight ? '#64748b' : '#475569';
  _ctx.lineWidth = 0.3;
  const off = 3.5;
  const r = 1.5;

  [[ox + off, oy + off], [ox + pw - off, oy + off], [ox + off, oy + ph - off], [ox + pw - off, oy + ph - off]].forEach(([hx, hy]) => {
    _ctx.beginPath();
    _ctx.arc(hx, hy, r, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.stroke();

    _ctx.beginPath();
    _ctx.moveTo(hx - 2, hy); _ctx.lineTo(hx + 2, hy);
    _ctx.moveTo(hx, hy - 2); _ctx.lineTo(hx, hy + 2);
    _ctx.stroke();
  });
  _ctx.restore();
}

function drawOrientationMark(sx, sy, w, h, dir, isOverride) {
  _ctx.save();
  const cx = sx + w / 2;
  const cy = sy + h / 2;
  const arm = Math.min(w, h) * 0.22;
  _ctx.strokeStyle = isOverride ? '#ec4899' : '#f97316'; // Pink if override, Orange if standard
  _ctx.lineWidth = 0.4;
  _ctx.lineCap = 'round';

  _ctx.beginPath();
  if (dir === 'up') {
    _ctx.moveTo(cx, cy + arm); _ctx.lineTo(cx, cy - arm);
    _ctx.moveTo(cx - arm * 0.4, cy - arm * 0.4); _ctx.lineTo(cx, cy - arm); _ctx.lineTo(cx + arm * 0.4, cy - arm * 0.4);
  } else if (dir === 'down') {
    _ctx.moveTo(cx, cy - arm); _ctx.lineTo(cx, cy + arm);
    _ctx.moveTo(cx - arm * 0.4, cy + arm * 0.4); _ctx.lineTo(cx, cy + arm); _ctx.lineTo(cx + arm * 0.4, cy + arm * 0.4);
  } else if (dir === 'right') {
    _ctx.moveTo(cx - arm, cy); _ctx.lineTo(cx + arm, cy);
    _ctx.moveTo(cx + arm * 0.4, cy - arm * 0.4); _ctx.lineTo(cx + arm, cy); _ctx.lineTo(cx + arm * 0.4, cy + arm * 0.4);
  } else if (dir === 'left') {
    _ctx.moveTo(cx + arm, cy); _ctx.lineTo(cx - arm, cy);
    _ctx.moveTo(cx - arm * 0.4, cy - arm * 0.4); _ctx.lineTo(cx - arm, cy); _ctx.lineTo(cx - arm * 0.4, cy + arm * 0.4);
  }
  _ctx.stroke();
  _ctx.restore();
}

function drawDimensions(ox, oy, pw, ph, geom, isLight) {
  _ctx.save();
  const col = isLight ? '#2563eb' : '#60a5fa';
  _ctx.strokeStyle = col;
  _ctx.fillStyle = col;
  _ctx.lineWidth = 0.35;
  _ctx.font = '400 2.8px "JetBrains Mono", monospace';

  // Plate width dimension (top)
  const dGap = 8;
  const topY = oy - dGap;
  _ctx.beginPath();
  _ctx.moveTo(ox, topY); _ctx.lineTo(ox + pw, topY);
  _ctx.moveTo(ox, topY - 1.5); _ctx.lineTo(ox, topY + 1.5);
  _ctx.moveTo(ox + pw, topY - 1.5); _ctx.lineTo(ox + pw, topY + 1.5);
  _ctx.stroke();

  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'bottom';
  _ctx.fillText(`${pw} mm`, ox + pw / 2, topY - 1);

  // Plate height dimension (right)
  const rightX = ox + pw + dGap;
  _ctx.beginPath();
  _ctx.moveTo(rightX, oy); _ctx.lineTo(rightX, oy + ph);
  _ctx.moveTo(rightX - 1.5, oy); _ctx.lineTo(rightX + 1.5, oy);
  _ctx.moveTo(rightX - 1.5, oy + ph); _ctx.lineTo(rightX + 1.5, oy + ph);
  _ctx.stroke();

  _ctx.textAlign = 'left';
  _ctx.textBaseline = 'middle';
  _ctx.fillText(`${ph} mm`, rightX + 1.5, oy + ph / 2);

  _ctx.restore();
}

function drawOverflowOverlay(ox, oy, pw, ph, geom) {
  _ctx.save();
  _ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
  _ctx.lineWidth = 0.5;
  _ctx.strokeRect(ox - 2, oy - 2, pw + 4, ph + 4);

  _ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
  _ctx.fillRect(ox, oy, pw, ph);
  _ctx.restore();
}

function drawTooltip(s, scrX, scrY, isLight) {
  _ctx.save();
  _ctx.font = '12px Inter, sans-serif';
  const txt = `${s.typeName ? `[${s.typeName}] ` : ''}#${s.id} (${s.nominalWidth}×${s.nominalHeight}mm @ ${s.rotation}°) ${t('tooltip_col')}:${s.column + 1} ${t('tooltip_row')}:${s.row + 1}`;
  const tw = _ctx.measureText(txt).width + 16;
  const th = 26;

  _ctx.fillStyle = isLight ? 'rgba(15,23,42,0.92)' : 'rgba(30,41,59,0.92)';
  _ctx.shadowColor = 'rgba(0,0,0,0.35)';
  _ctx.shadowBlur = 8;
  _ctx.shadowOffsetY = 3;

  roundRect(_ctx, scrX - tw / 2, scrY - th, tw, th, 6);
  _ctx.fill();

  _ctx.shadowColor = 'transparent';
  _ctx.fillStyle = '#ffffff';
  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.fillText(txt, scrX, scrY - th / 2);
  _ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── 뷰어 네비게이션 ──────────────────────────────────────────────────────────
function fitToView() {
  if (!_canvas || !state) return;
  const rect = _canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  const geom = state.getGeometry();
  const pw = geom.plate.width + 40; // Dimension margin
  const ph = geom.plate.height + 40;

  const scale = Math.min((cw - 40) / pw, (ch - 40) / ph);
  state.view.zoom = Math.max(0.1, Math.min(scale, 5));
  state.view.panX = 0;
  state.view.panY = 0;
  renderCanvas();
  updateToolbarStats();
}

function setZoom(factor) {
  state.view.zoom = Math.max(0.15, Math.min(10, state.view.zoom * factor));
  renderCanvas();
  updateToolbarStats();
}

function selectedSampleMatchesType(typeIdx) {
  const selectedId = state?.view?.selectedIdx;
  if (!selectedId || selectedId === -1) return false;
  const geom = _geomCache || state.getGeometry();
  const sample = geom?.samples?.find(s => s.id === selectedId);
  if (!sample) return false;
  if (typeIdx === 'single') return state.mode === 'single';
  const type = state.mixed?.types?.[Number(typeIdx)];
  return state.mode === 'mixed' && Boolean(type && sample.typeId === type.id);
}

function setupCanvasInteractions(canvas) {
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2 - state.view.panX;
    const mouseY = e.clientY - rect.top - rect.height / 2 - state.view.panY;

    const newZoom = Math.max(0.15, Math.min(10, state.view.zoom * zoomFactor));
    const ratio = newZoom / state.view.zoom;

    state.view.panX -= mouseX * (ratio - 1);
    state.view.panY -= mouseY * (ratio - 1);
    state.view.zoom = newZoom;

    renderCanvas();
    updateToolbarStats();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
      _isPanning = true;
      _panStart = { x: e.clientX - state.view.panX, y: e.clientY - state.view.panY };
      canvas.style.cursor = 'grabbing';
    }
  });

  if (_mouseMoveHandler) window.removeEventListener('mousemove', _mouseMoveHandler);
  if (_mouseUpHandler) window.removeEventListener('mouseup', _mouseUpHandler);

  _mouseMoveHandler = e => {
    if (_isPanning) {
      state.view.panX = e.clientX - _panStart.x;
      state.view.panY = e.clientY - _panStart.y;
      renderCanvas();
      return;
    }

    if (!_canvas) return;
    const rect = _canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      if (state.view.hoverIdx !== -1) {
        state.view.hoverIdx = -1;
        renderCanvas();
      }
      return;
    }

    // Inverse transform to plate mm coordinates
    const mx = (e.clientX - rect.left - rect.width / 2 - state.view.panX) / state.view.zoom;
    const my = (e.clientY - rect.top - rect.height / 2 - state.view.panY) / state.view.zoom;
    const geom = _geomCache || state.getGeometry();
    const pw = geom.plate.width;
    const ph = geom.plate.height;

    const plateX = mx + pw / 2;
    const plateY = ph / 2 - my; // Invert to bottom-up mm

    let foundId = null;
    for (const s of geom.samples) {
      if (plateX >= s.x && plateX <= s.x + s.width && plateY >= s.y && plateY <= s.y + s.height) {
        foundId = s.id;
        break;
      }
    }

    if (state.view.hoverIdx !== foundId) {
      state.view.hoverIdx = foundId;
      canvas.style.cursor = foundId ? 'pointer' : 'crosshair';
      renderCanvas();
    }
  };

  _mouseUpHandler = () => {
    if (_isPanning) {
      _isPanning = false;
      if (_canvas) _canvas.style.cursor = 'crosshair';
    }
  };

  window.addEventListener('mousemove', _mouseMoveHandler);
  window.addEventListener('mouseup', _mouseUpHandler);

  canvas.addEventListener('click', () => {
    if (state.view.hoverIdx) {
      state.view.selectedIdx = state.view.selectedIdx === state.view.hoverIdx ? null : state.view.hoverIdx;
      renderCanvas();
      updateCalculationPanel();
    }
  });

  canvas.addEventListener('dblclick', () => {
    fitToView();
  });
}

// ── 상단 툴바 & 계산 패널 갱신 ─────────────────────────────────────────────────
function updateToolbarStats() {
  const geom = _geomCache || state.getGeometry();
  const elZoom = document.getElementById('etchZoomVal');
  if (elZoom) elZoom.textContent = `${Math.round(state.view.zoom * 100)}%`;

  // Overflow Alert Banner
  const alertBanner = document.getElementById('etchOverflowBanner');
  if (alertBanner) {
    if (geom.isOverflow) {
      alertBanner.style.display = 'flex';
      alertBanner.innerHTML = tf('overflow_alert', { w: geom.overflow.width, h: geom.overflow.height });
    } else {
      alertBanner.style.display = 'none';
    }
  }
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('etchBtnUndo');
  const btnRedo = document.getElementById('etchBtnRedo');
  if (btnUndo) btnUndo.disabled = !state.canUndo();
  if (btnRedo) btnRedo.disabled = !state.canRedo();
}

function updateCalculationPanel() {
  const geom = _geomCache || state.getGeometry();
  const el = document.getElementById('etchCalcContent');
  if (!el) return;

  const isMixed = state.mode === 'mixed';

  let breakdownHTML = '';
  if (isMixed) {
    breakdownHTML = `
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:11px;font-weight:700;color:var(--text);letter-spacing:0.5px;">${t('sec_type_breakdown')}</div>
        ${geom.types.map(tObj => `
          <div style="padding:8px 10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <b style="font-size:12px;color:var(--accent,#3b82f6);">${tObj.name || tObj.id}</b>
                ${tObj.isFixed ? `<span style="font-size:9px;font-weight:700;background:rgba(59,130,246,0.15);color:var(--accent,#3b82f6);padding:1px 5px;border-radius:4px;">${t('layout_fixed')}</span>` : ''}
              </div>
              <span style="font-size:11px;font-weight:700;background:rgba(16,185,129,0.12);color:#10b981;padding:2px 7px;border-radius:4px;">${tObj.sampleCount} ${t('unit_ea')}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;color:var(--text-mut);">
              <span>${t('auto_ratio_lbl')} <b style="color:var(--accent,#3b82f6);">${tObj.actualRatio}%</b></span>
              <span>${t('specimen_lbl')} <b>${tObj.sample.width}×${tObj.sample.height}mm</b></span>
              <span>${t('array_lbl')} <b>${tObj.cols}×${tObj.rows}</b></span>
              <span>${t('layout_fixed')} <b style="color:#10b981;">${tObj.sampleCount} ${t('unit_ea')}</b></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    breakdownHTML = `
      <div style="margin-top:10px;padding:8px 10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px;">
          <span style="color:var(--text-dim);">${t('array_grid_lbl')}</span>
          <b>${tf('array_grid_val', { cols: geom.layout.columns, rows: geom.layout.rows })}</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:var(--text-dim);">${t('single_specimen_count_lbl')}</span>
          <b style="color:var(--accent,#3b82f6);">${geom.totalSamples} ${t('unit_ea')}</b>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <!-- Plate Overview -->
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:var(--text-dim);">${t('plate_dimensions_lbl')}</span>
        <b>${geom.plate.width} × ${geom.plate.height} mm</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:var(--text-dim);">${t('plate_area_lbl')}</span>
        <span>${geom.summary.plateArea.toLocaleString()} mm²</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:var(--text-dim);">${t('used_area_lbl')}</span>
        <span>${geom.summary.usedArea.toLocaleString()} mm²</span>
      </div>
    </div>

    <!-- Efficiency Badges -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="padding:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:8px;text-align:center;">
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">${t('yield_badge_lbl')}</div>
        <b style="font-size:16px;color:#10b981;">${geom.summary.yieldPct}%</b>
      </div>
      <div style="padding:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:8px;text-align:center;">
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">${t('scrap_badge_lbl')}</div>
        <b style="font-size:16px;color:#f59e0b;">${geom.summary.scrapPct}%</b>
      </div>
    </div>

    <!-- Total Specimens Count -->
    <div style="padding:12px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;text-align:center;margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;">${t('total_specimens_lbl')}</div>
      <div style="font-size:24px;font-weight:800;color:var(--accent,#3b82f6);font-family:'JetBrains Mono', monospace;">
        ${geom.totalSamples} <span style="font-size:14px;font-weight:600;">${t('unit_pcs')}</span>
      </div>
    </div>

    <!-- Breakdown Details -->
    ${breakdownHTML}

    <!-- Unused Space -->
    <div style="margin-top:12px;padding:8px 10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;font-size:11px;display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text-dim);">${t('unused_w_lbl')}</span>
        <b>${geom.summary.unusedWidth} mm</b>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text-dim);">${t('unused_h_lbl')}</span>
        <b>${geom.summary.unusedHeight} mm</b>
      </div>
    </div>

    <!-- Fit / Overflow Status Box -->
    <div style="margin-top:14px;padding:10px;border-radius:8px;text-align:center;font-size:12px;font-weight:600;${geom.isOverflow ? 'background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#ef4444;' : 'background:rgba(16,185,129,0.12);border:1px solid #10b981;color:#10b981;'}">
      ${geom.isOverflow ? tf('fit_overflow', { w: geom.overflow.width, h: geom.overflow.height }) : t('fit_ok')}
    </div>

    <button id="etchBtnCopySummary" class="sbtn" style="width:100%;margin-top:14px;text-align:center;padding:7px 0;font-size:12px;">
      ${t('btn_copy_summary')}
    </button>
  `;

  document.getElementById('etchBtnCopySummary')?.addEventListener('click', () => {
    const statusText = geom.isOverflow ? t('status_overflow') : t('status_ok');
    const text = tf('summary_template', {
      pw: geom.plate.width,
      ph: geom.plate.height,
      total: geom.totalSamples,
      used: geom.summary.usedArea.toLocaleString(),
      yield: geom.summary.yieldPct,
      scrap: geom.summary.scrapPct,
      status: statusText,
    });
    navigator.clipboard.writeText(text).then(() => alert(t('copied_msg')));
  });

  updateToolbarStats();
}

// ── Export Handlers ─────────────────────────────────────────────────────────
async function doExportDWG() {
  const geom = state.getGeometry();
  if (geom.isOverflow) {
    if (!confirm(t('confirm_dxf_overflow'))) return;
  }

  const modeSelect = document.getElementById('etchExportModeSelect');
  const mode = modeSelect ? modeSelect.value : 'MANUFACTURING';
  const isMfg = mode === 'MANUFACTURING';

  const exportOptions = {
    mode,
    exportDimensions: isMfg ? false : state.view.showDimensions,
    exportOrientationMarks: isMfg ? false : state.view.showOrientation,
    exportText: !isMfg,
    exportPlateOutline: true,
  };

  // Pre-export CAD validation check
  const cadModel = buildCadEntities(geom, exportOptions);
  const val = validateCadGeometry(cadModel);
  if (!val.valid) {
    alert(t('cad_validation_failed') + val.errors.join('\n'));
    return;
  }

  try {
    // Autodesk-compatible DWG is produced by converting this verified DXF
    // through an installed ODA File Converter. The previous in-browser DWG
    // writer produced files that Autodesk DWG TrueView rejected as invalid.
    const dxf = generateDXF(geom, exportOptions);
    const dxfBytes = new TextEncoder().encode(dxf);
    const response = await fetch('/api/cad/convert-dwg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dxfBase64: uint8ToBase64(dxfBytes), version: 'ACAD2007' }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error(t('dwg_converter_missing'));
    const converted = await response.json();
    if (!response.ok || !converted?.success) {
      if (converted?.code === 'converter_not_found') throw new Error(t('dwg_converter_missing'));
      throw new Error(t('dwg_conversion_failed') + (converted?.error || `HTTP ${response.status}`));
    }
    const dwgBytes = base64ToUint8(converted.dwgBase64 || '');
    if (dwgBytes.length < 64 || String.fromCharCode(...dwgBytes.slice(0, 6)) !== 'AC1021') {
      throw new Error(t('dwg_conversion_failed') + 'AC1021 validation failed');
    }
    const defaultFilename = `Etching_${geom.plate.width}x${geom.plate.height}_${isMfg ? 'MFG' : 'REVIEW'}.dwg`;
    await saveCadFile(
      dwgBytes,
      defaultFilename,
      'application/octet-stream',
      'AutoCAD Drawing (*.dwg)',
      '.dwg',
      t('prompt_save_dwg')
    );
  } catch (err) {
    console.error('DWG export failed:', err);
    alert(err.message || String(err));
  }
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToUint8(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function doExportDXF() {
  const geom = state.getGeometry();
  if (geom.isOverflow) {
    if (!confirm(t('confirm_dxf_overflow'))) return;
  }

  const modeSelect = document.getElementById('etchExportModeSelect');
  const mode = modeSelect ? modeSelect.value : 'MANUFACTURING';
  const isMfg = mode === 'MANUFACTURING';

  const exportOptions = {
    mode,
    exportDimensions: isMfg ? false : state.view.showDimensions,
    exportOrientationMarks: isMfg ? false : state.view.showOrientation,
    exportText: !isMfg,
    exportPlateOutline: true,
  };

  // Pre-export CAD validation check
  const cadModel = buildCadEntities(geom, exportOptions);
  const val = validateCadGeometry(cadModel);
  if (!val.valid) {
    alert(t('cad_validation_failed') + val.errors.join('\n'));
    return;
  }

  try {
    const dxf = generateDXF(geom, exportOptions);
    const defaultFilename = `Etching_${geom.plate.width}x${geom.plate.height}_${isMfg ? 'MFG' : 'REVIEW'}.dxf`;
    await saveCadFile(
      dxf,
      defaultFilename,
      'application/dxf',
      'AutoCAD DXF (*.dxf)',
      '.dxf',
      t('prompt_save_dxf')
    );
  } catch (err) {
    console.error('DXF export failed:', err);
    alert('DXF 내보내기 중 오류가 발생했습니다: ' + (err.message || err));
  }
}

function doExportSVG() {
  const geom = state.getGeometry();
  const svg = generateSVG(geom, {
    showDimensions: state.view.showDimensions,
    showOrientationMarks: state.view.showOrientation,
  });
  downloadFile(svg, `Etching_${geom.plate.width}x${geom.plate.height}.svg`, 'image/svg+xml;charset=utf-8');
}

function doExportPDF() {
  const geom = state.getGeometry();
  const pdf = generatePDF(geom, {
    scaleMode: '1:1',
    pageSize: 'auto',
    includeDimensions: state.view.showDimensions,
  });
  downloadFile(pdf, `Etching_${geom.plate.width}x${geom.plate.height}.pdf`, 'application/pdf');
}

function doExportPNG() {
  if (!_canvas) return;
  const link = document.createElement('a');
  link.download = `Etching_Preview.png`;
  link.href = _canvas.toDataURL('image/png');
  link.click();
}

async function saveCadFile(data, defaultFilename, mimeType, description, extension, promptMsg) {
  const ext = extension.startsWith('.') ? extension : ('.' + extension);

  // 1. File System Access API (showSaveFilePicker)
  // Opens native OS "Save As" file picker window in Chrome/Edge,
  // allowing user to select directory path and edit filename.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: description || `${extension.toUpperCase()} File`,
          accept: {
            [mimeType]: [ext]
          }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        // User clicked cancel in native save picker
        return false;
      }
      console.warn('showSaveFilePicker failed or not allowed, falling back to download:', err);
    }
  }

  // 2. Fallback: Prompt user to enter or edit filename
  let targetName = defaultFilename;
  if (typeof window.prompt === 'function') {
    const input = window.prompt(promptMsg || `${extension.toUpperCase()} 파일명을 입력하세요:`, defaultFilename);
    if (input === null) return false; // User cancelled
    const trimmed = input.trim();
    if (trimmed) {
      targetName = trimmed;
      if (!targetName.toLowerCase().endsWith(ext.toLowerCase())) {
        targetName += ext;
      }
    }
  }

  // 3. Fallback: Standard browser file download
  const blob = (data instanceof Blob) ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = targetName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  return true;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── 모듈 Export 객체 (3M Framework Interface) ─────────────────────────────────
const EtchingDesignModule = {
  name: 'Etching Design',
  icon: 'assets/etching_design.png',
  category: 'Software',
  viewType: 'custom',
  serial: null,

  onConnect() {},
  onDisconnect() {
    if (_resizeObserver) _resizeObserver.disconnect();
    _resizeObserver = null;
    if (_mouseMoveHandler) { window.removeEventListener('mousemove', _mouseMoveHandler); _mouseMoveHandler = null; }
    if (_mouseUpHandler) { window.removeEventListener('mouseup', _mouseUpHandler); _mouseUpHandler = null; }
    if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
    _canvas = null;
    _ctx = null;
    _geomCache = null;
  },
  onLine() {},

  // LEFT SIDEBAR: SETTINGS
  buildSidebar(el) {
    if (!state) state = new EtchingState();

    el.innerHTML = `
      <div style="padding:10px;display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;overflow-y:auto;box-sizing:border-box;">

        <!-- Mode Toggle (Single vs Mixed) -->
        <div class="panel" style="padding:10px;margin-bottom:0;">
          <div style="display:flex;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:2px;">
            <button id="etchModeSingle" class="sbtn" style="flex:1;text-align:center;font-size:12px;border:none;border-radius:4px;padding:6px 0;cursor:pointer;${state.mode === 'single' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('mode_single')}</button>
            <button id="etchModeMixed" class="sbtn" style="flex:1;text-align:center;font-size:12px;border:none;border-radius:4px;padding:6px 0;cursor:pointer;${state.mode === 'mixed' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('mode_mixed')}</button>
          </div>
        </div>

        <!-- Single Mode Controls -->
        <div id="etchSinglePanel" style="display:${state.mode === 'single' ? 'flex' : 'none'};flex-direction:column;gap:10px;">

          <!-- Preset Selector -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_preset')}</div>
            <select id="etchPresetSelect" class="inp" style="width:100%;font-size:12px;padding:6px 8px;">
              <option value="TYPE_1" ${state.currentPresetKey === 'TYPE_1' ? 'selected' : ''}>${t('preset_type1')}</option>
              <option value="TYPE_2" ${state.currentPresetKey === 'TYPE_2' ? 'selected' : ''}>${t('preset_type2')}</option>
              <option value="TYPE_3" ${state.currentPresetKey === 'TYPE_3' ? 'selected' : ''}>${t('preset_type3')}</option>
              <option value="CUSTOM" ${state.currentPresetKey === 'CUSTOM' ? 'selected' : ''}>${t('preset_custom')}</option>
            </select>
          </div>

          <!-- Plate Settings -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_plate')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('plate_width')}</label>
                <input type="number" id="etchPlateW" class="inp" value="${state.single.plate.width}" step="0.5" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('plate_height')}</label>
                <input type="number" id="etchPlateH" class="inp" value="${state.single.plate.height}" step="0.5" style="width:100%;">
              </div>
            </div>
            <div style="margin-top:6px;">
              <label style="font-size:10px;color:var(--text-mut);">${t('margin_mode')}</label>
              <div style="display:flex;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:2px;margin-top:2px;">
                <button id="etchSingleMarginAuto" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${state.single.margin.mode !== 'manual' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('margin_auto')}</button>
                <button id="etchSingleMarginManual" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${state.single.margin.mode === 'manual' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('margin_manual')}</button>
              </div>
            </div>
            <div id="etchManualMarginsRow" style="display:${state.single.margin.mode === 'manual' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('margin_lr')}</label>
                <input type="number" id="etchMarginLR" class="inp" value="${state.single.margin.left}" step="0.5" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('margin_tb')}</label>
                <input type="number" id="etchMarginTB" class="inp" value="${state.single.margin.top}" step="0.5" style="width:100%;">
              </div>
            </div>
          </div>

          <!-- Sample Specifications -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_sample')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('sample_width')}</label>
                <input type="number" id="etchSampleW" class="inp" value="${state.single.sample.width}" step="0.5" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('sample_height')}</label>
                <input type="number" id="etchSampleH" class="inp" value="${state.single.sample.height}" step="0.5" style="width:100%;">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('corner_type')}</label>
                <select id="etchSingleCornerType" class="inp" style="width:100%;font-size:11px;padding:4px 6px;">
                  <option value="fillet" ${(state.single.sample.cornerType || 'fillet') === 'fillet' ? 'selected' : ''}>${t('corner_type_fillet')}</option>
                  <option value="chamfer" ${state.single.sample.cornerType === 'chamfer' ? 'selected' : ''}>${t('corner_type_chamfer')}</option>
                  <option value="sharp" ${state.single.sample.cornerType === 'sharp' ? 'selected' : ''}>${t('corner_type_sharp')}</option>
                </select>
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('corner_radius')}</label>
                <input type="number" id="etchSingleCornerRadius" class="inp" value="${state.single.sample.cornerRadius ?? 0.3}" step="0.1" min="0" max="20" style="width:100%;">
              </div>
            </div>
          </div>

          <!-- Product Orientation -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_orient')}</div>
            <div style="display:flex;gap:4px;margin-bottom:8px;">
              ${[0, 90, 180, 270].map(deg => `
                <button class="sbtn etch-orient-btn" data-deg="${deg}" style="flex:1;text-align:center;font-size:11px;padding:6px 0;${state.single.sample.orientation === deg ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : ''}">
                  ${deg === 0 ? '↑ 0°' : deg === 90 ? '→ 90°' : deg === 180 ? '↓ 180°' : '← 270°'}
                </button>
              `).join('')}
            </div>
            <!-- Center Override -->
            <label style="font-size:11px;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="etchOverrideCenter" ${state.single.sample.overrideCenter ? 'checked' : ''}>
              <span>${t('orient_center_override')}</span>
            </label>
            <div id="etchCenterOrientRow" style="display:${state.single.sample.overrideCenter ? 'flex' : 'none'};gap:4px;margin-top:6px;">
              ${[0, 90, 180, 270].map(deg => `
                <button class="sbtn etch-center-orient-btn" data-deg="${deg}" style="flex:1;text-align:center;font-size:10px;padding:4px 0;${state.single.sample.centerOrientation === deg ? 'background:#ec4899;color:#fff;font-weight:700;' : ''}">
                  ${deg === 0 ? '↑ 0°' : deg === 90 ? '→ 90°' : deg === 180 ? '↓ 180°' : '← 270°'}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Layout Mode & Gaps -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_layout')}</div>
            <div style="margin-bottom:6px;">
              <div style="display:flex;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:2px;">
                <button id="etchSingleLayoutFixed" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${state.single.layout.mode === 'fixed' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('layout_fixed')}</button>
                <button id="etchSingleLayoutAuto" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${state.single.layout.mode !== 'fixed' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('layout_auto')}</button>
              </div>
              <div style="font-size:9px;color:var(--text-mut);margin-top:4px;line-height:1.45;">
                ${state.single.layout.mode === 'fixed' ? t('layout_fixed_help') : t('layout_auto_help')}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('cols')}</label>
                <input type="number" id="etchCols" class="inp" value="${state.single.layout.columns}" ${state.single.layout.mode === 'auto' ? 'disabled' : ''} min="1" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('rows')}</label>
                <input type="number" id="etchRows" class="inp" value="${state.single.layout.rows}" ${state.single.layout.mode === 'auto' ? 'disabled' : ''} min="1" style="width:100%;">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('h_gap')}</label>
                <input type="number" id="etchHGap" class="inp" value="${state.single.gaps.horizontalGap}" step="0.5" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('v_gap')}</label>
                <input type="number" id="etchVGap" class="inp" value="${state.single.gaps.verticalGap}" step="0.1" min="0.1" style="width:100%;">
              </div>
            </div>
          </div>

          <!-- Tabs (고정 탭) -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:700;color:var(--text-dim);">${t('sec_tabs')}</span>
              <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="checkbox" id="etchTabsEnable" ${state.single.tabs.enabled ? 'checked' : ''}>
                <span>${t('tabs_enable')}</span>
              </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('tab_width')}</label>
                <input type="number" id="etchTabWidth" class="inp" value="${state.single.tabs.width}" step="0.1" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('tab_length')}</label>
                <input type="number" id="etchTabLength" class="inp" value="${state.single.tabs.length}" step="0.1" style="width:100%;">
              </div>
            </div>

            <!-- Single Mode Bridge Feature -->
            <div style="margin-top:6px;padding:8px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;">
              <div style="font-size:10px;font-weight:700;color:var(--accent,#3b82f6);margin-bottom:6px;display:flex;align-items:center;gap:4px;">
                <span>⚙️</span>
                <span>${t('tab_feature_sec')}</span>
              </div>
              <div style="margin-bottom:6px;">
                <label style="font-size:9px;color:var(--text-mut);">${t('tab_feature_type')}</label>
                <select id="etchSingleTabFeatureType" class="inp" style="width:100%;font-size:11px;padding:3px 4px;font-weight:600;">
                  <option value="none" ${(!state.single.tabs?.feature?.type || state.single.tabs.feature.type === 'none') ? 'selected' : ''}>${t('tab_feature_none')}</option>
                  <option value="hole" ${state.single.tabs?.feature?.type === 'hole' ? 'selected' : ''}>${t('tab_feature_hole')}</option>
                  <option value="slot" ${state.single.tabs?.feature?.type === 'slot' ? 'selected' : ''}>${t('tab_feature_slot')}</option>
                </select>
              </div>
              <div id="etchSingleTabHolePanel" style="display:${state.single.tabs?.feature?.type === 'hole' ? 'block' : 'none'};">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_dia')}</label>
                    <input type="number" id="etchSingleTabHoleDia" class="inp" value="${state.single.tabs?.feature?.holeDia ?? 0.3}" step="0.05" min="0.05" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_x')}</label>
                    <select id="etchSingleTabHolePosX" class="inp" style="width:100%;font-size:10px;padding:3px 4px;">
                      <option value="center" ${(state.single.tabs?.feature?.posX || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                      <option value="twoPoints" ${state.single.tabs?.feature?.posX === 'twoPoints' ? 'selected' : ''}>${t('tab_pos_two_points')}</option>
                      <option value="fourPoints" ${state.single.tabs?.feature?.posX === 'fourPoints' ? 'selected' : ''}>${t('tab_pos_four_points')}</option>
                      <option value="custom" ${state.single.tabs?.feature?.posX === 'custom' ? 'selected' : ''}>${t('tab_pos_custom')}</option>
                    </select>
                  </div>
                </div>
                <div id="etchSingleTabHolePointInsetWrap" style="display:${['twoPoints','fourPoints'].includes(state.single.tabs?.feature?.posX) ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_distance_x')}</label>
                    <input type="number" id="etchSingleTabHoleInsetX" class="inp" value="${state.single.tabs?.feature?.pointDistanceX ?? Math.max(0, state.single.sample.width - 2 * (state.single.tabs?.feature?.pointInsetX ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                  <div id="etchSingleTabHoleInsetYWrap" style="display:${state.single.tabs?.feature?.posX === 'fourPoints' ? 'block' : 'none'};">
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_distance_y')}</label>
                    <input type="number" id="etchSingleTabHoleInsetY" class="inp" value="${state.single.tabs?.feature?.pointDistanceY ?? Math.max(0, state.single.sample.height - 2 * (state.single.tabs?.feature?.pointInsetY ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                </div>
                <div id="etchSingleTabHoleCustomXWrap" style="display:${state.single.tabs?.feature?.posX === 'custom' ? 'block' : 'none'};margin-bottom:6px;">
                  <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_custom')}</label>
                  <input type="number" id="etchSingleTabHoleCustomX" class="inp" value="${state.single.tabs?.feature?.customX ?? 0.25}" step="0.05" min="0.01" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                </div>
              </div>
              <div id="etchSingleTabSlotPanel" style="display:${state.single.tabs?.feature?.type === 'slot' ? 'block' : 'none'};">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_w')}</label>
                    <input type="number" id="etchSingleTabSlotW" class="inp" value="${state.single.tabs?.feature?.slotWidth ?? 0.2}" step="0.05" min="0.05" max="3.0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_h')}</label>
                    <input type="number" id="etchSingleTabSlotH" class="inp" value="${state.single.tabs?.feature?.slotHeight ?? 0.2}" step="0.05" min="0.05" max="2.0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_x')}</label>
                    <select id="etchSingleTabSlotPosX" class="inp" style="width:100%;font-size:10px;padding:3px 4px;">
                      <option value="center" ${(state.single.tabs?.feature?.posX || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                      <option value="twoPoints" ${state.single.tabs?.feature?.posX === 'twoPoints' ? 'selected' : ''}>${t('tab_pos_two_points')}</option>
                      <option value="fourPoints" ${state.single.tabs?.feature?.posX === 'fourPoints' ? 'selected' : ''}>${t('tab_pos_four_points')}</option>
                      <option value="custom" ${state.single.tabs?.feature?.posX === 'custom' ? 'selected' : ''}>${t('tab_pos_custom')}</option>
                    </select>
                  </div>
                  <div id="etchSingleTabSlotPosYWrap" style="display:${['twoPoints','fourPoints'].includes(state.single.tabs?.feature?.posX) ? 'none' : 'block'};">
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_y')}</label>
                    <select id="etchSingleTabSlotPosY" class="inp" style="width:100%;font-size:10px;padding:3px 4px;">
                      <option value="center" ${(state.single.tabs?.feature?.posY || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                      <option value="top" ${state.single.tabs?.feature?.posY === 'top' ? 'selected' : ''}>${t('tab_pos_top')}</option>
                      <option value="bottom" ${state.single.tabs?.feature?.posY === 'bottom' ? 'selected' : ''}>${t('tab_pos_bot')}</option>
                      <option value="both" ${state.single.tabs?.feature?.posY === 'both' ? 'selected' : ''}>${t('tab_pos_both')}</option>
                    </select>
                  </div>
                </div>
                <div id="etchSingleTabSlotPointInsetWrap" style="display:${['twoPoints','fourPoints'].includes(state.single.tabs?.feature?.posX) ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                  <div>
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_distance_x')}</label>
                    <input type="number" id="etchSingleTabSlotInsetX" class="inp" value="${state.single.tabs?.feature?.pointDistanceX ?? Math.max(0, state.single.sample.width - 2 * (state.single.tabs?.feature?.pointInsetX ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                  <div id="etchSingleTabSlotInsetYWrap" style="display:${state.single.tabs?.feature?.posX === 'fourPoints' ? 'block' : 'none'};">
                    <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_distance_y')}</label>
                    <input type="number" id="etchSingleTabSlotInsetY" class="inp" value="${state.single.tabs?.feature?.pointDistanceY ?? Math.max(0, state.single.sample.height - 2 * (state.single.tabs?.feature?.pointInsetY ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                  </div>
                </div>
                <div id="etchSingleTabSlotCustomXWrap" style="display:${state.single.tabs?.feature?.posX === 'custom' ? 'block' : 'none'};margin-bottom:6px;">
                  <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_custom')}</label>
                  <input type="number" id="etchSingleTabSlotCustomX" class="inp" value="${state.single.tabs?.feature?.customX ?? 0.25}" step="0.05" min="0.01" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                </div>
              </div>
              <div style="font-size:9px;color:var(--text-mut);line-height:1.45;margin-top:6px;">${t('tab_preview_help')}</div>
              <button id="etchSingleTabApplyType" class="sbtn" style="width:100%;margin-top:6px;padding:5px 8px;font-size:10px;font-weight:700;color:var(--accent,#3b82f6);border:1px solid rgba(59,130,246,0.35);">${t('tab_apply_all_btn')}</button>
            </div>
          </div>

        </div><!-- #etchSinglePanel -->

        <!-- Mixed Mode Controls -->
        <div id="etchMixedPanel" style="display:${state.mode === 'mixed' ? 'flex' : 'none'};flex-direction:column;gap:10px;">

          <!-- Mixed Sheet Specifications (원판 규격 및 여백 설정 - 단일 규격과 100% 동기화) -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_mixed_sheet')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('plate_width')}</label>
                <input type="number" id="etchMixedPlateW" class="inp" value="${state.mixed.plate.width}" step="0.5" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('plate_height')}</label>
                <input type="number" id="etchMixedPlateH" class="inp" value="${state.mixed.plate.height}" step="0.5" style="width:100%;">
              </div>
            </div>

            <!-- 여백 모드 (자동 중앙 정렬 vs 수동 여백 설정) -->
            <div style="margin-top:6px;">
              <label style="font-size:10px;color:var(--text-mut);">${t('margin_mode')}</label>
              <div style="display:flex;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:2px;margin-top:2px;">
                <button id="etchMixedMarginAuto" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${(state.mixed.margin?.mode ?? 'auto') !== 'manual' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('margin_auto')}</button>
                <button id="etchMixedMarginManual" class="sbtn" style="flex:1;text-align:center;font-size:11px;border:none;border-radius:4px;padding:4px 0;${state.mixed.margin?.mode === 'manual' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('margin_manual')}</button>
              </div>
            </div>
            <div id="etchMixedManualMarginsRow" style="display:${state.mixed.margin?.mode === 'manual' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('margin_lr')}</label>
                <input type="number" id="etchMixedMarginLR" class="inp" value="${state.mixed.margin?.left ?? 15}" step="0.5" min="0" style="width:100%;">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-mut);">${t('margin_tb')}</label>
                <input type="number" id="etchMixedMarginTB" class="inp" value="${state.mixed.margin?.top ?? 4.5}" step="0.5" min="0" style="width:100%;">
              </div>
            </div>
          </div>

          <!-- Mixed Partition & Boundary Specifications (혼합 구획 분할 및 경계 여백) -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;">${t('sec_mixed_partition')}</div>

            <!-- 구획 분할 방식 토글 (세로 vs 가로) -->
            <div style="margin-bottom:6px;">
              <label style="font-size:10px;color:var(--text-mut);">${t('sec_split_dir')}</label>
              <div style="display:flex;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:2px;margin-top:2px;">
                <button id="etchSplitVertical" class="sbtn" style="flex:1;text-align:center;font-size:10px;border:none;border-radius:4px;padding:4px 0;${state.mixed.splitDirection !== 'horizontal' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('split_vertical')}</button>
                <button id="etchSplitHorizontal" class="sbtn" style="flex:1;text-align:center;font-size:10px;border:none;border-radius:4px;padding:4px 0;${state.mixed.splitDirection === 'horizontal' ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('split_horizontal')}</button>
              </div>
            </div>

            <!-- 타입 간 기본 여백 -->
            <div>
              <label style="font-size:10px;color:var(--text-mut);">${t('boundary_width')}</label>
              <input type="number" id="etchMixedBoundaryWidth" class="inp" value="${state.mixed.boundaryWidth ?? 5}" step="0.5" min="0" max="50" style="width:100%;">
            </div>
          </div>

          <!-- Quick Optimization Toolbar (Direction Dropdown only) -->
          <div class="panel" style="padding:8px 10px;margin-bottom:0;">
            <div style="position:relative;width:100%;">
              <button id="etchMixedOrientDropBtn" class="sbtn" style="width:100%;font-size:11px;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;font-weight:600;">
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${state.mixed.alignDirection === 'vertical' ? t('mixed_orient_v') : t('mixed_orient_h')}</span>
                <span style="font-size:10px;opacity:0.7;margin-left:2px;">▼</span>
              </button>
              <div id="etchMixedOrientMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:999;overflow:hidden;min-width:180px;">
                <div class="etch-orient-opt" data-dir="horizontal" style="padding:8px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--text);${state.mixed.alignDirection !== 'vertical' ? 'background:rgba(59,130,246,0.15);color:var(--accent,#3b82f6);font-weight:700;' : ''}">
                  <span>📐</span>
                  <span>${t('mixed_orient_h')}</span>
                </div>
                <div class="etch-orient-opt" data-dir="vertical" style="padding:8px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--text);${state.mixed.alignDirection === 'vertical' ? 'background:rgba(59,130,246,0.15);color:var(--accent,#3b82f6);font-weight:700;' : ''}">
                  <span>📐</span>
                  <span>${t('mixed_orient_v')}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Types Configuration: Cols/Rows Quantities and Specs (Ratio is Auto Calculated) -->
          <div class="panel" style="padding:10px;margin-bottom:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-size:11px;font-weight:700;color:var(--text-dim);">${t('sec_mixed_types')}</div>
              <div style="display:flex;gap:4px;">
                <button id="etchAllLayoutFixedBtn" class="sbtn" style="padding:2px 6px;font-size:9px;font-weight:600;">${t('layout_all_fixed')}</button>
                <button id="etchAllLayoutAutoBtn" class="sbtn" style="padding:2px 6px;font-size:9px;font-weight:600;">${t('layout_all_auto')}</button>
              </div>
            </div>
            ${(() => {
              const curGeom = _geomCache || state.getGeometry();
              let totalPlateQty = 0;
              return state.mixed.types.map((tObj, idx) => {
                const isH = state.mixed.splitDirection === 'horizontal';
                let posTag = '';
                if (isH) {
                  posTag = idx === 0 ? t('pos_top') : (idx === state.mixed.types.length - 1 ? t('pos_bot') : t('pos_mid'));
                } else {
                  posTag = idx === 0 ? t('pos_left') : (idx === state.mixed.types.length - 1 ? t('pos_right') : t('pos_mid'));
                }
                const calcTypeObj = curGeom?.types?.[idx];
                const isFixed = tObj.layout?.mode === 'fixed';
                const appliedCols = calcTypeObj ? calcTypeObj.cols : (tObj.cols ?? tObj.layout?.columns ?? 4);
                const appliedRows = calcTypeObj ? calcTypeObj.rows : (tObj.rows ?? tObj.layout?.rows ?? 10);
                const count = appliedCols * appliedRows;
                totalPlateQty += count;

                const actualRatio = calcTypeObj?.actualRatio !== undefined ? calcTypeObj.actualRatio : (curGeom?.totalSamples ? ((count / curGeom.totalSamples) * 100).toFixed(1) : '33.3');

                const curBWidth = (Array.isArray(state.mixed.boundaryWidths) && state.mixed.boundaryWidths[idx] !== undefined)
                  ? state.mixed.boundaryWidths[idx]
                  : state.mixed.boundaryWidth;
                const nextTypeObj = state.mixed.types[idx + 1];
                return `
                <div style="margin-bottom:${idx < state.mixed.types.length - 1 ? '8px' : '10px'};padding-bottom:10px;border-bottom:${idx < state.mixed.types.length - 1 ? '1px solid var(--border)' : 'none'};">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:5px;">
                      <b style="color:var(--accent,#3b82f6);font-size:12px;">${tObj.name}</b>
                      <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(59,130,246,0.15);color:var(--accent,#3b82f6);font-weight:700;">${posTag}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:3px;">
                      <button class="sbtn etch-type-move-btn" data-idx="${idx}" data-dir="-1" title="${t('btn_move_up')}" style="padding:3px 6px;font-size:10px;line-height:1;${idx === 0 ? 'opacity:0.3;cursor:not-allowed;' : ''}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                      <button class="sbtn etch-type-move-btn" data-idx="${idx}" data-dir="1" title="${t('btn_move_down')}" style="padding:3px 6px;font-size:10px;line-height:1;${idx === state.mixed.types.length - 1 ? 'opacity:0.3;cursor:not-allowed;' : ''}" ${idx === state.mixed.types.length - 1 ? 'disabled' : ''}>▼</button>
                      ${state.mixed.types.length > 1 ? `
                        <button class="sbtn etch-type-del-btn" data-idx="${idx}" title="${t('btn_delete_type')}" style="padding:3px 6px;font-size:10px;line-height:1;color:#ef4444;">🗑️</button>
                      ` : ''}
                    </div>
                  </div>


                  <!-- 배열 구조 및 간격 (수량 고정 vs 자동 계산 세그먼트 버튼) -->
                  <div style="margin-bottom:6px;padding:6px 8px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                      <div style="font-size:10px;font-weight:700;color:var(--text-dim);">${t('sec_layout')}</div>
                      <div style="display:flex;background:var(--panel);border:1px solid var(--border);border-radius:5px;padding:2px;gap:2px;">
                        <button class="sbtn etch-type-layout-fixed" data-idx="${idx}" style="font-size:10px;padding:2px 7px;border:none;border-radius:3px;${isFixed ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('layout_fixed')}</button>
                        <button class="sbtn etch-type-layout-auto" data-idx="${idx}" style="font-size:10px;padding:2px 7px;border:none;border-radius:3px;${!isFixed ? 'background:var(--accent,#3b82f6);color:#fff;font-weight:700;' : 'background:transparent;color:var(--text-dim);'}">${t('layout_auto')}</button>
                      </div>
                    </div>
                    <div style="font-size:9px;color:var(--text-mut);margin:-1px 0 5px;line-height:1.4;">
                      ${isFixed ? t('layout_fixed_help') : t('layout_auto_help')}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                      <div>
                        <label style="font-size:9px;color:var(--text-mut);">${t('cols')}</label>
                        <input type="number" class="inp etch-type-cols" data-idx="${idx}" value="${appliedCols}" min="1" ${!isFixed ? 'disabled' : ''} style="width:100%;font-size:11px;padding:3px 5px;font-weight:700;${!isFixed ? 'background:var(--bg);opacity:0.85;cursor:not-allowed;' : ''}" title="${!isFixed ? t('auto_cols_rows_tooltip') : ''}">
                      </div>
                      <div>
                        <label style="font-size:9px;color:var(--text-mut);">${t('rows')}</label>
                        <input type="number" class="inp etch-type-rows" data-idx="${idx}" value="${appliedRows}" min="1" ${!isFixed ? 'disabled' : ''} style="width:100%;font-size:11px;padding:3px 5px;font-weight:700;${!isFixed ? 'background:var(--bg);opacity:0.85;cursor:not-allowed;' : ''}" title="${!isFixed ? t('auto_cols_rows_tooltip') : ''}">
                      </div>
                    </div>
                  </div>

                  <!-- 시편 규격 & 간격 -->
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <div>
                      <label style="font-size:9px;color:var(--text-mut);">${t('specimen_wh_lbl')}</label>
                      <div style="display:flex;gap:4px;">
                        <input type="number" id="etchMixedSampleW_${idx}" class="inp" value="${tObj.sample.width}" step="0.5" style="width:50%;">
                        <input type="number" id="etchMixedSampleH_${idx}" class="inp" value="${tObj.sample.height}" step="0.5" style="width:50%;">
                      </div>
                    </div>
                    <div>
                      <label style="font-size:9px;color:var(--text-mut);">${t('gap_wh_lbl')}</label>
                      <div style="display:flex;gap:4px;">
                        <input type="number" id="etchMixedHGap_${idx}" class="inp" value="${tObj.gaps.horizontalGap}" step="0.5" style="width:50%;">
                        <input type="number" id="etchMixedVGap_${idx}" class="inp" value="${tObj.gaps.verticalGap}" step="0.1" min="0.1" style="width:50%;">
                      </div>
                    </div>
                  </div>

                  <!-- 개별 모서리 가공 설정 (타입별 각각 설정) -->
                  <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:6px;margin-top:6px;">
                    <div>
                      <label style="font-size:9px;color:var(--text-mut);">${t('corner_type')}</label>
                      <select class="inp etch-type-corner-type" data-idx="${idx}" style="width:100%;font-size:11px;padding:3px 4px;">
                        <option value="fillet" ${(tObj.sample.cornerType || 'fillet') === 'fillet' ? 'selected' : ''}>${t('corner_type_fillet')}</option>
                        <option value="chamfer" ${tObj.sample.cornerType === 'chamfer' ? 'selected' : ''}>${t('corner_type_chamfer')}</option>
                        <option value="sharp" ${tObj.sample.cornerType === 'sharp' ? 'selected' : ''}>${t('corner_type_sharp')}</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:9px;color:var(--text-mut);">${t('corner_radius')}</label>
                      <input type="number" class="inp etch-type-corner-radius" data-idx="${idx}" value="${tObj.sample.cornerRadius ?? 0.5}" step="0.1" min="0" max="20" style="width:100%;font-size:10px;padding:3px 4px;">
                    </div>
                  </div>

                  <!-- 고정 탭 / 브릿지 가공 (타입별 일괄 적용) -->
                  <div style="margin-top:8px;padding:8px;background:rgba(59,130,246,0.04);border:1px solid rgba(59,130,246,0.2);border-radius:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                      <div style="font-size:10px;font-weight:700;color:var(--accent,#3b82f6);display:flex;align-items:center;gap:4px;">
                        <span>⚙️</span>
                        <span>${t('tab_feature_sec')}</span>
                      </div>
                      <button class="sbtn etch-tab-apply-all-btn" data-idx="${idx}" title="${t('tab_apply_all_confirm')}" style="padding:2px 6px;font-size:9px;font-weight:600;color:var(--accent,#3b82f6);border:1px solid rgba(59,130,246,0.3);border-radius:4px;">${t('tab_apply_all_btn')}</button>
                    </div>

                    <!-- 탭 치수 (폭 / 길이) 및 러너 간격 여백 -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                      <div>
                        <label style="font-size:9px;color:var(--text-mut);">${t('tab_width')}</label>
                        <input type="number" class="inp etch-tab-w" data-idx="${idx}" value="${tObj.tabs?.width ?? 0.8}" step="0.1" min="0.1" max="10" style="width:100%;font-size:10px;padding:3px 4px;">
                      </div>
                      <div>
                        <label style="font-size:9px;color:var(--text-mut);">${t('tab_length')}</label>
                        <input type="number" class="inp etch-tab-l" data-idx="${idx}" value="${tObj.tabs?.length ?? 0.8}" step="0.1" min="0.1" max="10" style="width:100%;font-size:10px;padding:3px 4px;">
                      </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:var(--text-mut);margin-bottom:6px;background:rgba(0,0,0,0.18);padding:3px 6px;border-radius:4px;">
                      <span>${t('tab_runner_gap')}</span>
                      <span style="font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace;">
                        ${Math.max(0, (tObj.gaps.horizontalGap - 2 * (tObj.tabs?.length ?? 0.8))).toFixed(2)} mm
                      </span>
                    </div>

                    <!-- 가공 형태 선택 (없음 / 원형 홀 / 직사각형 홈) -->
                    <div style="margin-bottom:6px;">
                      <label style="font-size:9px;color:var(--text-mut);">${t('tab_feature_type')}</label>
                      <select class="inp etch-tab-feature-type" data-idx="${idx}" style="width:100%;font-size:11px;padding:3px 4px;font-weight:600;">
                        <option value="none" ${(!tObj.tabs?.feature?.type || tObj.tabs.feature.type === 'none') ? 'selected' : ''}>${t('tab_feature_none')}</option>
                        <option value="hole" ${tObj.tabs?.feature?.type === 'hole' ? 'selected' : ''}>${t('tab_feature_hole')}</option>
                        <option value="slot" ${tObj.tabs?.feature?.type === 'slot' ? 'selected' : ''}>${t('tab_feature_slot')}</option>
                      </select>
                    </div>

                    <!-- 원형 홀 설정 패널 -->
                    <div class="etch-tab-hole-panel" data-idx="${idx}" style="display:${tObj.tabs?.feature?.type === 'hole' ? 'block' : 'none'};">
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_dia')}</label>
                          <input type="number" class="inp etch-tab-hole-dia" data-idx="${idx}" value="${tObj.tabs?.feature?.holeDia ?? 0.3}" step="0.05" min="0.05" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_x')}</label>
                          <select class="inp etch-tab-hole-pos-x" data-idx="${idx}" style="width:100%;font-size:10px;padding:3px 4px;">
                            <option value="center" ${(tObj.tabs?.feature?.posX || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                            <option value="twoPoints" ${tObj.tabs?.feature?.posX === 'twoPoints' ? 'selected' : ''}>${t('tab_pos_two_points')}</option>
                            <option value="fourPoints" ${tObj.tabs?.feature?.posX === 'fourPoints' ? 'selected' : ''}>${t('tab_pos_four_points')}</option>
                            <option value="custom" ${tObj.tabs?.feature?.posX === 'custom' ? 'selected' : ''}>${t('tab_pos_custom')}</option>
                          </select>
                        </div>
                      </div>
                      <div class="etch-tab-hole-point-inset-wrap" data-idx="${idx}" style="display:${['twoPoints','fourPoints'].includes(tObj.tabs?.feature?.posX) ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_distance_x')}</label>
                          <input type="number" class="inp etch-tab-hole-inset-x" data-idx="${idx}" value="${tObj.tabs?.feature?.pointDistanceX ?? Math.max(0, tObj.sample.width - 2 * (tObj.tabs?.feature?.pointInsetX ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                        <div class="etch-tab-hole-inset-y-wrap" data-idx="${idx}" style="display:${tObj.tabs?.feature?.posX === 'fourPoints' ? 'block' : 'none'};">
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_hole_distance_y')}</label>
                          <input type="number" class="inp etch-tab-hole-inset-y" data-idx="${idx}" value="${tObj.tabs?.feature?.pointDistanceY ?? Math.max(0, tObj.sample.height - 2 * (tObj.tabs?.feature?.pointInsetY ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                      </div>
                      <div class="etch-tab-hole-custom-x-wrap" data-idx="${idx}" style="display:${tObj.tabs?.feature?.posX === 'custom' ? 'block' : 'none'};margin-bottom:6px;">
                        <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_custom')}</label>
                        <input type="number" class="inp etch-tab-hole-custom-x" data-idx="${idx}" value="${tObj.tabs?.feature?.customX ?? 0.25}" step="0.05" min="0.01" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                      </div>
                    </div>

                    <!-- 직사각형 홈 설정 패널 -->
                    <div class="etch-tab-slot-panel" data-idx="${idx}" style="display:${tObj.tabs?.feature?.type === 'slot' ? 'block' : 'none'};">
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_w')}</label>
                          <input type="number" class="inp etch-tab-slot-w" data-idx="${idx}" value="${tObj.tabs?.feature?.slotWidth ?? 0.2}" step="0.05" min="0.05" max="3.0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_h')}</label>
                          <input type="number" class="inp etch-tab-slot-h" data-idx="${idx}" value="${tObj.tabs?.feature?.slotHeight ?? 0.2}" step="0.05" min="0.05" max="2.0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                      </div>
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_x')}</label>
                          <select class="inp etch-tab-slot-pos-x" data-idx="${idx}" style="width:100%;font-size:10px;padding:3px 4px;">
                            <option value="center" ${(tObj.tabs?.feature?.posX || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                            <option value="twoPoints" ${tObj.tabs?.feature?.posX === 'twoPoints' ? 'selected' : ''}>${t('tab_pos_two_points')}</option>
                            <option value="fourPoints" ${tObj.tabs?.feature?.posX === 'fourPoints' ? 'selected' : ''}>${t('tab_pos_four_points')}</option>
                            <option value="custom" ${tObj.tabs?.feature?.posX === 'custom' ? 'selected' : ''}>${t('tab_pos_custom')}</option>
                          </select>
                        </div>
                        <div class="etch-tab-slot-pos-y-wrap" data-idx="${idx}" style="display:${['twoPoints','fourPoints'].includes(tObj.tabs?.feature?.posX) ? 'none' : 'block'};">
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_y')}</label>
                          <select class="inp etch-tab-slot-pos-y" data-idx="${idx}" style="width:100%;font-size:10px;padding:3px 4px;">
                            <option value="center" ${(tObj.tabs?.feature?.posY || 'center') === 'center' ? 'selected' : ''}>${t('tab_pos_center')}</option>
                            <option value="top" ${tObj.tabs?.feature?.posY === 'top' ? 'selected' : ''}>${t('tab_pos_top')}</option>
                            <option value="bottom" ${tObj.tabs?.feature?.posY === 'bottom' ? 'selected' : ''}>${t('tab_pos_bot')}</option>
                            <option value="both" ${tObj.tabs?.feature?.posY === 'both' ? 'selected' : ''}>${t('tab_pos_both')}</option>
                          </select>
                        </div>
                      </div>
                      <div class="etch-tab-slot-point-inset-wrap" data-idx="${idx}" style="display:${['twoPoints','fourPoints'].includes(tObj.tabs?.feature?.posX) ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div>
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_distance_x')}</label>
                          <input type="number" class="inp etch-tab-slot-inset-x" data-idx="${idx}" value="${tObj.tabs?.feature?.pointDistanceX ?? Math.max(0, tObj.sample.width - 2 * (tObj.tabs?.feature?.pointInsetX ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                        <div class="etch-tab-slot-inset-y-wrap" data-idx="${idx}" style="display:${tObj.tabs?.feature?.posX === 'fourPoints' ? 'block' : 'none'};">
                          <label style="font-size:9px;color:var(--text-mut);">${t('tab_slot_distance_y')}</label>
                          <input type="number" class="inp etch-tab-slot-inset-y" data-idx="${idx}" value="${tObj.tabs?.feature?.pointDistanceY ?? Math.max(0, tObj.sample.height - 2 * (tObj.tabs?.feature?.pointInsetY ?? 1))}" step="0.1" min="0" style="width:100%;font-size:10px;padding:3px 4px;">
                        </div>
                      </div>
                      <div class="etch-tab-slot-custom-x-wrap" data-idx="${idx}" style="display:${tObj.tabs?.feature?.posX === 'custom' ? 'block' : 'none'};margin-bottom:6px;">
                        <label style="font-size:9px;color:var(--text-mut);">${t('tab_pos_custom')}</label>
                        <input type="number" class="inp etch-tab-slot-custom-x" data-idx="${idx}" value="${tObj.tabs?.feature?.customX ?? 0.25}" step="0.05" min="0.01" max="5.0" style="width:100%;font-size:10px;padding:3px 4px;">
                      </div>
                    </div>
                    <div style="font-size:9px;color:var(--text-mut);line-height:1.45;margin-top:6px;">${t('tab_preview_help')}</div>
                  </div>
                </div>

                ${idx < state.mixed.types.length - 1 ? `
                  <!-- Inter-Type Gap Input Card -->
                  <div class="etch-boundary-gap-card" style="margin:6px 0 10px 0;padding:6px 8px;background:rgba(217,70,239,0.08);border:1px dashed rgba(217,70,239,0.5);border-radius:6px;display:flex;align-items:center;justify-content:space-between;">
                    <div style="font-size:10px;font-weight:700;color:#d946ef;display:flex;align-items:center;gap:4px;">
                      <span>${isH ? '↕' : '↔'}</span>
                      <span>${tf('boundary_between_types', { type1: tObj.name, type2: nextTypeObj?.name || `TYPE ${idx + 2}` })}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                      <input type="number" class="inp etch-boundary-gap-input" data-bidx="${idx}" value="${curBWidth}" step="0.5" min="0" max="100" style="width:55px;font-size:11px;padding:2px 4px;text-align:right;border-color:rgba(217,70,239,0.6);font-weight:700;color:var(--text);">
                      <span style="font-size:10px;color:var(--text-mut);">mm</span>
                    </div>
                  </div>
                ` : ''}
              `;
              }).join('');
            })()}

            <button id="etchAddMixedTypeBtn" class="sbtn" style="width:100%;font-size:11px;padding:6px 8px;margin-top:6px;margin-bottom:8px;text-align:center;border:1px dashed var(--accent,#3b82f6);color:var(--accent,#3b82f6);background:rgba(59,130,246,0.06);font-weight:600;">
              ${t('btn_add_type')}
            </button>

            <div id="etchRatioTotalWrap" style="padding:6px 8px;background:var(--panel-2);border-radius:6px;margin-top:4px;font-size:11px;display:flex;justify-content:space-between;align-items:center;">
              <span>${t('total_produced_specimens')}</span>
              <b id="etchRatioTotalVal" style="color:#10b981;">${(_geomCache?.totalSamples || 0)} 개</b>
            </div>
          </div>
        </div>

      </div>
    `;

    // Mode Toggle events
    el.querySelector('#etchModeSingle').onclick = () => { state.setMode('single'); refreshAll(); EtchingDesignModule.buildSidebar(el); };
    el.querySelector('#etchModeMixed').onclick = () => { state.setMode('mixed'); refreshAll(); EtchingDesignModule.buildSidebar(el); };

    // Preset Selection
    el.querySelector('#etchPresetSelect')?.addEventListener('change', e => {
      state.loadPreset(e.target.value);
      refreshAll();
      EtchingDesignModule.buildSidebar(el);
    });

    // Parameter binding helper
    const bindInp = (id, fn) => {
      el.querySelector('#' + id)?.addEventListener('input', e => {
        state.pushState();
        fn(parseFloat(e.target.value) || 0);
        refreshAll();
      });
    };

    // Single mode bindings (Plate & Margins synced with Mixed)
    bindInp('etchPlateW', v => {
      state.setPlateWidth(v, false);
      const m = el.querySelector('#etchMixedPlateW');
      if (m) m.value = v;
    });
    bindInp('etchPlateH', v => {
      state.setPlateHeight(v, false);
      const m = el.querySelector('#etchMixedPlateH');
      if (m) m.value = v;
    });
    bindInp('etchSampleW', v => state.single.sample.width = v);
    bindInp('etchSampleH', v => state.single.sample.height = v);
    bindInp('etchCols', v => state.single.layout.columns = v);
    bindInp('etchRows', v => state.single.layout.rows = v);
    bindInp('etchHGap', v => { state.single.gaps.horizontalGap = v; state.single.gaps.separatorWidth = v; });
    bindInp('etchVGap', v => { state.single.gaps.verticalGap = v; state.single.gaps.connectorWidth = v; });
    bindInp('etchMarginLR', v => {
      state.setMarginLR(v, false);
      const m = el.querySelector('#etchMixedMarginLR');
      if (m) m.value = v;
    });
    bindInp('etchMarginTB', v => {
      state.setMarginTB(v, false);
      const m = el.querySelector('#etchMixedMarginTB');
      if (m) m.value = v;
    });
    bindInp('etchTabWidth', v => state.single.tabs.width = v);
    bindInp('etchTabLength', v => state.single.tabs.length = v);
    el.querySelector('#etchSingleCornerType')?.addEventListener('change', e => {
      state.pushState();
      state.single.sample.cornerType = e.target.value;
      refreshAll();
    });
    bindInp('etchSingleCornerRadius', v => state.single.sample.cornerRadius = v);

    el.querySelector('#etchSingleMarginAuto')?.addEventListener('click', () => {
      state.setMarginMode('auto', true);
      refreshAll();
      this.buildSidebar(el);
    });
    el.querySelector('#etchSingleMarginManual')?.addEventListener('click', () => {
      state.setMarginMode('manual', true);
      refreshAll();
      this.buildSidebar(el);
    });

    el.querySelector('#etchSingleLayoutFixed')?.addEventListener('click', () => {
      state.pushState();
      state.single.layout.mode = 'fixed';
      refreshAll();
      this.buildSidebar(el);
    });
    el.querySelector('#etchSingleLayoutAuto')?.addEventListener('click', () => {
      state.pushState();
      state.single.layout.mode = 'auto';
      refreshAll();
      this.buildSidebar(el);
    });

    el.querySelector('#etchTabsEnable')?.addEventListener('change', e => {
      state.pushState();
      state.single.tabs.enabled = e.target.checked;
      refreshAll();
    });

    // Single Mode Bridge Feature Bindings
    el.querySelector('#etchSingleTabFeatureType')?.addEventListener('change', e => {
      const val = e.target.value;
      state.setTabFeature('single', { type: val });
      const holeP = el.querySelector('#etchSingleTabHolePanel');
      const slotP = el.querySelector('#etchSingleTabSlotPanel');
      if (holeP) holeP.style.display = (val === 'hole') ? 'block' : 'none';
      if (slotP) slotP.style.display = (val === 'slot') ? 'block' : 'none';
      refreshAll();
    });

    el.querySelector('#etchSingleTabHoleDia')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0.2;
      state.setTabFeature('single', { holeDia: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabHolePosX')?.addEventListener('change', e => {
      const val = e.target.value;
      state.setTabFeature('single', { posX: val });
      const customWrap = el.querySelector('#etchSingleTabHoleCustomXWrap');
      if (customWrap) customWrap.style.display = (val === 'custom') ? 'block' : 'none';
      const pointWrap = el.querySelector('#etchSingleTabHolePointInsetWrap');
      const insetYWrap = el.querySelector('#etchSingleTabHoleInsetYWrap');
      if (pointWrap) pointWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'grid' : 'none';
      if (insetYWrap) insetYWrap.style.display = val === 'fourPoints' ? 'block' : 'none';
      refreshAll();
    });

    el.querySelector('#etchSingleTabHoleInsetX')?.addEventListener('input', e => {
      state.setTabFeature('single', { pointDistanceX: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    });
    el.querySelector('#etchSingleTabHoleInsetY')?.addEventListener('input', e => {
      state.setTabFeature('single', { pointDistanceY: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    });

    el.querySelector('#etchSingleTabHoleCustomX')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0.25;
      state.setTabFeature('single', { customX: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotW')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0.2;
      state.setTabFeature('single', { slotWidth: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotH')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0.2;
      state.setTabFeature('single', { slotHeight: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotPosX')?.addEventListener('change', e => {
      const val = e.target.value;
      state.setTabFeature('single', { posX: val });
      const customWrap = el.querySelector('#etchSingleTabSlotCustomXWrap');
      if (customWrap) customWrap.style.display = (val === 'custom') ? 'block' : 'none';
      const pointWrap = el.querySelector('#etchSingleTabSlotPointInsetWrap');
      const insetYWrap = el.querySelector('#etchSingleTabSlotInsetYWrap');
      const posYWrap = el.querySelector('#etchSingleTabSlotPosYWrap');
      if (pointWrap) pointWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'grid' : 'none';
      if (insetYWrap) insetYWrap.style.display = val === 'fourPoints' ? 'block' : 'none';
      if (posYWrap) posYWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'none' : 'block';
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotInsetX')?.addEventListener('input', e => {
      state.setTabFeature('single', { pointDistanceX: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    });
    el.querySelector('#etchSingleTabSlotInsetY')?.addEventListener('input', e => {
      state.setTabFeature('single', { pointDistanceY: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotPosY')?.addEventListener('change', e => {
      const val = e.target.value;
      state.setTabFeature('single', { posY: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabSlotCustomX')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0.25;
      state.setTabFeature('single', { customX: val });
      refreshAll();
    });

    el.querySelector('#etchSingleTabApplyType')?.addEventListener('click', () => {
      if (!selectedSampleMatchesType('single')) {
        alert(t('tab_preview_select_first'));
        return;
      }
      if (confirm(t('tab_apply_all_confirm'))) {
        state.applyTabFeatureToType('single');
        refreshAll();
        this.buildSidebar(el);
      }
    });

    el.querySelectorAll('.etch-orient-btn').forEach(btn => {
      btn.onclick = () => {
        state.pushState();
        state.single.sample.orientation = parseInt(btn.dataset.deg, 10);
        refreshAll();
        this.buildSidebar(el);
      };
    });

    el.querySelector('#etchOverrideCenter')?.addEventListener('change', e => {
      state.pushState();
      state.single.sample.overrideCenter = e.target.checked;
      refreshAll();
      this.buildSidebar(el);
    });

    el.querySelectorAll('.etch-center-orient-btn').forEach(btn => {
      btn.onclick = () => {
        state.pushState();
        state.single.sample.centerOrientation = parseInt(btn.dataset.deg, 10);
        refreshAll();
        this.buildSidebar(el);
      };
    });

    // Mixed mode sheet bindings (Plate & Margins synced with Single)
    bindInp('etchMixedPlateW', v => {
      state.setPlateWidth(v, false);
      const s = el.querySelector('#etchPlateW');
      if (s) s.value = v;
    });
    bindInp('etchMixedPlateH', v => {
      state.setPlateHeight(v, false);
      const s = el.querySelector('#etchPlateH');
      if (s) s.value = v;
    });
    el.querySelector('#etchMixedBoundaryWidth')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 0) {
        state.setBoundaryWidth(val);
        el.querySelectorAll('.etch-boundary-gap-input').forEach(bInp => {
          bInp.value = val;
        });
        refreshAll();
      }
    });

    el.querySelectorAll('.etch-boundary-gap-input').forEach(inp => {
      inp.addEventListener('input', e => {
        const bidx = parseInt(inp.dataset.bidx, 10);
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
          state.setIndividualBoundaryWidth(bidx, val);
          refreshAll();
        }
      });
    });

    el.querySelector('#etchMixedMarginAuto')?.addEventListener('click', () => {
      state.setMarginMode('auto', true);
      refreshAll();
      this.buildSidebar(el);
    });
    el.querySelector('#etchMixedMarginManual')?.addEventListener('click', () => {
      state.setMarginMode('manual', true);
      refreshAll();
      this.buildSidebar(el);
    });
    bindInp('etchMixedMarginLR', v => {
      state.setMarginLR(v, false);
      const s = el.querySelector('#etchMarginLR');
      if (s) s.value = v;
    });
    bindInp('etchMixedMarginTB', v => {
      state.setMarginTB(v, false);
      const s = el.querySelector('#etchMarginTB');
      if (s) s.value = v;
    });

    el.querySelector('#etchSplitVertical')?.addEventListener('click', () => {
      state.setSplitDirection('vertical');
      refreshAll();
      this.buildSidebar(el);
    });

    el.querySelector('#etchSplitHorizontal')?.addEventListener('click', () => {
      state.setSplitDirection('horizontal');
      refreshAll();
      this.buildSidebar(el);
    });

    // Mixed auto-allocation
    el.querySelector('#etchMixedAutoEqualBtn')?.addEventListener('click', () => {
      state.autoDistributeMixedEqual();
      refreshAll();
      this.buildSidebar(el);
    });

    // Direction auto-fit dropdown
    const dropBtn = el.querySelector('#etchMixedOrientDropBtn');
    const dropMenu = el.querySelector('#etchMixedOrientMenu');
    if (dropBtn && dropMenu) {
      dropBtn.onclick = e => {
        e.stopPropagation();
        const isOpen = dropMenu.style.display === 'block';
        dropMenu.style.display = isOpen ? 'none' : 'block';
      };
      document.addEventListener('click', () => {
        if (dropMenu) dropMenu.style.display = 'none';
      }, { once: true });
    }

    el.querySelectorAll('.etch-orient-opt').forEach(opt => {
      opt.onclick = e => {
        e.stopPropagation();
        const dir = opt.dataset.dir || 'horizontal';
        state.autoAlignMixedOrientation(dir);
        refreshAll();
        this.buildSidebar(el);
      };
    });

    // Add new mixed type
    el.querySelector('#etchAddMixedTypeBtn')?.addEventListener('click', () => {
      state.addMixedType();
      refreshAll();
      this.buildSidebar(el);
    });

    // Move mixed type up/down
    el.querySelectorAll('.etch-type-move-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const dir = parseInt(btn.dataset.dir, 10);
        state.moveMixedType(idx, idx + dir);
        refreshAll();
        this.buildSidebar(el);
      };
    });

    // Delete mixed type
    el.querySelectorAll('.etch-type-del-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (confirm(t('confirm_delete_type'))) {
          state.removeMixedType(idx);
          refreshAll();
          this.buildSidebar(el);
        }
      };
    });

    // Mixed per-type sample size and gap inputs
    state.mixed.types.forEach((t, idx) => {
      bindInp(`etchMixedSampleW_${idx}`, v => { t.sample.width = v; updateMixedSidebarBadges(el); });
      bindInp(`etchMixedSampleH_${idx}`, v => { t.sample.height = v; updateMixedSidebarBadges(el); });
      bindInp(`etchMixedHGap_${idx}`, v => { t.gaps.horizontalGap = v; t.gaps.separatorWidth = v; updateMixedSidebarBadges(el); });
      bindInp(`etchMixedVGap_${idx}`, v => { t.gaps.verticalGap = v; t.gaps.connectorWidth = v; updateMixedSidebarBadges(el); });
    });

    // Mixed per-type corner type and radius (individual per card only)
    el.querySelectorAll('.etch-type-corner-type').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (state.mixed.types[idx]) {
          state.pushState();
          if (!state.mixed.types[idx].sample) state.mixed.types[idx].sample = {};
          state.mixed.types[idx].sample.cornerType = e.target.value;
          refreshAll();
        }
      });
    });

    el.querySelectorAll('.etch-type-corner-radius').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        if (state.mixed.types[idx]) {
          state.pushState();
          if (!state.mixed.types[idx].sample) state.mixed.types[idx].sample = {};
          state.mixed.types[idx].sample.cornerRadius = Math.max(0, parseFloat(e.target.value) || 0);
          refreshAll();
        }
      });
    });

    // Mixed per-type tab width and length
    el.querySelectorAll('.etch-tab-w').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0 && state.mixed?.types?.[idx]) {
          if (!state.mixed.types[idx].tabs) state.mixed.types[idx].tabs = {};
          state.mixed.types[idx].tabs.width = val;
          refreshAll();
          updateMixedSidebarBadges(el);
        }
      });
    });
    el.querySelectorAll('.etch-tab-l').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0 && state.mixed?.types?.[idx]) {
          if (!state.mixed.types[idx].tabs) state.mixed.types[idx].tabs = {};
          state.mixed.types[idx].tabs.length = val;
          refreshAll();
          updateMixedSidebarBadges(el);
        }
      });
    });

    // Mixed per-type bridge feature type
    el.querySelectorAll('.etch-tab-feature-type').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const val = e.target.value;
        state.setTabFeature(idx, { type: val });
        const holeP = el.querySelector(`.etch-tab-hole-panel[data-idx="${idx}"]`);
        const slotP = el.querySelector(`.etch-tab-slot-panel[data-idx="${idx}"]`);
        if (holeP) holeP.style.display = (val === 'hole') ? 'block' : 'none';
        if (slotP) slotP.style.display = (val === 'slot') ? 'block' : 'none';
        refreshAll();
      });
    });

    // Mixed per-type hole diameter
    el.querySelectorAll('.etch-tab-hole-dia').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value) || 0.2;
        state.setTabFeature(idx, { holeDia: val });
        refreshAll();
      });
    });

    // Mixed per-type hole posX
    el.querySelectorAll('.etch-tab-hole-pos-x').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const val = e.target.value;
        state.setTabFeature(idx, { posX: val });
        const customWrap = el.querySelector(`.etch-tab-hole-custom-x-wrap[data-idx="${idx}"]`);
        if (customWrap) customWrap.style.display = (val === 'custom') ? 'block' : 'none';
        const pointWrap = el.querySelector(`.etch-tab-hole-point-inset-wrap[data-idx="${idx}"]`);
        const insetYWrap = el.querySelector(`.etch-tab-hole-inset-y-wrap[data-idx="${idx}"]`);
        if (pointWrap) pointWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'grid' : 'none';
        if (insetYWrap) insetYWrap.style.display = val === 'fourPoints' ? 'block' : 'none';
        refreshAll();
      });
    });

    el.querySelectorAll('.etch-tab-hole-inset-x').forEach(inp => inp.addEventListener('input', e => {
      state.setTabFeature(parseInt(e.target.dataset.idx, 10), { pointDistanceX: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    }));
    el.querySelectorAll('.etch-tab-hole-inset-y').forEach(inp => inp.addEventListener('input', e => {
      state.setTabFeature(parseInt(e.target.dataset.idx, 10), { pointDistanceY: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    }));

    // Mixed per-type hole customX
    el.querySelectorAll('.etch-tab-hole-custom-x').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value) || 0.25;
        state.setTabFeature(idx, { customX: val });
        refreshAll();
      });
    });

    // Mixed per-type slot width & height
    el.querySelectorAll('.etch-tab-slot-w').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value) || 0.2;
        state.setTabFeature(idx, { slotWidth: val });
        refreshAll();
      });
    });

    el.querySelectorAll('.etch-tab-slot-h').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value) || 0.2;
        state.setTabFeature(idx, { slotHeight: val });
        refreshAll();
      });
    });

    // Mixed per-type slot posX
    el.querySelectorAll('.etch-tab-slot-pos-x').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const val = e.target.value;
        state.setTabFeature(idx, { posX: val });
        const customWrap = el.querySelector(`.etch-tab-slot-custom-x-wrap[data-idx="${idx}"]`);
        if (customWrap) customWrap.style.display = (val === 'custom') ? 'block' : 'none';
        const pointWrap = el.querySelector(`.etch-tab-slot-point-inset-wrap[data-idx="${idx}"]`);
        const insetYWrap = el.querySelector(`.etch-tab-slot-inset-y-wrap[data-idx="${idx}"]`);
        const posYWrap = el.querySelector(`.etch-tab-slot-pos-y-wrap[data-idx="${idx}"]`);
        if (pointWrap) pointWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'grid' : 'none';
        if (insetYWrap) insetYWrap.style.display = val === 'fourPoints' ? 'block' : 'none';
        if (posYWrap) posYWrap.style.display = ['twoPoints', 'fourPoints'].includes(val) ? 'none' : 'block';
        refreshAll();
      });
    });

    el.querySelectorAll('.etch-tab-slot-inset-x').forEach(inp => inp.addEventListener('input', e => {
      state.setTabFeature(parseInt(e.target.dataset.idx, 10), { pointDistanceX: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    }));
    el.querySelectorAll('.etch-tab-slot-inset-y').forEach(inp => inp.addEventListener('input', e => {
      state.setTabFeature(parseInt(e.target.dataset.idx, 10), { pointDistanceY: Math.max(0, parseFloat(e.target.value) || 0) });
      refreshAll();
    }));

    // Mixed per-type slot posY
    el.querySelectorAll('.etch-tab-slot-pos-y').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const val = e.target.value;
        state.setTabFeature(idx, { posY: val });
        refreshAll();
      });
    });

    // Mixed per-type slot customX
    el.querySelectorAll('.etch-tab-slot-custom-x').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(e.target.value) || 0.25;
        state.setTabFeature(idx, { customX: val });
        refreshAll();
      });
    });

    // Commit the one-specimen preview to every specimen of this type.
    el.querySelectorAll('.etch-tab-apply-all-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!selectedSampleMatchesType(idx)) {
          alert(t('tab_preview_select_first'));
          return;
        }
        if (confirm(t('tab_apply_all_confirm'))) {
          state.applyTabFeatureToType(idx);
          refreshAll();
          this.buildSidebar(el);
        }
      };
    });


    // Mixed per-type layout mode (fixed vs auto)
    el.querySelectorAll('.etch-type-layout-fixed').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        state.setTypeLayoutMode(idx, 'fixed');
        refreshAll();
        this.buildSidebar(el);
      };
    });
    el.querySelectorAll('.etch-type-layout-auto').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        state.setTypeLayoutMode(idx, 'auto');
        refreshAll();
        this.buildSidebar(el);
      };
    });

    // All types batch layout mode
    el.querySelector('#etchAllLayoutFixedBtn')?.addEventListener('click', () => {
      state.setAllTypesLayoutMode('fixed');
      refreshAll();
      this.buildSidebar(el);
    });
    el.querySelector('#etchAllLayoutAutoBtn')?.addEventListener('click', () => {
      state.setAllTypesLayoutMode('auto');
      refreshAll();
      this.buildSidebar(el);
    });

    // Mixed per-type columns and rows inputs (auto-derives ratio and updates badges in real-time)
    el.querySelectorAll('.etch-type-cols').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseInt(e.target.value, 10) || 1;
        state.setTypeLayoutCols(idx, val);
        refreshAll();
        updateMixedSidebarBadges(el);
      });
    });
    el.querySelectorAll('.etch-type-rows').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseInt(e.target.value, 10) || 1;
        state.setTypeLayoutRows(idx, val);
        refreshAll();
        updateMixedSidebarBadges(el);
      });
    });
  },

  // CENTER: 2D DRAWING PREVIEW
  buildCenter(el) {
    if (!state) state = new EtchingState();

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--bg);">

        <!-- Main Engineering Toolbar (Clean 1-line grouping) -->
        <div class="panel" style="margin-bottom:0;padding:6px 12px;border-radius:0;border-left:none;border-right:none;border-top:none;display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;flex-shrink:0;">
          
          <!-- Group 1: Project Actions -->
          <div style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">
            <button id="etchBtnNew" class="sbtn" style="padding:5px 9px;font-size:11px;font-weight:600;white-space:nowrap;" title="${t('title_new')}">${t('btn_new')}</button>
            <label class="sbtn" style="padding:5px 9px;font-size:11px;font-weight:600;white-space:nowrap;cursor:pointer;margin:0;" title="${t('title_open')}">
              ${t('btn_open')}
              <input type="file" id="etchFileInput" accept=".etching,.json" style="display:none;">
            </label>
            <button id="etchBtnSave" class="sbtn" style="padding:5px 9px;font-size:11px;font-weight:600;white-space:nowrap;" title="${t('title_save')}">${t('btn_save')}</button>
          </div>

          <span style="width:1px;height:18px;background:var(--border);margin:0 2px;flex-shrink:0;"></span>

          <!-- Group 2: History (Undo / Redo) -->
          <div style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">
            <button id="etchBtnUndo" class="sbtn" style="padding:5px 9px;font-size:11px;font-weight:600;white-space:nowrap;" title="${t('title_undo')}" disabled>${t('btn_undo')}</button>
            <button id="etchBtnRedo" class="sbtn" style="padding:5px 9px;font-size:11px;font-weight:600;white-space:nowrap;" title="${t('title_redo')}" disabled>${t('btn_redo')}</button>
          </div>

          <span style="width:1px;height:18px;background:var(--border);margin:0 2px;flex-shrink:0;"></span>

          <!-- Group 3: Export Actions (DWG & DXF only with Manufacturing / Review mode) -->
          <div style="display:inline-flex;align-items:center;gap:5px;flex-shrink:0;">
            <select id="etchExportModeSelect" class="inp" style="padding:4px 6px;font-size:11px;font-weight:600;height:26px;border-radius:4px;cursor:pointer;">
              <option value="MANUFACTURING" selected>${t('export_mode_mfg')}</option>
              <option value="REVIEW_DRAWING">${t('export_mode_review')}</option>
            </select>
            <button id="etchBtnExportDWG" class="sbtn primary" style="padding:5px 12px;font-size:11px;font-weight:700;white-space:nowrap;" title="${t('title_export_dwg')}">${t('btn_export_dwg')}</button>
            <button id="etchBtnExportDXF" class="sbtn green" style="padding:5px 12px;font-size:11px;font-weight:700;white-space:nowrap;" title="${t('title_export_dxf')}">${t('btn_export_dxf')}</button>
          </div>

          <!-- Group 4: Zoom Controls (Pinned Right) -->
          <div style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">
            <button class="sbtn" id="etchZoomOut" style="padding:4px 8px;font-weight:700;">−</button>
            <span id="etchZoomVal" style="font-size:11px;font-weight:700;min-width:40px;text-align:center;color:var(--text);font-family:'JetBrains Mono',monospace;">100%</span>
            <button class="sbtn" id="etchZoomIn" style="padding:4px 8px;font-weight:700;">+</button>
            <button class="sbtn" id="etchFitView" style="padding:4px 9px;font-size:11px;font-weight:600;white-space:nowrap;" title="${t('title_fit')}">${t('btn_fit')}</button>
          </div>

        </div>

        <!-- Overflow Warning Banner -->
        <div id="etchOverflowBanner" style="display:none;background:#ef4444;color:#ffffff;padding:6px 14px;font-size:12px;font-weight:600;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(239,68,68,0.4);">
          ⚠️ DESIGN EXCEEDS PLATE
        </div>

        <!-- Canvas Container -->
        <div style="flex:1;min-height:0;position:relative;overflow:hidden;">
          <canvas id="etchCanvas" style="width:100%;height:100%;display:block;cursor:crosshair;"></canvas>

          <!-- Floating View Toggles (Bottom Left) -->
          <div style="position:absolute;bottom:10px;left:12px;display:flex;gap:8px;background:var(--panel);padding:6px 12px;border-radius:8px;border:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,0.3);font-size:11px;">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkDim" ${state.view.showDimensions ? 'checked' : ''}>
              <span>${t('overlay_dims')}</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkOrient" ${state.view.showOrientation ? 'checked' : ''}>
              <span>${t('overlay_orient')}</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkGrid" ${state.view.showGrid ? 'checked' : ''}>
              <span>${t('overlay_grid')}</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkBound" ${state.view.showBoundary ? 'checked' : ''}>
              <span>${t('overlay_boundary')}</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkBridges" ${state.view.showBridges ? 'checked' : ''}>
              <span>${t('overlay_bridges')}</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);">
              <input type="checkbox" id="chkEtchRemove" ${state.view.showEtchRemove ? 'checked' : ''}>
              <span>${t('overlay_etch_remove')}</span>
            </label>
          </div>

          <!-- Mouse Guide Hint (Bottom Right) -->
          <div style="position:absolute;bottom:10px;right:12px;background:rgba(0,0,0,0.55);color:#cbd5e1;padding:4px 8px;border-radius:6px;font-size:11px;pointer-events:none;">
            ${t('mouse_guide')}
          </div>

        </div>

      </div>
    `;

    _canvas = el.querySelector('#etchCanvas');
    _ctx = _canvas.getContext('2d');

    setupCanvasInteractions(_canvas);

    // Zoom buttons
    el.querySelector('#etchZoomIn').onclick = () => setZoom(1.2);
    el.querySelector('#etchZoomOut').onclick = () => setZoom(0.83);
    el.querySelector('#etchFitView').onclick = () => fitToView();

    // Toggles
    const bindToggle = (id, prop) => {
      el.querySelector('#' + id)?.addEventListener('change', e => {
        state.view[prop] = e.target.checked;
        renderCanvas();
      });
    };
    bindToggle('chkDim', 'showDimensions');
    bindToggle('chkOrient', 'showOrientation');
    bindToggle('chkGrid', 'showGrid');
    bindToggle('chkBound', 'showBoundary');
    bindToggle('chkBridges', 'showBridges');
    bindToggle('chkEtchRemove', 'showEtchRemove');

    // Undo / Redo buttons
    el.querySelector('#etchBtnUndo').onclick = () => {
      if (state.undo()) refreshAll();
    };
    el.querySelector('#etchBtnRedo').onclick = () => {
      if (state.redo()) refreshAll();
    };

    // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y)
    if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
    _keyHandler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (state.undo()) refreshAll();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        if (state.redo()) refreshAll();
      }
    };
    document.addEventListener('keydown', _keyHandler);

    // Export Buttons (DWG & DXF only)
    el.querySelector('#etchBtnExportDWG').onclick = doExportDWG;
    el.querySelector('#etchBtnExportDXF').onclick = doExportDXF;

    // Project File New, Open, Save
    el.querySelector('#etchBtnNew').onclick = () => {
      if (confirm(t('confirm_new_project'))) {
        state = new EtchingState();
        refreshAll();
        const sidebar = document.getElementById('sidebar');
        if (sidebar) this.buildSidebar(sidebar);
      }
    };

    el.querySelector('#etchBtnSave').onclick = async () => {
      const json = state.serializeProject();
      await saveCadFile(
        json,
        'Etching_Project.etching',
        'application/json',
        'Etching Project File (*.etching)',
        '.etching',
        t('prompt_save_project')
      );
    };

    el.querySelector('#etchFileInput').addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const res = state.loadProject(evt.target.result);
        if (res.ok) {
          refreshAll();
          const sidebar = document.getElementById('sidebar');
          if (sidebar) this.buildSidebar(sidebar);
          fitToView();
        } else {
          alert(t('error_load_project') + res.error);
        }
      };
      reader.readAsText(file);
    });

    if (_resizeObserver) _resizeObserver.disconnect();
    _resizeObserver = new ResizeObserver(() => {
      renderCanvas();
    });
    _resizeObserver.observe(_canvas);

    setTimeout(() => {
      fitToView();
      refreshAll();
    }, 50);
  },

  // RIGHT PANEL: CALCULATION / RESULT
  buildRightPanel(el) {
    if (!state) state = new EtchingState();

    el.innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;height:100%;min-height:0;overflow-y:auto;box-sizing:border-box;">
        <div class="panel-title" style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <span>📊</span><span>${t('sec_calc_title')}</span>
        </div>

        <div id="etchCalcContent" style="display:flex;flex-direction:column;">
          <!-- Dynamically populated by updateCalculationPanel() -->
        </div>
      </div>
    `;

    updateCalculationPanel();
  },

  onRebuild() {
    refreshAll();
  },
};

export default EtchingDesignModule;

function updateMixedSidebarBadges(container) {
  if (!container || !state) return;
  const geom = _geomCache || state.getGeometry();
  const total = geom?.totalSamples || 0;
  if (Array.isArray(state.mixed?.types)) {
    state.mixed.types.forEach((tObj, idx) => {
      const calcTypeObj = geom?.types?.[idx];
      const isFixed = tObj.layout?.mode === 'fixed';
      const cols = calcTypeObj ? calcTypeObj.cols : (tObj.cols ?? tObj.layout?.columns ?? 1);
      const rows = calcTypeObj ? calcTypeObj.rows : (tObj.rows ?? tObj.layout?.rows ?? 1);

      // When in auto mode, populate the actual applied cols & rows values directly into the input fields!
      if (!isFixed) {
        const cInp = container.querySelector(`.etch-type-cols[data-idx="${idx}"]`);
        const rInp = container.querySelector(`.etch-type-rows[data-idx="${idx}"]`);
        if (cInp && cInp.value != cols) cInp.value = cols;
        if (rInp && rInp.value != rows) rInp.value = rows;
      }
    });
  }
  const totalEl = container.querySelector('#etchRatioTotalVal');
  if (totalEl) {
    totalEl.textContent = `${total} 개`;
  }
}
