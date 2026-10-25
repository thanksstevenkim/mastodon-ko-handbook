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

**검증 상태: Docker Compose로 실행한 PostgreSQL에서 전용 역할·DB 생성과 SQL 연결까지 검증. Rails 마이그레이션 및 서비스 전체 기동은 아직 미검증.**

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
