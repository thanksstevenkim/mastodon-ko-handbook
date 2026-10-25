# 04. Docker Compose로 Mastodon 구성 이해하기

> **검증 상태:** Mastodon 공식 4.7.3 Compose 예제 기반 구성 안내 · **범위:** Ubuntu의 Docker Engine + Compose v2 · **주의:** 이 문서만으로 운영 가능한 배포를 완성하지는 않습니다. 실제 설정과 설치는 다음 문서를 참고하세요.

[← 03. 도메인과 DNS](03-domain-and-dns.md) · [다음: 최초 설치와 설정 →](05-initial-setup.md)

## Docker Compose가 하는 일

`docker-compose.yml`(또는 `compose.yaml`)은 여러 컨테이너의 **이미지·실행 명령·환경변수·연결·볼륨·포트**를 한곳에 선언합니다. Mastodon은 웹 앱 하나뿐 아니라 PostgreSQL, Redis, Sidekiq, Streaming 등이 서로 협력하므로 Compose를 사용하면 각 서비스를 구분해서 관리할 수 있습니다.

Mastodon 4.7.3의 [공식 Compose 예제](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)는 **운영 서버 배포용**이며, 로컬 개발용 구성과는 다릅니다. 선택한 Mastodon 버전과 **동일한 태그의 예제 파일과 이미지**를 사용하세요.

## 실측 사례: UTM Ubuntu ARM64에서 Docker Engine 검증 (2026-10-25)

**검증 상태: Docker 설치·기본 컨테이너 실행 확인. Mastodon 컨테이너 실행은 아직 미검증.**

[02. 서버 준비의 UTM 실측 환경](02-prerequisites.md)에서 Docker 공식 APT 저장소를 이용해 설치한 뒤 다음을 확인했습니다.

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

실험에서는 `sudo docker`를 사용했습니다. 일반 계정을 `docker` 그룹에 넣으면 사실상 호스트의 강력한 관리자 권한을 가지므로 편의를 위해 무조건 추가하지 않습니다.

## 기본 서비스와 접속 범위

| 서비스 | 기본 역할 | 외부 공개 여부 |
| --- | --- | --- |
| `web` | Rails/Puma 웹·API 서버 | 보통 호스트 루프백으로 공개하고 리버스 프록시를 거침 |
| `streaming` | 실시간 이벤트 처리 | 보통 호스트 루프백으로 공개하고 리버스 프록시를 거침 |
| `sidekiq` | 비동기 작업 | 인터넷에 포트를 열 필요 없음 |
| `db` | PostgreSQL 핵심 데이터 | 외부 직접 노출 금지 |
| `redis` | 큐와 임시 데이터 | 외부 직접 노출 금지 |
| `es` (선택) | Elasticsearch 전체 텍스트 검색 | 외부 직접 노출 피하기 |

Mastodon 4.7.3 예제의 Web·Streaming 포트 바인딩은 각각 `127.0.0.1:3000:3000`, `127.0.0.1:4000:4000`입니다. 앞쪽의 `127.0.0.1`은 서버 외부에서 해당 포트로 직접 들어오지 못하도록 호스트의 루프백 주소에만 바인딩하겠다는 의미입니다.

**`0.0.0.0:3000:3000`이나 `3000:3000`으로 바꾸면 외부 공개 범위가 넓어질 수 있으므로 임의로 변경하지 마세요.** Nginx·방화벽·클라우드 제공업체 네트워크 정책을 함께 확인해야 합니다.

## 왜 영속 데이터가 중요할까?

공식 예제에서는 PostgreSQL이 `./postgres14`, Redis가 `./redis`, 로컬 미디어가 `./public/system` 같은 경로에 바인드 마운트됩니다. 이는 예시이며 환경·버전에 따라 다를 수 있습니다.

- 컨테이너를 새 이미지로 **교체**하는 것과 저장된 **데이터를 삭제**하는 것은 다른 작업입니다.
- 폴더가 실제로 어디에 마운트되는지, 소유권과 쓰기 권한은 적절한지 확인해야 합니다.
- 객체 스토리지(S3 호환)를 쓰는 경우 로컬 미디어 볼륨과 백업 범위가 달라집니다.
- Docker 볼륨이 남아 있다고 해서 **백업이 존재하는 것은 아닙니다.**

[백업 준비 체크리스트](../operations/backup-readiness.md)와 함께 읽으세요.

## 구성 파일을 읽는 순서

1. `services:`에서 **서비스명과 이미지 태그**를 확인합니다.
2. `env_file`, `environment`에서 환경변수 공급 방식을 확인합니다.
3. `networks`와 `ports`에서 실제 접근 가능 범위를 확인합니다.
4. `volumes`에서 데이터가 컨테이너 교체 뒤에도 남는 위치를 찾습니다.
5. `depends_on`과 `healthcheck`를 확인합니다. 의존성 선언만으로 앱 준비와 데이터베이스 초기화가 끝났다고 간주하지 않습니다.

Compose 설정 검사(설정이 준비된 프로젝트 안에서 실행):

```bash
docker compose config --quiet
docker compose ps
```

`docker compose config --quiet`는 **구성 문법·치환 검증**에 도움이 되지만, 메일·DB 연결이나 가입 흐름의 동작을 증명하지 않습니다. `docker compose config`를 옵션 없이 출력하면 비밀 환경변수가 표시될 수 있어 공개 공유를 피하세요.

## 버전이 고정된 예제 살펴보기

새 작업용 폴더에서만 다음과 같이 **Mastodon 4.7.3 소스와 예제 구성을 참고**할 수 있습니다. 이미 운영 중인 폴더에서 실행하지 마세요.

```bash
git clone https://github.com/mastodon/mastodon.git mastodon-reference
cd mastodon-reference
git checkout v4.7.3
git status --short
```

이 동작은 소스 체크아웃만 수행합니다. **앱 설치·비밀키 생성·DB 초기화·컨테이너 시작은 하지 않습니다.** 현재 운영하려는 버전이 다른 경우 해당 릴리스 태그를 확인하세요.

## 하지 말아야 할 일

- 공식 예제의 PostgreSQL 인증 설정을 검토 없이 인터넷에 노출하지 않습니다. 예제의 신뢰 기반 인증은 **제한된 네트워크라는 전제**를 살펴야 합니다.
- 저장 위치를 모르는 상태에서 `docker compose down -v`, `docker volume prune`, `rm -rf`를 실행하지 않습니다.
- Compose 파일을 수정하기 전에 실제 이미지 태그와 볼륨 매핑을 보존합니다.
- 앱의 `web`·`sidekiq` 이미지와 별도 `streaming` 이미지를 동일한 것으로 혼동하지 않습니다.

### 참고 자료

- [Mastodon 공식 v4.7.3 Compose](https://github.com/mastodon/mastodon/blob/v4.7.3/docker-compose.yml)
- [Docker Compose 공식 문서](https://docs.docker.com/compose/)
- [Mastodon 서버 구성 개요](01-architecture.md)
- [운영 업데이트 체크리스트](../operations/upgrade-checklist.md)
