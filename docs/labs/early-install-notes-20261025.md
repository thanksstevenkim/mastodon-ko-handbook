# Getting Started에서 분리한 UTM 설치 실측 기록 (2026-10-25)

> **보존 자료:** 기존 기본편 02~06에 들어 있던 실측 사례와 당시 성공·실패 판단을 원문 중심으로 모았습니다. 이 문서는 **초보자의 필수 설치 순서가 아니며**, 각 단락의 '미검증'은 해당 시점의 판단입니다. 이후의 종합 실험은 [UTM 설치 기록](utm-install-v4.7.3.md)과 [별도 안전 설치·복원 실험](secure-install-and-restore-20261026.md)에서 확인하세요.

[실제 설치 가이드로 돌아가기](../getting-started/05-initial-setup.md) · [Labs 목차](README.md) · [핸드북 목차](../../README.md)

## 02. 서버 준비에 있던 실측 사례

## 실측 사례: UTM에서 Ubuntu Server ARM64 설치 (2026-10-25)

**검증 상태: 해당 실험 환경에서 확인 완료.** 아래는 보편적인 권장 사양이 아니라, 한 대의 Apple Silicon 맥북에서 UTM 가상화로 실제 확인한 값입니다.

| 항목 | 실측 결과 |
| --- | --- |
| 게스트 OS | Ubuntu Server 24.04.5 LTS |
| 아키텍처 | `aarch64` |
| 호스트 이름 | `mastodon-lab` (실험용 이름) |
| 네트워크 | UTM Shared Network(NAT), DHCP 연결 확인 |
| SSH | `systemctl is-active ssh` → `active`; 맥북 터미널에서 접속 성공 |
| 게스트 메모리 | 약 5.8 GiB, Swap 4 GiB |
| 가상 디스크 | 80 GiB |
| 루트 파일시스템 | LVM 위 ext4, 온라인 확장 후 `df -h /` → 약 76 GiB |
| 원복 준비 | Docker 설치 전에 원본 VM 복제본 보관 |

### 설치 시 LVM 공간이 절반만 보인 사례

Ubuntu Server 자동 파티셔닝 결과, 80 GiB 가상 디스크의 `ubuntu-vg`에는 약 38.47 GiB의 여유 공간이 남아 있었습니다. 루트 논리 볼륨은 처음에 약 38.47 GiB만 사용했습니다. **디스크의 나머지 용량이 사라진 것은 아니었습니다.**

진단할 때는 먼저 읽기 전용으로 확인합니다.

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
sudo vgs
sudo lvs
findmnt -no SOURCE,FSTYPE /
```

해당 실험에서는 `VFree=38.47g`, 루트 LV가 `/dev/ubuntu-vg/ubuntu-lv`, 루트 파일시스템이 `ext4`임을 확인한 다음 아래 **상태 변경 명령**으로 확장했습니다.

```bash
# 검증된 실험 VM의 LV와 동일할 때만 참고할 것
sudo lvextend -l +100%FREE -r /dev/ubuntu-vg/ubuntu-lv
```

`-l +100%FREE`는 Volume Group의 **남은 모든 공간**을 할당하므로 다른 LV를 만들 공간이 없어집니다. `-r`은 지원되는 파일시스템의 확장도 함께 수행합니다. 실행 전 현재 LV 경로와 파일시스템 종류를 확인하고, 별도 VM 복제본 또는 백업을 준비하세요. **다른 서버에 이 명령을 그대로 실행하지 마세요.**

확장 후 `df -h /`에서 루트 파일시스템 약 76 GiB, 사용 가능 약 66 GiB가 확인됐고, `sudo vgs`의 `VFree`는 0이었습니다. 이 결과는 **Ubuntu 디스크 확장 성공**을 뜻하며 Mastodon 설치 검증을 뜻하지는 않습니다.

---

## 03. 도메인·HTTPS에 있던 실측 사례

## 실측 사례: UTM 로컬 HTTPS 프록시용 Caddy 설치 (2026-10-25)

**검증 상태: Caddy 설치 및 systemd 서비스 실행 확인. `mastodon.test` 리버스 프록시 설정·로컬 인증서 발급·맥북 브라우저 접속은 아직 미검증.**

Mastodon 4.7.3의 Web·Sidekiq·Streaming을 포함한 핵심 컨테이너 다섯 개가 `healthy`이고 Web·Streaming Health가 각각 `OK`인 UTM Ubuntu 24.04.5 ARM64 VM에서 로컬 HTTPS 프록시를 준비했습니다.

- VM의 DHCP 주소: `192.168.64.4/24` (실험 당시 값이며 고정 IP가 아님)
- 설치 전 `ss -ltnp`에서 호스트 TCP 80/443 포트에 바인딩된 서비스 없음
- Caddy 공식 안정 버전 APT 저장소를 등록한 뒤 `caddy` ARM64 패키지 설치
- `caddy version`: `v2.11.7`
- `systemctl is-active caddy`: `active`

이 실험에서는 외부 공개용 TLS 인증서 대신 Caddy의 **`tls internal` 로컬 인증기관**을 사용할 계획입니다. 이 인증기관을 클라이언트의 신뢰 저장소에 등록하는 작업에는 해당 클라이언트에 대한 신뢰 권한이 수반되므로, 루트 인증서를 검증한 다음 필요한 장치에서만 적용해야 합니다.

`mastodon.test`는 예약된 테스트 도메인이므로 공인 DNS·Let's Encrypt·실제 연합 통신을 전제로 하지 않습니다. 공개 서버에서 `LOCAL_DOMAIN`을 선택하고 HTTPS를 설정하는 절차와는 구분하세요.

## 실측 사례: Caddy 로컬 HTTPS 프록시 검사 통과 (2026-10-25)

**검증 상태: UTM VM 내부에서 `mastodon.test`에 대한 Caddy TLS 설정/인증서 검증 및 Web·Streaming HTTPS Health 응답 확인. 맥북 Safari 접근은 아직 미검증.**

기본 Caddyfile을 백업하고, 아래 형태의 **실험 VM 전용** 설정을 적용했습니다.

```caddyfile
{
    auto_https disable_redirects
}

https://mastodon.test {
    bind 192.168.64.4
    tls internal

    @streaming path /api/v1/streaming /api/v1/streaming/*

    handle @streaming {
        reverse_proxy 127.0.0.1:4000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

- `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → `Valid configuration`
- `sudo systemctl reload caddy` 이후 `systemctl is-active caddy` → `active`
- TCP 443 리스너 → `192.168.64.4:443`
- 로컬 CA 공개 인증서 `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt` 존재
- VM 내부에서 `--resolve mastodon.test:443:192.168.64.4 --cacert <root.crt 경로>`를 사용한 HTTPS `/health`, `/api/v1/streaming/health` 모두 → `OK`

`caddy validate`는 설정 들여쓰기 관련 포맷 경고를 보여주었지만 구문 검사는 통과했습니다. `--cacert` 검증은 TLS 체인을 검증한 결과이며, 단순한 `-k` 인증서 무시 테스트가 아닙니다.

**주의:** `192.168.64.4`는 실험 당시 DHCP 주소입니다. `bind` 설정에 고정되므로 주소 변경 시 수정해야 합니다. macOS 브라우저에서 사용하려면 macOS의 이름 해석과 **공개 루트 CA 인증서 신뢰 설정**이 추가로 필요하며, 개인키를 외부로 복사하면 안 됩니다. 별도 로컬 CA를 맥북 시스템 신뢰 저장소에 추가하면 그 CA가 발급한 다른 인증서까지 신뢰하게 되는 보안 영향을 이해해야 합니다. 로컬에서 확인된 HTTPS 성공을 실제 공개 DNS·ACME 인증서 발급·연합 송수신 성공으로 오해하지 마세요.

## 실측 사례: macOS 호스트의 로컬 HTTPS 연결 성공 (2026-10-25)

**검증 상태: macOS에서 UTM VM에 접속하는 로컬 이름 해석 및 Caddy 로컬 CA를 명시한 HTTPS Web Health 응답 확인. Safari에서 시스템 신뢰 인증서를 통한 UI 접속/로그인은 아직 미검증.**

macOS 터미널에서 `scp`를 실행해 Ubuntu VM의 `/home/steven/mastodon-lab-root.crt`를 맥북의 `~/Downloads/mastodon-lab-root.crt`로 복사했습니다. 인증서 파일 크기는 627바이트이며 `openssl x509 -noout -subject -fingerprint -sha256`로 확인한 공개 루트 인증서의 subject는 `Caddy Local Authority - 2026 ECC Root`였습니다. 사용자가 인증서 복사를 성공시킨 후 원격 VM과 Mac 간 지문 일치 여부를 확인하도록 안내했지만 이 대화의 **맥북 로그만으로 양측 지문 대조를 독립적으로 입증할 수는 없습니다.**

맥북의 `/etc/hosts`에 `192.168.64.4    mastodon.test`를 설정하고 `dscacheutil`을 이용해 캐시를 갱신한 뒤, `dscacheutil -q host -a name mastodon.test`에서 해당 IP가 반환되는 것을 확인했습니다.

```bash
curl -fsS --noproxy '*' \
  --cacert ~/Downloads/mastodon-lab-root.crt \
  https://mastodon.test/health
```

실측 응답은 `OK`였습니다. 이는 Mac에서 로컬 CA 인증서를 명시적으로 지정해 Caddy가 제공하는 Mastodon Web의 HTTPS Health에 성공한 결과입니다. `-k`로 검증을 무시한 결과가 아닙니다.

**남은 검증:** macOS 사용자 키체인에 로컬 CA를 신뢰 등록한 뒤 HTTPS Health와 Safari UI 로그인 확인, 실험 계정 비밀번호 변경, 실제 게시·미디어 업로드·Sidekiq 작업 검증. `/etc/hosts`와 사용자 신뢰 설정은 실험 종료 후 정리해야 합니다. **CA 개인키는 복사하지 않습니다.**

---

## 04. Docker Compose에 있던 실측 사례

## 실측 사례: UTM Ubuntu ARM64에서 Docker Engine 검증 (2026-10-25)

**검증 상태: Docker 설치·기본 컨테이너 실행과 Mastodon 공식 이미지의 ARM64 매니페스트 확인. Mastodon 컨테이너 실행은 아직 미검증.**

[02. 서버 준비의 UTM 실측 환경](../getting-started/02-prerequisites.md)에서 Docker 공식 APT 저장소를 이용해 설치한 뒤 다음을 확인했습니다.

| 검사 | 관찰 결과 |
| --- | --- |
| Docker Engine Client/Server | `29.9.2` / `29.9.2` |
| Docker Compose | `v5.6.1` |
| containerd | `2.4.2` |
| Docker 데몬 | `systemctl is-active docker` → `active` |
| Docker 아키텍처 | `sudo docker info --format '{{.Architecture}}'` → `aarch64` |
| `hello-world` | ARM64 이미지 pull 및 컨테이너 실행 성공; `Hello from Docker!` 출력 |

기본 검증 명령은 다음과 같습니다.

```bash
sudo docker version
docker compose version
systemctl is-active docker
sudo docker info --format '{{.Architecture}}'
sudo docker run --rm hello-world
```

`hello-world`는 Docker 데몬·이미지 다운로드·컨테이너 시작을 확인하는 **독립적인 최소 테스트**입니다. PostgreSQL, Redis, Mastodon 이미지가 실행 가능한지 또는 전체 설치가 성공했는지는 아직 알 수 없습니다.

특히 Apple Silicon의 ARM64 VM에서는 **사용할 Mastodon과 Streaming 이미지가 linux/arm64를 실제 제공하는지 먼저 확인**해야 합니다. 이미지 태그가 동일해도 배포 아키텍처가 다를 수 있습니다. 이미지 호환성 검사는 이미지 태그를 고정한 뒤 별도로 진행합니다.

### Mastodon 4.7.3 공식 이미지의 ARM64 플랫폼 확인

동일한 UTM 게스트에서 다음을 실행해 공개 이미지 매니페스트를 조회했습니다.

```bash
sudo docker buildx imagetools inspect ghcr.io/mastodon/mastodon:v4.7.3
sudo docker buildx imagetools inspect ghcr.io/mastodon/mastodon-streaming:v4.7.3
```

| 공식 이미지 태그 | 조회에서 확인한 플랫폼 | 이미지 인덱스 다이제스트 |
| --- | --- | --- |
| `ghcr.io/mastodon/mastodon:v4.7.3` | `linux/arm64`, `linux/amd64` | `sha256:7d82164ff7304362787dd2c301b4e18a5f3a3ed7bf30e421b2693e57c3ccebb9` |
| `ghcr.io/mastodon/mastodon-streaming:v4.7.3` | `linux/arm64`, `linux/amd64` | `sha256:770f2e1f734fd0ed69628292638211f909eb87769f73db026c36f484ad3c6bd6` |

**결론:** Web/Sidekiq와 Streaming 이미지 모두 ARM64 매니페스트가 존재합니다. 이는 **아키텍처 배포 지원 확인**이지 이미지 pull, DB 연결, 실행 및 전체 Mastodon 서비스 검증이 아닙니다. PostgreSQL·Redis 이미지도 실제 사용하는 태그 기준으로 별도 검증해야 합니다.

### 공식 소스 및 PostgreSQL·Redis ARM64 지원 확인

동일한 실험 VM에서 Mastodon 공식 `v4.7.3` 태그를 shallow clone한 후, `git describe --tags --exact-match`로 `v4.7.3`을 확인했습니다. 체크아웃된 커밋은 `8ff11c2bb7b9f0714e947b10fa3629c6542c7121`이고 `docker-compose.yml`과 `.env.production.sample` 파일이 존재했습니다. 특정 태그를 체크아웃했기 때문에 Git의 `detached HEAD` 안내가 나타났으며 이는 오류가 아닙니다.

다음 읽기 전용 명령으로 공식 DB/캐시 이미지의 아키텍처를 조회했습니다.

```bash
sudo docker buildx imagetools inspect postgres:14-alpine
sudo docker buildx imagetools inspect redis:7-alpine
```

두 태그 모두 `linux/arm64/v8` 플랫폼이 출력됐습니다. 출력에 함께 표시된 `unknown/unknown`은 추가 매니페스트 항목일 수 있으며, ARM64 지원 자체가 누락됐다는 뜻은 아닙니다.

**검증 경계:** 위 결과는 공식 소스 파일의 존재와 이미지 매니페스트 호환성 확인입니다. PostgreSQL·Redis의 컨테이너 기동·영속성, Mastodon DB 초기화, Web·Sidekiq·Streaming 실행 검증은 아직 별도로 수행해야 합니다.

실험에서는 `sudo docker`를 사용했습니다. 일반 계정을 `docker` 그룹에 넣으면 사실상 호스트의 강력한 관리자 권한을 가지므로 편의를 위해 무조건 추가하지 않습니다.

## 실측 사례: PostgreSQL·Redis 컨테이너 초기 기동 (2026-10-25)

**검증 상태: 두 컨테이너 기동, Health 상태와 실제 기본 쿼리/명령 정상. Mastodon DB 초기화는 아직 미검증.**

새 VM의 공식 `v4.7.3` Compose 파일에서 `.env.production`이라는 빈 파일을 권한 `600`으로 준비하고 `sudo docker compose config --quiet`를 실행했습니다. 설정 검사가 오류 없이 끝난 뒤 **DB와 Redis 서비스만** 실행했습니다.

```bash
cd ~/mastodon-handbook-lab
sudo docker compose up -d db redis
sudo docker compose ps db redis
sudo docker compose exec -T db pg_isready -U postgres
sudo docker compose exec -T db psql -U postgres -d postgres -c 'SELECT current_database(), current_user;'
sudo docker compose exec -T redis redis-cli ping
```

첫 실행 직후 두 컨테이너의 상태는 `health: starting`이었고, PostgreSQL `pg_isready`는 `no response`를 반환했습니다. Redis는 즉시 `PONG`을 반환했습니다. 약 1분 후 재검사에서는 두 서비스가 **`healthy`**로 전환됐고 PostgreSQL의 `pg_isready`는 `accepting connections`, SQL 조회에서는 `postgres / postgres`, Redis는 `PONG`을 확인했습니다.

**교훈:** `Started`는 DB가 연결 가능한 준비 상태라는 뜻이 아닙니다. 최초 시작에는 초기화 시간이 필요할 수 있으며, `healthy`와 실제 연결 테스트를 모두 확인합니다. 연결이 계속 실패한다면 데이터 폴더를 지우지 말고 `sudo docker compose logs --tail=60 db`로 원인을 확인합니다.

본 실험의 공식 Compose 예제는 DB 서비스에 `POSTGRES_HOST_AUTH_METHOD=trust`를 사용하며 DB 포트를 호스트에 게시하지 않습니다. 이 설정은 **격리된 실험에서 확인한 공식 예제 구성**일 뿐, 실제 인터넷 공개 운영을 위한 인증 설정으로 권장되지 않습니다. 운영 환경에서는 DB 비밀번호 및 접근 정책을 별도로 설계해야 합니다.

## 실측 사례: 공식 Mastodon 이미지 다운로드 및 ARM64 확인 (2026-10-25)

**검증 상태: 공식 Mastodon v4.7.3 애플리케이션·Streaming 이미지 pull 성공 및 로컬 이미지 ARM64 확인. 서비스 기동은 아직 미검증.**

앞서 `buildx imagetools inspect`로 ARM64 매니페스트를 확인한 뒤, 같은 UTM ARM64 VM에서 다음을 실행했습니다.

```bash
sudo docker compose pull web streaming
sudo docker image inspect ghcr.io/mastodon/mastodon:v4.7.3 --format '{{.Os}}/{{.Architecture}}'
sudo docker image inspect ghcr.io/mastodon/mastodon-streaming:v4.7.3 --format '{{.Os}}/{{.Architecture}}'
```

두 이미지 모두 정상 다운로드됐고 `docker image inspect` 결과가 각각 `linux/arm64`였습니다. 공식 Compose 설정에서 `web`과 `sidekiq`는 동일한 Mastodon 이미지를 사용합니다.

이는 네이티브 ARM64 **이미지 확보에 대한 검증**으로, Rails 초기화·PostgreSQL 연결·Sidekiq/Streaming 실행·HTTPS/연합 기능의 성공을 의미하지 않습니다.

---

## 05. 초기 설치에 있던 실측 사례

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

---

## 06. 첫날 점검에 있던 실측 사례

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
