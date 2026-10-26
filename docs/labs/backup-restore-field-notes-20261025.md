# 백업·복원 실측 기록 (2026-10-25~26)

> **보존 자료:** 기존 백업 준비 문서의 실측 기록입니다. 일부 단계에서 '미검증'이라고 한 부분은 **그 시점의 상태**이며, 이후 [독립 VM DR 실험](utm-disaster-recovery-v4.7.3.md) 및 [별도 SCRAM 설치·복원 실험](secure-install-and-restore-20261026.md)이 진행됐습니다. 실제 운영에 백업을 적용할 때는 자신의 환경에 맞춰야 합니다.

[운영 체크리스트](../operations/backup-readiness.md) · [Labs 목차](README.md)

## 실측 사례: 격리된 Mastodon 4.7.3 실험 VM 암호화 백업 (2026-10-25)

**당시(2026-10-25) 검증 상태: 백업 생성·GPG 복호화·tar 목록 검사·SHA-256 검사 통과. 이 시점에는 독립 PostgreSQL 복원과 서비스 복구가 미검증이었으며, 이후 Checkpoint 20·21에서 추가 검증했습니다.**

UTM Ubuntu 24.04.5 ARM64의 Mastodon 4.7.3 로컬 실험 환경에서 백업 작업을 진행했습니다. 점검 시 루트 볼륨은 76GiB 중 약 63GiB 사용 가능, PostgreSQL DB 크기는 약 15MB, 로컬 미디어는 약 80KB였습니다. `pg_dump` 14.24, GNU tar 1.35, GNU sha256sum 9.4를 확인했습니다.

백업 준비에서는 별도의 비공개 임시 디렉터리에 `pg_dump --format=custom --no-owner --no-acl` 형식의 DB 덤프와 `public/system` 미디어 tar 파일을 작성하고 읽기 검사에 사용했습니다. 이후 **실험 전용** `.env.production`, Compose 구성 파일, Caddyfile을 포함해 GPG 대칭 암호화(AES-256) 아카이브를 만들었습니다. **원본 환경변수 내용과 관리자 비밀번호·복호화 암호는 저장소에 기록하지 않았습니다.**

최초 `tar | gpg --symmetric` 작업은 SSH 터미널에서 GPG agent/pinentry 암호 입력이 실패해 `Inappropriate ioctl for device`와 `Operation cancelled`이 발생했고, 선행 tar 명령은 파이프 중단에 따라 상태 141로 실패했습니다. PostgreSQL 자체 오류로 취급하지 않았습니다.

재시도 시 **터미널의 숨김 입력으로 암호와 확인값을 받고**, `gpg --batch --pinentry-mode loopback --passphrase-fd 3 --no-symkey-cache --symmetric --cipher-algo AES256`에 **별도 파일 디스크립터로 전달**하는 방식을 사용했습니다. 명령행 인수나 공개 로그에 암호를 직접 넣지 않았습니다. 성공 결과:

- GPG AES-256 암호화 백업 크기 약 **96KB**, 접근 권한 `600`
- SHA-256 체크섬 파일 크기 **133바이트**, 접근 권한 `600`
- `sha256sum -c` → `OK`
- `gpg --decrypt | tar -tzf -` → 성공
- 최종 출력 → `BACKUP VALIDATION PASSED`

**중요:** 크기·체크섬·복호화·tar 목록 검사만으로 독립 환경 복원이나 서비스 기동 성공은 입증되지 않습니다. 실제 별도 PostgreSQL 인스턴스에 복원하고 미디어/설정과 연결해 검증해야 합니다. 복호화 암호는 안전한 별도 보관이 필요하고, 암호화되지 않은 임시 스테이징 디렉터리는 성공 확인 후 정리해야 합니다. 단, 일반적인 파일 삭제는 SSD에서의 영구적 데이터 소거를 보장하지 않습니다.

이번 백업에는 **Redis 큐/캐시 상태 및 Caddy 로컬 CA 개인키**를 넣지 않았습니다. 외부용 운영 백업의 복구 범위와 구성을 그대로 대표하지 않으며, 사용한 `mastodon.test` 도메인도 공개 서비스용이 아닙니다.

## 실측 사례: macOS로 암호화 백업 이관 및 체크섬 재검증 (2026-10-25)

**당시(2026-10-25) 검증 상태: VM에서 macOS로 암호화 백업 파일 및 SHA-256 체크섬 전송 완료. macOS의 `shasum -a 256 -c` 검사 `OK`. 이 시점에는 복구 작업 전이었고, 이후 Checkpoint 20·21에서 진행했습니다.**

실험 담당자는 Ubuntu VM의 GPG AES-256 암호화 백업과 체크섬 파일을 `scp`를 이용하여 별도 호스트인 macOS의 비공개 백업 디렉터리로 복사했습니다. 양쪽 파일은 전송 완료 메시지가 확인됐고 Mac 터미널에서 `shasum -a 256 -c`가 **`mastodon-lab-20261025.tar.gz.gpg: OK`**를 반환했습니다. 백업은 기밀 자료이므로 실제 경로·내용·암호는 공개 저장소에 올리지 않습니다. 전송된 파일이 원본과 일치한다는 검사로서 의미가 있으며, **독립 PostgreSQL 복원과 전체 Mastodon 복구 성공을 의미하지는 않습니다.**

또한 macOS의 `mastodon.test` 인증서 공개 루트 지문이 VM의 공개 루트 지문과 일치함을 확인했고 macOS의 시스템 기본 TLS 신뢰 설정을 통한 `curl https://mastodon.test/health` 응답이 `OK`였습니다. 이는 별도 HTTPS 접속 검증이며 백업 복원 검사는 아닙니다.

## 실측 사례: 암호화 백업에서 격리된 PostgreSQL 14로 실제 복원 (2026-10-25)

**당시(2026-10-25) 검증 상태: Checkpoint 20 통과 — AES-256 암호화 백업을 GPG로 복호화하고 PostgreSQL 커스텀 덤프를 임시 DB로 복원한 뒤 계정·게시물·첨부 레코드를 SQL로 조회해 확인. 그 시점에 미검증이던 독립 VM의 전체 서비스와 미디어 복원은 [Checkpoint 21](utm-disaster-recovery-v4.7.3.md)에서 추가로 검증했습니다.**

먼저 앞서 사용한 **평문 스테이징 디렉터리가 이미 없음**을 확인했습니다. 운영 중인 `mastodon_production`을 건드리지 않고, `postgres:14-alpine` 이미지로 임시 컨테이너 `mastodon-lab-pg-restore-check`를 만들었습니다. `--network none`, `--tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=512m`, `--rm`을 사용해 네트워크 접속과 호스트 디스크 저장을 차단했습니다. `POSTGRES_HOST_AUTH_METHOD=trust`는 **외부 네트워크가 없는 이 일회성 검증 컨테이너에만** 적용했습니다.

```bash
# 다음은 검증된 실행의 핵심 명령 구조로, 기존 컨테이너 존재 여부를 먼저 검사합니다.
sudo docker run -d --rm \
  --name mastodon-lab-pg-restore-check \
  --network none \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=512m \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=restorecheck \
  -e POSTGRES_DB=mastodon_restore \
  postgres:14-alpine
```

`pg_isready -U restorecheck -d mastodon_restore`가 `accepting connections`를 반환했습니다. GPG 비밀번호는 비공개 터미널에서 숨김 입력으로 받았고, 파이프라인으로 암호화 아카이브 안의 `db.dump`를 추출하여 **별도 임시 컨테이너에만** 복원했습니다.

```bash
# archive와 passphrase는 사전에 안전하게 준비한 변수입니다.
# 비밀번호를 파일이나 GitHub에 저장하지 마세요.
gpg --batch --pinentry-mode loopback --passphrase-fd 3 \
    --no-symkey-cache --decrypt "$archive" \
    3< <(printf '%s\n' "$passphrase") \
  | tar -xzOf - db.dump \
  | sudo docker exec -i mastodon-lab-pg-restore-check \
      pg_restore -U restorecheck -d mastodon_restore \
        --no-owner --no-acl --exit-on-error
```

실측 결과 `Restore Command PASSED`가 출력됐고, 복원된 DB에서 `labadmin` 로컬 계정 **1개**, `statuses` **2건**, `media_attachments` **1건**을 조회했습니다. 원본 실험 DB에서 이전에 확인한 개수와 일치했습니다.

**범위와 정리:** `--rm` 컨테이너는 `docker stop mastodon-lab-pg-restore-check`로 정지하면 임시 DB도 함께 삭제됩니다. 이 정리는 **복원 테스트 컨테이너에만** 적용해야 하며 기존 Mastodon Compose의 DB·Redis·Web·Sidekiq·Streaming 컨테이너를 중지하거나 삭제해서는 안 됩니다. **정리 완료 확인:** 복원 시험 후 `postgres:14-alpine|none|true` 구성을 `docker inspect`로 재검증하고, `docker stop mastodon-lab-pg-restore-check`를 실행했습니다. 이어서 같은 이름에 대한 `docker container inspect` 실패로 임시 컨테이너가 제거됐음을 확인했습니다. `RESTORE TEST CLEANUP PASSED`가 출력됐으며, 기존 Mastodon Compose의 `db`, `redis`, `web`, `sidekiq`, `streaming` 다섯 컨테이너는 모두 `healthy`였습니다.
