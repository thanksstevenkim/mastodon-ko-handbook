# 01. Mastodon 서버의 구성 요소

> **검증 상태:** 공식 기술 개요·Mastodon 4.7.3 Compose 예제에 근거한 구조 설명 · **작성 기준:** 2026-10-25. 아래는 개념도이며 배포 환경의 실제 네트워크와 일치하지 않을 수 있습니다.

[← 00. 시작하기 전에](00-introduction.md) · [다음: 서버 준비 →](02-prerequisites.md)

## 전체 구조

Mastodon은 하나의 실행 파일만으로 모든 기능을 처리하지 않습니다. 웹 요청, 백그라운드 작업, 실시간 업데이트, 데이터 저장, 메일 발송과 선택적 검색이 나뉩니다.

```text
  이용자 브라우저 / 다른 연합 서버
                 |
           HTTPS (443)
                 |
       리버스 프록시 (Nginx 등)
           /             \
      Web (Rails)      Streaming
           |             |
           +---- Redis --+
           |       |
           |     Sidekiq ----> 외부 연합 서버 / 메일
           |       |
           +-- PostgreSQL
           |
     미디어 저장소 (로컬 볼륨 또는 객체 스토리지)
           |
     [선택] Elasticsearch / OpenSearch
```

*화살표는 대표적인 연결을 간단히 보여주는 것이며, 서비스 간 실제 통신 경로나 모든 의존성을 표현한 것은 아닙니다.*

## 각 요소는 무엇을 하나?

| 구성 요소 | 담당하는 일 | 문제가 생겼을 때의 예 |
| --- | --- | --- |
| **Web (Rails/Puma)** | 웹·API 요청, 계정·게시물 처리 | 화면·API 오류, HTTP 500 |
| **Sidekiq** | 연합 전달, 비동기 처리, 미디어 관련 작업 | 전달 지연, 대기열 증가 |
| **Streaming (Node.js)** | 실시간 알림·타임라인 이벤트 | 수동 새로고침은 되는데 새 이벤트가 늦음 |
| **PostgreSQL** | 계정·게시물 등 핵심 관계형 데이터 | 로그인·게시물 조회·저장 실패 |
| **Redis** | 백그라운드 작업 대기열, 캐시와 실시간 처리 보조 | Sidekiq 처리 지연, 일부 실시간 기능 이상 |
| **Nginx 등** | HTTPS 요청 수신, 라우팅, 프록시 | 컨테이너 정상인데 접속 불가 |
| **미디어 저장소** | 이미지·첨부파일 보관 | 미디어 업로드·표시 실패 |
| **Elasticsearch/OpenSearch** | 선택적 전체 텍스트 검색 | 검색 결과 누락 또는 검색 불가 |

SMTP 메일 서비스는 가입 확인·계정 복구 등의 메일을 외부로 보내는 데 필요합니다. Cloudflare 같은 CDN/WAF는 **선택적**이며, 서버 간 ActivityPub 요청도 정상 통과하는지 확인해야 합니다.

## Docker Compose에서는 어떻게 나뉘나?

Mastodon 4.7.3의 공식 예제에서는 `web`, `sidekiq`, `streaming`, `db`, `redis`를 별도 서비스로 정의하고, `es`(Elasticsearch)는 주석 처리된 선택 항목입니다.

중요한 차이:

- **컨테이너 ≠ 데이터:** PostgreSQL과 미디어는 컨테이너를 삭제해도 남아야 하므로 적절한 영속 볼륨이 필요합니다.
- **컨테이너가 healthy ≠ 앱 전체 정상:** 헬스체크와 실제 HTTPS·로그인·연합 통신을 함께 검증합니다.
- **검색 인덱스 ≠ 핵심 DB:** 인덱스 복구/재색인과 PostgreSQL 복구는 서로 다른 작업입니다.
- **로그 위치가 다름:** Web, Sidekiq, Streaming, Nginx 각각의 오류를 분리해서 확인해야 합니다.

## ActivityPub 연합은 어디서 처리될까?

다른 서버는 계정과 게시물을 조회하고 Inbox로 활동을 전송합니다. Web이 HTTP 요청을 받아 처리하고, 외부로 전달할 작업은 Sidekiq 같은 비동기 처리 경로를 거칩니다. 따라서 **웹 화면은 정상인데 연합 송신이 늦어지는 현상**도 가능합니다.

자세한 사례는 [Sidekiq 대기열 진단](../operations/sidekiq-queues.md)과 [가입 남용·연합 트래픽](../security/registration-and-federation.md)을 참고하세요.

## 읽기 전용 상태 확인

이미 Docker Compose로 설치한 서버라면 다음은 구성을 변경하지 않는 기본 조회 명령입니다.

```bash
docker compose ps
docker compose images
docker compose logs --since=10m web sidekiq streaming
```

실제 서비스 이름이 다르면 조정하세요. 로그를 공유하기 전 이용자 식별 정보와 비밀값을 검토하세요.

### 참고 자료

- [Mastodon 기술 개요](https://docs.joinmastodon.org/dev/overview/)
- [Mastodon 공식 Docker Compose 예제](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [운영 중 Nginx 장애 사례](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/001-cloudflare-521-after-upgrade.md)
