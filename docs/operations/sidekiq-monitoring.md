# Sidekiq 정기 모니터링과 실패 작업 관리

> **검증 상태: 특정 운영 환경에서 확인.** Mastodon 4.7.3 / Sidekiq 8.1.6 / Ubuntu systemd / Docker Compose 운영 서버에서 읽기 전용 감사 서비스를 수동·정기 실행한 사례를 일반화했습니다. 아래 예시는 다른 서버에 그대로 검증된 설치 스크립트가 아니므로 계정, 경로, Mastodon 버전과 Compose 환경에 맞춰 수정하고 검증하세요.

## 1. 왜 '주기적인 청소'가 아닌 모니터링인가?

Sidekiq는 Mastodon의 비동기 작업을 수행합니다. `Enqueued`는 실행을 기다리는 일반 대기열, `Busy`는 실행 중인 작업, `Scheduled`는 예약 작업, `Retry`는 실패 후 다시 실행할 작업, `Dead`는 재시도를 소진해 별도 보관된 작업을 가리킵니다. 누적 `Failed` 통계는 동일 작업의 반복 실패를 포함하는 **실패 실행 횟수**이지, 현재 실패한 고유 작업 수가 아닙니다.

연합 서버의 일시적인 DNS, TLS, 응답 오류로 Retry가 증가해도 Mastodon 자체는 정상적으로 처리 중일 수 있습니다. 먼저 **큐별 크기·지연, 컨테이너와 프로세스 상태, Retry·Dead 변화**를 함께 비교하세요. 정기적으로 `clear` 하거나 Redis를 `FLUSHDB` 하는 방식은 전송할 ActivityPub 활동을 유실시킬 위험이 있습니다.

대기열이 실제로 쌓인 사례와 진단 순서는 [Sidekiq 대기열이 쌓일 때](sidekiq-queues.md)를 함께 참고하세요.

## 2. 읽기 전용 상태 확인

아래 예시는 대상 Mastodon Compose 디렉터리에서 실행합니다. `docker compose exec` 권한이 있는 **운영 계정**으로 사용하고, 서비스명이 `sidekiq`인지 확인하세요.

```bash
docker compose ps sidekiq

docker compose exec -T sidekiq bin/rails runner '
  require "sidekiq/api"
  s = Sidekiq::Stats.new

  puts "Processed total: #{s.processed}"
  puts "Failed executions total: #{s.failed}"
  puts "Enqueued: #{s.enqueued}"
  puts "Retry: #{s.retry_size}"
  puts "Dead: #{s.dead_size}"
  puts "Scheduled: #{s.scheduled_size}"
  puts "Processes: #{s.processes_size}"
  puts "Busy workers: #{Sidekiq::WorkSet.new.size}"

  Sidekiq::Queue.all.sort_by(&:name).each do |queue|
    puts "#{queue.name}: size=#{queue.size}, latency=#{queue.latency.round(1)}s"
  end
'
```

이 점검은 데이터베이스 레코드나 작업을 수정하지 않습니다. 결과가 정상이어도 실제 연합 전송의 최종 도착까지 보증하지 않습니다. 로그와 오류 메시지, 작업 인수를 외부에 공유할 때는 원격 inbox URL과 계정·게시물 식별자를 제거하세요.

## 3. 실패를 구별하는 관점

- **원격 500·502·타임아웃:** 상대 서버, 프록시, 경로상의 네트워크 문제일 수 있습니다. 원인을 확인하지 않고 로컬 Sidekiq 전체 장애로 단정하지 않습니다.
- **401:** 요청 인증 또는 접근 거부 가능성이 있지만, 실제 원인은 서명 방식, 수신 측 정책, 계정 관계 등 다양합니다. 한 계정에 집중된다고 해서 개인키 결함이 확정되지는 않습니다.
- **회로 차단기 오류:** 실패한 목적지에 대한 요청을 일정 기간 억제하는 보호 동작일 수 있습니다. 직접적인 HTTP 응답 코드와 구분해야 합니다.
- **S3 호환 스토리지 오류:** 미디어 처리 실패에 연관될 수 있으나, Dead에 남은 오래된 오류만으로 **현재** 스토리지 장애나 같은 시기 Retry 급증의 원인을 입증할 수 없습니다.

Mastodon의 `ActivityPub::DeliveryWorker`는 관측된 4.7.3 환경에서 `retry: 16`, `dead: false`였습니다. 이 경우 전송 재시도 작업이 Retry에서 사라졌더라도 **성공했다고 결론 내릴 수 없습니다**. 사용 중인 버전의 실제 Worker 설정을 확인하세요.

Sidekiq 8 계열의 타임스탬프를 직접 숫자로 해석할 때 밀리초/초를 혼동하면 비현실적인 날짜가 나올 수 있습니다. 날짜 조사 시 검증된 API의 `job.failed_at`, `job.retried_at` 등을 우선 사용하세요.

## 4. systemd로 하루 한 번 감사 실행하기

운영 환경에서 **읽기 전용 보고서만** 기록하도록 설계합니다. 구성 요소는 (1) 점검용 셸 스크립트, (2) `Type=oneshot` 서비스, (3) 달력형 타이머입니다.

다음은 실제 운영에서 검증한 감사 로직을 **일반화한 예시**입니다. `/YOUR/MASTODON/COMPOSE/DIR`은 실제 Compose 프로젝트 경로로 바꿔야 합니다. 서비스에 Docker 명령 실행 권한을 가진 계정이 필요합니다. **Docker 소켓 접근 권한은 사실상 호스트 관리자 권한에 준하므로** 실행 계정을 엄격하게 제한하고 스크립트는 root 소유로 설치하세요. 컨테이너에 healthcheck가 없으면 예시 스크립트는 실패하도록 구성했습니다.

**`/usr/local/libexec/mastodon-sidekiq-audit` 파일 예시:**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /YOUR/MASTODON/COMPOSE/DIR

echo "=== MASTODON SIDEKIQ AUDIT ==="
echo "Timestamp (UTC): $(date -u +%FT%TZ)"

docker compose ps sidekiq
cid="$(docker compose ps -q sidekiq)"
test -n "$cid"

health="$(docker inspect \
  --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' \
  "$cid")"
echo "Container health: $health"
test "$health" = "running/healthy"

docker compose exec -T sidekiq bin/rails runner '
  require "sidekiq/api"

  s = Sidekiq::Stats.new
  puts "Processed total: #{s.processed}"
  puts "Failed executions total: #{s.failed}"
  puts "Enqueued: #{s.enqueued}"
  puts "Retry: #{s.retry_size}"
  puts "Dead: #{s.dead_size}"
  puts "Scheduled: #{s.scheduled_size}"
  puts "Processes: #{s.processes_size}"
  puts "Busy workers: #{Sidekiq::WorkSet.new.size}"

  Sidekiq::Queue.all.sort_by(&:name).each do |q|
    puts "#{q.name}: size=#{q.size}, latency=#{q.latency.round(1)}s"
  end

  puts "=== Recent Daily Statistics (UTC) ==="
  h = Sidekiq::Stats::History.new(3)
  processed, failed = h.processed, h.failed
  (processed.keys | failed.keys).sort.each do |date|
    puts "#{date}: processed=#{processed.fetch(date, 0)}, failed=#{failed.fetch(date, 0)}"
  end
'

echo "=== SIDEKIQ AUDIT COMPLETED ==="
```

이 스크립트와 아래 서비스·타이머 파일을 작성한 다음, 기존 경로·유닛이 없는지 확인하고 안전한 권한으로 설치합니다. 기존 파일을 덮어쓰지 마세요.

```bash
sudo install -d -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 ./mastodon-sidekiq-audit /usr/local/libexec/mastodon-sidekiq-audit
sudo install -o root -g root -m 0644 ./mastodon-sidekiq-audit.service /etc/systemd/system/mastodon-sidekiq-audit.service
sudo install -o root -g root -m 0644 ./mastodon-sidekiq-audit.timer /etc/systemd/system/mastodon-sidekiq-audit.timer
```

위 설치 명령은 **현재 작업 디렉터리에 검토된 세 파일이 이미 존재하고, 목적지에 같은 이름의 파일이 없다는 전제**의 예시입니다. 이 조건을 먼저 직접 확인하세요. 비밀번호나 토큰을 스크립트에 넣지 마세요.

**서비스 파일 예시(환경별 치환 필수):**

```ini
[Unit]
Description=Mastodon Sidekiq Read-Only Audit
After=docker.service

[Service]
Type=oneshot
User=YOUR_DEPLOY_USER
WorkingDirectory=/YOUR/MASTODON/COMPOSE/DIR
ExecStart=/usr/local/libexec/mastodon-sidekiq-audit
TimeoutStartSec=5min
StandardOutput=journal
StandardError=journal
```

**타이머 파일 예시:**

```ini
[Unit]
Description=Daily Mastodon Sidekiq Audit

[Timer]
OnCalendar=*-*-* 01:30:00 UTC
AccuracySec=1min
Persistent=true
Unit=mastodon-sidekiq-audit.service

[Install]
WantedBy=timers.target
```

`OnCalendar`는 점검 주기를 정의합니다. 위 예시의 **UTC 01:30은 예시일 뿐**이므로 기존 백업·업데이트 타이머와 겹치지 않는 시간으로 조정하세요. `Persistent=true`이면 꺼진 동안 놓친 실행이 타이머 활성화 직후 보충될 수 있으므로 장애 복구 시 작업 부하를 고려해야 합니다.

## 5. 적용 검증 및 운영

파일 충돌 여부와 유닛 설정을 확인한 다음, **타이머는 꺼 둔 채** 서비스를 수동 실행하여 종료 코드와 보고서 출력부터 검증하세요.

```bash
bash -n /usr/local/libexec/mastodon-sidekiq-audit
sudo systemd-analyze verify /etc/systemd/system/mastodon-sidekiq-audit.service /etc/systemd/system/mastodon-sidekiq-audit.timer
sudo systemctl daemon-reload
sudo systemctl start mastodon-sidekiq-audit.service
systemctl show mastodon-sidekiq-audit.service -p Result -p ExecMainStatus
sudo journalctl -u mastodon-sidekiq-audit.service -b -n 100 --no-pager
```

서비스 `Result=success`와 `ExecMainStatus=0` 및 필요한 보고서 필드가 확인된 뒤에만 타이머를 활성화합니다.

```bash
sudo systemctl enable --now mastodon-sidekiq-audit.timer
systemctl is-enabled mastodon-sidekiq-audit.timer
systemctl is-active mastodon-sidekiq-audit.timer
systemctl list-timers --all mastodon-sidekiq-audit.timer --no-pager
```

**검증은 여기서 끝나지 않습니다.** 첫 **예약 실행 시각이 지난 뒤**, journal의 새로운 실행 기록과 다음 실행 시각을 확인해야 합니다. 수동 실행 성공은 timer 구동 성공의 근거가 아닙니다. 상태를 기록만 하고 읽지 않는 시스템은 능동 경보가 아니므로, 별도의 알림 체계를 만들기 전에는 운영자가 주기적으로 journal을 확인해야 합니다. 로그 보존 기간은 호스트의 journald 설정에 따릅니다.

## 6. 장애 시 안전 원칙

1. 일반 큐 적체, 지연, 프로세스/컨테이너 상태부터 확인합니다.
2. Retry와 Dead를 삭제하지 않고 작업 종류, 마지막 오류 종류, 최초/마지막 실패 날짜로 분류합니다.
3. HTTP 5xx, 401, 타임아웃, 회로 차단기, 스토리지 실패를 동일한 원인으로 취급하지 않습니다.
4. 계정이나 서명용 키를 바꾸기 전에 관측된 증거와 복구 방법을 확인합니다.
5. 대기열 초기화, Redis 전체 비우기, 무분별한 재시도 또는 서비스 재기동을 자동 대응으로 추가하지 않습니다.

### 운영 근거 및 관련 문서

- [2026-10-26 Sidekiq 반복 전송 실패 조사와 일일 점검 자동화 (mastodon-lab)](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/sidekiq-delivery-retries-and-daily-audit-2026-10-26.md) — 한 서버에서 수동 실행·첫 예약 실행까지 확인한 기록
- [Sidekiq 대기열 증가 진단](sidekiq-queues.md) — 계정 삭제 후 `pull` 큐가 일시적으로 증가한 **별개의** 사례

이 가이드는 상태 조회와 기록을 위한 것이며, 사용자 데이터 및 연합 메시지를 제거하는 자동화 절차를 제공하지 않습니다.
