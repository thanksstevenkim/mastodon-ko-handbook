# 05B. 신규 설치의 비밀키·PostgreSQL 인증 안전화 실험

> **검증 상태: 설계 및 공식 소스 대조 완료 / 독립 신규 VM 실행 미검증 (Checkpoint 24-2, 2026-10-26).** 이 문서의 명령은 Mastodon v4.7.3과 PostgreSQL 14 공식 이미지의 설정을 대조해 마련한 **다음 실험안**입니다. 기존 `mastodon-lab`·`mastodon-dr-lab`·실제 운영 서버에서는 실행하지 않습니다. 별도의 **완전히 빈 Ubuntu VM**에서 결과를 확인한 뒤에만 '테스트 검증'으로 변경합니다.

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

실험자는 새 DB의 관리용 `psql` 세션 안에서 다음 순서로 작업합니다(`\password`는 psql의 대화형 메타명령입니다).

```text
CREATE ROLE mastodon LOGIN;
\password mastodon
CREATE DATABASE mastodon_production OWNER mastodon;
\q
```

설정한 앱 전용 비밀번호와 `.env.production`의 `DB_PASS`가 일치해야 합니다. 일반적인 `CREATE ROLE ... PASSWORD '...'`를 터미널 기록이나 공개 로그에 직접 쓰는 방법은 피합니다. 실제 새 VM에서 `psql` 대화형 비밀번호 입력과 SCRAM 호스트 연결을 시험한 뒤, 호스트에서 실행할 안전한 검사 명령까지 확정할 예정입니다.

Mastodon 앱 키는 **v4.7.3 이미지 내부의 공식 생성 작업**을 사용합니다.

| 용도 | 생성 작업 | 검증 계획 |
| --- | --- | --- |
| Rails 앱 키 | `bundle exec rails secret` | 키 존재 및 새 값 여부 확인, 값은 출력 금지 |
| Active Record 암호화 키 3개 | `bin/rails db:encryption:init` | 이름·개수 확인, 값은 출력 금지 |
| VAPID 개인키·공개키 | `bundle exec rails mastodon:webpush:generate_vapid_key` | 두 변수 모두 저장됐는지 확인, 값은 출력 금지 |

출력에서 호스트 파일로 값을 옮길 때 **일회성 컨테이너 내부 파일이 그대로 저장된다고 가정하지 않습니다.** 생성 출력의 취급, 원자적 호스트 파일 기록, 재실행 방지, 정상/오류 경로는 실제 새 VM에서 검증할 예정이므로 아직 범용 복사 실행 명령으로 제시하지 않습니다.

## 5. 아직 '통과'라고 선언하면 안 되는 항목

- SCRAM 인증으로 PostgreSQL 초기화 후 **잘못된 비밀번호가 거부되고 올바른 비밀번호가 허용되는지**
- 앱 역할이 DB 슈퍼유저가 아닌지 및 앱의 정상 접속이 가능한지
- 환경 파일이 권한 600으로 보관되고 앱 생성 키가 호스트에 정확히 저장되는지
- 신규 DB 마이그레이션, Web·Sidekiq·Streaming의 서비스 헬스와 로그인
- 별도 실험 VM 재시작 후 영속성·백업 복원

위 항목을 실제 새 VM에서 확인한 **명령과 출력**이 있어야 검증 상태를 바꿉니다. 기존 Checkpoint 21~23의 DR 복구 성공과 혼동하지 않습니다.

## 공식 출처와 연계 문서

- [Mastodon v4.7.3 Compose](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [Mastodon v4.7.3 환경변수 샘플](https://github.com/mastodon/mastodon/blob/v4.7.3/.env.production.sample)
- [Mastodon v4.7.3 DB 설정](https://github.com/mastodon/mastodon/blob/v4.7.3/config/database.yml)
- [Docker Official Postgres 이미지의 인증·초기화](https://hub.docker.com/_/postgres)
- [Mastodon 설정 공식 문서](https://docs.joinmastodon.org/admin/config/)
- [05A. 최초 설치 실측 흐름](05a-utm-verified-installation.md)
