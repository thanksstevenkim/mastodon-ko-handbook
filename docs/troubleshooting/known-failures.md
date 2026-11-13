# 서버 운영에서 자주 혼동하는 장애 원인

> **검증 상태: 운영 사고를 일반화한 진단 노트.** 아래는 특정 환경에서 실제로 발견된 원인이지, 같은 오류가 발생할 때의 유일한 정답은 아닙니다. **증상 → 확인 → 근거 확보 → 수정 → 재확인** 순서로 접근하세요.

## Cloudflare 521인데 컨테이너는 정상인가?

Cloudflare HTTP 521은 오리진 연결 문제가 있을 때 나타날 수 있습니다. 실제 사례에서는 Mastodon 컨테이너가 정상이었지만 **Nginx 설정 중복으로 Nginx가 시작되지 못한 것**이 원인이었습니다.

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
docker compose ps
```

설정을 백업하고 중복 정의를 확인한 뒤 `nginx -t`가 성공할 때만 적용하세요. 즉시 Web 또는 DB를 재시작할 근거는 없습니다.

[사례: SUP-0001](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/001-cloudflare-521-after-upgrade.md)

## 자동 업데이트 직후 Cloudflare 521이 발생했다면?

Ubuntu에서는 보안 업데이트 이후 `needrestart`가 Nginx 등 여러 서비스를 재시작할 수 있습니다. 이때 Nginx 설정에 **기동 시점에 DNS로 해석해야 하는 외부 upstream**이 있으면, 일시적인 이름 해석 실패가 Nginx **전체 기동 실패**로 이어질 수 있습니다. 이는 앞의 `SUP-0001`(설정 중복)과 별개의 장애 유형입니다.

우선 서비스 상태와 이벤트 순서를 확인합니다. 명령은 읽기 전용이며, 시간 범위는 실제 장애 시각에 맞추세요.

```bash
sudo systemctl status nginx --no-pager
sudo journalctl -u nginx --since "2 hours ago" --no-pager -o short-iso
sudo nginx -t
sudo grep -nE -A 8 -B 2 'Restarting services|nginx.service' \
  /var/log/unattended-upgrades/unattended-upgrades-dpkg.log | tail -n 80
```

- **업데이트가 Nginx를 재시작했는지**와 **왜 시작에 실패했는지**는 별개의 질문입니다. `Restarting services...`와 `host not found in upstream` 같은 로그를 각각 확인하세요. `systemd-resolved`가 같은 재시작 목록에 있었다고 해서 DNS 장애의 원인까지 확정되는 것은 아닙니다.
- 정적 외부 호스트 때문에 기동이 막힌다면, 해당 프록시의 **런타임 DNS 해석**(`resolver`와 변수를 쓰는 `proxy_pass`)을 검토할 수 있습니다. HTTPS upstream에는 **SNI**(`proxy_ssl_server_name on`)와 올바른 `Host` 헤더, 기존 URI 재작성 규칙이 함께 중요합니다. 변경 전 설정 백업, `nginx -t`, 오류 없는 reload를 기본으로 합니다. 설정 검사 성공만으로 미디어 조회 성공이 보장되지는 않습니다.
- **Cloudflare R2의 S3 API 엔드포인트**(`*.r2.cloudflarestorage.com`)와 **공개 버킷 커스텀 도메인**은 접근 방식이 다릅니다. S3 API를 인증 없는 공개 이미지 프록시처럼 취급하지 마세요. 로컬 Nginx 프록시에서 400이 나오더라도 공개 커스텀 도메인에서 200이 나올 수 있습니다. Cloudflare `CF-Cache-Status: HIT`만으로 원본 정상 여부를 판단하지 말고, `MISS` 결과와 요청 경로를 함께 기록하세요.
- 원인을 확인하기 전에는 자동 보안 업데이트를 끄거나, 운영 중인 R2 객체 키·경로·인증 구조를 임의로 바꾸지 않습니다.

관련 문서: [Nginx 프록시 동작 및 SNI](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) · [Cloudflare R2 S3 API](https://developers.cloudflare.com/r2/get-started/s3/) · [R2 공개 버킷](https://developers.cloudflare.com/r2/buckets/public-buckets/)

[실제 운영 사례: SUP-0014](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/014-nginx-restart-dns-failure-after-glibc-update-2026-11-13.md)

## Sidekiq가 Elasticsearch에 연결되지 않나?

컨테이너 내부에서는 호스트명으로 참조하는 값과 **Compose 서비스명 및 네트워크**가 일치해야 합니다. 한 업그레이드 사례에서는 검색 서비스 이름이 바뀌었는데 `ES_HOST`가 이전 값을 가리켜 이름 해석에 실패했습니다.

```bash
docker compose ps
docker compose config --quiet
```

실제 서비스명·검색 설정을 **비밀값을 출력하지 않는 방식**으로 비교하세요. `ES_HOST`를 특정 고정 문자열로 무조건 바꾸면 안 됩니다.

[사례: SUP-0002](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/002-elasticsearch-service-name.md)

## 업데이트 이후 DB 컬럼/테이블이 없다고 나오나?

`ActiveRecord`의 없는 컬럼·테이블 오류는 **마이그레이션 미완료** 또는 **구 프로세스의 스키마 정보** 때문일 수 있습니다. 먼저 대상 릴리스의 마이그레이션 절차를 확인하고 상태를 조회하세요.

```bash
docker compose run --rm web bundle exec rails db:migrate:status
docker compose logs --since=10m web sidekiq
```

필요한 마이그레이션이 빠졌다면 릴리스별 올바른 순서로 처리해야 합니다. 이미 적용됐는데 오류가 지속된다면 프로세스 재시작이 필요한 상황인지 확인하세요. **DB 삭제·리셋이나 임의의 마이그레이션 롤백은 해결책이 아닙니다.**

[사례: SUP-0007](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/007-database-migration-incomplete-after-upgrade.md) · [업그레이드 런북](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/upgrade.md)

## 빌드가 실패하면 곧바로 소스 문제인가?

| 오류 | 먼저 확인할 것 |
| --- | --- |
| `Bundler::RubyVersionMismatch` | 대상 Mastodon의 `.ruby-version`, 실제 Ruby·Bundler 버전 |
| Yarn 체크섬 불일치 | 캐시 및 잠금 파일 상태; 의존성 버전부터 바꾸지 않기 |
| `docker push` 인증 오류 | 레지스트리 로그인 상태와 권한 |
| Git 병합 실패 | 로컬 커스터마이징과 upstream 변경, 잔여 충돌 표식 |
| pre-commit의 엉뚱한 Ruby 버전 | 직접 실행과 Git hook 실행 환경, `core.hooksPath` |
| 포크의 CI만 실패 | 정확한 업스트림 태그와 포크의 설정 파일 차이 |

특히 `git worktree`를 이용해 **깨끗한 업스트림 태그에서 동일한 린트가 통과하는지 비교**하면 오래된 로컬 수정으로 인한 오류를 가려내는 데 유용합니다.

```bash
git status --short
git remote -v
git config --get core.hooksPath
git diff --check
```

원인을 특정하기 전에는 `Gemfile.lock`, Yarn lockfile, Git hook을 무작정 제거하거나 테스트를 억지로 수정하지 않습니다.

## 컨테이너가 healthy인데 웹이 느릴 수 있나?

그럴 수 있습니다. Web·Sidekiq·DB·리버스 프록시를 분리해, **실제 API 응답 시간과 Puma/Nginx 로그**를 확인해야 합니다. 한 WebFinger 집중 요청 사례에서는 지연과 Puma CPU 사용이 함께 관측됐지만 최종 원인은 확정하지 못했습니다. 특정 IP나 계정을 증거 없이 공격자로 지목하지 마세요.

[사례: SUP-0013](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/013-intermittent-web-latency-and-webfinger-request-concentration.md)

### 근거 자료

[SUP-0003 Docker push](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/003-docker-image-push-failed-due-to-authentication-error.md) · [SUP-0004 Yarn](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/004-yarn-checksum-mismatch-during-upgrade.md) · [SUP-0005 Ruby](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/005-ruby-runtime-version-mismatch.md) · [SUP-0006 병합](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/006-merge-conflicts-after-upstream-merge.md) · [SUP-0008 Git hooks](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/008-git-hooks-executed-with-an-invalid-hookspath.md) · [SUP-0009 포크 CI](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/009-github-actions-failures-from-fork-drift.md)
