# 독립 VM에서 Mastodon 4.7.3 전체 재해 복구 실험

> **검증 상태: 테스트 검증 (Checkpoint 21, 2026-10-26).** UTM의 별도 Ubuntu Server 24.04.5 ARM64 VM에서 암호화 백업으로 PostgreSQL·미디어·설정과 Mastodon 서비스를 복원하고, HTTPS·기존 관리자 로그인·게시물·이미지·홈 타임라인을 실제 확인했습니다. **실제 운영 서버의 장애 복구, 외부 연합 통신, 메일 송수신, Redis 작업 대기열 복원은 미검증**입니다.

이 문서는 [백업 준비와 복구 검증 체크리스트](backup-readiness.md)에 이어 실시한 독립 VM 복구 실험의 기록입니다. 예제의 디렉터리, 포트, 도메인 및 서비스명은 **실험 환경 전용**입니다. 실제 운영에 사용하기 전에 자신의 Compose·보안 정책과 복구 목표에 맞게 조정해야 합니다.

## 실험 목표와 대상 분리

- 원본: 별도 UTM VM의 로컬 실험용 Mastodon 4.7.3 (`mastodon-lab`).
- 복구 대상: 새 UTM VM `mastodon-dr-lab`, Ubuntu 24.04.5 LTS / ARM64 / 4 vCPU / 약 5.8 GiB RAM / 4 GiB swap.
- 복구 이미지: `postgres:14-alpine`, `redis:7-alpine`, `ghcr.io/mastodon/mastodon:v4.7.3`, `ghcr.io/mastodon/mastodon-streaming:v4.7.3`.
- 원본과 동일한 실험 도메인 `mastodon.test`를 사용하되, Mac의 hosts 매핑은 검증 시에만 일시 전환하고 종료 후 복원했습니다.
- 독립적인 Compose 프로젝트 `mastodon-dr`, Docker 데이터 디렉터리 및 네트워크를 사용했습니다. 기존 VM과 실제 운영 서버에서 복원 명령을 실행하지 않았습니다.

## 1. 백업 전송과 복호화

Mac에 보관된 GPG AES-256 암호화 tar 아카이브 및 SHA-256 체크섬을 새 VM으로 전송했습니다. **Mac에서 전송 전, DR VM에서 전송 후 각각 체크섬 `OK`**를 확인했습니다. 백업 파일은 약 96 KiB였으며, DR VM의 여유 공간은 약 29 GiB였습니다.

DR VM에서 GPG 복호화 후 tar 목록을 확인했고, 권한을 제한한 별도 스테이징 디렉터리에 다음 다섯 파일을 추출했습니다.

| 파일 | 확인된 크기 | 용도 |
| --- | ---: | --- |
| `db.dump` | 430,277 B | PostgreSQL custom-format 덤프 (`PGDMP`) |
| `media.tar.gz` | 32,367 B | 로컬 미디어 원본·축소본 |
| `.env.production` | 837 B | 애플리케이션 환경 설정 및 비밀값 |
| `docker-compose.yml` | 4,274 B | 원본 컨테이너 구성 |
| `Caddyfile` | 287 B | 원본 HTTPS 프록시 설정 |

**주의:** `.env.production`, 평문 덤프, 미디어 및 복호화 암호는 공개 저장소에 넣지 않았습니다. 복호화 암호는 대화·로그·명령행 인수에 공개하지 않고 터미널에서 입력했습니다. 평문 스테이징 파일은 이번 실험 후 DR VM에 남아 있을 수 있으므로 별도의 보안·정리 계획이 필요합니다. 복호화 성공과 파일 존재만으로 복구 성공을 선언하지 않았습니다.

## 2. 격리 네트워크와 인프라 복구

원본 Compose에는 Web·Sidekiq·Streaming이 일반 외부 네트워크에도 연결되어 있었습니다. 이를 그대로 기동하지 않고 `docker-compose.dr.json`을 **별도 파일로 생성**, 다섯 서비스를 오직 `dr_isolated` 브리지 네트워크(`internal: true`)에 연결했습니다. 원본 Compose는 보존했습니다.

- Docker Engine과 Compose를 새 VM에 설치했고 ARM64 `hello-world` 실행이 성공했습니다.
- PostgreSQL 14 및 Redis 7을 먼저 시작했고 두 컨테이너 모두 Healthy, `pg_isready`는 `accepting connections`, `redis-cli ping`은 `PONG`이었습니다.
- 실제 Docker 네트워크 검사에서 `Internal: true`를 확인했습니다.
- 동일 격리 네트워크의 단발성 컨테이너에서 외부 주소로 TCP 443 연결을 시도해 `Errno::ENETUNREACH`를 확인했습니다.
- Web·Sidekiq·Streaming은 **그 후** 실행했고 모두 Healthy, 격리 네트워크에만 소속된 것을 검사했습니다.

이 시험은 **특정 경로의 외부 TCP 통신 실패**를 보여 주지만, 모든 종류의 외부 통신 차단을 형식적으로 증명하는 것은 아닙니다. 실제 연합 전송이나 이메일 송수신을 시험하지 않았습니다. PostgreSQL의 `trust` 인증은 **격리 실험 전용**으로, 공개 네트워크나 운영 환경의 권장 설정이 아닙니다.

## 3. PostgreSQL 및 미디어 복원

사전 점검에서 새 PostgreSQL 인스턴스에는 `postgres` DB와 `postgres` 역할만 존재했습니다. 원본 덤프는 PostgreSQL 14.24에서 생성된 custom format이고 TOC 항목이 1,175개였습니다.

빈 `mastodon_production` DB와 `mastodon` 역할을 준비한 후 다음 옵션으로 복원했습니다.

```bash
# 대상이 독립 DR VM이며 빈 DB인지 먼저 검증할 것
pg_restore -U mastodon -d mastodon_production \
  --no-owner --no-privileges \
  --single-transaction --exit-on-error < db.dump
```

실제 명령은 **DR VM의 PostgreSQL 컨테이너 내부**에서 실행했습니다. 복원 명령은 오류 없이 끝났습니다. 이어진 레코드 확인 결과는 다음과 같습니다.

| 항목 | 복원 후 실측 |
| --- | ---: |
| `accounts` | 2 |
| `statuses` | 2 |
| `media_attachments` | 1 |
| `users` | 1 |
| 로컬 `labadmin` 계정 | 1 |

처음에는 기존 시험의 `accounts=1`을 전체 행 수로 잘못 예상했습니다. 백업의 `accounts` COPY 데이터를 별도로 검사한 결과 **백업에도 2개 행**이 있었고, 복원 DB의 2개 행(로컬 2개, 음수 ID 1개)과 일치했습니다. 이전의 `accounts=1`은 `labadmin` 계정 수 검증값이므로 전체 계정 수로 사용하면 안 됩니다. **차이가 발견됐다는 이유로 레코드를 삭제하지 않았습니다.**

`media.tar.gz` 내부 경로와 파일 유형을 확인한 뒤 Compose가 마운트하는 `public/system`에 추출했습니다. JPEG 2개 파일(원본 18,998 B / 축소본 14,915 B)이 실제 JPEG로 확인됐고, 이후 Safari에서 이미지 표시까지 확인했습니다.

## 4. Web·Streaming 및 Caddy HTTPS

Web·Sidekiq·Streaming 컨테이너는 Healthy였고 Web 컨테이너 내부 `/health`는 HTTP 200을 반환했습니다. 반면 내부 전용 Docker 네트워크에만 연결된 Web·Streaming에서는 호스트 포트 선언이 존재해도 실측 `docker inspect .NetworkSettings.Ports` 값이 `null`이었고, 호스트의 `127.0.0.1:3000` 접속에 실패했습니다.

따라서 **Mastodon 컨테이너를 일반 네트워크에 노출하지 않고**, 별도의 Caddy 컨테이너에만 접근용 브리지 네트워크와 기존 `dr_isolated` 네트워크를 연결했습니다. Caddy의 업스트림은 `web:3000`, `streaming:4000`; 호스트 쪽 HTTPS는 **DR VM IP에만** 바인딩했습니다.

초기 Caddy는 원본 VM의 IP가 남은 `bind` 지시어 때문에 재시작을 반복했습니다.

```text
bind: cannot assign requested address
```

원본 Caddyfile을 보존하고 **DR 전용 Caddyfile에서만 그 `bind` 지시어를 제거**했습니다. 수정한 설정은 `caddy validate` 통과, 이후 Caddy는 Running 상태와 HTTPS 리스너 및 로컬 인증서 발급 성공을 확인했습니다. 컨테이너가 실제로 준비되기 전에 실행한 첫 HTTPS 요청은 실패했으므로, 재검사로 `/health` HTTP 200을 확인했습니다. 이때의 Caddyfile 서식 경고는 장애 원인으로 취급하지 않았습니다.

## 5. macOS에서 실제 로그인·타임라인 검증

DR Caddy의 **공개 루트 CA 인증서만** Mac으로 복사하고 SHA-256 지문이 동일한 것을 확인했습니다. CA 개인키는 복사하지 않았습니다. Mac의 `curl --cacert`와 `--resolve`를 이용해 `--insecure` 없이 DR 서버의 `/health` 및 홈페이지에서 모두 HTTP 200을 확인했습니다.

Safari 실험을 위해 Mac 사용자 인증서 신뢰 설정을 일시 추가하고 `/etc/hosts`의 `mastodon.test` 대상만 DR VM으로 변경했습니다.

- 기존 `labadmin` 계정 로그인이 정상 동작했습니다.
- 계정 프로필에 기존 게시물 2개와 JPEG가 표시됐습니다.
- 처음에는 홈 타임라인이 비어 있었습니다. 이 백업에는 Redis 상태가 없었으므로, DR 환경에서 `bin/tootctl feeds build labadmin`을 실행했고 `OK`를 확인했습니다.
- Safari에서 **홈 타임라인이 정상 복구된 것**을 다시 확인했습니다.

검증 후에는 사전에 보존한 Mac `/etc/hosts`를 원본과 대조해 복구했고, DR CA 인증서 및 신뢰 설정 제거 명령도 정상 종료됐습니다. 최종 hosts 항목은 원본 VM을 다시 가리키는 것으로 확인됐습니다. **후속 Checkpoint 22에서 원본 VM 대상 HTTPS `/health` HTTP 200을 다시 확인했습니다.** 다만 원본 VM에 대한 Safari 재로그인은 별도로 검사하지 않았습니다.

## 6. Checkpoint 22 — 원본 접근 복귀와 DR 보관 상태 점검 (2026-10-26)

Mac에서 `mastodon.test`의 hosts 매핑이 원본 실험 VM으로 돌아온 사실을 확인하고, 해당 주소를 대상으로 인증서 검증을 유지한 HTTPS `/health` 요청의 **HTTP 200** 응답을 확인했습니다. 인증서/hosts 원상복구의 명령 성공과 실제 원본 HTTPS 재접속을 구분하여 기록합니다.

DR VM에서 읽기 전용으로 점검한 결과:

| 항목 | 관찰 결과 |
| --- | --- |
| PostgreSQL·Redis·Web·Sidekiq·Streaming | 5개 Healthy |
| Caddy | Running |
| 핵심 5개 컨테이너 재시작 정책 | `always` |
| Caddy 재시작 정책 | `unless-stopped` |
| Docker 데몬 | `active`, 자동 시작 `enabled` |
| `.env.production`, `db.dump`, `media.tar.gz`, DR Compose, DR Caddyfile | 각각 권한 `600` |
| DR VM 디스크 여유 | 약 27 GiB |

영속 저장 디렉터리의 호스트 표시 소유자에 `UNKNOWN`이 포함됐지만, 컨테이너 UID를 확인하거나 권한을 임의 변경하지 않았습니다. **복원된 PostgreSQL·Redis·미디어 저장 경로가 스테이징 디렉터리 안에 있으므로 디렉터리 전체를 삭제하면 안 됩니다.**

## 7. Checkpoint 23 — 재부팅 후 자동 복구·지속성 시험 (2026-10-26)

DR VM 재부팅 이후 Docker Compose를 수동으로 다시 기동하지 않고 상태를 검사했습니다. 첫 검사에서는 PostgreSQL의 헬스 상태가 `starting`이어서 `set -e` 스크립트가 종료됐습니다. 즉시 장애로 판정하거나 컨테이너를 재시작하지 않고, 후속 검사에서 준비 상태가 완료되는지 확인했습니다.

| 항목 | 재부팅 후 확인 결과 |
| --- | --- |
| Docker | `active` |
| PostgreSQL 14 | `healthy` |
| Redis 7 | `healthy` 및 `PONG` |
| Web | `healthy` |
| Sidekiq | `healthy` |
| Streaming | `healthy` |
| Caddy | `running` |
| PostgreSQL 레코드 | 계정 2 / 게시물 2 / 미디어 1 |
| Redis 홈 피드 | `feed:home:<account_id>` 유형 `zset`, 항목 2개 |
| Mac → DR HTTPS `/health` | HTTP 200, `text/plain; charset=utf-8` |
| Mac → DR HTTPS `/` | HTTP 200, `text/html; charset=utf-8` |
| Mac → DR JPEG 원본 | HTTP 200, `image/jpeg` |

HTTPS 검사는 Mac의 hosts 파일을 변경하지 않고 `curl --cacert`와 `--resolve`를 사용했습니다. 인증서 검증을 우회하는 `--insecure`는 사용하지 않았습니다. Redis 피드는 **재구축 명령을 재실행하지 않고** 기존 정렬 집합의 2개 항목이 보존된 것을 확인했습니다. 웹 브라우저의 사용자 로그인과 홈 피드 렌더링은 **재부팅 전에** 이미 검증했으며, 재부팅 후에는 위의 HTTP·DB·Redis 저장 상태를 별도로 검증했습니다.

명령 작성 시 macOS `zsh`의 읽기 전용 `status`, `PATH`에 연결되는 `path` 특수 변수명 때문에 검사 스크립트가 중단된 사례가 있었습니다. 임의 변수로 사용하지 않고 `http_code`, `endpoint` 같은 이름을 사용해 재실행한 뒤 성공 결과를 확인했습니다.

**Checkpoint 23 판정:** 실험용 DR VM의 Docker 자동 시작, 5개 핵심 서비스 헬스체크, Caddy 실행, DB 레코드·Redis 홈 피드 보존 및 HTTPS/JPEG 접근 **재부팅 후 검증 통과**. 운영 환경의 RTO/RPO를 측정했다는 뜻은 아닙니다.

## 검증 범위의 한계와 후속 조치

1. 이 결과는 **소규모 로컬 Mastodon 4.7.3 백업의 독립 VM 복구 성공**을 의미합니다. 운영 서버의 성능, 대용량 스토리지, 실제 장애 상황을 대표하지 않습니다.
2. Redis 스냅샷, Sidekiq 대기 작업, 세션 상태 등은 복구하지 않았습니다. 홈 피드 재구축은 Redis 전체 상태 복원과 다릅니다.
3. 외부 ActivityPub 전송, SMTP, 연합 상호작용, 백업 자동화와 복구 시간 목표(RTO/RPO)는 미검증입니다.
4. 백업에 비밀 설정값이 들어 있으므로 **DR VM 스테이징 평문 파일과 로컬 CA 관련 자료를 안전하게 관리**해야 합니다. 공개 GitHub에 업로드하지 않습니다.
5. 원본 VM의 HTTPS 재접속과 DR VM 재부팅 후 자동 복구는 후속 Checkpoint 22~23에서 추가 검증했습니다. 장기 지속 운영, 재부팅 후 Safari 재로그인 및 운영 환경의 복구 시간 목표는 별도 검증이 필요합니다.

**판정:** PostgreSQL 데이터·로컬 미디어·설정·Mastodon 5개 서비스·Caddy HTTPS·관리자 로그인·게시물·이미지·홈 피드에 한하여 **독립 VM 재해 복구 실험 통과**.

## 관련 자료

- [백업 준비와 복구 검증 체크리스트](backup-readiness.md)
- [Mastodon 공식 문서](https://docs.joinmastodon.org/)
- [mastodon-lab 백업 런북](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/backup.md)
