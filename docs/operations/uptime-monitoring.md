# 웹사이트 가용성 감시와 장애 알림

> **범위:** Mastodon 웹사이트의 HTTP 접속 상태를 주기적으로 검사하고, 실패·검사 누락을 운영자에게 알리는 방법입니다. Sidekiq 대기열 점검과는 **별개**입니다. 2026-11-15 한 운영 환경에서 1분 검사와 첫 예약 실행, 성공 Ping까지 확인했으나 **실제 운영 장애 알림은 유도하지 않았습니다**.

## 왜 Sidekiq 점검만으로는 부족한가?

일일 Sidekiq 감사가 정상이어도, 감사 시각 **사이**에 Nginx가 중단되거나 Cloudflare가 521을 반환할 수 있습니다. [Sidekiq 모니터링](sidekiq-monitoring.md)은 백그라운드 작업을, 이 문서는 **HTTP 응답 가능 여부**를 확인합니다.

| 감시 방식 | 알 수 있는 것 | 한계 |
| --- | --- | --- |
| 컨테이너 `healthy` | 컨테이너 내부 상태 | 외부 HTTPS 접속 실패를 놓칠 수 있음 |
| 서버 내부에서 공개 도메인으로 `curl` | 서버에서 공개 URL까지의 요청 결과 | 지역별·외부 전용 경로 장애를 놓칠 수 있음 |
| 별도 외부 위치에서 HTTP 검사 | 외부 클라이언트 관점의 접속 상태 | 감시 서비스·네트워크에 의존 |
| Healthchecks.io heartbeat | 검사 프로그램이 성공·실패·누락 신호를 보냈는지 | Healthchecks가 **직접 웹사이트를 검사하지는 않음** |

서버 내부 점검만 사용하더라도, 서버가 완전히 정지하면 Healthchecks가 **신호 누락**을 감지할 수 있습니다. 단, 외부 독립 HTTP 감시와 동등하다고 설명하면 안 됩니다.

## 최소 점검 로직

다음은 **HTTP 검사만 수행하는 예제**입니다. Healthchecks 전송이나 systemd 설정까지 자동 설치하지 않습니다. 자신이 관리하는 HTTPS 도메인으로 바꿔 사용하세요.

```bash
#!/usr/bin/env bash
set -euo pipefail

if status="$(
  curl --silent --show-error     --output /dev/null     --write-out '%{http_code}'     --connect-timeout 4     --max-time 10     --proto '=https'     https://social.example.com/
)"; then
  if [[ "$status" == "200" ]]; then
    echo "WEBSITE_CHECK=OK HTTP=200"
    exit 0
  fi
  echo "WEBSITE_CHECK=FAILED HTTP=$status"
else
  echo "WEBSITE_CHECK=FAILED NETWORK_ERROR"
fi

exit 1
```

`HTTP 200`은 이 예제의 정상 조건입니다. 운영 사이트가 의도적으로 리다이렉트한다면 **정상 상태의 기대 응답 코드를 먼저 확인**하고 조건을 조정해야 합니다. 헤더만 읽는 `curl -I` 대신 실제 GET 요청으로 검사합니다.

## systemd와 Healthchecks.io 연결하기

기본 구성은 다음과 같습니다.

1. 검사 코드를 `Type=oneshot` systemd 서비스로 실행합니다.
2. 별도 timer로 1분마다 서비스를 실행합니다. 예: `OnCalendar=*-*-* *:*:00 UTC`, `AccuracySec=1s`, `Persistent=false`.
3. 서비스 **성공 시 정상 Ping**, 실패 시 `/fail` Ping을 보내는 독립 notifier를 둡니다. `ExecStopPost`에서 systemd의 `SERVICE_RESULT`를 읽는 방식이 한 예입니다. 이 문서의 검사 코드만으로는 알림이 전송되지 않습니다.
4. Healthchecks에서 전용 Check를 만들고, Simple schedule의 **Period 1분 / Grace 2분** 등으로 타이머 주기에 맞춥니다. 이메일·Matrix는 기존 운영 알림방을 재사용하거나 필요할 때 별도 방을 마련합니다.

**중요:** Healthchecks의 Grace는 *정상 Ping이 늦을 때* 기다리는 시간입니다. 명시적 `/fail` 신호는 즉시 장애 상태 전환을 요청할 수 있으므로 **'2분 유예 = 두 번 연속 실패 후 경고'가 아닙니다.** 오탐이 실제 문제가 될 때만 별도 연속 실패 정책을 검토하세요.

Ping URL은 비밀값입니다. 권한이 제한된 파일(`root:root`, `0600` 등)에 두고, 명령줄 인수·셸 히스토리·Git·로그에 그대로 출력하지 않습니다. `ExecStopPost=-+`는 root 권한으로 실행하면서 notifier 오류를 원래 서비스 결과에 반영하지 않는 형태이므로, 적용 전에 해당 권한과 실패 처리 의미를 이해해야 합니다. 완전한 운영용 notifier는 환경에 맞춰 별도로 구현·검증해야 합니다.

## 검증은 네 가지를 구분

- 검사 스크립트 직접 실행에서 기대 HTTP 상태를 확인했는가?
- systemd **예약 실행** 후 새 journal 로그가 남았는가?
- Healthchecks로 **성공 Ping이 전송·수신**되었는가?
- 실제 장애 시 Email·Matrix로 **알림이 도착**하는가?

검사기 실행 로그의 `DELIVERED`는 서버 측 전송 성공의 증거지만, Matrix 푸시 수신까지 보증하지는 않습니다. 운영 웹사이트를 일부러 끄지 말고, 알림 통합 시험이 필요하면 **별도의 테스트 Check**로 정상 → 실패 → 복구 신호를 검증합니다. 운영 Check에 테스트용 `/fail`을 보내지 마세요.

```bash
systemctl list-timers --all --no-pager
sudo journalctl -u YOUR-WEBSITE-MONITOR.service -n 40 --no-pager
```

실제 장애 알림이 오면 HTTP 응답, Nginx 상태, 검사 실행 여부, Ping 송신과 외부 수신, 알림 채널을 차례로 구분합니다. 감시 알림만으로 DB 초기화나 무차별 서비스 재시작을 하지 않습니다.

### 참고

- [Healthchecks.io 개념 및 신호](https://healthchecks.io/docs/)
- [Healthchecks.io Period·Grace 설정](https://healthchecks.io/docs/configuring_checks/)
- [2026-11-15 머스타드 웹사이트 1분 모니터링 운영 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/website-healthchecks-monitoring-2026-11-15.md)
