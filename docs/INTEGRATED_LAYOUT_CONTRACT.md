# 통합 프로그램 레이아웃 계약

이 문서는 새 계측기 카드 추가나 기존 화면 수정으로 빈 우측 여백, 잘린 중앙 화면,
사라진 그래프가 다시 발생하지 않도록 공통 규칙을 정의한다.

## 공통 엔진 동작

`core.js`는 카드 진입과 테마·언어 재구성 후 `#rightpanel`의 실제 상태를 확인해
`#layout[data-layout-mode]`를 자동 지정한다.

- `three`: 사이드바 + 중앙 화면 + 우측 그래프/속성 패널
- `two`: 사이드바 + 중앙 화면. 우측 패널이 없거나 비어 있으면 자동 적용
- `one`: 중앙 화면만 표시하는 편집 단계

카드 전환 전에는 이전 모듈이 남긴 인라인 `grid-template-columns`, `display`, `hidden`,
전용 레이아웃 클래스를 공통 엔진이 초기화한다. `MutationObserver`는 우측 패널의 동적
추가·제거를 감지하고, `ResizeObserver`는 최종 폭이 정해진 뒤 그래프를 다시 그린다.

## 새 카드 작성 규칙

1. 일반 그리드 계측기는 별도 레이아웃 설정 없이 `viewType: 'grid'`를 사용한다.
2. 커스텀 카드에서 우측 패널이 필요 없으면 `buildRightPanel`을 생략하거나 내용을 비운다.
3. 명시적으로 고정하려면 모듈에 `layoutMode: 'one' | 'two' | 'three'`를 선언한다.
   화면 단계에 따라 바뀌면 `layoutMode()` 함수를 사용할 수 있다.
4. 우측 패널을 동적으로 바꾼 뒤 즉시 동기화가 필요하면 `app.refreshLayout()`을 호출한다.
5. 그래프 캔버스는 `.graph-area` 안에 배치하고 부모에 실제 높이 또는 `flex:1; min-height:0`을 준다.
6. 모듈에서 `#layout.style.gridTemplateColumns`를 직접 설정하지 않는다.
7. 넓은 표는 중앙 열을 밀어내지 않도록 `.table-wrap` 내부에서만 가로 스크롤한다.

통합 EXE 빌드는 `index.js`의 실제 `INSTRUMENTS` 등록 순서를 읽어 포함 모듈을 자동 결정한다.
새 카드를 `index.js`에 등록하고 `build/build_standalone.py`의 `INSTRUMENT_MAP`에 매핑하면 된다.
둘 중 하나가 빠지면 빌드가 조용히 누락하지 않고 오류로 중단된다.

## 필수 검증

소스 수정 후 다음을 실행한다.

```powershell
node scripts/test_layout_contract.mjs
python .agents/skills/maintain-3m-instrument-logger/scripts/verify_project.py
```

브라우저에서는 모든 카드를 한 번씩 열고 다음을 확인한다.

- 우측 콘텐츠가 없는 카드는 `data-layout-mode="two"`이고 우측 폭이 0인지
- 우측 그래프/속성이 있는 카드는 `data-layout-mode="three"`인지
- `layout.scrollWidth - layout.clientWidth`가 0인지
- 보이는 그래프 캔버스의 폭과 높이가 모두 0보다 큰지
- 테마와 언어를 바꾼 뒤에도 위 값이 유지되는지
