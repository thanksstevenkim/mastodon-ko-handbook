# 05B. 신규 설치의 비밀키·PostgreSQL 인증 안전화 실험

> **검증 상태: 신규 VM의 설치 기반·PostgreSQL SCRAM 인증·앱 역할·필수 키 존재 및 DB 스키마 초기화 검증 통과 (Checkpoint 24-2~24-7, 2026-10-26).** 새 `mastodon-install-lab`에서 SCRAM TCP 인증·앱 계정 권한·필수 키 6개와 Rails 초기 스키마를 검증했습니다. **Web·Sidekiq·Streaming 최초 실행, HTTPS 로그인, 신규 실험 VM 재부팅·독립 복원은 아직 미검증**입니다. 기존 `mastodon-lab`·`mastodon-dr-lab`·실제 운영 서버는 변경하지 않았습니다.

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

## 7. 아직 '통과'라고 선언하면 안 되는 항목

- Web·Sidekiq·Streaming 최초 기동, Health 검사, 미디어 바인드 마운트 및 쓰기 권한
- 브라우저 HTTPS 로그인, 게시물·이미지 저장 및 백그라운드 작업의 실제 동작
- 별도 실험 VM 재부팅 후 영속성·백업 복원
- 새 설치 절차를 외부 독자가 다른 환경에서 재현할 수 있는지

위 항목을 실제 새 VM에서 확인한 **명령과 출력**이 있어야 검증 상태를 바꿉니다. 기존 Checkpoint 21~23의 DR 복구 성공과 혼동하지 않습니다.

## 공식 출처와 연계 문서

- [Mastodon v4.7.3 Compose](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [Mastodon v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)
- [Mastodon v4.7.3 DB 설정](https://github.com/mastodon/mastodon/blob/v4.7.3/config/database.yml)
- [Docker Official Postgres 이미지의 인증·초기화](https://hub.docker.com/_/postgres)
- [Mastodon 설정 공식 문서](https://docs.joinmastodon.org/admin/config/)
- [05A. 최초 설치 실측 흐름](05a-utm-verified-installation.md)
