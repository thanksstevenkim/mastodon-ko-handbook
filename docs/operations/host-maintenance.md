# Ubuntu 호스트 업데이트와 재부팅

> **범위:** Ubuntu + Docker Compose 기반 Mastodon 운영 서버의 **호스트 운영체제** 유지보수입니다. Mastodon 애플리케이션의 Ruby·Node.js 의존성 패치나 릴리스 업그레이드는 [런타임·보안 패치](security-patch-rollout.md)와 [Mastodon 업그레이드](upgrade-checklist.md)를 참고하세요. 아래는 Ubuntu 24.04 운영 경험을 일반화한 체크리스트로, 모든 서버에 그대로 적용되는 자동 업데이트 스크립트는 아닙니다.

## 1. 무엇을 업데이트하는지 먼저 구분하기

| 대상 | 영향과 확인할 것 |
| --- | --- |
| Ubuntu 보안 패키지·커널 | `needrestart`가 서비스 재시작을 요청할 수 있고, 새 커널에는 재부팅이 필요할 수 있음 |
| Docker Engine·containerd | 데몬이 재시작되거나 컨테이너 가용성에 영향이 있을 수 있음. `LiveRestoreEnabled`와 각 컨테이너 재시작 정책을 구분 |
| 호스트 PostgreSQL | 별도 시스템 서비스가 사용 중일 수 있음. Mastodon이 Docker PostgreSQL을 사용한다는 이유로 호스트 DB가 불필요하다고 가정하지 않음 |
| Mastodon 컨테이너 이미지 | 호스트 APT 패키지와 별도로 빌드·배포·검증 |

`apt upgrade`와 Ubuntu **배포판 업그레이드**(`do-release-upgrade`)는 다른 작업입니다. 새 LTS 버전 안내가 표시되었다는 이유만으로 운영 서버를 즉시 올릴 필요는 없습니다.

## 2. 업데이트 전 최소 확인

서버에 원격 관리 콘솔 등 SSH 이외의 복구 경로가 있는지 확인하고, 서비스 중단이 가능한 시간을 정합니다. 활성 데이터 처리나 백업 작업이 있으면 충돌하지 않는 시간을 선택합니다.

```bash
cat /etc/os-release
uname -r
dpkg --audit
df -h / /boot
test -f /run/reboot-required && echo "REBOOT_REQUIRED" || true

sudo apt-get update
apt list --upgradable
sudo apt-get -s upgrade
```

마지막 `-s`는 **설치 시뮬레이션**입니다. 여기에 Docker, PostgreSQL, Nginx, 커널 등 영향이 큰 패키지가 포함되는지 살펴보세요. `apt-get update`는 패키지 목록을 갱신하지만 패키지를 설치하지 않습니다.

컨테이너를 운영한다면 아래를 추가 확인합니다.

```bash
systemctl is-active docker containerd nginx
docker info --format 'LiveRestore={{.LiveRestoreEnabled}}'
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker ps -q | xargs -r docker inspect --format '{{.Name}}: {{.HostConfig.RestartPolicy.Name}}'
```

- `restart=always`는 부팅 후 자동 시작 대상, `restart=no`는 기본적으로 자동 시작하지 않는 대상입니다. **실험·복구 컨테이너를 무조건 자동 시작으로 바꾸지 마세요.**
- 호스트에서 PostgreSQL도 운영 중이라면 `pg_lsclusters` 등으로 사용 여부와 시작 정책을 확인합니다.
- 실행 중인 서비스의 백업·롤백 자료가 있는지 **운영 범위에 맞게** 확인합니다. 이 때문에 모든 백업을 새로 만들거나 전체 DR 실험을 반복할 필요는 없습니다.

## 3. 패키지 적용 시 주의

Ubuntu 24.04부터 `needrestart`가 영향을 받은 서비스를 자동 재시작할 수 있습니다. 자동 재시작이 운영에 위험하다면 유지보수 작업에 한해 **목록 출력 모드**(`NEEDRESTART_MODE=l`)를 고려할 수 있습니다. 이 모드는 **APT 패키지 자체의 설치 스크립트가 서비스에 영향을 주는 것을 막는 보증이 아닙니다.**

```bash
# 유지보수 창에서 패키지 목록과 영향 범위를 확인한 뒤 실행하는 예
sudo env NEEDRESTART_MODE=l apt-get upgrade
```

자동 설치·무인 재부팅으로 처리하지 말고, 실제 패키지 목록과 설정 파일 질문을 검토합니다. `autoremove`와 `do-release-upgrade`는 이번 단순 패키지 업데이트에 자동으로 덧붙일 필요가 없습니다. 필요한 경우 서비스 로그와 패키지 관리자 종료 상태를 먼저 확인하세요.

## 4. 재부팅 후에는 이 정도만 확인

재부팅이 필요하면 이용자에게 공지하고, 원격 복구 경로를 확보한 뒤 수행합니다. SSH 연결이 끊어지는 것은 예상된 현상입니다. 부팅이 끝난 후:

```bash
uname -r
systemctl is-active docker containerd nginx
docker compose ps
curl -fsS --max-time 15 -o /dev/null -w 'HTTP %{http_code}\n' https://social.example.com/
test -f /run/reboot-required && echo "REBOOT STILL REQUIRED" || echo "NO REBOOT REQUIRED"
```

`docker compose ps`는 실제 Compose 프로젝트 디렉터리에서 실행합니다. 사이트 주소와 운영 서비스명은 자신의 환경에 맞게 바꾸세요. 단순 HTTP 200이나 컨테이너 `healthy`만으로 로그인·연합·미디어의 모든 기능이 보증되지는 않습니다.

이후 기존 `systemd` 점검 타이머의 다음 실행 시각을 확인하면 됩니다.

```bash
systemctl list-timers --all --no-pager
```

**정상적인 재부팅 한 번**이 과거의 모든 재시작·DNS 장애를 해결했다고 단정하지 마세요. Nginx가 실패했다면 컨테이너보다 먼저 [프록시 및 업데이트 장애 진단](../troubleshooting/known-failures.md)을 참고합니다.

## 운영 기록에 남길 것

업데이트 날짜, 실행 전·후 커널, 적용한 주요 패키지와 개수, 서비스 재시작 여부, 재부팅 결과, 웹사이트 접속 확인, **미확인 범위**만 기록하면 충분합니다. 운영 중 확인한 로그 전문이나 비밀 설정을 공개 문서에 붙이지 않습니다.

### 참고

- [Ubuntu 서버 자동 업데이트와 needrestart](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)
- [2026-11-15 머스타드 Ubuntu 패키지 업데이트·재부팅 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/ubuntu-24-04-package-updates-and-reboot-2026-11-15.md)
