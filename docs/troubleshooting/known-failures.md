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
