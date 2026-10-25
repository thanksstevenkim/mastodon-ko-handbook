# 05A. UTM에서 검증한 Mastodon 4.7.3 최초 설치 흐름

> **검증 상태: 테스트 검증 (2026-10-25, Checkpoint 1~20).** UTM의 새 Ubuntu Server 24.04.5 ARM64 VM에 Mastodon 4.7.3을 설치하고 HTTPS, 관리자 로그인, 게시물 2건, JPEG 첨부 1건, Sidekiq 작업, 컨테이너·VM 재시작 후 지속성, 암호화 백업을 검증했습니다. **아래는 당시의 실제 검증 명령과 판정을 순서대로 엮은 실습 기록이지, 모든 환경에서 무인 실행되는 설치 스크립트가 아닙니다.**

[← 최초 설치와 설정](05-initial-setup.md) · [다음: 첫날 운영 점검 →](06-first-day-checklist.md) · [핸드북 목차](../../README.md)

## 적용 대상과 경계

| 항목 | 실험에서 확인한 구성 |
| --- | --- |
| 가상화 | macOS의 UTM, 새 `mastodon-lab` VM |
| 게스트 | Ubuntu Server 24.04.5 LTS / `aarch64` |
| 자원 | 메모리 약 5.8 GiB, swap 4 GiB, 80 GiB 가상 디스크(LVM 확장 후 루트 약 76 GiB) |
| DB / 캐시 | PostgreSQL 14 / Redis 7 |
| 앱 | Mastodon Web·Sidekiq 이미지 `v4.7.3`, 별도 Streaming 이미지 `v4.7.3` |
| HTTPS | Ubuntu 호스트의 Caddy `tls internal` 및 로컬 실험 도메인 `mastodon.test` |
| 저장 | 로컬 `postgres14`, `redis`, `public/system` 바인드 마운트 |

**이 글을 사용하면 안 되는 경우:** 기존 Mastodon 서버의 업데이트, 이미 데이터가 있는 DB 재초기화, 공개 인터넷에서 바로 운영할 서버. 그런 작업은 각각 [업그레이드](../operations/upgrade-checklist.md), [백업·복원](../operations/backup-readiness.md), [독립 VM 복구](../operations/disaster-recovery-utm.md) 안내에서 시작해야 합니다.

`mastodon.test`와 로컬 CA는 인터넷 공개용 연합 도메인·공인 TLS 인증서를 대신하지 않습니다. **공개 SMTP 송신과 외부 ActivityPub 송수신은 이 실험에서 확인하지 않았습니다.** DB의 `POSTGRES_HOST_AUTH_METHOD=trust` 구성 또한 외부 접근이 차단된 실험의 기록이지 운영 권고가 아닙니다.

## 1. OS·SSH·디스크 기본선 확인

빈 VM에 접속한 뒤 다음과 같은 **읽기 전용** 명령으로 호스트를 확인했습니다.

```bash
hostname
cat /etc/os-release
uname -m
free -h
df -h /
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
systemctl is-active ssh
```

실험에서는 SSH 접속이 성공했고 Ubuntu 24.04.5 / ARM64가 확인됐습니다. 설치 과정에서 80 GiB 가상 디스크의 루트 논리 볼륨이 약 절반만 사용되는 상황을 확인했습니다. `vgs`·`lvs`·파일시스템 종류를 조사한 뒤 **그 특정 VM에서만** LVM을 확장했으며, 이 조치는 일반 설치 과정의 필수 명령이 아닙니다. 자세한 사전 점검과 당시 검증값은 [02. 서버 준비](02-prerequisites.md)에 남겨 두었습니다.

## 2. Docker와 Mastodon 4.7.3 구성 확인

Docker Engine과 Compose 플러그인을 **Docker 공식 Ubuntu APT 설치 절차**에 따라 설치했습니다. 배포 시점에 따라 버전이 달라지므로 고정된 임의 설치 스크립트 대신 [Docker 설치 문서](https://docs.docker.com/engine/install/ubuntu/)를 참고합니다.

```bash
sudo docker version
docker compose version
systemctl is-active docker
sudo docker info --format '{{.Architecture}}'
sudo docker run --rm hello-world
```

실측: Docker 데몬 `active`, 아키텍처 `aarch64`, `Hello from Docker!` 출력. 당시 확인한 버전은 Docker Engine 29.9.2 및 Compose v5.6.1입니다. **이 버전은 보편적 요구사항이 아니라 당시 관찰값**입니다.

Mastodon 공식 `v4.7.3` 소스를 shallow clone해 태그 및 `docker-compose.yml`·`.env.production.sample` 존재를 확인했습니다. 테스트 프로젝트 디렉터리는 `~/mastodon-handbook-lab`이었습니다. [04. Compose 이해하기](04-docker-compose.md)에 기록한 이미지 아키텍처 검사에서 `postgres:14-alpine`·`redis:7-alpine`·Mastodon Web/Streaming 이미지의 ARM64 지원을 확인했고, 공식 Mastodon 두 이미지를 실제 다운로드한 뒤 각각 `linux/arm64`를 확인했습니다.

**중요:** 공식 Compose는 빈 서버에 그대로 붙여 넣기만 하면 동작하는 완성 설정이 아닙니다. 환경변수, 로컬 미디어 경로, DB 초기화, 프록시, 메일 정책을 확인해야 합니다. 이 글은 실제 사용된 비밀값이나 환경 파일 원본을 제공하지 않습니다.

## 3. PostgreSQL·Redis부터 시작

신규 실험 프로젝트에서 접근 권한 `600`의 호스트 `.env.production` 파일을 준비하고 Compose 설정 검사를 완료한 후 DB·Redis만 실행했습니다.

```bash
cd ~/mastodon-handbook-lab

sudo docker compose config --quiet
sudo docker compose up -d db redis
sudo docker compose ps db redis
sudo docker compose exec -T db pg_isready -U postgres
sudo docker compose exec -T redis redis-cli ping
```

처음에는 PostgreSQL이 `health: starting`이며 `pg_isready`에 응답하지 않았으나 잠시 뒤 `healthy`·`accepting connections`이 됐고 Redis는 `PONG`을 반환했습니다. **`Started`와 `healthy`는 다릅니다.** 계속 실패할 때는 DB 저장 폴더를 삭제하지 말고 로그와 포트를 검사합니다.

## 4. 실험 전용 DB 역할·데이터베이스 생성

**데이터가 없고 해당 역할/DB도 존재하지 않는 최초 설치일 때만** 아래 명령을 사용했습니다.

```bash
sudo docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE mastodon LOGIN;
CREATE DATABASE mastodon_production OWNER mastodon;
SQL

sudo docker compose exec -T db \
  psql -U mastodon -d mastodon_production \
  -c 'SELECT current_database(), current_user;'
```

실측: `CREATE ROLE`·`CREATE DATABASE`와 `mastodon_production / mastodon` 조회 성공.

**주의:** 당시의 PostgreSQL 내부 연결 인증은 `trust` 기반이었습니다. 이 SQL은 **실험 당시의 초기화**를 기록한 것으로 운영 환경에서 비밀번호 없는 로그인 역할을 권장하지 않습니다. 운영 시 역할 비밀번호와 `pg_hba.conf`/네트워크 정책을 별도로 설정·검증해야 합니다.

## 5. Mastodon 환경변수·암호화 키 준비

권한 `600`의 호스트 `.env.production`에 다음 범주의 값을 준비했습니다. **기존 서버의 키를 복사한 것이 아니라 새 실험의 비밀값을 생성**했습니다.

| 설정 범주 | 실험에서 적용한 원칙 |
| --- | --- |
| `LOCAL_DOMAIN` | `mastodon.test`, 로컬 시험에 한정 |
| `DB_HOST` / `DB_NAME` / `DB_USER` | Compose 서비스 `db`, DB `mastodon_production`, 역할 `mastodon`에 맞춤 |
| `REDIS_HOST` | Compose 서비스 `redis` |
| `SECRET_KEY_BASE` | 새 무작위 값 생성·비공개 보관 |
| Active Record encryption | primary/deterministic/key derivation 관련 키 3개 설정 |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | v4.7.3 컨테이너에서 생성하여 **호스트 환경 파일**에 저장 |
| `ES_ENABLED` / `S3_ENABLED` | 로컬 시험에서 비활성화 |
| SMTP | 실송신 미검증; 공개 서버 설정으로 전용 불가 |

VAPID 생성에는 공식 Web 이미지의 일회성 컨테이너에서 `bundle exec rails mastodon:webpush:generate_vapid_key`를 사용했습니다. 환경 파일 내용, 비밀값, VAPID 개인키 및 관리자 암호는 출력하거나 GitHub에 저장하지 않습니다.

**복사·실행 주의:** 이 단계의 정확한 비밀키 생성·파일 기록 셸 스크립트는 공개된 실험 기록에서 재현 가능한 형태로 확보되지 않았습니다. 그래서 임의의 생성 명령과 테스트용 비밀값을 끼워 넣지 않았습니다. 실제 실행자는 [Mastodon v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)과 [공식 설정 문서](https://docs.joinmastodon.org/admin/config/)를 확인하고, 권한이 제한된 호스트 파일에 **직접** 값을 안전하게 설정해야 합니다. 일회성 컨테이너 내부에 작성한 설정 파일은 별도 마운트가 없다면 호스트에 자동으로 남지 않습니다.

## 6. 신규 데이터베이스 스키마 초기화

초기 점검에서 `public` 스키마에 테이블이 **0개**였던 신규 DB에만 다음을 실행했습니다.

```bash
cd ~/mastodon-handbook-lab
sudo docker compose run --rm --no-deps -e RAILS_ENV=production \
  web bundle exec rails db:migrate:setup
```

실행 후 `accounts`·`users` 테이블이 존재했고 `public` 테이블은 **118개**였습니다. 다음과 같이 확인했습니다.

```bash
sudo docker compose exec -T db \
  psql -U mastodon -d mastodon_production \
  -c "SELECT to_regclass('public.accounts'), to_regclass('public.users');"

sudo docker compose exec -T db \
  psql -U mastodon -d mastodon_production \
  -c "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
```

후속 시드 확인에서 사용자 역할 데이터와 `schema_migrations` 615개가 확인됐습니다. **이미 데이터가 있는 운영 DB·복원 DB에서 `db:migrate:setup`을 재실행하지 마세요.**

## 7. 미디어 저장 경로와 핵심 서비스 기동

실험 당시 Mastodon 이미지가 사용한 파일 소유자 ID를 확인한 뒤 다음 명령으로 로컬 미디어 디렉터리를 준비했습니다.

```bash
sudo install -d -o 991 -g 991 -m 0755 public/system
stat -c '%u:%g %a %n' public/system

sudo docker compose up -d web sidekiq streaming
sudo docker compose ps
```

실측: `991:991` 및 권한 `755`; DB·Redis·Web·Sidekiq·Streaming 5개 서비스가 최종적으로 모두 `healthy`에 도달했습니다. 이미지가 다른 경우 UID/GID를 먼저 검사하고 **991을 무조건 적용하지 마세요.**

게스트 VM에서 Web·Streaming HTTP 응답을 따로 확인했습니다.

```bash
curl -fsS --max-time 10 http://127.0.0.1:3000/health
curl -fsS --max-time 10 http://127.0.0.1:4000/api/v1/streaming/health
```

두 엔드포인트는 각각 `OK`를 반환했습니다. Web·Streaming 포트는 VM 루프백으로 제한했으며, DB·Redis 포트를 호스트 외부로 공개하지 않았습니다.

## 8. 관리자 생성과 테스트용 이메일 도메인 특례

실험에서는 신규 `labadmin` 계정을 Owner 역할로 만들었습니다. 처음에 `--confirmed`·`--approve`를 사용한 관리자 생성이 종료 코드 1과 이메일 주소의 `unreachable` 오류로 실패했습니다. 해당 DB에 계정·사용자 레코드가 없음을 확인한 뒤, **격리된 실험에서 일회성 계정 생성 컨테이너에만** `EMAIL_DOMAIN_ALLOWLIST=mastodon.test`를 적용한 재시도가 성공했습니다.

```bash
# 아래 명령은 격리된 .test 실험 전용입니다.
# 출력에 관리자 임시 비밀번호가 포함될 수 있으므로 공개 터미널·로그에서 실행하지 마세요.
sudo docker compose run --rm --no-deps \
  -e EMAIL_DOMAIN_ALLOWLIST=mastodon.test \
  web bin/tootctl accounts create labadmin \
  --email labadmin@mastodon.test --confirmed --approve --role Owner
```

DB 조회에서 `Owner`, `approved=true`, `confirmed_at IS NOT NULL=true`를 확인했습니다. 실제 관리자 비밀번호는 공개하지 않았습니다.

**운영 경계:** `.test` 특례는 이메일 DNS 검증을 우회하기 위한 로컬 실험 조치이며, 운영 서버에 상시 적용하면 안 됩니다. 실제 이메일을 수신할 수 있는 도메인과 검증된 SMTP 설정을 사용해야 합니다. 임시 비밀번호가 생성되는 명령의 출력을 다른 사람에게 공유하거나 공개 저장소에 남기지 마세요.

## 9. Caddy 로컬 HTTPS와 Safari 로그인

Ubuntu 호스트에서 Caddy를 설치·실행하고, 로컬 `mastodon.test`와 `tls internal`을 사용하는 프록시를 구성했습니다. 경로 `/api/v1/streaming` 및 하위 경로는 Streaming으로, 나머지는 Web으로 보냈습니다. 당시 구성과 로컬 CA 경로는 [03. 도메인·HTTPS](03-domain-and-dns.md)의 실측 Caddyfile 예제에 기록되어 있습니다.

- Caddy 설정 검사: `Valid configuration`.
- VM의 인증서 체인 확인을 수반한 HTTPS Web·Streaming Health: `OK`.
- Mac의 `/etc/hosts` 실험용 이름 매핑 및 **CA 공개 루트 인증서**를 이용한 HTTPS Web Health: `OK`.
- macOS Safari에서 `labadmin` 계정 **실제 로그인 성공**.

로컬 CA의 **개인키를 복사하지 마세요.** Mac에 일시적으로 추가한 CA 신뢰와 hosts 항목은 실험 후 복구해야 하며, 예제의 원본 VM DHCP 주소를 새 VM에 그대로 바인딩하면 실패할 수 있습니다. [Checkpoint 21 독립 VM 복구](../operations/disaster-recovery-utm.md)에서도 과거 IP를 복사한 Caddy `bind` 때문에 재시작하는 장애를 실제로 경험했습니다.

## 10. 설치 완료 판정은 화면·DB·작업 처리까지

실험에서 확인한 순서는 다음과 같습니다.

| 점검 | 실제 결과 |
| --- | --- |
| HTTPS 및 Safari 로그인 | `labadmin` 로그인 성공 |
| 첫 로컬 게시물 | `statuses`에 1건 확인 |
| 최종 로컬 게시물 | 2건 확인 |
| JPEG 첨부 | `media_attachments` 1건, `processing=2`(complete) |
| 로컬 미디어 | 원본·축소본을 포함한 일반 파일 2개 |
| Sidekiq | 여러 Worker의 `start`·`done` 로그 확인 |
| Compose 5개 서비스 정지·재기동 | 최종 5개 `healthy`, DB·미디어 보존 |
| 원본 VM 재부팅 | Docker·Caddy 자동 시작, 5개 서비스 `healthy`, Safari 기존 게시물 표시 |
| 암호화 백업 | GPG AES-256 백업·SHA-256 검증 및 Mac 전송 |
| 독립 VM 복원 | 후속 Checkpoint 21에서 DB·미디어·로그인·홈 피드 복원 성공 |
| DR VM 재부팅 | 후속 Checkpoint 23에서 서비스·DB·Redis 피드·HTTPS·JPEG 지속성 확인 |

Sidekiq에서 작업 완료 로그가 있다는 사실은 **외부 연합 서버의 반영 성공을 증명하지 않습니다.** 자세한 검사 SQL, Media 처리 상태, 원본 VM 재시작 결과는 [05. 초기 설정](05-initial-setup.md), [06. 첫날 점검](06-first-day-checklist.md)에서 확인할 수 있습니다.

## 다음 독립 설치 실험에서 추가 검증할 것

1. 민감한 설정값이 노출되지 않는 **새 VM 기준 비밀키 생성·환경파일 구성의 안전한 명령**을 정리하고, 다른 실험 VM에서 그대로 재현되는지 확인.
2. 운영용 비밀번호 기반 PostgreSQL 인증, 공개 DNS·공인 TLS·SMTP·외부 ActivityPub 경로를 별도 환경에서 검증.
3. 설치 가이드의 각 단계별 멱등성·오류 중단 조건과 복구/롤백 지점 재시험.
4. 동일한 실험을 다른 아키텍처 또는 새 Mastodon 릴리스에서 반복해 버전 종속 사항 분리.

**결론:** UTM 로컬 실험에서는 Mastodon 4.7.3의 최초 설치 → 실제 기능 사용 → 백업 → 독립 VM 복원 및 재부팅까지 검증했습니다. 그러나 이 기록을 **생산 환경에 복사 실행 가능한 범용 설치 스크립트**로 해석해서는 안 됩니다.

## 근거 문서

- [02. 서버 준비](02-prerequisites.md)
- [03. 도메인·DNS·HTTPS](03-domain-and-dns.md)
- [04. Docker Compose 구성](04-docker-compose.md)
- [05. 최초 설치와 설정](05-initial-setup.md)
- [06. 첫날 운영 점검](06-first-day-checklist.md)
- [백업 및 실제 복원 검증](../operations/backup-readiness.md)
- [독립 VM 전체 복구와 재부팅 검증](../operations/disaster-recovery-utm.md)
