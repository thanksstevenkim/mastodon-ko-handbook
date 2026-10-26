# 05. Mastodon 최초 설치: 필요한 작업만 따라가기

> **대상:** 새 Ubuntu 서버에 **공식 Mastodon v4.7.3 + Docker Compose**를 처음 설치할 때의 안내입니다. 이 버전의 UTM 실측이 근거이며, 공인 도메인·실제 SMTP를 사용하는 인터넷 운영은 환경별 확인이 추가로 필요합니다. **기존 서버 업그레이드·복구에는 사용하지 마세요.**

[← 04. Docker Compose](04-docker-compose.md) · [05B. 필수 보안 설정](05b-secure-configuration.md) · [06. 첫날 점검 →](06-first-day-checklist.md)

## 설치 전 확인

- [02. 서버 준비](02-prerequisites.md): Ubuntu·SSH·저장 공간·백업 위치
- [03. 도메인·HTTPS·메일](03-domain-and-dns.md): 오래 사용할 `LOCAL_DOMAIN`, DNS, 실제 SMTP
- [04. Docker Compose](04-docker-compose.md): Docker Engine/Compose, 서비스별 볼륨과 포트
- [05B. 보안 설정](05b-secure-configuration.md): **PostgreSQL SCRAM, DB 역할, 비밀키**
- 사용할 Mastodon 릴리스의 [공식 설치 문서](https://docs.joinmastodon.org/admin/install/)와 [릴리스 노트](https://github.com/mastodon/mastodon/releases) 확인

**운영 중인 DB·볼륨이 이미 있다면 이 설치를 진행하지 마세요.** 아래 예시는 처음부터 비어 있는 서버만 전제로 합니다.

## 1. 동일한 버전의 소스·Compose 준비

새 작업 디렉터리를 만들고 사용하려는 릴리스의 공식 설정을 확인합니다. 다음은 검증했던 `v4.7.3` 예시입니다.

```bash
git clone --branch v4.7.3 --depth 1 https://github.com/mastodon/mastodon.git mastodon
cd mastodon
git describe --tags --exact-match
```

`docker-compose.yml`의 이미지 태그와 `.env.production.sample`이 같은 릴리스에 해당하는지 확인하세요. 다른 버전을 설치한다면 **릴리스 번호와 공식 지침을 함께 교체**해야 합니다.

## 2. DB·Redis·비밀 설정 준비

1. 호스트에 `.env.production`을 만들고 `LOCAL_DOMAIN`, `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PASS`, `REDIS_HOST`, 암호화 키·VAPID 키·메일 설정을 확정합니다. **이 파일은 `chmod 600`으로 보호**합니다.
2. PostgreSQL과 앱의 비밀번호를 분리하고 [05B 보안 설정](05b-secure-configuration.md)에 따라 신규 DB의 SCRAM 인증과 앱 전용 DB 역할을 준비합니다.
3. 로컬 미디어 저장소를 사용할 경우 `public/system`의 영속 저장 경로와 이미지 실행 사용자의 쓰기 권한을 확인합니다.
4. 선택하지 않은 S3·Elasticsearch는 환경 설정에서 비활성화합니다.

**비밀값을 README나 공개 터미널 로그에 붙여 넣지 마세요.** 설정 자동 생성 명령이 컨테이너 안에 만든 파일은 별도 마운트 없이는 호스트에 보존되지 않을 수 있습니다.

## 3. DB·Redis부터 시작

`compose.auth.lab.yml`을 보안 설정 가이드의 예시 이름으로 사용했다면, 이후 Compose 명령에 동일한 파일을 계속 지정해야 합니다. 다음 예제에서는 편의를 위해 공통 옵션을 사용합니다.

```bash
# 실제 프로젝트 디렉터리에서, 실제 오버라이드 파일 이름으로 실행
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml config --quiet
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml up -d db redis
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml ps db redis
```

PostgreSQL·Redis가 준비되면 `pg_isready`와 `redis-cli ping`으로 상태를 확인합니다. **컨테이너가 Started라고 해서 DB 초기화와 연결까지 완료된 것은 아닙니다.**

## 4. 신규 DB 스키마 준비

**앱 로그인 역할과 빈 `mastodon_production` DB가 준비된 경우에만**, 해당 릴리스가 제공하는 초기화 절차를 수행합니다. v4.7.3 UTM 실험에서는 다음 명령을 사용했습니다.

```bash
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml \
  run --rm --no-deps web bundle exec rails db:migrate:setup
```

데이터가 이미 있는 DB에 재실행하지 마세요. 성공 후 앱의 계정·역할 관련 테이블이 준비됐는지 확인합니다.

## 5. Web·Sidekiq·Streaming 시작

미디어 저장 디렉터리 권한과 HTTPS 리버스 프록시 구성을 확인한 뒤 핵심 서비스를 시작합니다.

```bash
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml \
  up -d web sidekiq streaming
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml ps
```

실제 리버스 프록시는 **Web(기본 내부 3000)과 Streaming(기본 내부 4000)**을 올바르게 분기해야 합니다. PostgreSQL·Redis는 인터넷에 공개하지 않습니다. 컨테이너 내부 헬스체크뿐 아니라 실제 HTTPS 접속을 확인하세요.

## 6. 관리자 계정 만들기

선택한 Mastodon 릴리스의 `tootctl accounts create`로 관리자 계정을 만들고 **실제로 수신할 수 있는 이메일 주소**를 사용합니다. 최초 발급 비밀번호는 공개 출력·채팅·Git 저장소에 남기지 않고 개인 보관합니다.

`.test` 도메인에서 사용한 이메일 허용 목록 예외는 **로컬 실험 전용**이며 공개 운영 서버에 그대로 적용하지 않습니다. 관리자 로그인과 비밀번호 재설정 메일이 실제로 동작하는지 확인하세요.

## 7. 설치 후 최소 확인

```bash
sudo docker compose -f docker-compose.yml -f compose.auth.lab.yml ps
```

이어서 **HTTPS 페이지 → 관리자 로그인 → 게시물 작성 → 이미지 업로드 → 메일 수신** 순서로 확인하면 됩니다. 첫날 필수 체크리스트는 [06. 첫날 점검](06-first-day-checklist.md)에 모았습니다.

---

**이것이 기본 설치 경로의 끝입니다.** 백업·업데이트는 [운영 문서](../operations/backup-readiness.md)를, 우리가 사용한 UTM VM·암호화 백업·독립 복원·명령 오류 분석은 [Labs](../labs/README.md)를 필요할 때만 참고하세요. **설치하기 위해 VM 네 개나 수십 개의 체크포인트를 만들 필요는 없습니다.**
