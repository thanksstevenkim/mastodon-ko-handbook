# 06. 설치 후 첫날 운영 점검

> **검증 상태:** 운영 사례 기반 점검표 · **작성 기준:** 2026-10-25. 아래 명령 대부분은 읽기 전용이지만, **게시물 발행·가입·메일 송신은 실제 데이터를 생성**하므로 테스트용 계정과 허가된 연합 상대를 이용하세요.

[← 05. 최초 설치와 설정](05-initial-setup.md) · [핸드북 목차](../../README.md)

## 첫날에는 무엇을 확인하나?

Docker 컨테이너가 모두 실행 중이고 `healthy`라고 표시되어도, 이용자에게 보이는 기능이 모두 작동한다는 보장은 없습니다. 운영 시작 전에는 **인터넷 접속 → 계정·게시물 → 백그라운드 처리 → 연합 → 백업** 순서로 살펴봅니다.

## 실측 사례: Mastodon 4.7.3 서비스 재시작 후 데이터 영속성 (2026-10-25)

**검증 상태: 통과 — 공식 Docker Compose의 DB·Redis·Web·Sidekiq·Streaming 5개 서비스를 `stop` 후 `up -d`하여 모두 다시 `healthy`에 도달했고, 게시물·미디어 DB 레코드 및 호스트 미디어 파일의 개수/체크섬이 재시작 전후 일치.**

UTM Ubuntu 24.04.5 ARM64 로컬 설치(`mastodon.test`, PostgreSQL 14, Redis 7, Caddy)에서 재시작 전 다음을 기록했습니다.

| 검사 항목 | 재시작 전 | 재시작 후 | 상태 |
| --- | ---: | ---: | --- |
| `labadmin` 소유 `statuses` | 2 | 2 | 일치 |
| `labadmin` 소유 `media_attachments` | 1 | 1 | 일치 |
| `processing = 2` (complete) 첨부 | 1 | 1 | 일치 |
| `public/system` 일반 파일 | 2 | 2 | 일치 |
| 미디어 파일 집합 SHA-256 | `904413ebbe429c124a22454d5802ef3ad67e62d2015c0b13c3afe9ce2a9b293f` | 동일 | 일치 |

실행한 서비스 재시작 명령:

```bash
cd ~/mastodon-handbook-lab
sudo docker compose stop
sudo docker compose up -d
sudo docker compose ps
```

다섯 컨테이너는 즉시 `health: starting`으로 나타났고, **재기동 약 32초 후** `db`, `redis`, `web`, `sidekiq`, `streaming` 모두 `healthy`로 전환됐습니다.

DB 검사는 전후 같은 SQL로 수행했습니다.

```sql
SELECT
  (SELECT COUNT(*) FROM statuses WHERE account_id = a.id) AS statuses,
  (SELECT COUNT(*) FROM media_attachments WHERE account_id = a.id) AS media,
  (SELECT COUNT(*) FROM media_attachments
   WHERE account_id = a.id AND processing = 2) AS completed_media
FROM accounts a
WHERE a.username = 'labadmin' AND a.domain IS NULL;
```

파일 검사:

```bash
sudo find public/system -type f | wc -l
sudo find public/system -type f -exec sha256sum {} + | LC_ALL=C sort | sha256sum
```

마지막 명령은 개별 파일의 해시와 **파일 경로 문자열**을 모아 다시 해싱하는 방식이므로 동일 경로에서의 전후 비교에 유효합니다. 절대적인 백업 무결성이나 파일시스템 전체 검증을 의미하지는 않습니다.

**브라우저 재검증까지 통과:** 실험 담당자가 macOS Safari에서 `labadmin` 로그인 세션이 유지됐고, 기존 게시물 **2개**와 JPEG 첨부 이미지가 정상 표시되며, 새로고침 후에도 이미지가 표시된다고 확인했습니다. 따라서 **컨테이너 정상 재시작 이후 DB·미디어 영속성과 사용자 화면 재표시**까지 검증했습니다.

**검증 경계:** 이 실험은 컨테이너의 정상 `stop` 및 재기동만 시험했습니다. 운영체제/VM 재부팅, 컨테이너 재생성, 디스크/볼륨 장애, 백업에서의 독립 복원은 **아직 미검증**입니다. `docker compose down -v` 및 저장 디렉터리 제거 명령은 실행하지 않았습니다.

## 실측 사례: Ubuntu VM 재부팅 후 Mastodon 자동 복구 (2026-10-25)

**검증 상태: 통과 — UTM Ubuntu 24.04.5 ARM64 VM을 재부팅한 후 Docker·Caddy 서비스가 `active`, Mastodon 공식 Compose의 다섯 서비스가 모두 `healthy`에 도달. Web·Streaming Health가 `OK`이고, macOS Safari에서 정상 접속 및 기존 게시물 표시를 확인.**

이전 단계에서 Docker Compose 컨테이너의 정상 종료/재시작 및 DB·미디어 파일 영속성을 검증한 다음, 실험 VM의 **운영체제 재부팅** 시험을 수행했습니다. VM으로 SSH 재접속 후 다음 검사를 실행했습니다.

```bash
cd ~/mastodon-handbook-lab

systemctl is-active docker caddy
sudo docker compose ps
curl -fsS --max-time 10 http://127.0.0.1:3000/health
curl -fsS --max-time 10 http://127.0.0.1:4000/api/v1/streaming/health
```

실측 결과는 Docker와 Caddy 모두 `active`, Web·Streaming Health 모두 `OK`였습니다. 재부팅 후 약 19초에는 `db`, `redis`, `web`, `sidekiq`, `streaming`이 모두 `health: starting`이었지만, 약 45초 시점에는 **5개 모두 `healthy`**였습니다. 실험 담당자가 Mac Safari에서 Mastodon에 **정상 접속하고 기존 게시물이 그대로 표시됨**을 확인했습니다.

**참고:** `docker compose ps`를 일반 사용자로 실행할 경우 `/var/run/docker.sock` 접근 권한 오류가 나타났지만, `sudo docker compose ps`로 정상 조회됐습니다. 이는 Docker 엔진이나 컨테이너의 장애가 아닙니다. Docker 그룹에 사용자를 추가하면 사실상 높은 시스템 권한이 부여되므로, 단지 오류를 없애기 위해 추가할 필요는 없습니다.

**검증 경계:** VM 재부팅 후 기본 자동 복구와 브라우저 접근은 확인했지만, 이번 재부팅 시점에 파일 체크섬을 다시 비교하거나 이미지 새로고침 표시를 별도로 재검사한 기록은 없습니다. 컨테이너 **재생성**, 디스크 고장, PostgreSQL 백업 파일에서의 **독립 복구**도 아직 검증하지 않았습니다. 실제 SMTP 메일·외부 연합 송수신은 `mastodon.test` 로컬 실험 범위에 포함되지 않습니다.

## 1. 구성과 서비스 확인

Compose 프로젝트 디렉터리에서 다음을 확인합니다.

```bash
docker compose config --quiet
docker compose ps
docker compose images
docker compose logs --since=10m web sidekiq streaming
```

기대 결과: 의도한 이미지 태그가 실행 중이고 반복 재시작이나 지속적인 앱 오류가 없습니다. `docker compose ps`에 적힌 서비스명은 배포에 따라 다를 수 있습니다.

**주의:** 로그에 이메일·계정명·요청 URL이 포함될 수 있어 외부에 공유할 때는 비식별화하세요. `docker compose config`를 옵션 없이 공개하면 비밀값이 노출될 수 있습니다.

## 2. HTTPS와 Web 확인

```bash
# 실제 호스트 이름으로 바꿔 실행
curl -I --max-time 10 https://social.example.com/
```

- [ ] 브라우저에서 서비스 도메인 접속과 인증서 확인
- [ ] 서버 소개 및 공개 페이지 표시
- [ ] 테스트 계정 로그인/로그아웃 성공
- [ ] 타임라인·알림이 정상 표시
- [ ] 연속된 요청에서 비정상적인 지연이나 HTTP 5xx 없음

Cloudflare에서 521이 뜨지만 컨테이너는 정상이라면 Nginx 등 **원본 서버의 프록시 상태**부터 확인하세요. [장애 진단 문서](../troubleshooting/known-failures.md).

## 3. 게시물·미디어

- [ ] 테스트 계정으로 공개/비공개 범위를 구분해 게시물 작성
- [ ] 게시물을 다시 열어 저장과 표시를 확인
- [ ] 이미지 업로드 후 저장, 썸네일 표시, 새로고침 뒤 지속성 확인
- [ ] 테스트가 끝난 뒤 필요한 자료만 지우고, 타인의 데이터는 건드리지 않음

원격 이미지 캐시는 로컬 업로드와 저장/정리 방식이 다를 수 있습니다. 미디어 표시 장애가 곧 원본 게시물 손실을 뜻하지는 않습니다.

## 4. 메일·가입

- [ ] 관리자 또는 테스트 계정으로 확인 메일 수신
- [ ] 비밀번호 복구 메일의 도착과 링크 확인
- [ ] SMTP 오류·스팸 폴더·발신 도메인 인증 상태 점검
- [ ] 가입 공개 여부, 승인제, 이용 약관·연락처가 의도대로 적용

**가입을 실제로 열기 전에** 정상적인 확인/복구 절차가 작동하는지 검증하세요. 가입 남용과 CAPTCHA는 [보안 운영 문서](../security/registration-and-federation.md)를 참고하세요.

## 5. Sidekiq·실시간 이벤트

- [ ] 새 게시물과 알림이 새로고침 없이 도착하는지
- [ ] Sidekiq 대기열이 증가만 하는 것이 아니라 실제 처리되는지
- [ ] 오래된 Retry/Dead 카운트와 **현재 진행 중인 장애**를 구분
- [ ] 백그라운드 작업 로그에서 반복 실패·네트워크 타임아웃 확인

```bash
docker compose ps sidekiq streaming
docker compose logs --since=10m sidekiq streaming
```

대기열이 늘었다고 무조건 작업을 삭제하거나 Sidekiq를 재시작하지 마세요. 자세한 방법은 [대기열 진단](../operations/sidekiq-queues.md)에 정리돼 있습니다.

## 6. 서버 간 연합(ActivityPub)

허가된 외부 테스트 계정이나 협조 가능한 상대 서버를 이용합니다.

- [ ] 외부 서버에서 로컬 공개 계정/게시물이 조회되는지
- [ ] 로컬 계정의 게시물이 원격으로 전달되는지
- [ ] 원격 계정·게시물이 로컬에 수신되는지
- [ ] 상대 서버가 보낸 Inbox 요청이 비정상적으로 차단되지 않는지

연합은 캐시·비동기 처리로 약간 지연될 수 있으므로 한 번의 조회 실패만으로 즉시 차단 정책이나 방화벽을 바꾸지 마세요. CDN/WAF는 브라우저 요청과 ActivityPub 서버 간 요청을 다르게 처리할 수 있습니다.

## 7. 백업과 운영 인계

- [ ] PostgreSQL·미디어·필수 설정의 백업 대상이 정의돼 있음
- [ ] 백업 위치와 접근 권한이 적절함
- [ ] 파일 무결성 확인과 **별도 환경 복구 연습** 계획이 있음
- [ ] 현재 Mastodon/DB/Redis/검색 엔진/이미지 태그를 기록함
- [ ] 비상 연락·장애 공지 경로 및 다음 업데이트 계획이 있음

백업 파일의 존재나 체크섬 통과만으로 **전체 서비스 복구 성공을 선언하지 마세요.** [백업 준비 문서](../operations/backup-readiness.md)를 통해 아직 검증되지 않은 항목을 분명하게 기록합니다.

## 최종 운영 점검 기록 예시

| 항목 | 결과 | 확인 시점 / 근거 |
| --- | --- | --- |
| HTTPS / 인증서 | 성공·실패·미확인 | |
| 로그인 및 게시 | 성공·실패·미확인 | |
| 메일 수신 | 성공·실패·미확인 | |
| Sidekiq·Streaming | 성공·실패·미확인 | |
| 미디어 업로드 | 성공·실패·미확인 | |
| 연합 송수신 | 성공·실패·미확인 | |
| DB·미디어 백업 | 성공·실패·미확인 | |
| 실제 복구 연습 | 성공·실패·미확인 | |

**'미확인'은 실패도 성공도 아닙니다.** 검증하지 않은 부분을 남기는 것이 실제 운영을 더 안전하게 만듭니다.

### 다음 읽을거리

- [업데이트 체크리스트](../operations/upgrade-checklist.md)
- [런타임·보안 패치](../operations/security-patch-rollout.md)
- [장애 대응 모음](../troubleshooting/known-failures.md)
- [Sidekiq 대기열](../operations/sidekiq-queues.md)
- [Mastodon 공식 초기 설정](https://docs.joinmastodon.org/admin/setup/)
