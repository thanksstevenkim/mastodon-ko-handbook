# 05B. 최초 설치의 필수 보안 설정

> **적용 대상:** Ubuntu + Docker Compose로 **새 Mastodon 4.7.3 서버와 빈 PostgreSQL 14 데이터 디렉터리**를 준비할 때의 설정 원칙입니다. 이미 운영 중인 서버의 인증 방식이나 비밀키를 이 절차로 다시 초기화하지 마세요.

[← 05. 최초 설치](05-initial-setup.md) · [06. 설치 후 점검 →](06-first-day-checklist.md) · [상세 실험 근거](../labs/secure-install-and-restore-20261026.md)

## 1. 비밀 설정을 안전하게 분리하기

- Mastodon용 `.env.production`에는 `DB_PASS`, `SECRET_KEY_BASE`, Active Record 암호화 키 3종, VAPID 키 쌍을 보관합니다.
- PostgreSQL 최초 초기화용 `.env.postgres`의 `POSTGRES_PASSWORD`는 **별도의 값**으로 준비해 DB 서비스에만 전달합니다.
- 비밀 파일의 호스트 권한은 `600`으로 제한하고, Git 저장소·공개 로그·화면 공유에 노출하지 않습니다.
- 공식 v4.7.3 환경변수 샘플에 맞춰 비밀값을 생성합니다. **구버전 `OTP_SECRET`은 v4.7.3 필수 변수가 아닙니다.**
- 이미 운영 중인 서버의 암호화 키를 임의로 새 값으로 바꾸지 않습니다.

## 2. PostgreSQL의 새 데이터 디렉터리를 SCRAM 인증으로 초기화하기

공식 v4.7.3 Compose 예제의 DB 설정을 그대로 복사하기보다, 신규 설치의 PostgreSQL 인증을 명시합니다. 아래는 **기존 `docker-compose.yml`과 함께 쓰는 오버라이드의 핵심 부분**입니다.

```yaml
# 신규/빈 PostgreSQL 데이터 디렉터리 전용
services:
  db:
    env_file:
      - .env.postgres
    environment:
      POSTGRES_HOST_AUTH_METHOD: scram-sha-256
      POSTGRES_INITDB_ARGS: --auth-host=scram-sha-256
```

`.env.postgres`에는 `POSTGRES_PASSWORD`를 별도로 안전하게 준비해야 합니다. 예제의 `trust` 기반 호스트 인증을 그대로 사용하지 않는 것이 이 구성의 목적입니다.

**중요:** PostgreSQL 공식 Docker 이미지의 초기화 환경변수는 **빈 데이터 디렉터리에서만** 인증 설정을 초기화합니다. 기존 운영 볼륨에 이 YAML을 덮어쓴다고 인증 방식이 바뀌지 않습니다.

## 3. Mastodon 전용 DB 역할 준비

- PostgreSQL 슈퍼유저 `postgres`와 앱 계정 `mastodon`을 분리합니다.
- 신규 DB에 `mastodon` 역할을 만들고 `\password mastodon`과 같은 비밀번호 입력 절차를 통해 암호를 설정한 후, `mastodon_production` 데이터베이스를 앱 역할 소유로 준비합니다.
- `.env.production`의 `DB_HOST=db`, `DB_USER=mastodon`, `DB_NAME=mastodon_production`, `DB_PASS`가 **실제 생성한 DB와 일치**해야 합니다.
- Redis 서비스명이 `redis`이면 `REDIS_HOST=redis`를 사용합니다. DB·Redis의 포트를 인터넷에 공개하지 않습니다.

역할 생성·DB 생성은 **빈 신규 설치에 한 번만** 수행합니다. 기존 DB를 복원하는 경우에는 계정·스키마 생성 순서가 다르며, `db:migrate:setup`을 기존 데이터에 적용하지 마세요.

## 4. 핵심 확인만 하기

설정을 마친 **프로젝트 디렉터리에서** 다음을 사용합니다.

```bash
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml config --quiet
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml ps
```

`compose.auth.lab.yml`은 **위 오버라이드를 저장한 경우의 파일명 예시**입니다. 실제 선택한 이름을 사용하세요. Compose의 `config --quiet`는 문법과 병합을 검사할 뿐 비밀번호 인증까지 보증하지는 않습니다.

PostgreSQL에서 인증 방식을 직접 확인할 때는 관리자 권한으로 `pg_hba_file_rules`의 `auth_method`를 점검하고, 비밀번호가 잘못된 TCP 접속이 거부되는지 확인합니다. 자세한 검증 명령과 실제 성공·실패 기록은 [실험 자료](../labs/secure-install-and-restore-20261026.md)에 있습니다.

## 여기까지 하면 충분한가?

보안 설정의 최소 기준을 확보하는 단계이며, **인터넷 공개 준비 전체가 끝났다는 뜻은 아닙니다.** HTTPS, 실제 메일 수신, 계정 로그인, 업로드와 백업은 [첫날 점검](06-first-day-checklist.md)에서 확인하세요.

이 핸드북은 모든 보안 실패 상황을 재현하거나 모든 구성의 안전성을 보증하지 않습니다. [Mastodon 공식 환경 설정](https://docs.joinmastodon.org/admin/config/)과 [대상 버전의 Compose 예제](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)를 함께 보세요.
