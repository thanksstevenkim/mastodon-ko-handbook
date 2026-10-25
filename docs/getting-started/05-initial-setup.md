# 05. 최초 설치와 Mastodon 초기 설정

> **검증 상태: 초안/부분 확인.** Mastodon 공식 설치·설정 문서와 4.7.3 컨테이너 구성을 바탕으로 **점검 순서와 설정 원칙**을 정리했습니다. 빈 Ubuntu 서버에서 처음부터 끝까지 검증한 **복사 실행형 Docker 설치 절차는 아닙니다.** 새 서버에서 실제 수행하기 전에 선택한 버전의 공식 절차와 차이를 확인하세요.

[← 04. Docker Compose](04-docker-compose.md) · [다음: 첫날 점검 →](06-first-day-checklist.md)

## 시작 전 전제조건

- [02. 서버 준비](02-prerequisites.md), [03. 도메인·DNS](03-domain-and-dns.md) 점검 완료
- 사용하려는 Mastodon 릴리스에 맞춘 Compose 파일과 **이미지 태그**
- 영속 데이터 디렉터리·권한·백업 계획
- PostgreSQL 및 Redis 연결 정보, 실제 DB 사용자·데이터베이스 준비 방식
- SMTP 발송 서비스와 설정값, HTTPS·리버스 프록시 계획

**기존 서버를 재설치하는 상황이라면 이 문서의 신규 설치 절차를 사용하지 마세요.** 먼저 백업·복구·업그레이드 문서를 확인해야 합니다.

## 실측 사례: 전용 PostgreSQL 역할 및 DB 생성 (2026-10-25)

**검증 상태: Docker Compose로 실행한 PostgreSQL에서 전용 역할·DB 생성과 SQL 연결까지 검증. Rails 스키마 초기화는 이후 단계에서 별도로 확인했고 서비스 전체 기동은 아직 미검증.**

격리된 UTM ARM64 실험 VM에서 공식 Mastodon `v4.7.3` Compose의 `db`와 `redis`가 `healthy`인 상태를 확인하고 다음을 실행했습니다.

```bash
sudo docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE mastodon LOGIN;
CREATE DATABASE mastodon_production OWNER mastodon;
SQL

sudo docker compose exec -T db \
  psql -U mastodon -d mastodon_production \
  -c 'SELECT current_database(), current_user;'
```

`CREATE ROLE`, `CREATE DATABASE`가 출력됐고, SQL 결과의 `current_database`와 `current_user`는 각각 `mastodon_production`, `mastodon`이었습니다.

**주의:** 이 명령은 **새 DB에 한 번만** 실행하는 초기화 예시입니다. 역할이나 DB가 이미 있다면 재실행 시 오류가 발생할 수 있으며, 운영 DB를 초기화하려는 용도로 사용해서는 안 됩니다. 실험의 PostgreSQL 서비스는 공식 예제의 내부 네트워크 `trust` 인증을 사용하므로, 이 기록은 운영용 DB 인증 보안 가이드가 아닙니다. 비밀번호 기반 인증, 역할 권한, 백업 및 접속 제한은 공개 운영 환경에서 따로 검증해야 합니다.

## 실측 사례: 로컬 환경변수 및 VAPID 키 준비 (2026-10-25)

**검증 상태: 필수 환경변수 설정·VAPID 키 생성/저장·권한·Compose 구문 검사 성공. Rails DB 초기화는 이후 단계에서 별도로 확인했고 서비스 전체 기동은 아직 미검증.**

UTM ARM64 VM에서 `.env.production`에 실험 도메인 `mastodon.test`, 내부 PostgreSQL `db` / Redis `redis` 연결값과 무작위 `SECRET_KEY_BASE` 및 Active Record 암호화 키 3개를 설정했습니다. 실험 구성에서는 검색·S3를 끄고 로컬 미디어를 사용하며, SMTP는 실제로 검증하지 않았습니다. `mastodon.test`는 이 로컬 실험을 위한 이름이고 공개 연합 서비스용 도메인이 아닙니다.

공식 `ghcr.io/mastodon/mastodon:v4.7.3` ARM64 이미지를 이용하여 `bundle exec rails mastodon:webpush:generate_vapid_key`를 **일회성 `docker compose run --rm --no-deps web`** 컨테이너에서 실행했습니다. VAPID 개인키와 공개키를 호스트의 `.env.production`에 저장했고, 두 변수 모두 값이 존재함을 재검증했습니다.

`.env.production`은 권한 `600`이었으며 `sudo docker compose config --quiet`가 오류 없이 통과했습니다. **비밀값은 저장소/운영 기록에 포함하지 않았습니다.**

**중요:** `mastodon:setup` 등의 Rails 작업을 컨테이너에서 실행할 때, 컨테이너 내부에 작성된 파일이 호스트 `.env.production`에 자동 저장되는 것으로 가정해서는 안 됩니다. 실험에서는 **출력을 호스트에서 별도로 받아 키 항목만 기록하는 절차**를 사용했습니다. 설정 파일의 내용을 표준 출력 또는 공개 기록으로 보내지 마세요.

## 실측 사례: 신규 Mastodon DB 스키마 초기화 (2026-10-25)

**검증 상태: 공식 Mastodon 4.7.3 ARM64 컨테이너의 신규 DB 초기화 작업 종료 및 테이블 생성 확인. 초기 시드 데이터와 서비스 실행은 다음 단계에서 별도 검증.**

앞서 만든 `mastodon_production`은 초기 검사에서 `public` 스키마에 테이블이 **0개**였습니다. 그런 다음 해당 **신규 실험 전용 DB**에 다음을 수행했습니다.

```bash
cd ~/mastodon-handbook-lab
sudo docker compose run --rm --no-deps -e RAILS_ENV=production web bundle exec rails db:migrate:setup
```

명령은 별도 오류 메시지 없이 쉘로 복귀했습니다. 사후 검사에서 `public.accounts`, `public.users` 테이블이 존재했으며 `public` 스키마의 테이블은 **118개**였습니다. DB와 Redis 컨테이너는 모두 `healthy`였습니다.

확인에 사용한 SQL:

```bash
sudo docker compose exec -T db psql -U mastodon -d mastodon_production -c "SELECT to_regclass('public.accounts') AS accounts_table, to_regclass('public.users') AS users_table;"
sudo docker compose exec -T db psql -U mastodon -d mastodon_production -c "SELECT COUNT(*) AS table_count FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
```

Mastodon 4.7.3의 `db:migrate:setup` 작업은 신규 스키마에서 마이그레이션과 시드를 처리하도록 정의되어 있지만, **이번 출력만으로 시드 데이터 내용까지 확인된 것은 아닙니다.** 관리자 계정에 필요한 `user_roles` 초기 데이터는 추후 SQL로 검증해야 합니다.

**경고:** 이 명령은 기존 운영 DB의 초기화·복구 지침으로 제시하는 것이 아닙니다. 이미 운영 중인 DB, 다른 `LOCAL_DOMAIN`, 복원된 데이터에 적용하지 말고 해당 환경의 공식 업그레이드/복구 절차를 따르세요.

## 실측 사례: 시드 데이터·미디어 권한 및 서비스 최초 기동 (2026-10-25)

**검증 상태: 사용자 역할·마이그레이션 기록, Web/Streaming의 HTTP 헬스 엔드포인트 확인. Sidekiq의 Docker Health 완료 및 로그인/게시/실제 연합은 별도 검증이 필요.**

신규 DB 스키마 초기화 후 `user_roles`에서 `Admin`, `Moderator`, `Owner` 등 사용자 역할과 `schema_migrations` **615건**을 확인했습니다. 화면에는 4개 행이 반환됐으므로, 별도 역할이 하나 더 있을 수 있으나 상세값까지 단정하지 않습니다.

로컬 미디어 디렉터리는 다음 명령으로 준비하고 UID/GID와 권한을 확인했습니다.

```bash
sudo install -d -o 991 -g 991 -m 0755 public/system
stat -c '%u:%g %a %n' public/system
```

실측 결과는 `991:991 755 public/system`입니다.

다음과 같이 Web·Sidekiq·Streaming을 시작했습니다.

```bash
sudo docker compose up -d web sidekiq streaming
sudo docker compose ps
```

Docker Compose는 DB·Redis가 실행 중인 상태에서 나머지 세 컨테이너를 `Started`로 보고했습니다. 바로 직후 상태 확인에서 DB·Redis는 `healthy`, Web·Sidekiq·Streaming은 `health: starting`이었습니다.

이어서 게스트 VM에서 HTTP 헬스 엔드포인트를 확인했습니다.

```bash
curl -fsS --max-time 10 http://127.0.0.1:3000/health
curl -fsS --max-time 10 http://127.0.0.1:4000/api/v1/streaming/health
```

두 엔드포인트 모두 `OK`를 반환했습니다. 루트 파일시스템은 약 76 GiB 중 약 9.5 GiB 사용, 약 63 GiB 사용 가능했습니다.

**추가 Health 재검증:** 약 3분 뒤 `sudo docker compose ps`에서 **DB·Redis·Web·Sidekiq·Streaming 5개가 모두 `healthy`**로 전환됐고 Web/Streaming Health가 각각 다시 `OK`를 반환했습니다. 단, Sidekiq의 실제 비동기 작업 실행·SMTP·브라우저 기능은 별도 테스트가 필요합니다.

**관리자 생성 관련 실패와 해결:** 최초 계정 생성은 `bin/tootctl accounts create labadmin --email labadmin@mastodon.test --confirmed --approve --role Owner`에서 종료 코드 **1**을 반환했습니다. 오류 출력의 `Failure/Error: email` 및 `unreachable`을 확인했고, `accounts`와 `users`에 해당 사용자 기록이 없음을 SQL로 확인한 뒤 **일회성 생성 컨테이너에만** `EMAIL_DOMAIN_ALLOWLIST=mastodon.test`를 적용해 재시도했습니다. 재시도는 종료 코드 **0**으로 성공했고, SQL에서 `labadmin`의 역할 `Owner`, `approved=true`, `confirmed_at IS NOT NULL=true`를 확인했습니다. 비밀번호가 저장된 출력 파일은 권한 `600`으로 보관했으며 **비밀번호 값은 문서에 남기지 않습니다.**

**검증 경계:** `OK`는 웹/스트리밍 HTTP 처리의 최소 동작 증거입니다. 비동기 큐 작업, 브라우저의 HTTPS 로그인, 계정 생성·게시·업로드·연합 기능은 아직 별도로 확인해야 합니다. 공식 Compose의 Web·Streaming 바인딩은 VM의 `127.0.0.1`에 한정되어 있으며 외부 접근을 위해 임의로 `0.0.0.0`으로 변경하지 않습니다.

### 테스트용 이메일 도메인 검증 실패의 주의사항

이메일 확인 메일을 생략하는 `--confirmed` 옵션은 이메일 DNS 검증 자체를 무조건 생략하지 않습니다. 외부 DNS에서 이메일을 수신하지 않는 `.test` 도메인을 계정에 사용했으므로 주소 연결 가능성 검사에서 `unreachable` 오류가 발생했습니다.

해당 **격리된 로컬 실험 환경에서만** 다음과 같이 계정 생성 작업에 일회성 허용 목록을 전달했습니다.

```bash
sudo docker compose run --rm --no-deps \
  -e EMAIL_DOMAIN_ALLOWLIST=mastodon.test \
  web bin/tootctl accounts create labadmin \
  --email labadmin@mastodon.test --confirmed --approve --role Owner
```

**명령 출력에 새 계정의 임시 비밀번호가 포함됩니다.** 실행 시에는 권한 `600`의 **호스트 측 비공개 파일로 출력을 리디렉션하고**, 출력 원문을 게시하거나 공유하지 마세요. 위 예제는 동작 원리를 보여주는 명령이므로 비밀번호 보관과 기존 사용자 중복 확인 절차는 별도로 갖춰야 합니다.

`EMAIL_DOMAIN_ALLOWLIST`를 서비스 전체에 무조건 적용하거나 운영 환경의 무효한 메일 주소를 허용하는 방식으로 일반화하지 않습니다. 공개 서버에서는 정상적으로 수신 가능한 이메일과 실제 도메인 검증을 사용해야 합니다. **관리자 계정 생성 완료가 로그인·게시·메일 발송의 성공을 의미하지는 않습니다.**

## 실측 사례: macOS Safari에서 Mastodon 로그인 성공 (2026-10-25)

**검증 상태: 로컬 Ubuntu ARM64 VM의 Mastodon 4.7.3에 대해 macOS Safari에서 실험용 Owner 계정 `labadmin` 로그인 성공. 게시·이미지 업로드·메일 발송·실제 연합 통신은 아직 미검증.**

앞 단계에서 UTM VM 주소 `192.168.64.4`의 Caddy가 `https://mastodon.test`을 로컬 TLS로 서비스하고, macOS의 `/etc/hosts`가 `mastodon.test`를 해당 VM에 매핑하는 것을 확인했습니다. macOS의 `curl --cacert ~/Downloads/mastodon-lab-root.crt https://mastodon.test/health`에서 `OK`를 확인했습니다. 이후 실험 담당자가 **Safari에서 실제 로그인 완료**를 보고했습니다. 이 보고에 근거하여 브라우저의 화면 표시 및 `labadmin` 계정의 로그인 성공을 확인한 것으로 기록합니다.

이 테스트는 **공개 서버가 아닌 로컬 격리 실험**이며 실제 SMTP 전달, 새로운 게시물 및 미디어 처리, WebSocket 스트리밍 동작, Sidekiq 작업 성공, 다른 서버와의 ActivityPub 송수신 등을 입증하지 않습니다. 특히 `mastodon.test`는 공개 DNS와 연합 식별자에 사용할 도메인이 아닙니다.

비밀키·인증서 개인키·생성된 관리자 임시 비밀번호는 GitHub에 보관하지 않습니다. 실험 종료 시 Mac의 `/etc/hosts` 항목과 사용자 키체인에 등록한 로컬 CA 신뢰 항목 정리를 점검하고, VM과 인증서 사용 범위를 유지·관리해야 합니다.

## 실측 사례: 로컬 게시물 PostgreSQL 저장 확인 (2026-10-25)

**검증 상태: macOS Safari에서 Owner 계정 로그인 성공 이후 실험용 게시물이 PostgreSQL `statuses` 테이블에 존재함을 확인. 새로고침 후의 화면 표시·본문·공개 범위는 본 검사의 SQL로는 별도 확인하지 않음.**

새로 만든 `labadmin` 계정의 로컬 게시물 수를 다음과 같이 조회했습니다.

```bash
sudo docker compose exec -T db \
  psql -U mastodon -d mastodon_production \
  -c "
SELECT COUNT(*) AS local_statuses
FROM statuses
WHERE account_id = (
  SELECT id FROM accounts
  WHERE username = 'labadmin' AND domain IS NULL
);
"
```

실측 `local_statuses`는 **1**이었습니다. 이 결과는 계정과 연결된 게시물 데이터의 저장을 뒷받침합니다. **미디어 첨부·백그라운드 작업·외부 연합 전송의 성공 증거는 아닙니다.**

## 실측 사례: 로컬 이미지 저장 및 Sidekiq 실행 확인 (2026-10-25)

**검증 상태: JPEG 미디어 첨부의 PostgreSQL 기록·처리 완료 상태, 로컬 파일 생성 및 Sidekiq 실행 로그 확인. 재시작 후 영속성·브라우저 새로고침 표시·외부 연합 통신은 아직 미검증.**

Safari에서 실험용 JPEG 이미지를 게시한 뒤 `labadmin` 계정의 `media_attachments`를 조회했습니다. 미디어 레코드 1건, `file_content_type=image/jpeg`, `file_file_size=18998`바이트, 유효한 `status_id`, `processing=2`를 확인했습니다. Mastodon 4.7.3의 `app/models/media_attachment.rb`에서 `enum :processing, { queued: 0, in_progress: 1, complete: 2, failed: 3 }`이므로 **`processing=2`는 처리 완료 상태**입니다.

`public/system`에는 파일 **2개**, 사용량 **80KB**가 확인됐고 최상위 디렉터리 권한은 `991:991 / 755`였습니다. 이는 로컬 미디어 파일 저장이 이루어졌다는 증거입니다. 이 단계에서는 개별 파일 내용이나 원본·썸네일 관계까지 식별하지 않았습니다.

Sidekiq 컨테이너는 약 35분 가동 후에도 `healthy`였습니다. 로그에서 `TriggerWebhookWorker`, `DistributionWorker`, `ActivityPub::DistributionWorker`, `LinkCrawlWorker`, `PushUpdateWorker`와 예약 작업의 `start` 후 `done` 기록을 확인했습니다. **Sidekiq가 실제로 작업을 처리한 증거이지만, 특정 이미지 처리 작업과의 일대일 대응이나 외부 연합 전달의 성공을 의미하지 않습니다.**

실험자는 다음 단계에서 `docker compose stop`과 `docker compose up -d` 후 DB/미디어 영속성과 브라우저 표시를 검증할 예정입니다. **현재 단계에서 완료로 기록하지 않습니다.** 볼륨 삭제 옵션 `down -v`, `prune`, `rm -rf` 등은 사용하지 않습니다.

## 1. 환경변수 파일을 준비하기

Mastodon은 환경변수를 통해 설정됩니다. 공식 저장소의 `.env.production.sample`은 완성된 서버 설정이 아니라 **값을 채워야 하는 예시**입니다. 샘플에 켜져 있는 선택적 기능(예: Elasticsearch나 S3)을 사용하지 않는다면 해당 옵션을 명시적으로 꺼야 합니다.

| 항목 | 의미 및 초기 확인 |
| --- | --- |
| `LOCAL_DOMAIN` | 계정·연합 식별자. 운영 후 안전한 변경이 어려움 |
| `DB_HOST` / `DB_USER` / `DB_NAME` | 실제 Compose DB 서비스와 초기화된 DB 사용자·이름에 맞춤 |
| `REDIS_HOST` | 실제 Redis 서비스명 또는 연결 대상 |
| `SECRET_KEY_BASE` 등 비밀값 | 해당 릴리스에서 안내한 방법으로 **새로 생성**, 비공개 보관 |
| Active Record 암호화 키 | 사용하는 버전에 필요한 항목 확인; 서비스 운영 후 임의 변경 금지 |
| `SMTP_SERVER` 등 | 실사용 메일 제공자 정보로 구성 |
| `ES_ENABLED` / `S3_ENABLED` | 검색·객체 스토리지 사용 여부에 따라 설정 |

예를 들어 Compose 서비스명이 `db`와 `redis`라면 호스트명에 이 서비스 이름을 사용할 수 있습니다. 하지만 **서비스명이 곧 DB 사용자명이라는 뜻은 아닙니다.** 컨테이너의 DB 초기화·인증 정책과 Rails 설정이 일치해야 합니다.

일부 키를 잃으면 세션이나 암호화된 데이터 복구에 영향을 줄 수 있습니다. **새 비밀키로 무작정 교체하지 말고 안전한 백업/보관**을 계획하세요. 이 문서에는 실제 비밀값이나 예시 토큰을 싣지 않습니다.

## 2. 초기화 순서 이해하기

일반적인 순서는 **DB/Redis 준비 → Mastodon 환경변수 확정 → 데이터베이스 스키마/필수 초기 데이터 준비 → 앱 프로세스 시작 → 관리자 계정 생성**입니다. 단, 실제 Rails 작업 명령과 실행 순서는 Mastodon 릴리스와 배포 방식에 따라 확인해야 합니다.

Mastodon 공식 소스 설치 안내는 다음 **대화형 설정 마법사**를 소개합니다.

```bash
RAILS_ENV=production bin/rails mastodon:setup
```

이 명령은 **소스 직접 설치 환경을 기준**으로 설명된 예시입니다. Docker Compose에서 그대로 실행한다고 호스트의 `.env.production`이 자동 저장되지는 않습니다. `docker compose run --rm`은 일회성 컨테이너를 제거하므로, 파일을 별도로 보존하는 볼륨/마운트가 없으면 컨테이너 안에서 생성된 설정이 사라질 수 있습니다.

따라서 컨테이너 방식에서는 다음을 확인한 뒤 **버전에 맞는 설정 마법사 사용법 또는 수동 초기화 절차**를 결정해야 합니다.

1. 환경변수 파일이 실제로 **호스트에 존재하고 영속적으로 유지**되는가?
2. 설정 마법사의 DB 연결 사용자와 Compose PostgreSQL 사용자·권한이 일치하는가?
3. 생성된 비밀값을 안전하게 보존했는가?
4. 초기화·마이그레이션이 성공했고 애플리케이션이 **그 설정을 읽고 실행**되는가?

처음 설치라고 해도 이미 데이터가 있는 DB에 임의의 재설정/초기화 명령을 반복하지 마세요.

## 3. 애플리케이션과 관리자 계정

환경변수·DB 준비와 HTTPS 프록시 구성이 끝나면 Web, Sidekiq, Streaming 상태를 확인합니다.

```bash
docker compose config --quiet
docker compose ps
docker compose logs --since=10m web sidekiq streaming
```

Mastodon 공식 안내는 CLI의 `tootctl accounts create`를 이용한 관리자 계정 생성과, 필요할 경우 `tootctl accounts modify ... --approve` 과정을 설명합니다. **관리자 역할명과 옵션은 대상 버전을 확인**해야 하며, 초기 비밀번호가 터미널에 출력될 수 있으므로 화면 공유·로그 저장에 주의하세요.

관리자 권한을 부여할 때는 최소 권한 원칙을 지키고, 계정 보호를 위해 강력한 인증 수단과 2단계 인증을 활용하세요.

## 4. 가입·메일·미디어 설정 확인

- 가입 확인·비밀번호 재설정 메일이 **실제로 수신되는지** 확인
- 신규 업로드가 저장소에 보존되고 새로고침 후에도 보이는지 확인
- 계정/서버 설명, 연락 채널, 기본 이용 규칙과 신고 방식을 작성
- 가입 공개 여부와 승인제 정책을 결정
- 외부 연합 서버에 공개되는 데이터와 전달 정책을 검토

메일 발송이 안 된다면 가입 공개 전에 원인을 찾는 편이 좋습니다. 필요하다면 [가입 남용·연합 보호](../security/registration-and-federation.md)를 참고하세요.

## 5. 완료라고 선언하기 전에

설정 파일이 있고 컨테이너가 실행된다는 사실만으로 설치가 끝난 것은 아닙니다. **[06. 첫날 운영 점검](06-first-day-checklist.md)**에 따라 HTTPS, 로그인, 게시물, 미디어, Sidekiq, 연합, 메일, 백업을 확인하세요.

### 참고 자료

- [Mastodon 설치 안내: 설정 마법사](https://docs.joinmastodon.org/admin/install/)
- [Mastodon 환경변수](https://docs.joinmastodon.org/admin/config/)
- [공식 초기 서버 설정/관리자 계정](https://docs.joinmastodon.org/admin/setup/)
- [v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)
- [Mastodon v4.7.3 Compose 예제](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
