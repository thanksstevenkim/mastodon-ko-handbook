# Docusaurus 시범 사이트 (Draft)

기존 `docs/` Markdown 안내서를 그대로 사용하고, 읽기용 웹사이트의 화면과 목차만 추가하는 **시범 구성**입니다.

- **아직 GitHub Pages를 공개 배포하지 않습니다.** 배포 워크플로도 포함하지 않습니다.
- 기존 `README.md`와 `docs/`의 설치·운영 내용은 변경하지 않습니다.
- Docusaurus **3.10.2**와 Node.js **22**를 사용합니다. `npm install`은 패키지 설치이고, `npm run build`는 정적 사이트 생성입니다.
- 기존 Markdown의 GitHub README 상대 링크 및 문서 간 링크 때문에 빌드 경고가 나올 수 있습니다. 시범 단계에서는 `onBrokenLinks: 'warn'`으로 기록만 하며, **공개 배포 전에는 경고를 해결하고 엄격한 링크 검사로 되돌려야 합니다.**
- 검색, 사용자 도메인, GitHub Pages 배포, 테마의 대규모 변경은 이 PR 범위 밖입니다.

## 로컬 미리보기 (선택)

```sh
npm install
npm run start
```

브라우저에서 개발 서버 주소를 열어 한글 페이지·문서 링크·모바일 화면을 확인합니다. 실제 정적 빌드는 `npm run build`를 사용합니다.

## 배포를 진행하려면

먼저 초보자 관점의 메뉴·링크 및 CI 빌드 결과를 검토하고, 그 다음 별도 PR에서 GitHub Pages 배포 자동화를 추가하세요. Mastodon 운영 서버에 배포할 필요는 없습니다.
