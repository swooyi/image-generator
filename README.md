# Puzzle Image Generators

`index.html`을 더블클릭하면 FTO와 3×3 이미지 생성기를 선택할 수 있다. 별도 설치나 로컬 서버는 필요 없다.

- `image-gen-fto.html`: FTO 이미지 생성기
- `image-gen-3x3.html`: 3×3 이미지 생성기 (3D·LL, 회전기호, 시점 변환, 색상 편집, 프리셋, PNG·SVG 및 여러 ALG 저장)

개발 중 원본 JavaScript나 JSON을 변경한 경우 아래 명령으로 브라우저용 정적 파일을 다시 만든다.

```powershell
npm run build
```

검사는 `npm test`, 로컬 서버 실행은 `npm start`를 사용한다. 로컬 서버 주소는
<http://127.0.0.1:4187>이다.

FTO 생성기 페이지는 `src/app.bundle.js`를 읽는다. 이 파일에는 회전 엔진과 CIF·EIF 템플릿,
색상 데이터가 포함되어 있으므로 직접 수정하지 않는다. 원본은 `src/app.js`,
`src/fto-engine.js`, `src/assets/` 아래에 있다.

3×3 생성기 원본은 `src/cube-engine.js`, `src/cube-3x3.js`, `src/cube-3x3.css`다.
`src/cube-3x3.bundle.js`는 빌드 결과이므로 직접 수정하지 않는다.
Setup은 입력한 회전을 그대로 적용하고, Alg는 역공식으로 케이스를 만든다.
시점은 3D와 LL에서 별도로 설정하며, 색상 편집은 원래 스티커를 따라간다.
여러 ALG는 `[{"filename":"case-01","scramble":"R U R' U'"}]` 형식으로 입력한다.
저장 이미지는 투명 배경이며 PNG의 긴 변은 1600px다. 폴더 선택을 지원하지 않는
브라우저에서는 기본 다운로드를 사용하며, 여러 파일 다운로드 허용이 필요할 수 있다.
