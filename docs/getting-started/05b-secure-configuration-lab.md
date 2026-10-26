# 05B. 신규 설치의 비밀키·PostgreSQL 인증 안전화 실험

> **검증 상태: 신규 VM의 설치 기반·PostgreSQL SCRAM 인증·앱 역할·필수 키·DB 스키마·핵심 서비스·독립 Mac HTTPS·Safari 로그인·게시물/미디어 저장·실제 재부팅 후 자동 복구 및 Safari 재검증·Mac 임시 설정 정리·암호화 백업 생성 및 아카이브 복호화 검사 통과 (Checkpoint 24-2~24-15B, 2026-10-26).** 새 `mastodon-install-lab`에서 SCRAM TCP 인증, 계정·키, 초기 스키마, 핵심 서비스, Caddy HTTPS와 Mac 접근을 검증했습니다. **재부팅 후 Safari HTTPS 접속·관리자 재인증/세션·기존 게시물과 이미지 표시·관리자 대시보드 접근은 사용자의 정상 동작 보고**로 확인했습니다. DB·미디어·설정의 재부팅 후 보존과 Mac의 임시 실험 CA 신뢰 및 hosts 항목 제거도 검사했습니다. **Sidekiq 개별 작업 성공 및 별도 환경의 백업 독립 복원은 아직 미검증**입니다. 기존 `mastodon-lab`·`mastodon-dr-lab`·실제 운영 서버는 변경하지 않았습니다.

[← 05A. UTM 설치 실측](05a-utm-verified-installation.md) · [05. 최초 설치](05-initial-setup.md) · [핸드북 목차](../../README.md)

## 왜 별도 실험이 필요한가?

이전에 성공한 Mastodon 4.7.3 로컬 실험은 원본 Compose에 있는 `POSTGRES_HOST_AUTH_METHOD=trust`를 사용했습니다. 이 옵션은 비밀번호를 설정해도 PostgreSQL의 해당 호스트 연결 인증을 우회하므로 인터넷 공개용 DB 인증으로 권장하지 않습니다.

반면 공식 `postgres:14-alpine` 이미지에서는 **새 데이터 디렉터리를 최초 초기화할 때** 비밀번호와 SCRAM-SHA-256 호스트 인증을 사용할 수 있습니다. Docker 이미지의 초기화 환경변수는 **이미 존재하는 데이터 디렉터리를 자동으로 변경하지 않습니다.** 따라서 이 실험은 기존 볼륨을 수정하지 않고 **새 VM, 새 Compose 프로젝트, 비어 있는 PostgreSQL 데이터 디렉터리**에서만 진행합니다.

Mastodon v4.7.3의 `config/database.yml`은 `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PASS`를 읽습니다. `.env.production.sample`은 `SECRET_KEY_BASE`를 `bundle exec rails secret`으로, Rails 암호화 관련 키 3개를 `bin/rails db:encryption:init`으로, VAPID 키 쌍을 `bundle exec rails mastodon:webpush:generate_vapid_key`로 만들도록 안내합니다. 생성된 **실제 비밀값은 공개하거나 커밋하면 안 됩니다.**

## 1. 전용 실험 VM의 사전 확인 (읽기 전용)

UTM에서 새 Ubuntu Server VM을 준비하고, 호스트 이름을 `mastodon-install-lab`으로 설정합니다. VM을 복제하는 대신 새 빈 시스템으로 구축하는 이유는 비밀키·DB·미디어가 원본 및 DR 실험 자료와 절대로 공유되지 않도록 하기 위해서입니다.

아래 명령은 환경을 조회할 뿐 설치·초기화·재부팅·파일 삭제를 하지 않습니다.

```bash
(
  set -euo pipefail
  test "$(hostname)" = "mastodon-install-lab" || {
    echo "ABORT: Not the dedicated installation lab"
    exit 1
  }

  echo "=== OS & Architecture ==="
  . /etc/os-release
  printf 'OS: %s\n' "$PRETTY_NAME"
  uname -m
  echo "=== Resources ==="
  free -h
  df -h /
  echo "=== Network & SSH ==="
  hostname -I
  systemctl is-active ssh
  echo "=== Existing Docker State ==="
  if command -v docker >/dev/null 2>&1; then
    docker --version
  else
    echo "Docker: not installed (expected for a fresh OS)"
  fi
  echo "=== CHECKPOINT 24-2 PREFLIGHT COMPLETE ==="
)
```

**판정:** Ubuntu 24.04 ARM64 등 실제 대상 환경을 기록하고, SSH 및 여유 공간을 확인합니다. 새 VM의 용량과 IP는 기존 실험값을 그대로 가정하지 않습니다. VM이 아직 없다면 이 단계부터 수행하고, **기존 DR VM에 이 실험을 재사용하지 않습니다.**

## 2. 비밀 설정 파일 보존 정책

구성 파일은 실험 전용 프로젝트 아래에 보관하고 디렉터리 및 비밀 파일 접근 권한을 제한합니다. 프로젝트를 처음 만들 때는 `umask 077`을 적용하고, `.env.production` 및 DB 초기화 전용 `.env.postgres`를 각각 모드 `600`으로 둡니다.

| 자료 | 읽는 서비스 | 원칙 |
| --- | --- | --- |
| `.env.production` | Mastodon Web·Sidekiq·Streaming | `DB_PASS`, 앱 키, VAPID 개인키, 필요한 SMTP 비밀값 등 |
| `.env.postgres` | PostgreSQL 초기화 컨테이너 | **`POSTGRES_PASSWORD`만 포함**한 DB 슈퍼유저 초기 비밀번호 파일 |
| `docker-compose.yml` | Compose | v4.7.3 원본 버전 고정, 실험 전 원본 보존 |
| `compose.auth.lab.yml` | Compose | 다음의 신규 DB 인증 전용 **오버라이드**; 비밀값 자체는 넣지 않음 |

`.env.postgres`를 Mastodon 앱에 전달하지 않고, `.env.production`은 PostgreSQL 컨테이너의 `env_file`로 설정하지 않습니다. PostgreSQL의 초기 관리자 비밀번호와 앱 계정의 `DB_PASS`는 **서로 다른 비밀값**을 사용합니다.

주의 사항:

- 환경 파일을 `cat`, `docker compose config`(`--quiet` 없이), `set -x` 등으로 콘솔·CI 로그에 공개하지 않습니다.
- 임시 파일·쉘 기록·개인 메신저·스크린샷에 비밀값을 남기지 않습니다.
- `.gitignore`만 믿지 않고, 프로젝트 저장소에 실제 비밀 설정을 추가하지 않습니다.
- Docker 관리자에게는 컨테이너 환경변수와 볼륨을 볼 수 있는 권한이 있습니다. 모드 `600`과 독립 환경만으로 완전한 비밀 보호가 보장되지는 않습니다.
- **이미 사용 중인** `SECRET_KEY_BASE`·Active Record 키·VAPID 키는 새로운 비밀값으로 덮어쓰지 않습니다.

## 3. PostgreSQL 14 인증 오버라이드 (실행 전 검토용)

원본 v4.7.3 Compose의 `db` 서비스에는 `POSTGRES_HOST_AUTH_METHOD=trust`가 들어 있습니다. 이를 **원본 파일을 덮어쓰지 않고**, 실험 전용 오버라이드에서 변경하는 설계입니다.

```yaml
# compose.auth.lab.yml — 빈 데이터 디렉터리의 신규 실험 전용
services:
  db:
    env_file:
      - .env.postgres
    environment:
      POSTGRES_HOST_AUTH_METHOD: scram-sha-256
      POSTGRES_INITDB_ARGS: --auth-host=scram-sha-256
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-d", "postgres"]
```

`.env.postgres`에는 외부에 공유하지 않을 충분히 긴 무작위 `POSTGRES_PASSWORD` 값이 필요합니다. **이 문서에서는 값 자체를 싣지 않습니다.**

**유의:** Compose의 환경설정 병합은 실제 파일을 대상으로 `sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml config --quiet`로 사전 검사해야 합니다. 그다음 PostgreSQL의 **새 데이터 디렉터리 초기화** 로그에서 암호화된 호스트 인증이 적용됐는지 확인합니다. `pg_isready` 성공만으로 잘못된 암호가 거부되는 것을 증명하지는 못합니다.

## 4. 앱 전용 역할과 키 생성의 검증 설계

PostgreSQL 이미지는 기본 `postgres` 슈퍼유저로 빈 DB를 초기화합니다. 이후에 앱 전용 `mastodon` 로그인 역할과 `mastodon_production` 데이터베이스를 생성해야 합니다. **앱을 DB 슈퍼유저로 실행하지 않습니다.**

**Checkpoint 24-5B 실측:** 새 DB에 역할·데이터베이스가 모두 없다는 사실(`0|0`)을 사전 확인했습니다. 호스트의 권한 `600`인 `.env.production`에서 앱 비밀번호를 읽어, 콘솔이나 명령행 인수로 출력하지 않고 `docker exec -i`의 **표준 입력**으로 `psql`에 전달하는 일회성 SQL을 실행했습니다. `CREATE ROLE`·`CREATE DATABASE`에 성공했고 DB 소유자는 `mastodon`이었습니다. 실험의 역할 검사는 아래 순서로 `1|0|0|0|0|0`을 반환했습니다.

```text
LOGIN | SUPERUSER | CREATEDB | CREATEROLE | REPLICATION | BYPASSRLS
1     | 0         | 0        | 0          | 0           | 0
```

또한 TCP에서 올바른 `.env.production`의 `DB_PASS`로 `mastodon_production|mastodon` 연결 성공, 잘못된 앱 비밀번호로 연결 거부를 확인했습니다. `CREATE ROLE ... PASSWORD '...'`의 **SQL 본문 자체는 컨테이너 내부 입력과 PostgreSQL 처리 과정에서 비밀값을 포함**하므로, 서버 프로세스/DB 관리자의 접근권한과 SQL 로깅·감사 설정을 별도로 고려해야 합니다. 비밀값은 공개 문서·출력에 남기지 않았습니다.

Mastodon 앱 키는 **v4.7.3 이미지 내부의 공식 생성 작업**을 사용합니다.

| 용도 | 생성 작업 | 검증 계획 |
| --- | --- | --- |
| Rails 앱 키 | `bundle exec rails secret` | 키 존재 및 새 값 여부 확인, 값은 출력 금지 |
| Active Record 암호화 키 3개 | `bin/rails db:encryption:init` | 이름·개수 확인, 값은 출력 금지 |
| VAPID 개인키·공개키 | `bundle exec rails mastodon:webpush:generate_vapid_key` | 두 변수 모두 저장됐는지 확인, 값은 출력 금지 |

출력에서 호스트 파일로 값을 옮길 때 **일회성 컨테이너 내부 파일이 그대로 저장된다고 가정하지 않습니다.** 생성 출력의 취급, 원자적 호스트 파일 기록, 재실행 방지, 정상/오류 경로는 실제 새 VM에서 검증할 예정이므로 아직 범용 복사 실행 명령으로 제시하지 않습니다.

## 5. Checkpoint 24-3~24-5A 검증 결과

- **24-3 Docker:** Docker Engine 29.9.2, Compose v5.6.1, `aarch64` 엔진과 ARM64 `hello-world` 실행 성공.
- **24-4 Compose/비밀 파일:** Mastodon v4.7.3 공식 소스 커밋 `8ff11c2bb7b9f0714e947b10fa3629c6542c7121`, `.env.production`·`.env.postgres`·오버라이드 권한 600, 서로 다른 64자리 16진수 DB 비밀번호, 유효한 Compose 구성, DB/Redis의 호스트 포트 미게시 확인. **Rails/VAPID 키는 미생성** 상태.
- **24-5A PostgreSQL:** 새 `postgres:14-alpine` 컨테이너 Healthy, `pg_hba_file_rules`에서 호스트 유형 규칙 5개가 모두 `scram-sha-256`, 규칙 오류 0건. 올바른 PostgreSQL 관리자 비밀번호 허용, 잘못된 비밀번호 및 무비밀번호 **TCP** 연결 거부를 실제 시험했습니다.
- **중요한 인증 경계:** 로컬 Unix 소켓을 위한 `local` 규칙 2개에는 `trust`가 남아 있습니다. 따라서 모든 연결 경로가 SCRAM으로 보호된다는 의미는 아닙니다. PostgreSQL 내부 소켓 접근자와 컨테이너 관리권한을 별도로 통제해야 합니다.

## 6. Checkpoint 24-6~24-7 검증 결과

- **24-6 비밀키 생성:** 실험자가 공식 Mastodon v4.7.3 컨테이너에서 Rails 앱 키, Active Record encryption 키 3개, VAPID 키 2개를 생성하는 배치 명령의 **정상 통과를 보고**했습니다. 이후 터미널 화면은 `clear`되어 원본 출력은 보관되지 않았습니다. 이를 고려해 후속 검사 결과와 구분합니다.
- **24-7 비밀키 저장 실측:** 호스트 `.env.production`의 필수 키 6개가 각각 예상 형식으로 1개씩 존재하고 서로 다른 값을 가진 것을 재검증했습니다. 실제 비밀값을 출력하지 않았으며 Git 제외 및 Compose 구문 검사도 통과했습니다. **저장된 키의 존재·형식 검증이지 암호화 키의 모든 기능 테스트는 아닙니다.**
- **24-7 스키마 초기화:** PostgreSQL 앱 DB의 기존 `public` 테이블 **0개** 확인 후 Redis 7을 시작해 Healthy / `PONG`을 확인했습니다. 공식 Web 이미지의 신규 Rails `db:migrate:setup` 작업이 오류 없이 끝났고, 사후 점검에서 `public` 테이블 **118개**, `accounts`·`users`·`user_roles` 존재, `schema_migrations` **615개**, 사용자 역할 시드 **4개**를 확인했습니다.

## 7. Checkpoint 24-8 핵심 서비스 최초 기동

기존 PostgreSQL·Redis 두 서비스의 `healthy`, 신규 앱 컨테이너 부재, 공식 Mastodon v4.7.3 소스 커밋 및 Compose 구문 검사를 사전 확인했습니다. Mastodon 이미지 내부 `id`로 UID:GID가 **991:991**임을 확인하고, 새 미디어 저장 디렉터리 `public/system`을 이 소유자와 `755` 권한으로 만들었습니다.

- Web·Sidekiq·Streaming 최초 기동 후 **DB·Redis 포함 다섯 서비스 전부 `healthy`**.
- Web·Sidekiq에 각각 동일한 호스트 `public/system`이 `/mastodon/public/system`으로 바인드 마운트된 것을 실제 Docker inspect로 확인.
- Web 포트 **`127.0.0.1:3000`**, Streaming 포트 **`127.0.0.1:4000`**으로만 바인딩된 상태 확인.
- 게스트 VM의 Web `/health` 및 Streaming `/api/v1/streaming/health`에서 각각 **`OK`**.

이는 **앱 서버가 실행되고 최소 헬스체크가 성공했다는 증거**입니다. 브라우저 로그인, 실제 미디어 쓰기 및 외부 연합 송수신 성공을 의미하지 않습니다.

## 8. Checkpoint 24-9 Caddy 로컬 HTTPS 검증

새 VM의 IPv4 `192.168.64.6`, 핵심 서비스 5개의 `healthy`, VM의 HTTP/HTTPS 포트 미사용 상태와 Caddy 미설치를 확인한 후 공식 패키지 저장소에서 **Caddy v2.11.7 (ARM64)**을 설치했습니다. 원본 설정을 `/etc/caddy/Caddyfile.before-install-lab`에 보존하고 테스트 도메인 `mastodon-install.test`에 대해 `tls internal`과 VM IP 전용 `bind 192.168.64.6`를 설정했습니다. Streaming 경로는 `127.0.0.1:4000`, 나머지 경로는 `127.0.0.1:3000`으로 프록시합니다.

| 점검 | 게스트 VM에서 관찰한 결과 |
| --- | --- |
| Caddy 설정 `caddy validate` | `Valid configuration` |
| systemd 서비스 `caddy` | `active` |
| 로컬 공개 루트 CA | 인증서 파일 존재 |
| `https://mastodon-install.test/health` | `OK` |
| `https://mastodon-install.test/api/v1/streaming/health` | `OK` |
| HTTPS `/` | HTTP `200` |

`curl --cacert`와 `--resolve`를 사용하여 **인증서를 무시하지 않고** HTTPS 연결을 검사했습니다. Caddyfile 서식 경고는 출력됐으나 유효한 구성과 실제 HTTPS 응답을 확인했습니다. **Mac에서의 독립적 TLS 검사, Safari 접속, 관리자 계정·로그인, 메일과 외부 연합 통신은 이번 검증에 포함되지 않았습니다.** 개인 인증기관의 **개인키는 복사하거나 공개하지 않습니다.**

## 9. Checkpoint 24-10 독립 Mac HTTPS 검증

VM에서 Caddy의 **공개 로컬 CA 인증서만** 별도 파일로 추출해 Mac으로 SCP 전송했습니다. VM과 Mac이 산출한 인증서 SHA-256 해시가 **`b573d28ca562ea30284e3218db74298222a0a50b24d805530a186d6033c8b07b`**로 일치했습니다. Mac에서는 `/etc/hosts`나 키체인 신뢰 설정을 변경하지 않고, `curl --noproxy '*' --cacert ... --resolve mastodon-install.test:443:192.168.64.6`로 서버 연결을 독립적으로 검증했습니다.

- HTTPS Web `/health` 응답 **`OK`**.
- HTTPS Streaming `/api/v1/streaming/health` 응답 **`OK`**.
- HTTPS 홈페이지 응답 **HTTP 200**.
- **아직 브라우저 검증은 아님:** `curl --cacert`의 성공은 Safari가 자동으로 Caddy 로컬 CA를 신뢰하거나 `mastodon-install.test`라는 이름을 해석한다는 뜻은 아닙니다. Mac 키체인과 `/etc/hosts`는 이 단계에서 그대로 두었습니다.

## 10. Checkpoint 24-11A 신규 Owner 계정 생성

전용 신규 VM에서 DB·Redis·Web·Sidekiq·Streaming의 `healthy`를 다시 확인하고, 신규 계정 이전에 `Owner` 역할 1개와 `labadmin` 계정·실험 이메일의 부재(`1|0|0`)를 확인했습니다. Mastodon v4.7.3 공식 `bin/tootctl accounts create labadmin`을 `--confirmed --approve --role Owner` 옵션 및 실험 도메인 이메일 허용값으로 실행했습니다.

- 실험용 사용자명: `labadmin`, 테스트 전용 이메일: `labadmin@mastodon-install.test`.
- 명령의 자동 생성 암호 출력은 **터미널에 표시하지 않고** VM의 개인 자격증명 파일로 리디렉션했습니다. 파일 권한은 `600`, 생성된 암호 형식을 별도 검사했습니다. 비밀번호 자체는 기록하지 않았습니다.
- 계정·역할·이메일·승인·확인·암호화된 비밀번호에 대한 DB 검증 결과 **1개 계정 일치**.
- **아직 로그인 성공을 의미하지 않습니다.** Safari HTTPS 신뢰 설정과 실제 로그인·세션을 후속 검증해야 합니다. SMTP는 테스트하지 않았습니다.

## 11. Checkpoint 24-11B Mac 인증서 신뢰 진단 (진행 중)

Mac 로그인 키체인에 **실험용 로컬 공개 CA 인증서**를 사용자 신뢰(`trustRoot`, SSL, 대상 호스트 한정)로 추가하고, `/etc/hosts`에 **`192.168.64.6 mastodon-install.test # MASTODON-INSTALL-LAB-20261026`**을 임시 추가했습니다. 사용자 보고 출력에서 `dscacheutil`은 실험 도메인을 기대 IP로 해석했으나, 첫 `/usr/bin/curl` HTTPS 검사에서는 **`curl: (60) unable to get local issuer certificate`**로 중단됐습니다.

이후 **설정 변경 없이** 읽기 전용 진단을 진행했습니다. Mac의 `/usr/bin/curl`은 기본 LibreSSL 외에 SecureTransport를 선택할 수 있는 구성이었고, 같은 호스트에 대해 명시적 `--cacert`를 사용한 HTTPS는 `OK`, `CURL_SSL_BACKEND=secure-transport /usr/bin/curl -q`로 실행한 **macOS 키체인 신뢰 HTTPS도 `OK`**였습니다. `security user-trust-settings-enable` 출력은 사용자 신뢰 설정의 활성화를 나타냈습니다.

**후속 판정(2026-10-26):** 동일한 Mac에서 `CURL_SSL_BACKEND`를 지정하지 않은 두 호출(`curl -q`, 기본 `curl`)은 모두 `curl: (60) unable to get local issuer certificate`로 실패했습니다. 따라서 `.curlrc` 사용 여부는 원인이 아니었습니다. macOS `/usr/bin/curl -V`가 보여준 `libcurl/8.7.1 (SecureTransport) LibreSSL/3.3.6`에서 **괄호 밖 LibreSSL은 기본 TLS 백엔드이고 SecureTransport는 선택 가능한 다른 백엔드**입니다. 공식 curl 설명에 따르면 `CURL_SSL_BACKEND=secure-transport`로 백엔드를 지정할 수 있으며, SecureTransport는 macOS의 인증서 신뢰 설정을 사용합니다. 따라서 이전 테스트에서 `SecureTransport` 강제 선택 시 `OK`, 기본 LibreSSL에서 오류 60이 나온 현상과 부합합니다. 출처: [curl TLS 백엔드 문서](https://everything.curl.dev/usingcurl/tls/backends.html), [curl 개발자 설명](https://curl.se/mail/lib-2025-01/0048.html). **이는 Safari 브라우저 로그인이 성공했다는 판정이 아닙니다.** 서버나 CA를 재발급할 이유는 없으며 기존에 추가한 인증서·hosts를 중복 설치하지 않습니다. 최종 실험 뒤에는 해당 임시 설정만 제거할 예정입니다.

## 12. Checkpoint 24-11B Safari 로그인 확인

실험자는 Mac의 `mastodon-install.test` 접근 설정 이후 비밀번호 파일에서 암호를 출력 없이 클립보드로 복사했으며, 기존 Mac zsh에서 `case`의 `!` 히스토리 확장 오류를 피하도록 검사식을 수정했습니다. 이어서 **Safari 로그인 성공을 보고**했습니다. 브라우저 화면·세션 내부 관리자 권한은 별도 진단 로그로 검증하지 않았으므로, 본 항목은 **사용자 보고에 따른 실사용 로그인 성공**으로 명시합니다. 임시 Caddy 로컬 CA의 Mac 로그인 키체인 신뢰와 `/etc/hosts` 실험 도메인 설정은 아직 유지 중이며, 후속 브라우저 실험 완료 후 해당 항목만 원상복구할 예정입니다.

## 13. Checkpoint 24-12 실제 게시물·미디어 저장 검사

`mastodon-install-lab`에서 체크포인트 검증 명령을 실행했으며 PostgreSQL·Redis·Web·Sidekiq·Streaming의 **다섯 컨테이너 모두 healthy**, 호스트 Caddy **active**를 확인했습니다. PostgreSQL의 `mastodon_production` DB에서 로컬 `labadmin` 계정의 일반 상태(status) 레코드 **2개**, 같은 계정에 귀속되고 `status_id`가 설정된 미디어 첨부 **1개**를 확인했습니다. 호스트 `public/system` 아래 실파일의 존재도 검증했습니다. Redis `stat:processed` 카운터는 **145**였습니다.

**검증의 한계:** 이번 검사로 DB 레코드·미디어 파일 보존과 Sidekiq 누적 처리 지표는 확인되지만, 특정 이미지 변환 작업의 성공이나 브라우저에서의 실제 표시까지 자동으로 검증한 것은 아닙니다. 사용자가 본 Safari 이미지 표시, 관리자 대시보드 화면 성공에 대한 독립 출력도 제공되지 않았습니다. 실험 VM에서 실수로 실행된 `mustard-r2-batch-runner.sh`의 권한 변경·문법 검사·SHA-256 출력은 파일 부재로 모두 실패했으며, 이 R2 유지보수 스크립트는 별도 서버 작업에 속하므로 이 VM의 Mastodon 검사와 무관합니다.

## 14. Checkpoint 24-13A 재부팅 전 영속성 기준점

전용 `mastodon-install-lab`의 읽기 전용 검사에서 **Docker와 Caddy 모두 `enabled` 및 `active`**, Docker Compose 프로젝트 `mastodon-install`의 DB·Redis·Web·Sidekiq·Streaming **다섯 컨테이너 모두 `healthy`이고 재시작 정책은 모두 `always`**였습니다. PostgreSQL `./postgres14`, Redis `./redis`, Web·Sidekiq 공유 미디어 `./public/system`의 실제 Docker 바인드 마운트를 비교하여 영속 경로가 정확히 연결됐음을 확인했습니다.

재부팅 전 DB 기준점은 다음과 같습니다.

| 지표 | 재부팅 전 실측 |
| --- | ---: |
| 로컬 `labadmin` 계정 | 1 |
| 로컬 `labadmin`의 일반 게시물 | 2 |
| 해당 계정의 게시물에 연결된 미디어 | 1 |
| `schema_migrations` 항목 | 615 |

`.env.production`과 `.env.postgres` 권한은 각각 `600`, 실제 `public/system` 미디어 파일이 존재했고 게스트 HTTPS `/health` 응답은 `OK`였습니다. **이것은 자동 재기동과 데이터 보존의 사전 조건을 확인한 결과이며, 실제 재부팅 후 복구 성공을 의미하지 않습니다.** 후속 Checkpoint 24-13B에서 비교해야 합니다.

## 15. Checkpoint 24-13B 실제 재부팅 후 자동 복구 검증

전용 `mastodon-install-lab`에서 부팅 ID·비밀 설정 파일의 체크섬을 비공개 파일에 저장한 뒤 **`sudo systemctl reboot`로 실제 VM 재부팅**했습니다. SSH 연결이 종료된 후 같은 VM으로 재접속했고, `docker compose up` 같은 수동 재시작 없이 읽기 전용 검사를 수행했습니다.

| 항목 | 재부팅 후 관찰 |
| --- | --- |
| Linux 부팅 ID | 재부팅 전과 달라 실제 재부팅 확인 |
| Docker·Caddy | 자동 시작 후 모두 `active` |
| DB·Redis·Web·Sidekiq·Streaming | 모두 `healthy` |
| 관리자·게시물·첨부 미디어·마이그레이션 | **`1|2|1|615`**, 24-13A 기준점과 일치 |
| PostgreSQL `pg_hba_file_rules` | 호스트 규칙 5개 / 비SCRAM 규칙 0개 |
| `.env.production`, `.env.postgres` | 기록된 SHA-256과 두 파일 모두 일치 (`OK`) |
| 미디어 저장소 | 실제 파일 보존 확인 |
| Redis | `PONG` |
| Caddy HTTPS Web / Streaming | 두 Health 엔드포인트 모두 `OK` |

**판정:** VM의 실제 부팅 이후 Docker와 Caddy의 자동 서비스 복구, PostgreSQL SCRAM 규칙과 핵심 DB 데이터·비밀 설정 파일·미디어 보존 및 HTTP 헬스체크를 실증했습니다. 별도 VM에 암호화 백업을 복원하는 **독립 재해 복구(DR)** 성공과는 다른 검사입니다. 또한 Safari에서의 재부팅 후 로그인 상태 및 원본·썸네일 미디어 표시 여부는 아직 별도 확인이 필요합니다.

## 16. Checkpoint 24-13C 재부팅 후 Safari 실사용 확인

재부팅 후 자동 복구(24-13B)의 인프라 로그 검증을 마친 다음, 사용자는 Safari에서 이전 안내의 네 가지 검사항목—**HTTPS 접근, 기존 관리자 세션 또는 재로그인, 작성한 게시물 2개와 첨부 이미지 표시, 관리자 대시보드 접근**—이 모두 정상이라고 보고했습니다. 브라우저 화면을 직접 수집한 검증과 구분하여 **사용자 확인에 따른 실사용 통과**로 기록합니다.

임시 Mac 로그인 키체인의 테스트 CA 신뢰와 `/etc/hosts`의 `192.168.64.6 mastodon-install.test # MASTODON-INSTALL-LAB-20261026` 항목은 24-13C 시점에 유지돼 있었습니다. **정확히 해당 실험용 CA와 hosts 항목만 제거하고 검증하는 정리 작업은 다음 체크포인트**입니다. 공개 루트 인증서의 SHA-256은 `b573d28ca562ea30284e3218db74298222a0a50b24d805530a186d6033c8b07b`이며, Mac의 다른 `mastodon.test` 환경과 CA, VM의 사설키, 원본/DR/운영 서버 설정은 변경하지 않습니다.

## 17. Checkpoint 24-14 Mac 임시 CA/hosts 설정 정리

실험자는 Mac에서 실험용 Caddy 공개 루트 CA 파일의 SHA-256 **`b573d28ca562ea30284e3218db74298222a0a50b24d805530a186d6033c8b07b`**와 로그인 키체인에 일치하는 인증서가 하나 존재함을 검사했습니다. `/etc/hosts`에서 **`192.168.64.6 mastodon-install.test # MASTODON-INSTALL-LAB-20261026`** 항목도 한 건임을 확인했습니다. 그 뒤 해당 인증서에 대한 사용자 신뢰 및 로그인 키체인 인증서를 `security delete-certificate`로 삭제하고, `/etc/hosts`를 별도 파일에 백업한 뒤 실험용 줄만 제거했습니다. DNS 캐시를 새로고침하고, 해당 줄과 해당 인증서 지문이 더는 나타나지 않는 것을 검증했습니다. 클립보드의 실험 비밀번호도 다른 문자열로 덮어썼습니다.

**판정:** 출력에 `CHECKPOINT 24-14 MAC CLEANUP PASSED`가 확인됐습니다. 그 외 `mastodon.test` 등 다른 실험 환경의 hosts 및 인증서 항목은 변경 대상이 아니었습니다. Mac에는 공개 CA 파일과 `/etc/hosts` 정리 전 백업이 남아 있고, 새 실험 VM의 Caddy 인증서와 비밀키·기존 계정은 건드리지 않았습니다. GitHub에 비밀값이나 Mac의 실제 키체인 데이터를 기록하지 않았습니다.

## 18. Checkpoint 24-15A 백업 준비 점검

전용 `mastodon-install-lab`에서 DB·Redis·Web·Sidekiq·Streaming이 모두 **healthy**, Caddy가 **active**임을 확인했습니다. `gpg`, `tar`, `gzip`, `sha256sum`, `mktemp`가 설치됐고 PostgreSQL 14 컨테이너의 **`pg_dump 14.24`**가 사용 가능했습니다.

| 항목 | 관찰값 |
| --- | ---: |
| PostgreSQL `postgres14` 저장 디렉터리 | 58MB |
| Redis `redis` 저장 디렉터리 | 100KB |
| 미디어 `public/system` 저장 디렉터리 | 124KB |
| 루트 파일시스템 가용 공간 | 약 26GB |
| 앱 관리자·게시물·미디어 DB 기록 | `1|2|1` |

`.env.production`, `.env.postgres`는 일반 파일이고 권한 `600` 및 Git 제외가 확인됐으며 `public/system`에 실제 파일이 있었습니다. **이 검사는 읽기 전용으로 실행됐고 백업 파일은 아직 생성되지 않았습니다.** 다음 단계에서는 PostgreSQL 커스텀 논리 덤프·미디어·필수 환경변수·설정 파일을 암호화하고 원본 VM의 구성을 변경하지 않는 방식을 시험합니다. 원본 DB 디렉터리 복사만으로 일관된 온라인 백업이 된다고 가정하지 않습니다.

## 19. Checkpoint 24-15B 암호화 아카이브 생성 및 검증

전용 `mastodon-install-lab`에서 핵심 서비스 5개가 모두 `healthy`, Caddy가 `active`임을 확인하고, PostgreSQL 14 이미지 내부 `pg_dump -Fc`로 `mastodon_production`의 **커스텀 형식 논리 덤프**를 만들었습니다. 덤프의 `PGDMP` 형식을 확인하고, Caddy 설정·복구용 메타데이터·미디어 파일·권한 `600`인 `.env.production` 및 `.env.postgres`·공식 Compose와 SCRAM 오버라이드를 `tar`로 묶어 **GPG AES-256 대칭키 방식으로 암호화**했습니다. Redis 캐시 및 Caddy 로컬 CA 개인키는 제외했습니다.

**실측 결과:** `Encrypted archive: CREATED`, `Encrypted archive: DECRYPTION VERIFIED`, `Required archive members: VERIFIED`, `CHECKPOINT 24-15B ENCRYPTED BACKUP PASSED`. 아카이브 파일은 `mastodon-install-20261026T022203Z.tar.gpg`, 크기는 **492KB**, SHA-256은 `9f97177c3d0e3b4307382f9bfb8a2731549ca26b109a7f0ba396c5b9d2bf7962`였습니다. **해시와 파일명만 공개**하고 비밀번호·암호화 키·환경 파일 값은 공개하지 않았습니다.

**검증의 한계:** 원본 VM에서 암호화 아카이브가 복호화되고 필수 구성원이 존재하는 것까지 검사했습니다. **실제 `pg_restore`, 원본 계정 로그인 및 별도 VM에서의 독립 복원은 아직 통과하지 않았습니다.** `pg_dump`는 PostgreSQL의 글로벌 역할 자체를 내보내지 않으므로 대상 VM에 `mastodon` 역할과 데이터베이스를 마련해야 합니다. DB와 미디어를 실행 중에 채집했으므로 지속적인 쓰기가 있는 운영 환경에서의 DB/파일 간 시점 일치를 자동 보장하지 않는다는 점도 명시합니다. 백업 암호는 별도 비밀번호 관리자에 보관하고, 일반 파일 삭제가 SSD의 평문 잔존을 완전히 제거한다고 간주하지 않습니다.

## 20. 아직 '통과'라고 선언하면 안 되는 항목

- 특정 Sidekiq 개별 작업 성공 여부의 독립적 검증
- 암호화 아카이브의 Mac 보관 및 **독립 복원**
- 새 설치 절차를 외부 독자가 다른 환경에서 재현할 수 있는지

위 항목을 실제 새 VM에서 확인한 **명령과 출력**이 있어야 검증 상태를 바꿉니다. 기존 Checkpoint 21~23의 DR 복구 성공과 혼동하지 않습니다.

## 공식 출처와 연계 문서

- [Mastodon v4.7.3 Compose](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [Mastodon v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)
- [Mastodon v4.7.3 DB 설정](https://github.com/mastodon/mastodon/blob/v4.7.3/config/database.yml)
- [Docker Official Postgres 이미지의 인증·초기화](https://hub.docker.com/_/postgres)
- [Mastodon 설정 공식 문서](https://docs.joinmastodon.org/admin/config/)
- [05A. 최초 설치 실측 흐름](05a-utm-verified-installation.md)
