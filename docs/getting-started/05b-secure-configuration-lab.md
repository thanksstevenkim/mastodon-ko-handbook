# 05B. 신규 설치의 비밀키·PostgreSQL 인증 안전화 실험

> **검증 상태: 신규 VM의 설치 기반·PostgreSQL SCRAM 인증·앱 역할·필수 키·DB 스키마·핵심 서비스·서버/독립 Mac HTTPS·최초 Owner 생성 검증 통과 (Checkpoint 24-2~24-11A, 2026-10-26).** 새 `mastodon-install-lab`에서 SCRAM TCP 인증·앱 계정 권한·필수 키 6개·Rails 초기 스키마, 핵심 서비스 헬스체크 및 Caddy HTTPS를 검증했습니다. Mac에서 별도 공개 루트 CA로 Web·Streaming·홈페이지 HTTPS 연결도 확인했습니다. **Safari 브라우저 신뢰·실제 로그인·신규 실험 VM 재부팅·독립 복원은 아직 미검증**입니다. 기존 `mastodon-lab`·`mastodon-dr-lab`·실제 운영 서버는 변경하지 않았습니다.

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

이후 **설정 변경 없이** 읽기 전용 진단을 진행했습니다. Mac 기본 curl은 SecureTransport 기반이며, 같은 호스트에 대해 명시적 `--cacert`를 사용한 HTTPS는 `OK`, `CURL_SSL_BACKEND=secure-transport /usr/bin/curl -q`로 실행한 **기본 신뢰 HTTPS 역시 `OK`**였습니다. `security user-trust-settings-enable` 출력은 사용자 신뢰 설정의 활성화를 나타냈습니다.

**후속 판정(2026-10-26):** 동일한 Mac에서 `CURL_SSL_BACKEND`를 지정하지 않은 두 호출(`curl -q`, 기본 `curl`)은 모두 `curl: (60) unable to get local issuer certificate`로 실패했습니다. 따라서 `.curlrc` 사용 여부는 원인이 아니었습니다. macOS `/usr/bin/curl -V`가 보여준 `libcurl/8.7.1 (SecureTransport) LibreSSL/3.3.6`에서 **괄호 밖 LibreSSL은 기본 TLS 백엔드이고 SecureTransport는 선택 가능한 다른 백엔드**입니다. 공식 curl 설명에 따르면 `CURL_SSL_BACKEND=secure-transport`로 백엔드를 지정할 수 있으며, SecureTransport는 macOS의 인증서 신뢰 설정을 사용합니다. 따라서 이전 테스트에서 `SecureTransport` 강제 선택 시 `OK`, 기본 LibreSSL에서 오류 60이 나온 현상과 부합합니다. 출처: [curl TLS 백엔드 문서](https://everything.curl.dev/usingcurl/tls/backends.html), [curl 개발자 설명](https://curl.se/mail/lib-2025-01/0048.html). **이는 Safari 브라우저 로그인이 성공했다는 판정이 아닙니다.** 서버나 CA를 재발급할 이유는 없으며 기존에 추가한 인증서·hosts를 중복 설치하지 않습니다. 최종 실험 뒤에는 해당 임시 설정만 제거할 예정입니다.

## 12. 아직 '통과'라고 선언하면 안 되는 항목

- Mac 키체인 및 브라우저 이름 해석을 임시로 설정한 뒤 Safari에서 실제 관리자 로그인
- 게시물·이미지 저장 및 Sidekiq 백그라운드 작업의 실제 기능
- 별도 실험 VM 재시작 후 영속성·백업 복원
- 새 설치 절차를 외부 독자가 다른 환경에서 재현할 수 있는지

위 항목을 실제 새 VM에서 확인한 **명령과 출력**이 있어야 검증 상태를 바꿉니다. 기존 Checkpoint 21~23의 DR 복구 성공과 혼동하지 않습니다.

## 공식 출처와 연계 문서

- [Mastodon v4.7.3 Compose](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [Mastodon v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)
- [Mastodon v4.7.3 DB 설정](https://github.com/mastodon/mastodon/blob/v4.7.3/config/database.yml)
- [Docker Official Postgres 이미지의 인증·초기화](https://hub.docker.com/_/postgres)
- [Mastodon 설정 공식 문서](https://docs.joinmastodon.org/admin/config/)
- [05A. 최초 설치 실측 흐름](05a-utm-verified-installation.md)
