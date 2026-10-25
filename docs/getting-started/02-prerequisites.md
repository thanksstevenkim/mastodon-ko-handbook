# 02. 서버 준비: 운영체제·보안·용량

> **검증 상태:** 공식 권고 및 운영 경험 기반의 사전 점검 가이드 · **작성 기준:** 2026-10-25. **자동 설치 스크립트나 새 서버 전체 구축을 검증한 문서는 아닙니다.** Ubuntu 24.04 LTS를 설명용 예시로 사용합니다.

[← 01. 구성 요소](01-architecture.md) · [다음: 도메인과 DNS →](03-domain-and-dns.md)

## 준비물과 책임

시작하기 전에 다음이 있어야 합니다.

- 서버에 접속할 **관리자 권한과 SSH 공개키 인증 수단**
- 장기간 사용할 도메인과 DNS 편집 권한
- HTTPS 인증서 발급·갱신 계획
- 외부로 메일을 보낼 SMTP 서비스와 발신 도메인
- PostgreSQL·미디어·필수 설정을 보존할 백업 공간 및 복구 계획
- 유지보수 시간과 장애 시 연락할 운영자

테스트용 서버라 해도 인터넷에 공개되면 남용 요청을 받을 수 있습니다. 운영체제의 보안 업데이트와 접근 제어를 먼저 점검하세요.

## 서버 자원 계획

단일한 '최소 사양'만으로 운영 가능성을 단정하지 않습니다. 동시 접속자, 연합 대상, 원격 미디어 캐시, Sidekiq 처리량, DB 크기, 검색 활성화 여부에 따라 달라집니다.

| 자원 | 판단 기준 |
| --- | --- |
| CPU | 웹 요청·백그라운드 작업과 이미지 처리의 동시 부하 |
| RAM | Rails/Puma, Sidekiq, PostgreSQL, Redis 및 선택적 Elasticsearch 동시 실행 |
| 디스크 | DB·업로드·캐시·로그 증가량, 스냅샷/백업 여유 공간 |
| 네트워크 | HTTPS 통신, 원격 서버와의 ActivityPub 송수신, 메일 연결 |
| 운영 지원 | 주기적인 OS 패치, 모니터링, 장애 복구 능력 |

운영 중 PostgreSQL 데이터와 미디어 저장소를 같은 장소에만 두는 것은 백업이 아닙니다. 복구 가능한 별도 사본을 준비하세요.

## 읽기 전용 서버 점검

아래는 구성 변경 없이 환경을 확인하기 위한 명령입니다.

```bash
cat /etc/os-release
uname -m
free -h
df -h
timedatectl status
```

Docker를 이미 설치했다면 버전을 확인하세요.

```bash
docker version
docker compose version
```

`docker compose`는 Docker Compose 플러그인을 사용하는 명령입니다. 설치된 버전은 배포 시점에 따라 달라질 수 있으며, 이 핸드북의 UTM 검증에서는 Compose `v5.6.1`을 확인했습니다. Docker Engine 및 Compose 설치는 **운영체제와 배포판에 맞는 [Docker 공식 안내](https://docs.docker.com/engine/install/ubuntu/)**를 따르세요. 기존 패키지가 있을 때는 충돌 가능성을 살펴보고, 아무 서버에서나 자동 설치 스크립트를 실행하지 않습니다.

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

## SSH 접근 보안

1. **별도 터미널에서 SSH 공개키 로그인이 가능한지 먼저 확인**합니다.
2. 비밀번호 로그인 제한, 관리자 계정 권한, SSH 포트와 방화벽을 검토합니다.
3. 방화벽을 변경하기 전에 **현재 SSH 연결을 유지한 채 재접속 방법**을 준비합니다.
4. 서버 제공업체의 복구 콘솔 또는 대역 외 접근 방법을 확인합니다.

**주의:** 인증 확인 전에 비밀번호 SSH 로그인을 비활성화하거나 방화벽 정책을 적용하면 스스로 서버에 접속하지 못할 수 있습니다. `ufw`, `iptables` 등의 명령을 한 번에 복사해 적용하지 마세요.

보통 공개 접근은 HTTPS(443) 및 인증서 발급·리디렉션에 필요한 HTTP(80)를 중심으로 하고, 관리용 SSH는 필요한 출발지에만 허용합니다. DB·Redis·Elasticsearch 포트를 인터넷에 직접 노출하는 것은 피해야 합니다.

## 백업과 복구 기준선

Mastodon을 공개하기 전에 **백업 대상, 보관 위치, 접근 권한, 무결성 확인, 복구 연습**을 계획합니다. 검색 인덱스까지 쓰는 경우 PostgreSQL 복원과 검색 재색인/스냅샷 복원을 구분하세요.

정확한 백업·복구 명령은 배포 방식에 따라 달라지므로 아직 단일 실행 절차로 제공하지 않습니다. [백업 준비 체크리스트](../operations/backup-readiness.md)를 먼저 참고하세요.

## 준비 완료 체크리스트

- [ ] SSH 키 인증과 비상 복구 경로가 있다.
- [ ] 운영체제·아키텍처·Docker/Compose 버전을 기록했다.
- [ ] 리소스와 스토리지 증가에 대한 계획이 있다.
- [ ] 방화벽의 공개 포트 범위를 이해했다.
- [ ] 외부 백업 보관 위치와 복구 계획이 있다.

### 참고 자료

- [Mastodon: Preparing your machine](https://docs.joinmastodon.org/admin/prerequisites/)
- [Mastodon 공식 설치 요구사항](https://docs.joinmastodon.org/admin/install/)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose 설치 안내](https://docs.docker.com/compose/install/linux/)
