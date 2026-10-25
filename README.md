# 마스토돈 한국어 운영 핸드북

**Mastodon Korean Handbook** — 마스토돈(Mastodon) 서버를 직접 구축하고 운영하는 사람을 위한 비공식 한국어 실무 문서입니다.

> **작성 진행 중** · Ubuntu / Docker Compose 기반 실제 운영 사례를 중심으로 정리합니다. 사용 중인 버전과 구성에 따라 절차가 다르므로, 공식 릴리스 노트와 자신의 환경을 확인하세요.

## 문서 찾아보기

### 업그레이드와 운영

- [Mastodon 업그레이드: 안전한 진행 순서](docs/operations/upgrade-checklist.md) — 버전 확인, CI, 마이그레이션, 배포 후 검증
- [런타임·의존성 보안 패치](docs/operations/security-patch-rollout.md) — 변경 범위와 Web/Sidekiq 단계별 배포
- [백업 준비와 복구 검증 체크리스트](docs/operations/backup-readiness.md) — **복구 절차는 아직 미작성**
- [Sidekiq 대기열이 쌓일 때](docs/operations/sidekiq-queues.md) — 연합 전송 작업과 장애 구분

### 장애 대응과 보안

- [서버 운영에서 자주 혼동하는 장애 원인](docs/troubleshooting/known-failures.md) — Cloudflare 521, Elasticsearch 연결, DB 마이그레이션, 빌드·CI
- [가입 남용 대응과 연합 트래픽 보호](docs/security/registration-and-federation.md) — 가입 승인제·CAPTCHA·Cloudflare·ActivityPub

### 검색과 한국어

- [Elasticsearch Nori로 한국어 검색 개선하기](docs/search/korean-nori.md) — **실험 및 CI 검증 완료, 운영 미적용**

## 작성 예정인 분야

Mastodon 초기 설치, 서버 요구사항과 DNS, 검증된 전체 백업·복구 실습, 검색 인덱스의 안전한 전환·롤백, ActivityPub 동작 원리를 비롯한 주제는 계속 작성할 예정입니다. **아직 문서가 없는 기능을 지원 완료로 표시하지 않습니다.**

## 이 프로젝트의 목적과 범위

마스토돈 운영에는 설치 외에도 업데이트, 백업, 보안, 검색, 연합, 장애 대응이 필요합니다. 이 저장소는 개인 서버 운영 경험을 다른 운영자가 재현하고 검토할 수 있는 **일반화된 한국어 안내서**로 옮기기 위한 프로젝트입니다.

초기 자료는 [mastodon-lab](https://github.com/thanksstevenkim/mastodon-lab)에 공개된 실제 운영·사고 기록과 기술 검증을 바탕으로 합니다. 다만 한 서버에서의 성공이 모든 환경에서 동일하게 재현된다는 의미는 아닙니다.

## 검증 상태의 구분

- **실험 중:** 아이디어, 격리된 실험 또는 제한된 재현 단계로 운영 적용 미권장
- **테스트 검증:** 별도 실험 환경·CI에서 확인했으나 실제 운영 도입과는 구별
- **운영 확인:** 특정 운영 환경에서 적용과 확인을 마침. 다른 환경에서의 성공은 보장하지 않음
- **초안/부분 확인:** 절차 또는 복구 검증에 필요한 근거가 아직 부족함

각 문서는 상태를 앞부분에 표시하고, 가능한 한 **적용 환경 → 준비 → 실행/진단 → 확인 → 복구 → 근거** 순서로 정리합니다.

## 공개 문서의 안전 원칙

- 비밀번호, API 토큰, 환경변수 비밀값, 암호화·복호화 키, SSH 개인 키, 개인 데이터 및 운영 중인 방어 규칙의 세부값은 공개하지 않습니다.
- 삭제·마이그레이션·인덱스 재구축 등 위험한 작업에는 선행 백업과 롤백 조건을 명시합니다.
- 장애의 **확인된 원인**과 **가능성 있는 추정**을 혼동하지 않습니다.
- 실행하기 전에 명령의 대상 호스트·경로·서비스명과 적용 버전을 반드시 확인합니다.
- 이 프로젝트는 Mastodon 공식 문서나 공식 지원 채널이 아닙니다. 변경 전에는 [공식 문서](https://docs.joinmastodon.org/)와 사용 버전의 릴리스 노트를 참고하세요.

## 관련 프로젝트

- [Mastodon 공식 문서](https://docs.joinmastodon.org/)
- [Mastodon 업스트림 소스코드](https://github.com/mastodon/mastodon)
- [mastodon-lab](https://github.com/thanksstevenkim/mastodon-lab) — 실제 실험·사고 및 운영 기록
- [mastodon-v2](https://github.com/thanksstevenkim/mastodon-v2) — 머스타드 개발용 Mastodon 포크

## 참여와 제안

설명 오류, 운영 사례, 버전 차이와 새 문서 제안은 [Issues](https://github.com/thanksstevenkim/mastodon-ko-handbook/issues) 또는 Pull Request로 제안할 수 있습니다. 공개 이슈에도 비밀정보와 이용자 개인정보를 포함하지 마세요.

## 라이선스

별도 표기가 없는 한 저장소의 내용은 [MIT License](LICENSE)를 따릅니다. 외부 프로젝트의 원문과 코드는 각 원저작물의 라이선스를 별도로 따릅니다.
