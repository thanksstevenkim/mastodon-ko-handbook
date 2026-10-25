# Sidekiq 대기열이 쌓일 때 확인할 것

> **검증 상태: 운영 사례 기반 진단 가이드.** 한 차례 대기열 증가가 실제로 관측·해소됐지만, 아래 관찰이 모든 Sidekiq 장애를 설명하지는 않습니다.

## 대기열 증가 ≠ Sidekiq 전체 장애

마스토돈에서는 외부 연합 서버로 전달하는 작업이 오래 걸릴 수 있습니다. 예컨대 오래 사용하지 않은 계정을 삭제할 때 과거 연합 관계로 인해 다수의 `Delete` 전달 작업이 발생할 수 있습니다.

2026년 10월의 [실제 운영 사고 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/012-sidekiq-pull-queue-backlog-after-account-deletion.md)에서는 `pull` 대기열에 수천 건의 작업이 쌓였으나 다른 주요 대기열은 거의 비어 있었고, 작업량은 **파괴적 개입 없이 감소**했습니다.

## 진단 순서

1. **대기열별** 크기와 가장 오래 기다린 작업의 지연을 확인합니다. `pull`만 정체됐는지, `push`나 `default`에도 영향이 있는지 구분하세요.
2. Sidekiq 프로세스의 `busy`/동시 실행 수, retry/dead 수를 함께 확인합니다.
3. 작업 **클래스별 분포**를 살펴봅니다. 예: `ActivityPub::LowPriorityDeliveryWorker`.
4. 실패 로그에서 로컬 애플리케이션 오류와 원격 서버의 DNS, TLS, 타임아웃, HTTP 5xx를 구분합니다.
5. 단일 시점이 아니라 **대기열 크기와 지연의 변화 추세**를 확인합니다.
6. 최근 계정 삭제나 대량 연합 작업과 시점이 겹치는지 확인하되, 시간적 상관관계만으로 원인을 확정하지 않습니다.

일반적인 초기 점검:

```bash
docker compose ps sidekiq
docker compose logs --since=15m sidekiq
```

로그에는 원격 서버 주소나 계정 식별자가 포함될 수 있으므로 외부 공유 전에 제거해야 합니다.

## 먼저 하지 말아야 할 조치

- 장애 원인 파악 전에 재시도 큐·대기열을 일괄 삭제하지 않습니다.
- **대기열이 크다는 이유만으로** Sidekiq 재시작 또는 전체 Compose 재기동을 실행하지 않습니다.
- 사라진 연합 서버로의 전달 실패를 무조건 로컬 DB 장애로 해석하지 않습니다.

계속 증가하고 핵심 기능에 영향이 있다면 별도 장애 대응으로 확대하되, 사용자 데이터나 전달할 활동을 삭제할 수 있는 명령은 승인과 복구 계획 없이 실행하지 않습니다.

## 함께 볼 것: Web 성능 저하

[별도의 웹 지연 사례](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/013-intermittent-web-latency-and-webfinger-request-concentration.md)에서는 Puma 요청과 WebFinger가 늦어졌지만, 조사 당시 Sidekiq 핵심 대기열은 비어 있었습니다. DB 활동·Puma CPU·Nginx 요청 시간·직접 앱 응답을 분리해 점검했고, 특정 요청 패턴과의 인과관계는 **확정하지 않았습니다**. 서로 다른 장애를 하나로 묶어 추측하지 않는 것이 중요합니다.

### 근거 자료

- [SUP-0012: 계정 삭제 후 `pull` 대기열 증가](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/012-sidekiq-pull-queue-backlog-after-account-deletion.md)
- [SUP-0013: 간헐적 웹 지연 조사](https://github.com/thanksstevenkim/mastodon-lab/blob/main/incidents/013-intermittent-web-latency-and-webfinger-request-concentration.md)
