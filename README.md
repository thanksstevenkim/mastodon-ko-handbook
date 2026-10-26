# 마스토돈 한국어 운영 핸드북

**Mastodon Korean Handbook** — Mastodon 서버를 직접 설치·관리하는 사람을 위한 **비공식 한국어 실무 안내서**입니다.

> 공식 Mastodon Docs 전체를 번역하거나 모든 배포 방식의 답을 모으려는 프로젝트가 아닙니다. **처음 운영할 때 필요한 순서, 운영 중 참고할 판단 기준, 실제로 겪은 문제의 기록**에 집중합니다.

## 처음 설치한다면 — 이 순서만 읽으세요

[00. 운영을 시작하기 전에](docs/getting-started/00-introduction.md) → [01. 서버 구성 요소](docs/getting-started/01-architecture.md) → [02. 서버 준비](docs/getting-started/02-prerequisites.md) → [03. 도메인·HTTPS·메일](docs/getting-started/03-domain-and-dns.md) → [04. Docker Compose](docs/getting-started/04-docker-compose.md) → [05. 최초 설치](docs/getting-started/05-initial-setup.md) → [05B. 필수 보안 설정](docs/getting-started/05b-secure-configuration.md) → [06. 설치 후 첫날 점검](docs/getting-started/06-first-day-checklist.md)

기본편은 **Ubuntu + Docker Compose 기반의 새로운 Mastodon 설치**를 주로 다룹니다. Mastodon v4.7.3 UTM 실험에서 주요 기능을 확인했지만, 모든 공개 운영 환경에서 실행 가능한 무인 설치 스크립트는 아닙니다. 선택한 버전의 [공식 설치 문서](https://docs.joinmastodon.org/admin/install/)와 릴리스 노트를 함께 확인하세요.

**처음 설치하기 위해 독립 VM 네 대를 준비하거나 실험 체크포인트를 모두 수행할 필요는 없습니다.**

## 설치 후 운영할 때

- [백업·복원 체크리스트](docs/operations/backup-readiness.md) — 무엇을 보관하고 어디까지 복구를 확인할지
- [Mastodon 업그레이드](docs/operations/upgrade-checklist.md) — 변경 전 백업, DB 마이그레이션, 롤백
- [런타임·보안 패치](docs/operations/security-patch-rollout.md) — 변경 범위를 좁힌 순차 배포
- [Sidekiq 대기열 문제](docs/operations/sidekiq-queues.md) / [정기 모니터링](docs/operations/sidekiq-monitoring.md) — 지표와 장애 구분
- [가입 남용·연합 보호](docs/security/registration-and-federation.md) — 운영 정책과 접속 제한
- [자주 혼동하는 장애](docs/troubleshooting/known-failures.md) — 증상별 확인 지점
- [Elasticsearch Nori 한국어 검색](docs/search/korean-nori.md) — 선택 기능의 실험 및 도입 고려사항

## 실제 실험과 검증 기록 (선택 사항)

실험에서 얻은 증거를 버리지 않되, **설치에 필요한 명령과 섞지 않도록** 별도로 정리했습니다.

- [Labs 목차](docs/labs/README.md) — 원문 기록 전체로 이동
- [UTM v4.7.3 설치 실측](docs/labs/utm-install-v4.7.3.md)
- [신규 SCRAM 설치·암호화 백업·독립 복원 실험](docs/labs/secure-install-and-restore-20261026.md)
- [독립 VM 재해 복구 실험](docs/labs/utm-disaster-recovery-v4.7.3.md)

실험 기록의 Checkpoint는 **우리가 한 검증**이지 독자가 모두 통과해야 하는 필수 목록이 아닙니다. 완료·미완료 판단은 실제로 확인한 범위에만 적용됩니다.

## 작성 기준과 범위

- 실무 절차에는 **대상 버전·적용 조건·실행 순서·최소 확인·주의사항**을 적습니다.
- 실험에서 얻은 세부 로그, 오류 원인, 반복 검사는 **Labs**에 둡니다.
- 일상적인 작업, 업데이트, 백업과 복구 판단은 **Operations**에 둡니다.
- 모든 장애나 보안 취약점을 독자 또는 작성자가 미리 재현·해결해야 한다고 전제하지 않습니다.
- 실제 운영 환경에서의 성공은 환경·버전·데이터 규모에 따라 달라집니다. 구체적으로 검증하지 않은 사항은 성공했다고 쓰지 않습니다.

## 공개 문서의 안전 원칙

비밀번호, API 토큰, 개인키, 데이터 복호화 키, 이용자 개인정보, 운영 방어 규칙의 민감한 값은 공개하지 않습니다. DB 초기화·볼륨 삭제·재구축은 적용 대상을 확인한 후 실시해야 합니다. 운영 기록과 일반화한 안내를 혼동하지 마세요.

이 저장소는 Mastodon의 공식 지원·번역본이 아닙니다. [Mastodon 공식 문서](https://docs.joinmastodon.org/), [공식 소스](https://github.com/mastodon/mastodon) 및 [mastodon-lab 실험·운영 자료](https://github.com/thanksstevenkim/mastodon-lab)를 함께 참고할 수 있습니다.

## 제안과 참여

오류 신고와 추가 사례는 [Issues](https://github.com/thanksstevenkim/mastodon-ko-handbook/issues) 또는 Pull Request로 받을 수 있습니다. 공개 이슈에도 비밀값이나 개인정보를 포함하지 마세요.

## 라이선스

별도 표기가 없는 한 이 저장소는 [MIT License](LICENSE)를 따릅니다. 인용·참조한 외부 문서와 코드는 각각의 라이선스를 따릅니다.
