import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/0op64/.gemini/antigravity/scratch/3M Instrument Logger";
const skillDir = "C:/Users/0op64/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations";
const runtimePython = "C:/Users/0op64/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const buildDir = path.join(workspaceDir, ".codex-pptx-build");
const outputDir = path.join(workspaceDir, "reports");
const finalPath = path.join(outputDir, "3M_Instrument_Logger_월별_계측기_작업이력_20260914.pptx");
const sourceReference = path.join(workspaceDir, "3M_Instrument_Logger_보고.pptx");

const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href,
);

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const FONT = "맑은 고딕";
const NAVY = "#204778";
const BLUE = "#0B84C6";
const LIGHT = "#EFF5FC";
const PALE = "#DCEAF9";
const WHITE = "#FFFFFF";
const INK = "#1E2A3A";
const MUTED = "#5D6D82";
const GREEN = "#168B5B";
const ORANGE = "#D66A13";
const BORDER = "#BFCFE2";

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function addRect(slide, left, top, width, height, fill, lineFill = "none") {
  return slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height },
    fill,
    line: { fill: lineFill, width: lineFill === "none" ? 0 : 1 },
  });
}

function addText(slide, text, left, top, width, height, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: options.fontSize ?? 22,
    bold: options.bold ?? false,
    color: options.color ?? INK,
    autoFit: "shrinkText",
    horizontalAlignment: options.align ?? "left",
    verticalAlignment: options.valign ?? "middle",
  };
  return shape;
}

function addChrome(slide, title, subtitle, slideNo) {
  slide.background.fill = "#F7F9FC";
  addRect(slide, 0, 0, 1280, 112, NAVY);
  addText(slide, title, 46, 22, 920, 54, { fontSize: 34, bold: true, color: WHITE });
  if (subtitle) addText(slide, subtitle, 48, 75, 1000, 26, { fontSize: 16, color: "#C7DBF4" });
  addText(slide, `2026.09.14  |  ${slideNo}`, 1060, 28, 172, 28, { fontSize: 13, color: "#DCE8F8", align: "right" });
  addRect(slide, 0, 686, 1280, 34, NAVY);
  addText(slide, "3M Korea  계측기 통합 관리 시스템", 46, 689, 420, 24, { fontSize: 13, color: "#DCE8F8" });
  addText(slide, "Confidential", 1080, 689, 150, 24, { fontSize: 13, color: "#DCE8F8", align: "right" });
}

function styleTable(table, headerRows = 1, firstColumn = true, fontSize = 16) {
  table.borders.assign({ style: "solid", fill: BORDER, width: 1 });
  const all = table.cells.block({ row: 0, column: 0, rowCount: table.rows.length, columnCount: table.columns.length });
  all.assign({
    textStyle: { typeface: FONT, fontSize, color: INK },
    margins: { left: 10, right: 10, top: 6, bottom: 6 },
    anchor: "middle",
  });
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.cells.block({ row: r, column: 0, rowCount: 1, columnCount: table.columns.length });
    row.fill = r < headerRows ? NAVY : (r % 2 === 0 ? "#F2F6FB" : WHITE);
    row.textStyle.color = r < headerRows ? WHITE : INK;
    row.textStyle.bold = r < headerRows;
    for (let c = 0; c < table.columns.length; c++) {
      table.getCell(r, c).text.style = {
        typeface: FONT,
        fontSize,
        bold: r < headerRows || (firstColumn && c === 0 && r >= headerRows),
        color: r < headerRows ? WHITE : (firstColumn && c === 0 ? NAVY : INK),
        autoFit: "shrinkText",
        verticalAlignment: "middle",
      };
    }
  }
  if (firstColumn) {
    const col = table.cells.block({ row: headerRows, column: 0, rowCount: table.rows.length - headerRows, columnCount: 1 });
    col.fill = PALE;
    col.textStyle.bold = true;
    col.textStyle.color = NAVY;
  }
}

function addMatrixSlide(title, subtitle, values, pageNo) {
  const slide = deck.slides.add();
  addChrome(slide, title, subtitle, pageNo);
  const table = slide.tables.add({
    rows: values.length,
    columns: 5,
    left: 38,
    top: 138,
    width: 1204,
    height: 516,
    columnTracks: [
      { mode: "fixed", value: 218 },
      { mode: "fr", value: 1 },
      { mode: "fr", value: 1 },
      { mode: "fr", value: 1 },
      { mode: "fr", value: 1.25 },
    ],
    values,
  });
  styleTable(table, 1, true, 14);
  table.rows[0].height = 46;
  slide.speakerNotes.textFrame.setText("출처: 프로젝트 AGENTS.md, Git 이력, docs/RELEASE_STATUS_20260909.md, docs/RELEASE_STATUS_20260912.md");
  return slide;
}

function addMonthSlide(month, headline, values, note, pageNo) {
  const slide = deck.slides.add();
  addChrome(slide, `${month} 작업 이력`, headline, pageNo);
  const table = slide.tables.add({
    rows: values.length,
    columns: 3,
    left: 52,
    top: 145,
    width: 1176,
    height: 455,
    columnTracks: [
      { mode: "fixed", value: 255 },
      { mode: "fixed", value: 650 },
      { mode: "fr", value: 1 },
    ],
    values,
  });
  styleTable(table, 1, true);
  table.rows[0].height = 50;
  addRect(slide, 52, 620, 1176, 45, LIGHT, BORDER);
  addText(slide, note, 68, 626, 1144, 32, { fontSize: 16, color: MUTED });
  slide.speakerNotes.textFrame.setText("출처: 프로젝트 AGENTS.md 및 Git 작업 기록. 실장비 검증 여부는 당시 기록을 기준으로 표기했습니다.");
  return slide;
}

// 1. Cover
{
  const slide = deck.slides.add();
  slide.background.fill = NAVY;
  addText(slide, "3M Instrument Logger", 58, 66, 900, 60, { fontSize: 48, bold: true, color: WHITE });
  addText(slide, "월별·계측기별 개발 작업 이력", 58, 142, 900, 52, { fontSize: 32, color: "#D6E7FA" });
  addRect(slide, 58, 232, 1164, 2, "#69B9E8");
  addText(slide, "2026년 6월부터 9월까지", 58, 264, 520, 42, { fontSize: 22, color: WHITE });
  addText(slide, "통합 카드 13개", 58, 350, 360, 52, { fontSize: 30, bold: true, color: "#63D6AA" });
  addText(slide, "최신 배포  v1.0.0-rc.2  ·  Build 2", 58, 412, 620, 44, { fontSize: 23, color: WHITE });
  addText(slide, "기준 문서  AGENTS.md · 릴리즈 상태 · Git 이력", 58, 486, 760, 35, { fontSize: 18, color: "#C7DBF4" });
  addText(slide, "2026. 09. 14", 1015, 66, 205, 30, { fontSize: 16, color: "#D6E7FA", align: "right" });
  addText(slide, "3M Korea  계측기 통합 관리 시스템", 58, 660, 500, 30, { fontSize: 14, color: "#D6E7FA" });
  addText(slide, "Confidential", 1045, 660, 175, 30, { fontSize: 14, color: "#D6E7FA", align: "right" });
  slide.speakerNotes.textFrame.setText("기존 2026-06-18 보고서의 색상과 구성을 참고해 최신 월별 이력 보고서로 재구성했습니다.");
}

addMatrixSlide(
  "월별 계측기 작업 지도  1/2",
  "기존 계측기 7종의 월별 주요 변경",
  [
    ["계측기", "6월", "7월", "8월", "9월"],
    ["Hioki 3540", "웹 통합\n표·그래프", "한·영 전환 점검", "유지", "공통 레이아웃 점검"],
    ["Keithley 2700", "웹 통합\n오버레인지 처리", "한·영 전환 점검", "유지", "공통 레이아웃 점검"],
    ["Mitutoyo VL-50", "7-E-2 통신\n그룹 그래프", "한·영 전환 점검", "유지", "공통 레이아웃 점검"],
    ["DAQ-6510", "SCPI·채널 스캔\n그래프 수정", "공통 UI 점검", "유지", "레이아웃 회귀 점검"],
    ["Agilent 4339B", "-213 시퀀스 수정\n수염차트", "언어·그룹 점검", "유지", "레이아웃·문서 점검"],
    ["SP-2100 / TL-2200", "통신·그래프 기반", "언어 전환 점검", "유지", "Raw 수집·다중 구간 통계\nXLSX 반영"],
    ["PT-2000", "WebHID 통합\n그래프", "공통 UI 점검", "유지", "공통 레이아웃 점검"],
  ],
  2,
);

addMatrixSlide(
  "월별 계측기 작업 지도  2/2",
  "나머지 계측기와 소프트웨어 도구의 월별 주요 변경",
  [
    ["계측기·도구", "6월", "7월", "8월", "9월"],
    ["LT-1000", "통신·사용 가이드\n캘리브레이션", "공통 UI 점검", "유지", "공통 레이아웃 점검"],
    ["PST-3202", "준비", "3채널·사이클·트래킹\nExcel·평가 목록", "유지", "레이아웃·릴리즈 점검"],
    ["Keithley 2400", "-", "-", "신규 통합\nRS-232·GPIB·2/4-Wire", "4-Wire 실측\n그래프·mA 표시"],
    ["Epson OK900P", "-", "-", "준비", "편집·검색·인쇄\n시리얼 범위 출력"],
    ["Photo Editor", "USB 현미경\nExcel·ZIP", "다국어·저장 보완", "유지", "공통 레이아웃 점검"],
    ["Etching Design", "-", "-", "-", "혼합 배치·브릿지\n제조용 DWG/DXF"],
  ],
  3,
);

addMonthSlide(
  "2026년 6월",
  "통합 웹 프로그램과 주요 계측기 통신 기반 구축",
  [
    ["계측기·영역", "주요 작업", "상태"],
    ["공통 웹 앱", "통합 런처, Web Serial 연결, 반응형 화면, 결과 표와 그래프 기반", "완료"],
    ["DAQ-6510", "SCPI -113 수정, 수동 릴레이 채널 스캔, 4-Wire 페어링, 채널별 그래프", "실기 확인"],
    ["Agilent 4339B", "BUS Trigger 기반 시퀀스 재작성, -213 해결, 충전 카운트다운과 수염차트", "실기 확인"],
    ["VL-50", "9600 bps 7-E-2 통신, GA01 폴링, 소수점 5자리와 그룹 그래프", "완료"],
    ["PT/LT/SP 계열", "측정 데이터 수신, 결과표, 그룹 통계 그래프와 사용 안내", "기능 구축"],
    ["Photo Editor", "USB 현미경 연결 안정화, 촬영 파일 자동 이름, Excel·ZIP 내보내기", "완료"],
    ["EXE", "런처 카드 미표시 원인인 모듈·MIME·저장 주입 문제 수정", "재빌드"],
  ],
  "6월의 핵심은 여러 개의 독립 프로그램을 하나의 웹 앱과 EXE 배포 구조로 묶은 것입니다.",
  4,
);

addMonthSlide(
  "2026년 7월",
  "PST-3202 평가 기능과 공통 사용성 집중 개선",
  [
    ["계측기·영역", "주요 작업", "상태"],
    ["PST-3202", "3채널 동기화, 입력 검증, Auto Clamp, 독립·직렬·병렬 트래킹", "기능 완료"],
    ["PST-3202 사이클", "트래킹 모드 CH1↔CH2 단계값과 OVP 상태 동기화", "수정 완료"],
    ["PST-3202 데이터", "평가 목록 가져오기·내보내기, 제품명 필터, 재측정 확인, 소요 시간 표시", "완료"],
    ["PST-3202 Excel", "그래프 빈 화면 수정, Graph·Raw Data 우측 순차 배치, 범례 개선", "완료"],
    ["공통 언어", "그리드와 커스텀 계측기의 한국어·영어 전환 전수 점검", "잔여 한글 0건"],
    ["문서", "계측기별 MD 매뉴얼과 PST-3202 PDF 사용자 설명서 작성", "완료"],
    ["Photo Editor", "EXE 저장 폴백과 Excel/JPEG ZIP 내보내기 안정화", "완료"],
  ],
  "7월 작업의 중심은 PST-3202였으며 데이터 저장과 Excel 결과물까지 사용 흐름을 완성했습니다.",
  5,
);

addMonthSlide(
  "2026년 8월",
  "Keithley 2400 신규 통합과 단일 EXE 운영 규칙 확립",
  [
    ["계측기·영역", "주요 작업", "상태"],
    ["Keithley 2400 연결", "RS-232 Web Serial과 GPIB/VISA 연결, COM 포트 표시 보완", "실기 검증"],
    ["Keithley 2400 측정", "전압·전류 인가, 2/4-Wire, 단일·시간·Sweep·반복 사이클", "구현 완료"],
    ["Keithley 2400 안전", "OUTPUT OFF, Compliance 감시, 22W 제한, 전압 200V 앱 제한, 자동 OVP", "구현 완료"],
    ["Keithley 2400 결과", "평가 누적, 복수 선택 그래프, Raw Data와 대시보드 XLSX", "구현 완료"],
    ["배포 운영", "통합 EXE를 한 개만 유지하고 새 빌드가 성공한 뒤 기존 파일 교체", "규칙 확정"],
    ["잔여 검증", "낮은 저항 더미 부하의 전면 표시와 실제 Compliance 비교", "추가 확인 필요"],
  ],
  "8월부터 2400은 RS-232와 GPIB에서 같은 측정·그래프·XLSX 기능을 사용하도록 통합됐습니다.",
  6,
);

addMonthSlide(
  "2026년 9월",
  "실측 데이터 검증, 그래프 분석, 라벨 인쇄와 CAD 설계 확장",
  [
    ["계측기·영역", "주요 작업", "상태"],
    ["Keithley 2400", "9V·4-Wire·FAST 실측, 전류 mA 소수점 5자리, 단일/복수 그래프 범례", "실측 완료"],
    ["SP-2100 / TL-2200", "Raw 수집, 다중 드래그 구간, 평균·최소·최대, XLSX 대시보드", "기능 반영"],
    ["Epson OK900P", "프린터 검색, 테이프 폭 비례 조정, 자유 회전, 다중 선택, 범위 인쇄", "실기 검증"],
    ["Etching Design", "혼합 배치, 수동 여백, 브릿지·제거 영역, 제조/검토 DWG·DXF", "자동 검증"],
    ["공통 레이아웃", "카드 전환 시 1/2/3열 자동 판정, 빈 우측 여백 제거, 그래프 재렌더링", "회귀 테스트"],
    ["문서와 배포", "13개 카드 매뉴얼·릴리즈 문서 정리, rc.2 Build 2 통합 EXE", "빌드 완료"],
  ],
  "Etching Design의 CAD 자동 검증은 통과했지만 실제 제조 공정 검증은 별도로 진행해야 합니다.",
  7,
);

// 8. Current status
{
  const slide = deck.slides.add();
  addChrome(slide, "현재 상태와 다음 확인 항목", "2026년 9월 14일 기준", 8);
  const table = slide.tables.add({
    rows: 7,
    columns: 3,
    left: 52,
    top: 150,
    width: 1176,
    height: 435,
    columnTracks: [
      { mode: "fixed", value: 250 },
      { mode: "fixed", value: 650 },
      { mode: "fr", value: 1 },
    ],
    values: [
      ["구분", "현재 상태", "판정"],
      ["통합 프로그램", "계측기·도구 13개 등록", "완료"],
      ["최신 EXE", "v1.0.0-rc.2 · Build 2 · 파일 버전 1.0.0.2", "배포 가능"],
      ["SP-2100", "다중 구간 분석과 XLSX 반영", "소스·EXE 포함"],
      ["PST-3202", "3채널·트래킹·사이클 구현", "실기 추가 확인"],
      ["Keithley 2400", "9V 4-Wire 실측 완료", "더미 부하 추가 확인"],
      ["Etching Design", "기하·제조 파일 자동 테스트 통과", "현장 제조 검증 필요"],
    ],
  });
  styleTable(table, 1, true);
  addText(slide, "상세 기준 문서", 52, 607, 190, 34, { fontSize: 18, bold: true, color: NAVY });
  addText(slide, "AGENTS.md  ·  docs/RELEASE_STATUS_20260912.md  ·  계측기별 통신 및 사용자 매뉴얼", 235, 607, 990, 34, { fontSize: 16, color: MUTED });
  slide.speakerNotes.textFrame.setText("최신 EXE 정보는 docs/RELEASE_STATUS_20260912.md를 기준으로 합니다. 현장 검증과 자동 테스트는 구분해 표기했습니다.");
}

const candidatePath = path.join(buildDir, "monthly_history_candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 8,
  requiredNativeTableOwnerSlides: [2, 3, 4, 5, 6, 7, 8],
  requiredNativeChartOwnerSlides: [],
};
const fontPolicy = {
  basis: "design",
  families: [FONT, "Calibri"],
};

const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-heading-fit",
    ...requirements.requiredNativeTableOwnerSlides.flatMap(number => ["--require-native-table-slide", String(number)]),
  ],
  requiredNativeTableOwnerSlides: requirements.requiredNativeTableOwnerSlides,
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "monthly_history_v3.validation.json"),
});

console.log(JSON.stringify({ finalPath, candidatePath, result }, null, 2));
