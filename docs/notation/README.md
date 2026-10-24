# 표기법 구현 기준

이 폴더는 퍼즐별 변환 엔진을 구현할 때 참고할 표기법 기준을 둔다. `.codex/skills/`의 원본 기준을 앱 구현 관점으로 요약한 문서이며, 실제 변환 코드는 `src/transforms/` 아래에 둔다.

## 공통 원칙

- 입력은 문자열 그대로 변환하지 않고 먼저 토큰으로 파싱한다.
- 변환은 `파싱 -> 변환 -> 포맷팅` 순서로 처리한다.
- 문법 검증과 퍼즐 상태의 합법성 검사는 분리한다.
- 정규 출력은 프로젝트 표기법을 따른다.
- 퍼즐별 변환기는 DOM에 의존하지 않는 순수 함수로 구현한다.

## 문서와 코드 대응

```text
docs/notation/3x3.md       -> src/transforms/3x3.js
docs/notation/square-1.md  -> src/transforms/square1.js
docs/notation/fto.md       -> src/transforms/fto.js
```

공통 진입점은 `src/transforms/index.js`에서 제공한다.

```js
transformAlgorithm(puzzle, algorithm)
```

반환값은 UI 출력 키와 맞춘다.

```js
{
  inverse: "",
  mirrorLeftRight: "",
  mirrorFrontBack: "",
  mirrorUpDown: ""
}
```

퍼즐에서 지원하지 않는 변환은 반환하지 않거나 빈 문자열로 둔다.
