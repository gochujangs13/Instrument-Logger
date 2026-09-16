import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
import { finalizePresentation } from 'file:///C:/Users/0op64/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root=process.cwd(), tmp=path.join(root,'.quarterly-build');
const skill='C:/Users/0op64/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const p=Presentation.create({slideSize:{width:1280,height:720}});
function text(s,t,x,y,w,h,size=21,bold=false,color='#222222') {const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=t;a.text.style={typeface:'Malgun Gothic',fontSize:size,bold,color,autoFit:'none'};return a;}
function box(s,x,y,w,h){s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'#A5A5A5',width:1}});}
function base(title,n){let s=p.slides.add();s.background.fill='#FFFFFF';text(s,title,30,22,1220,62,38,true);text(s,'2026년 3분기 진행사항 (7월~9월 14일 기준)',32,85,1100,30,16,false,'#666666');text(s,'3M Confidential',32,678,500,22,12,false,'#777777');text(s,String(n),1210,678,35,22,12);s.speakerNotes.textFrame.setText('사용자 제공 2Q26 보고서 이미지 및 대화에 기록된 2026년 3분기 작업 내용을 바탕으로 작성. 분기 종료 전인 9월 14일 기준. 장비 실측 정확도와 사용자 도면 CAD 호환성의 최종 확인은 후속 과제.');return s;}
let s=base('JP Kim : 분기별 성과 대화 3Q26',1);
box(s,30,130,612,530);box(s,658,130,592,250);box(s,658,394,592,266);
text(s,'기여 및 성과',48,145,570,38,28,true);
text(s,'2분기에 구축한 통합 프로그램을 바탕으로, 실제 평가 업무에 필요한 측정·분석 기능과 신규 도구를 확대했습니다.',48,195,568,75,22);
text(s,'Keithley 2400\n전압·전류·저항 그래프와 다중 샘플 비교,\n원시 데이터 연동 Excel 보고서 및 안전 설정 개선',48,279,568,95,21);
text(s,'SP-2100 / TL-2200\n원시 데이터 수집과 파형 분석 개선,\n복수 구간 선택 및 구간별 평균 비교 기능 추가',48,384,568,95,21);
text(s,'Epson OK900P / 에칭 설계\n라벨 편집·연속 번호 인쇄 기능 완성\n시편 자동 배치·대칭 홀 가공·CAD 내보내기 개발',48,489,568,105,21);
text(s,'공통 화면 및 배포 안정성 개선도 병행했습니다.',48,616,568,28,19,false,'#555555');
text(s,'업무 방식',676,145,550,38,28,true);
text(s,'평가자 관점에서 설정을 쉽게 이해하고, 결과를 편리하게 비교할 수 있도록 개선했습니다.\n\n사용자 피드백과 실제 오류 사례를 수정에 반영하고, 작업 이력과 배포 기록을 문서화했습니다.',676,198,550,164,22);
text(s,'개발 방향 및 역량 강화',676,409,550,38,28,true);
text(s,'측정 데이터 분석, 시스템 구조 설계와 사용자 중심 화면 설계 역량을 강화하고자 합니다.\n\n다음 단계에서는 2400 실측·그래프 일치 여부와 CAD 호환성을 검증하고, 업데이트 편의성을 개선해 PIM/Hx 평가 업무의 통합 범위를 넓힐 계획입니다.',676,461,550,184,21);
s=base('계측기·도구별 주요 업데이트',2);
const rows=[
['Keithley 2400','RS-232/GPIB 연결 및 2-Wire/4-Wire 설정 개선\n시간·사이클 평가, 다중 샘플 그래프, 원시 데이터 연동 Excel 대시보드\n설정 범위 검사와 보호 안내 추가'],
['SP-2100 / TL-2200','원시 데이터 수집과 파형 표시 개선\n마우스로 복수 구간을 선택하여 구간별 평균 비교\n측정 기록 및 Excel 보고 기능 개선'],
['LT-1000 / PT-2000','반복 측정 기록과 그룹별 결과 비교 흐름 개선\n평가 데이터 확인 및 사용 편의성 보완'],
['Photo Editor','사진 크기·정렬 및 Excel 저장 일관성 개선\n카메라 촬영과 여러 이미지 정리 기능 보완'],
['Epson OK900P','테이프 폭에 따른 디자인 자동 조정, 바코드·QR 코드 지원\n시리얼 시작·종료 범위 인쇄와 여러 요소 일괄 편집'],
['에칭 설계','원판·시편 크기와 간격에 따른 자동 배치\n중앙 및 대칭 2·4포인트 가공, 홀 중심 간 거리 설정\nODA 기반 AutoCAD 2007 DWG 변환 구현']];
let y=136;for(const [name,body] of rows){text(s,name,35,y,280,64,22,true);text(s,body,328,y,900,78,20);y+=86;}
text(s,'후속 확인: 2400 실측 정확도 및 사용자 도면의 TrueView/Inventor 호환성',35,654,1200,24,16,false,'#666666');
const candidate=path.join(tmp,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){let b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(tmp,`slide-${i+1}.png`),new Uint8Array(await b.arrayBuffer()));}
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:path.join(root,'reports/JP_Kim_3Q26_분기성과_한글.pptx'),pythonExecutable:'C:/Users/0op64/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000'],fontPolicy:{basis:'design',families:['Malgun Gothic']},explicitTotalSlideCount:2,verifyArtifactToolImport:true,receiptPath:path.join(tmp,'validation.json')});
