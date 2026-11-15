# Docusaurus 시범 사이트 및 GitHub Pages 배포 준비

기존 `docs/` Markdown 본문을 유지하고, 한국어 시작 화면·문서 목차·반응형 레이아웃을 추가하는 **읽기용 문서 사이트**입니다.

## 현재 범위

- Docusaurus **3.10.2**, Node.js **22**.
- `docs/handbook-index.md`에 웹용 목차를 만들고, 기존 문서 9곳의 `../../README.md` 링크를 그 목차로 연결했습니다. GitHub의 Markdown 링크도 유지합니다.
- 문서 사이트 첫 화면과 하단 메뉴의 경로를 Docusaurus가 생성하는 실제 경로에 맞췄습니다.
- `onBrokenLinks: 'throw'`로 내부 링크 오류를 빌드 실패로 판정합니다.
- PR 빌드 검사는 **배포하지 않으며**, `.github/workflows/docusaurus-pages.yml`은 **main 브랜치 push 후**에만 배포를 시도합니다.
- 검색, 독립 도메인, 기존 설치·운영 문서의 본문 개편, 머스타드 운영 서버 작업은 범위 밖입니다.

## 로컬 시범 실행 (선택)

```sh
npm install
npm run start
```

정적 빌드와 링크 검사는 `npm run build`로 실행합니다. GitHub Actions PR의 `Docusaurus draft build check`가 동일한 빌드를 수행합니다.

## GitHub Pages 공개 전 필요한 설정

1. 저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. PR 검사가 성공했는지 보고 나서 해당 PR을 `main`에 병합합니다.
3. `Deploy Docusaurus to GitHub Pages` 워크플로의 build와 deploy가 모두 성공했는지 확인합니다.
4. 실제 사이트 주소 `https://thanksstevenkim.github.io/mastodon-ko-handbook/`가 열리고 시작 페이지와 문서 연결이 정상인지 확인합니다.
5. 사이트가 실제로 공개된 것이 확인되면, 저장소 `README.md`에 주소를 추가합니다.

**페이지 주소는 사전 설정에 따른 예상 주소이지, 배포 전부터 정상 접속이 보장되는 URL이 아닙니다.** GitHub Pages Source 설정은 GitHub 저장소 관리자가 해야 합니다.

주의: GitHub Actions 빌드 성공과 GitHub Pages 배포 성공은 다릅니다. 직접 열어보기 전에는 공개를 완료했다고 기록하지 않습니다.
