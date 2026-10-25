# Mastodon 런타임·의존성 보안 패치

> **검증 상태: 운영 확인 사례의 일반화.** Mastodon 애플리케이션 버전 자체를 올리지 않고 Ruby, Node.js 또는 잠긴 의존성만 보안 목적으로 갱신할 때의 점검 가이드입니다. **DB 마이그레이션이 동반되면 일반 업그레이드 절차**로 전환하세요.

## 1. 변경 범위를 좁히기

1. 보안 권고문, 취약 버전, 수정 버전 및 업스트림 호환성을 확인합니다.
2. 해당 패키지가 Web·Sidekiq용 이미지에 있는지, Streaming 이미지에 있는지 구분합니다.
3. 현재 실행 중인 버전·이미지 태그·소스 커밋과 롤백 이미지를 기록합니다.
4. 보안 패치와 관련 없는 대규모 라이브러리 업그레이드는 함께 수행하지 않습니다.

Ruby 의존성을 변경했다면 `Gemfile.lock`의 **직접 변경과 연쇄 변경**을 검토하고, 패치된 새 이미지를 빌드한 뒤 이미지 내부에서 실제 버전을 다시 확인합니다. 호스트의 Ruby가 다르다는 이유만으로 호스트 전체 런타임을 교체할 필요는 없습니다.

## 2. CI와 이미지 구분

- 소스 린트와 테스트, 의존성 취약점 검사, 이미지 빌드 상태를 **서로 별개로** 확인합니다.
- `ruby/setup-ruby` 같은 CI 설정 도구가 새 Ruby 버전을 아직 지원하지 않을 수도 있습니다. 이 경우 앱 오류와 환경 구성 오류를 구분합니다.
- CI의 작업이 `skipped`이면 **성공으로 기록하지 않습니다**.
- 소스 커밋 및 새 이미지 태그를 함께 기록하고, 종전 이미지는 롤백을 위해 유지합니다.

## 3. Compose 설정 검증과 단계별 전환

아래는 **새 이미지가 이미 준비되고**, 서비스별 이미지 태그가 Compose 파일에서 검토됐다는 전제의 예시입니다. 명령 자체가 이미지를 빌드하거나 의존성을 설치해 주지는 않습니다.

```bash
docker compose config --quiet
docker compose images
```

Mastodon Web과 Sidekiq의 이미지만 바꾸는 보안 패치라면, 검증 가능한 범위에서 Web부터 재생성합니다.

```bash
docker compose up -d --no-deps --no-build --pull never web
docker compose ps web
docker compose logs --tail=40 web
```

Web의 이미지·헬스체크·HTTPS 및 주요 요청을 점검하고 이상이 없을 때 Sidekiq를 전환합니다. 실행 중 작업에 대한 유예 시간을 두는 방법은 운영 환경에 맞춰 검토해야 합니다.

```bash
docker compose stop -t 60 sidekiq
docker compose up -d --no-deps --no-build --pull never sidekiq
docker compose ps sidekiq
docker compose logs --tail=60 sidekiq
```

Streaming은 별도 런타임·이미지일 수 있으므로 동일한 변경으로 간주하지 않습니다. `docker compose down`으로 전체 서비스를 불필요하게 내리지 마세요.

## 4. 롤백과 사후 확인

사전에 보존한 이미지·Compose 설정으로 변경 서비스를 되돌릴 수 있어야 합니다. 단, 스키마 변경이 있는 업데이트는 이미지 전환만으로 안전하게 되돌릴 수 없습니다.

점검 결과에는 실제 관찰한 Ruby·gem·Node 버전, 작업 처리, 외부 HTTPS, 컨테이너 재시작 횟수, 미검증 범위를 구분해 적습니다. Sidekiq 작업의 `done` 메시지는 **로컬 작업 완료**이지 상대 연합 서버의 최종 반영까지 입증하지는 않습니다.

### 근거 자료

- [런타임·의존성 보안 패치 런북](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/runtime-dependency-security-patches.md)
- [2026-10-24 Ruby 4.0.9 보안 패치 운영 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/update-log/4-7-3-ruby-4-0-9-official-base-and-gem-security-2026-10-24.md)
