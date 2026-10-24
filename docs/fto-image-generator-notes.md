# FTO Image Generator 보완 메모

## 2026-07-07 수정/보완 기준

### 1. EIF 뷰 기준

- EIF는 정면에 `U` 면이 보이는 뷰다.
- `U` 면은 흰색이며, 정면을 바라보는 역삼각형 형태로 표시되어야 한다.
- 현재 단순히 평면 전개도 순서만 바꾼 EIF 표시는 정확한 EIF 뷰가 아니다.
- `fto-all-template.pdf` 오른쪽 3D 뷰와 첨부 참고 이미지의 오른쪽 뷰를 기준으로 별도 EIF 렌더링 데이터를 만들어야 한다.

### 2. 확정 색상

앱에서 사용할 색상은 아래 값으로 고정한다.

```text
U  white       #ffffff
R  red         #e72119
BL orange      #ef7e1d
D  yellow      #fff100
F  green       #6db92c
B  blue        #3463ae
L  purple      #643d94
BR gray        #898888
blank dark     #2c2d2d
line dark      #211f20 또는 템플릿 윤곽선 기준값
```

기존 PDF에서 추출한 근사 색상은 참고용으로만 사용하고, 실제 앱 팔레트는 위 색상값을 우선한다.

### 3. 후면 시점과 반전 처리

- `BL`, `BR`, `D`, `B` 면은 정면 기준으로 직접 보이는 면이 아니다.
- 평면 전개도에서 보이는 해당 면들은 뒤쪽에서 통과해서 보는 시점으로 이해해야 한다.
- 따라서 이 면들은 실제 퍼즐 표면 기준과 전개도 표시 기준이 반전되어 있다.
- 회전 매핑을 만들 때 `BL`, `BR`, `D`, `B`의 sticker index 순서를 정면 면과 동일하게 처리하면 안 된다.
- 후면 면의 sticker index는 렌더링용 index와 물리 회전용 index를 분리하거나, face별 orientation transform을 둬야 한다.

권장 데이터 구조:

```json
{
  "id": "B0",
  "face": "B",
  "renderIndex": 0,
  "physicalIndex": 2,
  "path": "M ... Z"
}
```

또는 face 단위로 반전 정보를 둔다.

```json
{
  "faceOrientation": {
    "U": "front",
    "R": "front",
    "F": "front",
    "L": "front",
    "B": "back-mirrored",
    "BR": "back-mirrored",
    "D": "back-mirrored",
    "BL": "back-mirrored"
  }
}
```

### 4. 회전 매핑 보완 방향

- 현재 `src/app.js`의 `buildDraftCycles()`는 초안이며, 실제 FTO 회전 매핑으로 확정하면 안 된다.
- 정확한 매핑을 위해 먼저 72개 스티커에 대해 다음 두 좌표계를 확정해야 한다.
  - 렌더링 좌표계: 화면에 보이는 path 순서
  - 물리 좌표계: 실제 퍼즐 표면에서 회전이 적용되는 순서
- 후면 면(`BL`, `BR`, `D`, `B`)은 두 좌표계 사이에 반전 변환이 필요하다.
- `R L U D F B BR BL` 기본 회전은 이 물리 좌표계를 기준으로 permutation을 정의한다.

### 5. 다음 구현 작업

1. `src/assets/fto-colors.json`을 확정 색상값으로 업데이트한다.
2. `fto-all-template.pdf` 또는 별도 Illustrator/SVG 템플릿에서 EIF 전용 path 데이터를 추출한다.
3. `src/assets/fto-template.json`에 `renderIndex`, `physicalIndex`, `orientation` 필드를 추가한다.
4. `BL`, `BR`, `D`, `B` 후면 반전 규칙을 문서화한 뒤 move permutation을 다시 작성한다.
5. `R U F`와 `F' U' R'` 같은 역공식 표시가 새 permutation에서도 맞는지 검증한다.
