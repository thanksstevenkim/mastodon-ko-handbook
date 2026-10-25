# Mastodon 업그레이드: 안전한 진행 순서

> **검증 상태: 운영 사례 기반 안내.** 머스타드 운영 기록에서 반복 확인된 점검 항목을 일반화했습니다. 명령어는 Docker Compose 기반 배포를 가정하며 실제 서비스명·버전·환경에 맞춰 조정해야 합니다. 특히 마이그레이션 순서는 **대상 Mastodon 릴리스의 공식 안내가 우선**입니다.

## 1. 변경 전에 확인할 것

- 현재 Mastodon 버전, 실제 실행 중인 Web·Sidekiq·Streaming **이미지 태그**, 이미지 ID, 소스 커밋을 기록합니다.
- 현재 버전에서 목표 버전까지 **중간 버전을 포함한 릴리스 노트**와 Ruby·Node.js·DB·검색 엔진 요구사항을 확인합니다.
- PostgreSQL, 미디어 저장소, 필수 설정을 백업하고 복구할 수 있는지 확인합니다. 단순히 백업 파일이 존재하는 것으로 복구 가능성을 단정하지 않습니다.
- 이전 버전의 이미지 태그와 Compose 설정을 롤백용으로 보존합니다.
- 커스텀 포크라면 업그레이드 전용 브랜치에서 upstream 변경을 병합하고 차이를 검토합니다.
- 긴 마이그레이션이나 서비스 중단이 예상되면 이용자에게 미리 알립니다.

## 2. 개발·빌드 단계

업스트림과 로컬 변경의 충돌을 해결할 때 모든 파일을 일괄적으로 한쪽 버전으로 덮어쓰지 마세요. 의도적인 커스터마이징인지, 오래된 포크 차이인지 먼저 판단합니다.

```bash
git status --short
git diff --check
git grep -nE '^(<<<<<<< |>>>>>>> )' || true
```

마지막 명령은 **병합 충돌 표식 후보를 찾는 보조 검사**입니다. 특정 문맥의 문자열일 수도 있으므로 결과를 직접 살펴보세요.

목표 버전에 맞는 Ruby·Bundler·Yarn으로 의존성을 설치하고 린트·테스트·CI를 실행합니다. CI에서 **실패**한 작업과 **건너뛴** 작업을 구분하세요. 건너뛴 빌드 작업은 이미지 빌드 성공의 근거가 아닙니다.

검증된 커밋을 기준으로 **버전이 명시된 새 이미지**를 빌드·보관합니다. `latest`만을 복구 기준으로 삼지 마세요.

## 3. 배포 직전 읽기 전용 점검

아래 명령은 **해당 Compose 프로젝트 디렉터리**에서 실행합니다.

```bash
docker compose config --quiet
docker compose ps
docker compose images
docker compose logs --since=10m web sidekiq streaming
```

배포 전후 이미지가 의도한 태그인지 확인합니다. `docker compose config`의 전체 출력에는 환경변수나 인증정보가 포함될 수 있으므로 공개 게시물에 그대로 붙이지 마세요.

## 4. 데이터베이스 마이그레이션

Mastodon의 일부 릴리스는 **사전 배포 마이그레이션 → 새 앱 실행 → 사후 배포 마이그레이션** 순서를 사용합니다. 그 경우, 해당 릴리스의 공식 안내를 확인한 뒤 순서대로 실행해야 합니다.

- 사전 배포: 새 버전 명령을 이용하되 사후 배포 마이그레이션은 건너뛰도록 설정
- 서비스 전환: 새 Web·Sidekiq·Streaming 이미지를 배포하고 상태 확인
- 사후 배포: 남은 마이그레이션을 실행하고 상태 확인

마이그레이션 완료 후에는 다음을 확인합니다.

```bash
docker compose run --rm web bundle exec rails db:migrate:status
```

**주의:** 이 문서는 모든 버전에 적용 가능한 단일 마이그레이션 명령을 제공하지 않습니다. 스키마를 변경한 뒤 구버전 프로세스가 계속 실행 중이면 스키마 캐시 문제도 발생할 수 있습니다. 마이그레이션이 오래 걸린다는 이유만으로 중단하거나, 문제가 있다고 데이터베이스를 삭제·초기화하지 마세요.

## 5. 정상 동작 확인

Docker의 `healthy` 상태만으로 운영 정상화를 선언하지 않습니다.

| 범위 | 확인할 내용 |
| --- | --- |
| Web | HTTPS, 로그인, 타임라인, 게시물 발행, API 응답 |
| Sidekiq | 작업 처리, 재시도·실패, 대기열 지연 |
| Streaming | 새 알림·게시물의 실시간 반영 |
| 미디어 | 새 업로드, 썸네일 표시, 원격 미디어 |
| 연합 | 외부 서버로 발신·수신, Inbox 처리 |
| DB | 필요한 마이그레이션의 `up` 상태 |
| 이미지 | Web·Sidekiq·Streaming의 실제 이미지 태그 |

오류가 나면 바꾸기 전에 로그와 정확한 증상을 보존하세요. 이미지 롤백이 가능하더라도 **DB 마이그레이션이 구버전과 호환되는지는 별도 문제**입니다.

## 6. 운영 기록 남기기

일시, 이전/목표 버전, 소스 커밋, 이미지 태그, 백업 및 복구 확인 범위, CI 결과, 마이그레이션 결과, 장애·복구, 실제 검증 항목을 남깁니다. 확인하지 않은 항목은 성공했다고 쓰지 않습니다.

### 근거 자료

- [Mastodon 업그레이드 런북 — mastodon-lab](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/upgrade.md)
- [DB 마이그레이션 미완료 사고](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/007-database-migration-incomplete-after-upgrade.md)
- [포크 차이로 발생한 CI 오류](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/009-github-actions-failures-from-fork-drift.md)
- [Mastodon 공식 문서](https://docs.joinmastodon.org/admin/upgrading/)
